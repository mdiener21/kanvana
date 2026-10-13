// The single entry point of the event log (#177): local mutations and remote
// events (SSE and catch-up) both pass through ingestEvent(). Origin only decides
// the `synced` flag and whether the remote HLC is observed first; validation,
// projection, DATA_CHANGED and persistence are shared.
//
// Ordering (#179): an event newer than everything applied for its scope key is
// folded incrementally. An older one makes the key's view be rebuilt from its
// snapshot plus the stored events, in HLC order (CONTEXT.md §9).

import { DATA_CHANGED, EVENT_EMITTED, emit } from '../events.js';
import { flushPendingPersists, getDbRef, persistEvent, EVENTS_STORE } from '../idb-store.js';
import { compareHlc, observeRemote } from './hlc.js';
import { validateEvent } from './event-validation.js';
import { GRACE_WINDOW_MS, loadEventsAfter, loadSnapshot, saveSnapshot, snapshotKeyForEvent } from './snapshot.js';
import { applyEvents } from '../reducer.js';

export const EVENT_ORIGIN = Object.freeze({ LOCAL: 'local', REMOTE: 'remote' });
export const EVENT_ORDER = Object.freeze({ APPLIED: 'applied', IN_ORDER: 'in-order', LATE: 'late' });

let projector = null;
const unpersisted = new Map();
const committedDuringRebuild = new Map();
const rebuilds = new Map();
const superseded = new Map();
const loggedDrops = new Set();

// The read-model projector (ADR-0005) connects itself once storage has loaded:
// { classify(event), project(event), rebuild(key, snapshot, events, superseded) }.
// Until then events are only persisted, which is what boot-time backfill needs.
export function connectProjector(next) {
  projector = next;
  return () => {
    if (projector === next) projector = null;
  };
}

// Local events project synchronously, before this returns, so the caller's
// render sees them (ADR-0005 instant UI). The returned promise settles once
// the event is persisted, and for a late event once the view is rebuilt; it
// rejects if persistence fails.
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL, receivedAt } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event, receivedAt);
  return commit(event, origin);
}

// A remote event already in the event store was applied before, maybe before
// a reload; the store, unlike session memory, survives one (#178).
async function ingestRemote(event, receivedAt) {
  if (await isStored(event.id)) return;
  if (reachedServerTooLate(event, receivedAt)) return logDrop(event);
  if (projector?.classify(event) === EVENT_ORDER.LATE && !await foldIntoCoveringSnapshot(event)) return;
  if (event.hlc) await observeRemote(event.hlc);
  return commit(event, EVENT_ORIGIN.REMOTE);
}

// The server's receipt time is the same on every device, so the drop does not
// depend on what this device has snapshotted (CONTEXT.md §9). Unstamped: kept.
function reachedServerTooLate(event, receivedAt) {
  const received = Date.parse(String(receivedAt ?? '').replace(' ', 'T'));
  return Number.isFinite(received) && received - event.hlc.wallTime > GRACE_WINDOW_MS;
}

function logDrop(event) {
  if (loggedDrops.has(event.id)) return;
  loggedDrops.add(event.id);
  console.warn(`[Kanvana] Dropped event ${event.id}: it reached the server later than the sync grace window.`);
}

async function isStored(id) {
  const db = getDbRef();
  return Boolean(db && await db.get(EVENTS_STORE, id));
}

// An event this device's snapshot covers but lacks is folded onto the snapshot,
// since the events before it may be gone. False when the snapshot holds it.
async function foldIntoCoveringSnapshot(event) {
  const key = snapshotKeyForEvent(event);
  const snapshot = await loadSnapshot(key);
  if (!snapshot || compareHlc(event.hlc, snapshot.hlc) > 0) return true;
  if (snapshot.state.appliedEventIds.has(event.id)) return false;
  await saveSnapshot(key, applyEvents(snapshot.state, [event]), snapshot.hlc);
  return true;
}

function commit(event, origin) {
  const key = snapshotKeyForEvent(event);
  const order = projector?.classify(event);
  // A late local edit still shows at once; the rebuild then puts it in order.
  if (order !== EVENT_ORDER.LATE || origin === EVENT_ORIGIN.LOCAL) {
    if (projector?.project(event)) emit(DATA_CHANGED, { event });
  }
  emit(EVENT_EMITTED, event);
  committedDuringRebuild.get(key)?.set(event.id, event);
  if (!getDbRef()) return Promise.resolve();

  unpersisted.set(event.id, event);
  const persisted = persistEvent({ ...event, synced: origin === EVENT_ORIGIN.REMOTE })
    .then(() => flushPendingPersists())
    .finally(() => unpersisted.delete(event.id));
  return order === EVENT_ORDER.LATE ? persisted.then(() => rebuildScope(key)) : persisted;
}

// Adopts a server snapshot (#180): the key's view becomes the snapshot plus
// this device's stored events newer than it, so unsynced local edits stay.
// What the replaced snapshot held, and the stored events the new one covers,
// is known to the event log; the rebuild drops it unless the snapshot has it.
export async function adoptSnapshot(key, state, hlc) {
  const replaced = await loadSnapshot(key);
  const covered = (await loadEventsAfter(key, replaced?.hlc ?? null)).filter((event) => compareHlc(event.hlc, hlc) <= 0);
  await saveSnapshot(key, state, hlc);
  const entry = superseded.get(key) ?? { snapshots: [], events: [] };
  if (replaced) entry.snapshots.push(replaced);
  entry.events.push(...covered);
  superseded.set(key, entry);
  return rebuildScope(key);
}

// Rebuilds a scope key's view (board id, '__global__' or '__timetracking__')
// from its stored snapshot plus every stored event newer than it, in HLC order.
// Requests for a key that is already waiting to rebuild share that run.
export function rebuildScope(key) {
  const current = rebuilds.get(key);
  if (current?.waiting) return current.promise;
  const entry = { waiting: true };
  entry.promise = (current?.promise ?? Promise.resolve())
    .catch(() => {})
    .then(() => {
      entry.waiting = false;
      return runRebuild(key);
    })
    .finally(() => {
      if (rebuilds.get(key) === entry) rebuilds.delete(key);
    });
  rebuilds.set(key, entry);
  return entry.promise;
}

// Events committed while the store is read are not all in the read yet, so
// they are collected and folded in too; the reducer dedups by id.
async function runRebuild(key) {
  if (!projector) return;
  const collected = new Map([...unpersisted].filter(([, event]) => snapshotKeyForEvent(event) === key));
  const replaced = superseded.get(key);
  superseded.delete(key);
  committedDuringRebuild.set(key, collected);
  try {
    const snapshot = await loadSnapshot(key);
    const stored = await loadEventsAfter(key, snapshot?.hlc ?? null);
    const pending = [...collected.values()].filter((event) => !snapshot || compareHlc(event.hlc, snapshot.hlc) > 0);
    if (projector?.rebuild(key, snapshot, [...stored, ...pending], replaced)) emit(DATA_CHANGED, { rebuilt: key });
  } finally {
    committedDuringRebuild.delete(key);
  }
}

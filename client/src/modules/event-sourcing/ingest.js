// The single entry point of the event log for local and remote events (#177); ordering rules: CONTEXT.md §9.

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

// Until the projector (ADR-0005) connects, events are only persisted, which is what boot-time backfill needs.
export function connectProjector(next) {
  projector = next;
  return () => {
    if (projector === next) projector = null;
  };
}

// Local events project before this returns (ADR-0005 instant UI); the promise settles once persisted, or rebuilt if late.
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL, receivedAt } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event, receivedAt).then(() => {});
  return commit(event, origin);
}

// Catch-up's path: validated and sorted once; resolves to the events not stored before, for its watermark.
export async function ingestRemoteBatch(items) {
  const valid = items
    .map(({ event, receivedAt }) => ({ event: validateEvent(event), receivedAt }))
    .filter(({ event }) => event)
    .sort((a, b) => compareHlc(a.event.hlc, b.event.hlc));
  const fresh = [];
  for (const { event, receivedAt } of valid) {
    if (await ingestRemote(event, receivedAt)) fresh.push(event);
  }
  return fresh;
}

// The event store, unlike session memory, survives a reload (#178).
async function ingestRemote(event, receivedAt) {
  if (await isStored(event.id)) return false;
  if (reachedServerTooLate(event, receivedAt)) {
    logDrop(event);
    return true;
  }
  if (projector?.classify(event) === EVENT_ORDER.LATE && !await foldIntoCoveringSnapshot(event)) return true;
  await observeRemote(event.hlc);
  await commit(event, EVENT_ORIGIN.REMOTE);
  return true;
}

// The server's receipt time is the same on every device, so the drop ignores local snapshots (CONTEXT.md §9).
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

// The events before a covered event may be gone, so one the snapshot lacks is folded onto the snapshot.
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

// The rebuild keeps this device's newer stored events (#180) and drops what only the replaced history knew.
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

// Events committed while the store is read may be missing from the read; the reducer dedups by id.
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

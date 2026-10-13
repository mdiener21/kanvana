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
import { loadEventsAfter, loadSnapshot, snapshotKeyForEvent } from './snapshot.js';

export const EVENT_ORIGIN = Object.freeze({ LOCAL: 'local', REMOTE: 'remote' });
export const EVENT_ORDER = Object.freeze({ APPLIED: 'applied', IN_ORDER: 'in-order', LATE: 'late' });

let projector = null;
const unpersisted = new Map();
const committedDuringRebuild = new Map();
const rebuilds = new Map();
const loggedDrops = new Set();

// The read-model projector (ADR-0005) connects itself once storage has loaded:
// { classify(event), project(event), rebuild(key, snapshot, events) }.
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
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event);
  return commit(event, origin);
}

// A remote event already in the event store was applied before, maybe before
// a reload; the store, unlike session memory, survives one (#178). Events a
// snapshot has collected are answered by the projector from the snapshot.
async function ingestRemote(event) {
  if (await isStored(event.id)) return;
  if (projector?.classify(event) === EVENT_ORDER.LATE && await isCoveredBySnapshot(event)) return;
  if (event.hlc) await observeRemote(event.hlc);
  return commit(event, EVENT_ORIGIN.REMOTE);
}

async function isStored(id) {
  const db = getDbRef();
  return Boolean(db && await db.get(EVENTS_STORE, id));
}

// A snapshot covers only events older than the grace window, so an event it
// covers can no longer be ordered in. Every device drops it by the same rule.
async function isCoveredBySnapshot(event) {
  const snapshot = await loadSnapshot(snapshotKeyForEvent(event));
  if (!snapshot || compareHlc(event.hlc, snapshot.hlc) > 0) return false;
  if (!snapshot.state.appliedEventIds.has(event.id) && !loggedDrops.has(event.id)) {
    loggedDrops.add(event.id);
    console.warn(`[Kanvana] Dropped event ${event.id}: it is older than the sync grace window.`);
  }
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
  committedDuringRebuild.set(key, collected);
  try {
    const snapshot = await loadSnapshot(key);
    const stored = await loadEventsAfter(key, snapshot?.hlc ?? null);
    const pending = [...collected.values()].filter((event) => !snapshot || compareHlc(event.hlc, snapshot.hlc) > 0);
    if (projector?.rebuild(key, snapshot, [...stored, ...pending])) emit(DATA_CHANGED, { rebuilt: key });
  } finally {
    committedDuringRebuild.delete(key);
  }
}

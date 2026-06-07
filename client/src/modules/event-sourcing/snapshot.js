import { openStore, EVENTS_STORE, SNAPSHOTS_STORE } from '../idb-store.js';
import { createProjectionState, applyEvents } from '../reducer.js';
import { compareHlc } from './hlc.js';

export const SNAPSHOT_EVENT_THRESHOLD = 500;
export const SNAPSHOT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_JITTER_MS = 60_000;
export const GLOBAL_SNAPSHOT_KEY = '__global__';

const _pendingSnapshots = new Map();
let _getJitter = () => Math.floor(Math.random() * (MAX_JITTER_MS + 1));
let _afterSnapshotSaved = null;

export function serializeState(state) {
  return {
    boards: Array.isArray(state.boards) ? state.boards : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    columns: Array.isArray(state.columns) ? state.columns : [],
    labels: Array.isArray(state.labels) ? state.labels : [],
    settings: state.settings && typeof state.settings === 'object' ? state.settings : {},
    globalSettings: state.globalSettings && typeof state.globalSettings === 'object' ? state.globalSettings : {},
    appliedEventIds: [...(state.appliedEventIds instanceof Set ? state.appliedEventIds : [])],
    taskTombstones: [...(state.taskTombstones instanceof Set ? state.taskTombstones : [])]
  };
}

export async function saveSnapshot(key, state, hlc) {
  const db = await openStore();
  await db.put(SNAPSHOTS_STORE, {
    payload: serializeState(state),
    hlc,
    at: new Date().toISOString()
  }, key);
}

export async function loadSnapshot(key) {
  const db = await openStore();
  const record = await db.get(SNAPSHOTS_STORE, key);
  if (!record) return null;
  const { payload, hlc, at } = record;
  const state = createProjectionState({
    ...payload,
    appliedEventIds: new Set(Array.isArray(payload.appliedEventIds) ? payload.appliedEventIds : []),
    taskTombstones: new Set(Array.isArray(payload.taskTombstones) ? payload.taskTombstones : [])
  });
  return { state, hlc, at };
}

export async function gcEvents(snapshotHlc) {
  const db = await openStore();
  const all = await db.getAll(EVENTS_STORE);
  const tx = db.transaction(EVENTS_STORE, 'readwrite');
  for (const event of all) {
    if (compareHlc(event.hlc, snapshotHlc) <= 0) tx.store.delete(event.id);
  }
  await tx.done;
}

export async function hydrateFromSnapshot(key, events) {
  const snapshot = await loadSnapshot(key);
  const baseState = snapshot ? snapshot.state : createProjectionState();
  const toReplay = snapshot
    ? events.filter(e => compareHlc(e.hlc, snapshot.hlc) > 0)
    : events;
  return applyEvents(baseState, toReplay);
}

async function shouldTakeSnapshot(key) {
  const db = await openStore();
  const snapshot = await loadSnapshot(key);

  if (snapshot) {
    const age = Date.now() - new Date(snapshot.at).getTime();
    if (age >= SNAPSHOT_AGE_MS) return { should: true, reason: 'age' };
    const all = await db.getAll(EVENTS_STORE);
    const since = all.filter(e => compareHlc(e.hlc, snapshot.hlc) > 0).length;
    if (since >= SNAPSHOT_EVENT_THRESHOLD) return { should: true, reason: 'count' };
    return { should: false };
  }

  const all = await db.getAll(EVENTS_STORE);
  if (all.length >= SNAPSHOT_EVENT_THRESHOLD) return { should: true, reason: 'count' };
  return { should: false };
}

export function checkAndScheduleSnapshot(key, state, hlc) {
  if (_pendingSnapshots.has(key)) return;
  const jitter = _getJitter();
  const id = setTimeout(async () => {
    _pendingSnapshots.delete(key);
    try {
      const { should } = await shouldTakeSnapshot(key);
      if (!should) return;
      await saveSnapshot(key, state, hlc);
      await gcEvents(hlc);
      if (_afterSnapshotSaved) await _afterSnapshotSaved(key, state, hlc);
    } catch (err) {
      if (err?.code !== 11) console.error('[Kanvana] Snapshot failed', err);
    }
  }, jitter);
  _pendingSnapshots.set(key, id);
}

export function setAfterSnapshotSaved(fn) {
  _afterSnapshotSaved = fn;
}

export function _resetSnapshotSchedulerForTesting() {
  for (const id of _pendingSnapshots.values()) clearTimeout(id);
  _pendingSnapshots.clear();
  _getJitter = () => Math.floor(Math.random() * (MAX_JITTER_MS + 1));
  _afterSnapshotSaved = null;
}

export function _setJitterForTesting(fn) {
  _getJitter = fn;
}

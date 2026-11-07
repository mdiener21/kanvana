// The single entry point of the event log for local and remote events (#177); ordering rules: CONTEXT.md §9.

import { DATA_CHANGED, EVENT_EMITTED, EVENTS_STORED, SNAPSHOT_ADOPTED, emit } from '../events.js';
import { flushPendingPersists, getDbRef, persistEvent, EVENTS_STORE } from '../idb-store.js';
import { compareHlc, observeRemote } from './hlc.js';
import { validateEvent } from './event-validation.js';
import { GRACE_WINDOW_MS, loadEventsAfter, loadSnapshot, saveSnapshot, snapshotKeyForEvent } from './snapshot.js';
import { EVENT_ORDER, createReadModelProjector, createSuperseded } from './read-model-projector.js';

export const EVENT_ORIGIN = Object.freeze({ LOCAL: 'local', REMOTE: 'remote' });

// The one Read Model (ADR-0005). Storage gets its reads and the writes no event carries; only ingest projects into it.
let readModel = null;
const unpersisted = new Map();
const committedDuringRebuild = new Map();
const rebuilds = new Map();
const superseded = new Map();
const loggedDrops = new Set();

const STORAGE_SIDE = [
  'load', 'startProjecting', 'reset', 'addBoard', 'removeBoard', 'boards', 'board', 'globalSettings', 'timeTracking',
  'cachedTasks', 'cacheTasks', 'setBoards', 'setBoardSlice', 'setGlobalSettings', 'writeBoardSettings', 'refreshBoardSettings'
];

export function createReadModel(ctx) {
  if (readModel) throw new Error('[Kanvana] The Read Model is already created');
  readModel = createReadModelProjector(ctx);
  return Object.fromEntries(STORAGE_SIDE.map((name) => [name, readModel[name]]));
}

// Until storage starts projecting, ingested events are only persisted, which boot-time backfill needs.
function projector() {
  return readModel?.isProjecting() ? readModel : null;
}

// Local events project before this returns (ADR-0005 instant UI); the promise settles once persisted, or rebuilt if late.
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL, receivedAt } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event, receivedAt).then(() => {});
  return commit(event, origin);
}

// One redraw and one write per slice for a user mutation (#142); synchronous, to stay in this tick's write batch (#256) and a drop's reconcile window.
export function commitTogether(mutation) {
  readModel?.beginCommit();
  try {
    return mutation();
  } finally {
    readModel?.endCommit(closeCommit);
  }
}

function closeCommit({ changed, stored }) {
  if (changed) emit(DATA_CHANGED);
  announceStored(stored);
}

// One notice, so another tab folds the mutation as one and never shows half of it. A failed write was already logged.
function announceStored(stored) {
  if (!stored.length) return;
  Promise.all(stored)
    .then((ids) => emit(EVENTS_STORED, { ids, local: true }))
    .catch(() => {});
}

// Catch-up's path: validated and sorted once; resolves to the events not stored before, for its watermark.
// Every DATA_CHANGED is a full board render, so the batch signals once at the end instead of per event.
export async function ingestRemoteBatch(items) {
  const valid = items
    .map(({ event, receivedAt }) => ({ event: validateEvent(event), receivedAt }))
    .filter(({ event }) => event)
    .sort((a, b) => compareHlc(a.event.hlc, b.event.hlc));
  const stored = await storedIds();
  const fresh = [];
  const writes = [];
  readModel?.beginBatch();
  try {
    for (const { event, receivedAt } of valid) {
      if (await ingestRemote(event, receivedAt, stored, writes)) fresh.push(event);
      stored?.add(event.id);
    }
    await Promise.all(writes);
  } finally {
    endRemoteBatch();
  }
  // The read model the batch deferred is stored before the caller advances its watermark.
  await flushPendingPersists();
  if (fresh.length) emit(EVENTS_STORED, { ids: fresh.map((event) => event.id), local: false });
  return fresh;
}

function endRemoteBatch() {
  if (readModel?.endBatch()) emit(DATA_CHANGED, { batch: true });
}

// Another tab stored these (#222); its read model is not copied, since it may lack this tab's newest edit.
export async function ingestStoredEvents(ids) {
  const db = getDbRef();
  if (!db || !projector()) return;
  const events = await Promise.all(ids.map((id) => db.get(EVENTS_STORE, id)));
  await foldStoredEvents(events.filter(Boolean));
}

// For a tab that may have missed notices: one opening, waking up or taking over. `scopes` limits it to those event scopes.
export async function ingestMissedEvents({ scopes = null } = {}) {
  const db = getDbRef();
  if (!db || !projector()) return;
  const stored = await db.getAll(EVENTS_STORE);
  await foldStoredEvents(projector().missedEvents(scopes ? stored.filter((event) => scopes.includes(event.scope)) : stored));
}

async function foldStoredEvents(events) {
  const lateKeys = new Set();
  readModel?.beginBatch();
  try {
    for (const event of [...events].sort((a, b) => compareHlc(a.hlc, b.hlc))) {
      // Or the next local edit here could sort before an event this tab already shows.
      await observeRemote(event.hlc);
      const order = projector()?.classify(event);
      if (order === EVENT_ORDER.LATE) lateKeys.add(snapshotKeyForEvent(event));
      else if (order === EVENT_ORDER.IN_ORDER && readModel.project(event, { batched: true })) signalChanged({ event });
    }
  } finally {
    endRemoteBatch();
  }
  for (const key of lateKeys) await rebuildScope(key);
}

function signalChanged(detail) {
  if (!readModel?.holdChange()) emit(DATA_CHANGED, detail);
}

// The event store, unlike session memory, survives a reload (#178).
// Projection is in memory, so a batch need not wait for each write before the next event; it awaits them all once.
async function ingestRemote(event, receivedAt, stored, writes) {
  if (stored?.has(event.id) || await isStored(event.id)) return false;
  if (reachedServerTooLate(event, receivedAt)) {
    logDrop(event);
    return true;
  }
  if (projector()?.classify(event) === EVENT_ORDER.LATE && !await foldIntoCoveringSnapshot(event)) return true;
  await observeRemote(event.hlc);
  const written = commit(event, EVENT_ORIGIN.REMOTE, { batched: Boolean(writes) });
  if (!writes) await written;
  else {
    // The batch rethrows a failed write after the loop; this only stops it reading as unhandled meanwhile.
    written.catch(() => {});
    writes.push(written);
  }
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

async function storedIds() {
  const db = getDbRef();
  return db ? new Set(await db.getAllKeys(EVENTS_STORE)) : null;
}

// The events before a covered event may be gone, so one the snapshot lacks is folded onto the snapshot.
async function foldIntoCoveringSnapshot(event) {
  const key = snapshotKeyForEvent(event);
  const snapshot = await loadSnapshot(key);
  if (!snapshot || compareHlc(event.hlc, snapshot.hlc) > 0) return true;
  const folded = readModel.foldOntoSnapshot(key, snapshot, event);
  if (!folded) return false;
  await saveSnapshot(key, folded, snapshot.hlc);
  return true;
}

function commit(event, origin, { batched = false } = {}) {
  const key = snapshotKeyForEvent(event);
  const order = projector()?.classify(event);
  // A late local edit still shows at once; the rebuild then puts it in order.
  if (order && (order !== EVENT_ORDER.LATE || origin === EVENT_ORIGIN.LOCAL)) {
    if (readModel.project(event, { batched }) && !readModel.holdChange({ local: origin === EVENT_ORIGIN.LOCAL })) {
      emit(DATA_CHANGED, { event });
    }
  }
  emit(EVENT_EMITTED, event);
  committedDuringRebuild.get(key)?.set(event.id, event);
  if (!getDbRef()) return Promise.resolve();

  unpersisted.set(event.id, event);
  let heldByCommit = false;
  const persisted = persistEvent({ ...event, synced: origin === EVENT_ORIGIN.REMOTE })
    .then(() => flushPendingPersists())
    .then(() => {
      // Other tabs and the queue read the store, so they may only hear of an event once it is there.
      if (!batched && !heldByCommit) emit(EVENTS_STORED, { ids: [event.id], local: origin === EVENT_ORIGIN.LOCAL });
    })
    .finally(() => unpersisted.delete(event.id));
  heldByCommit = Boolean(readModel?.holdStored(persisted, event.id));
  return order === EVENT_ORDER.LATE ? persisted.then(() => rebuildScope(key)) : persisted;
}

// The rebuild keeps this device's newer stored events (#180) and drops what only the replaced history knew.
export async function adoptSnapshot(key, state, hlc) {
  const replaced = await loadSnapshot(key);
  const covered = (await loadEventsAfter(key, replaced?.hlc ?? null)).filter((event) => compareHlc(event.hlc, hlc) <= 0);
  await saveSnapshot(key, projector()?.snapshotToAdopt(key, state) ?? state, hlc);
  const entry = superseded.get(key) ?? createSuperseded();
  if (replaced) entry.snapshots.push(replaced);
  entry.events.push(...covered);
  superseded.set(key, entry);
  await rebuildScope(key);
  const held = replaced ? [...replaced.state.tasks, ...replaced.state.columns, ...replaced.state.labels] : [];
  emit(SNAPSHOT_ADOPTED, { key, forgotten: [...covered.map((event) => event.entity_id), ...held.map((item) => item?.id)] });
}

// Another tab adopted a snapshot (#222): only it knows what was replaced, and this rebuild must drop the same.
export function rebuildAfterPeerAdoption(key, forgotten) {
  const entry = superseded.get(key) ?? createSuperseded();
  entry.events.push(...forgotten.map((entity_id) => ({ entity_id })));
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
  if (!projector()) return;
  const collected = new Map([...unpersisted].filter(([, event]) => snapshotKeyForEvent(event) === key));
  const replaced = superseded.get(key);
  superseded.delete(key);
  committedDuringRebuild.set(key, collected);
  try {
    const snapshot = await loadSnapshot(key);
    const stored = await loadEventsAfter(key, snapshot?.hlc ?? null);
    const pending = [...collected.values()].filter((event) => !snapshot || compareHlc(event.hlc, snapshot.hlc) > 0);
    if (projector()?.rebuild(key, snapshot, [...stored, ...pending], replaced)) signalChanged({ rebuilt: key });
  } finally {
    committedDuringRebuild.delete(key);
  }
}

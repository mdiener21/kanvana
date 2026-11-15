// The single entry point of the event log (#177): admits events, which the Read Model then applies; ordering rules: CONTEXT.md §9.

import { SNAPSHOT_ADOPTED, emit } from '../events.js';
import { getDbRef, EVENTS_STORE } from '../idb-store.js';
import { compareHlc } from './hlc.js';
import { validateEvent } from './event-validation.js';
import { GRACE_WINDOW_MS } from './snapshot.js';
import { ADMISSION, EVENT_ORIGIN, createReadModelProjector } from './read-model-projector.js';

export { EVENT_ORIGIN };

// The one Read Model (ADR-0005), which storage.js makes. Without one, events are only stored, as during boot-time backfill.
let readModel = null;
const storeOnly = createReadModelProjector({});
const loggedDrops = new Set();

const STORAGE_SIDE = [
  'load', 'startProjecting', 'reset', 'addBoard', 'removeBoard', 'boards', 'board', 'globalSettings', 'timeTracking',
  'cachedTasks', 'cacheTasks', 'setBoardSlice', 'setGlobalSettings', 'writeBoardSettings', 'refreshBoardSettings'
];

// Storage gets its reads and the writes no event carries, always on ingest's Read Model, so the two never differ.
export function createReadModel(ctx) {
  if (readModel) throw new Error('[Kanvana] The Read Model is already created');
  readModel = createReadModelProjector(ctx);
  return Object.fromEntries(STORAGE_SIDE.map((name) => [name, (...args) => readModel[name](...args)]));
}

// Lets a test make a fresh Read Model without reloading the module graph; storage then reads that one too.
export function _resetReadModelForTesting() {
  readModel = null;
}

function target() {
  return readModel ?? storeOnly;
}

// Local events project before this returns (ADR-0005 instant UI); the promise settles once persisted, or rebuilt if late.
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL, receivedAt } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event, receivedAt);
  return target().apply(event, { origin });
}

// One redraw and one write per slice for a user mutation (#142).
export function commitTogether(mutation) {
  return readModel ? readModel.commitTogether(mutation) : mutation();
}

// Catch-up's path: validated and sorted once; resolves to the events not stored before, for its watermark.
export async function ingestRemoteBatch(items) {
  const valid = items
    .map(({ event, receivedAt }) => ({ event: validateEvent(event), receivedAt }))
    .filter(({ event }) => event)
    .sort((a, b) => compareHlc(a.event.hlc, b.event.hlc));
  const stored = await storedIds();
  return target().applyRemoteBatch(valid, async ({ event, receivedAt }) => {
    const verdict = await admitRemote(event, receivedAt, stored);
    stored?.add(event.id);
    return verdict;
  });
}

// Another tab stored these (#222); its read model is not copied, since it may lack this tab's newest edit.
export async function ingestStoredEvents(ids) {
  const db = getDbRef();
  if (!db || !target().isProjecting()) return;
  const events = await Promise.all(ids.map((id) => db.get(EVENTS_STORE, id)));
  await readModel.applyStored(events.filter(Boolean));
}

// For a tab that may have missed notices: one opening, waking up or taking over. `scopes` limits it to those event scopes.
export async function ingestMissedEvents({ scopes = null } = {}) {
  const db = getDbRef();
  if (!db || !target().isProjecting()) return;
  const stored = await db.getAll(EVENTS_STORE);
  await readModel.applyStored(readModel.missedEvents(scopes ? stored.filter((event) => scopes.includes(event.scope)) : stored));
}

async function ingestRemote(event, receivedAt) {
  if (await admitRemote(event, receivedAt) !== ADMISSION.ADMITTED) return;
  await target().apply(event, { origin: EVENT_ORIGIN.REMOTE });
}

// The event store, unlike session memory, survives a reload (#178).
async function admitRemote(event, receivedAt, stored = null) {
  if (stored?.has(event.id) || await isStored(event.id)) return ADMISSION.STORED;
  if (reachedServerTooLate(event, receivedAt)) {
    logDrop(event);
    return ADMISSION.DROPPED;
  }
  return ADMISSION.ADMITTED;
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

export async function adoptSnapshot(key, state, hlc) {
  const forgotten = await readModel.adoptSnapshot(key, state, hlc);
  emit(SNAPSHOT_ADOPTED, { key, forgotten });
}

export function rebuildAfterPeerAdoption(key, forgotten) {
  return readModel.rebuildAfterPeerAdoption(key, forgotten);
}

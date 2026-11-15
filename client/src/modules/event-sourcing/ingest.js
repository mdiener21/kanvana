// The single entry point of the event log for local and remote events (#177); ordering rules: CONTEXT.md §9.
// Ingest admits events (validate, dedupe against the event store, drop late arrivals, observe remote HLCs);
// the Read Model does everything after admission, redraw and store notices included.

import { SNAPSHOT_ADOPTED, emit } from '../events.js';
import { getDbRef, EVENTS_STORE } from '../idb-store.js';
import { compareHlc, observeRemote } from './hlc.js';
import { validateEvent } from './event-validation.js';
import { GRACE_WINDOW_MS } from './snapshot.js';
import { ADMISSION, EVENT_ORIGIN, createReadModelProjector } from './read-model-projector.js';

export { EVENT_ORIGIN };

// The Read Model ingest applies events to (ADR-0005): the one made last. storage.js makes one per tab.
let readModel = null;
const loggedDrops = new Set();

const STORAGE_SIDE = [
  'load', 'startProjecting', 'reset', 'addBoard', 'removeBoard', 'boards', 'board', 'globalSettings', 'timeTracking',
  'cachedTasks', 'cacheTasks', 'setBoards', 'setBoardSlice', 'setGlobalSettings', 'writeBoardSettings', 'refreshBoardSettings'
];

// A fresh Read Model with its own state, which ingest applies events to from now on. Storage gets its reads and
// the writes no event carries; a test can make another to start clean, without reloading the module graph.
export function createReadModel(ctx) {
  readModel = createReadModelProjector(ctx);
  return Object.fromEntries(STORAGE_SIDE.map((name) => [name, readModel[name]]));
}

// Local events project before this returns (ADR-0005 instant UI); the promise settles once persisted, or rebuilt if late.
export function ingestEvent(input, { origin = EVENT_ORIGIN.LOCAL, receivedAt } = {}) {
  const event = validateEvent(input);
  if (!event) return Promise.resolve();
  if (origin === EVENT_ORIGIN.REMOTE) return ingestRemote(event, receivedAt);
  return readModel.apply(event, { origin });
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
  return readModel.applyRemoteBatch(valid, async ({ event, receivedAt }) => {
    const verdict = await admitRemote(event, receivedAt, stored);
    stored?.add(event.id);
    return verdict;
  });
}

// Another tab stored these (#222); its read model is not copied, since it may lack this tab's newest edit.
export async function ingestStoredEvents(ids) {
  const db = getDbRef();
  if (!db) return;
  const events = await Promise.all(ids.map((id) => db.get(EVENTS_STORE, id)));
  await applyStored(events.filter(Boolean));
}

// For a tab that may have missed notices: one opening, waking up or taking over. `scopes` limits it to those event scopes.
export async function ingestMissedEvents({ scopes = null } = {}) {
  const db = getDbRef();
  if (!db) return;
  const stored = await db.getAll(EVENTS_STORE);
  await applyStored(readModel.missedEvents(scopes ? stored.filter((event) => scopes.includes(event.scope)) : stored));
}

// Observed first, or the next local edit here could sort before an event this tab already shows.
async function applyStored(events) {
  for (const event of [...events].sort((a, b) => compareHlc(a.hlc, b.hlc))) await observeRemote(event.hlc);
  await readModel.applyStored(events);
}

async function ingestRemote(event, receivedAt) {
  if (await admitRemote(event, receivedAt) !== ADMISSION.ADMITTED) return;
  await readModel.apply(event, { origin: EVENT_ORIGIN.REMOTE });
}

// The event store, unlike session memory, survives a reload (#178).
async function admitRemote(event, receivedAt, stored = null) {
  if (stored?.has(event.id) || await isStored(event.id)) return ADMISSION.STORED;
  if (reachedServerTooLate(event, receivedAt)) {
    logDrop(event);
    return ADMISSION.DROPPED;
  }
  await observeRemote(event.hlc);
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

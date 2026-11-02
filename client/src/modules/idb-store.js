// IDB plumbing — singleton connection, key helpers, fire-and-forget persistence.
// Changes when: the storage backend or key scheme changes.

import { openDB } from 'idb';

const DB_NAME = 'kanvana-db';
const DB_VERSION = 2;
const KV_STORE = 'kv';
const EVENTS_STORE = 'events';
const SNAPSHOTS_STORE = 'snapshots';
const READ_MODEL_STORE = 'read_model';
const DATA_OWNER_KEY = 'kanvana:dataOwner';
const FIRST_PULL_PENDING_KEY = 'kanvana:sync:firstPullPending';
const DATA_GENERATION_KEY = 'kanvana:dataGeneration';
const DATA_REPLACED_PREFIX = 'kanvana:dataReplaced:';
const WRITE_BATCH_STORES = [KV_STORE, EVENTS_STORE, READ_MODEL_STORE];

let _db = null;
let _opening = null;
let _needsV2DataMigration = false;
let _pinnedGeneration = null;
let _dataReplaced = false;
let _writeBatch = null;
let _onDataReplaced = null;

// In-flight persist Promises — used by _flushPersistsForTesting().
const _pendingPersists = new Set();

function getDB() {
  if (_db) return Promise.resolve(_db);
  _opening ??= openConnection().finally(() => { _opening = null; });
  return _opening;
}

async function openConnection() {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const events = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
        events.createIndex('hlc', ['hlc.wallTime', 'hlc.counter', 'hlc.nodeId']);
        events.createIndex('synced', 'synced');
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) db.createObjectStore(SNAPSHOTS_STORE);
      if (!db.objectStoreNames.contains(READ_MODEL_STORE)) db.createObjectStore(READ_MODEL_STORE);
      _needsV2DataMigration = oldVersion < 2;
    }
  });
  if (_needsV2DataMigration) {
    await migrateReadModelFromKv(db);
    _needsV2DataMigration = false;
  }
  _pinnedGeneration = (await db.get(KV_STORE, DATA_GENERATION_KEY)) ?? null;
  _db = db;
  return db;
}

export function onDataReplaced(handler) {
  _onDataReplaced = handler;
}

// A check inside a write transaction over KV_STORE can not interleave with a wipe, which bumps the generation (ADR-0006).
export async function isDataCurrent(tx) {
  const generation = (await tx.objectStore(KV_STORE).get(DATA_GENERATION_KEY)) ?? null;
  if (generation === _pinnedGeneration) return true;
  noteDataReplaced();
  return false;
}

function noteDataReplaced() {
  if (_dataReplaced) return;
  _dataReplaced = true;
  _onDataReplaced?.();
}

function dataReplacedKey(generation) {
  return `${DATA_REPLACED_PREFIX}${generation ?? 0}`;
}

// The request goes in at the call, as with db.put: writes keep their order and store the value as it is now.
async function guardedWrite(db, storeName, write) {
  if (_dataReplaced) return false;
  _writeBatch = null; // A later batched write must land after this one.
  const tx = db.transaction(storeName === KV_STORE ? KV_STORE : [KV_STORE, storeName], 'readwrite');
  const current = isDataCurrent(tx);
  const written = Promise.all([write(tx.objectStore(storeName)), tx.done]);
  if (await current) {
    await written;
    return true;
  }
  tx.abort();
  await written.catch(() => {});
  return false;
}

// Every write of account data goes through here. Resolves to false when it was dropped.
export async function writeIfDataCurrent(storeName, write) {
  return guardedWrite(await getDB(), storeName, write);
}

// A batch commits before it could read the generation, so a wipe's marker fails it instead: add() is refused if the marker exists.
async function settleWriteBatch(tx) {
  const kv = tx.objectStore(KV_STORE);
  const marker = dataReplacedKey(_pinnedGeneration);
  const replaced = kv.add(true, marker).then(() => false, (err) => err?.name === 'ConstraintError');
  kv.delete(marker).catch(() => {});
  try {
    await tx.done;
    return true;
  } catch (err) {
    if (!await replaced) throw err;
    noteDataReplaced();
    return false;
  }
}

// Commit in the task that made the writes: Chromium finishes a committed transaction through a reload, and the screen has not painted yet.
function openWriteBatch() {
  const tx = _db.transaction(WRITE_BATCH_STORES, 'readwrite');
  const batch = { tx, written: settleWriteBatch(tx) };
  queueMicrotask(() => {
    if (_writeBatch === batch) _writeBatch = null;
    try { tx.commit?.(); } catch { /* a failed write already aborted it */ }
  });
  return batch;
}

// Writes of one tick share a transaction, so an event and its read-model change land together or not at all (#256).
// Requests go in at the call, so the writes keep their order and store each value as it is now.
async function batchedWrite(storeName, write) {
  if (_dataReplaced) return false;
  _writeBatch ??= openWriteBatch();
  const { tx, written } = _writeBatch;
  try {
    Promise.resolve(write(tx.objectStore(storeName))).catch(() => {}); // A failed request aborts the transaction, which written reports.
  } catch (err) {
    try { tx.abort(); } catch { /* an earlier write of this tick already aborted it */ }
    await written.catch(() => {});
    throw err;
  }
  return written;
}

async function migrateReadModelFromKv(db) {
  const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
  const kv = tx.objectStore(KV_STORE);
  const readModel = tx.objectStore(READ_MODEL_STORE);
  const keys = await kv.getAllKeys();

  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const match = /^kanbanBoard:(.+):(tasks|columns|labels)$/.exec(key);
    if (match) {
      await readModel.put(await kv.get(key), readModelKeyFor(match[1], match[2]));
      await kv.delete(key);
      continue;
    }
    if (key.startsWith('events:')) {
      await kv.delete(key);
    }
  }

  await tx.done;
}

export function schedulePersist(key, value) {
  if (!_db) return; // IDB not yet initialised (e.g. during testing without initStorage)
  const p = batchedWrite(KV_STORE, (store) => store.put(value, key)).catch((err) => {
    console.error('[Kanvana] IDB persist failed for key', key, err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleDelete(key) {
  if (!_db) return;
  const p = batchedWrite(KV_STORE, (store) => store.delete(key)).catch((err) => {
    console.error('[Kanvana] IDB delete failed for key', key, err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleReadModelPersist(boardId, kind, value) {
  if (!_db) return;
  const p = batchedWrite(READ_MODEL_STORE, (store) => store.put(value, readModelKeyFor(boardId, kind))).catch((err) => {
    console.error('[Kanvana] IDB read-model persist failed for key', readModelKeyFor(boardId, kind), err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleReadModelDelete(boardId, kind) {
  if (!_db) return;
  const p = batchedWrite(READ_MODEL_STORE, (store) => store.delete(readModelKeyFor(boardId, kind))).catch((err) => {
    console.error('[Kanvana] IDB read-model delete failed for key', readModelKeyFor(boardId, kind), err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export async function persistEvent(event) {
  if (!_db) await getDB();
  return batchedWrite(EVENTS_STORE, (store) => store.put({ ...event, synced: event.synced === true }));
}

// Events not yet acknowledged by PocketBase. Unsorted — the sync queue orders
// them by HLC before draining (boolean values are not valid IDB index keys, so
// the `synced` index can't be range-queried; a full scan + filter is correct).
export async function getUnsyncedEvents() {
  const db = await getDB();
  const all = await db.getAll(EVENTS_STORE);
  return all.filter(e => e.synced !== true);
}

export async function markEventSynced(id) {
  await writeIfDataCurrent(EVENTS_STORE, async (store) => {
    const event = await store.get(id);
    if (event) await store.put({ ...event, synced: true });
  });
}

export async function getDataOwner() {
  const db = await getDB();
  return (await db.get(KV_STORE, DATA_OWNER_KEY)) ?? null;
}

// Local data with no Data Owner goes to the first account to ask; the result is whoever owns it now.
export async function claimDataOwner(userId) {
  const db = await getDB();
  const tx = db.transaction(KV_STORE, 'readwrite');
  const owner = await tx.store.get(DATA_OWNER_KEY);
  if (!owner) await tx.store.put(userId, DATA_OWNER_KEY);
  await tx.done;
  return owner ?? userId;
}

// One transaction, so one account's data is never the other's; refuses when more events are unsynced than the user agreed to lose.
export async function replaceLocalData({ ownerId, maxUnsynced, keepKvKeys }) {
  const db = await getDB();
  const tx = db.transaction([KV_STORE, EVENTS_STORE, SNAPSHOTS_STORE, READ_MODEL_STORE], 'readwrite');
  const unsynced = (await tx.objectStore(EVENTS_STORE).getAll()).filter((e) => e.synced !== true).length;
  if (unsynced > maxUnsynced) {
    tx.abort();
    await tx.done.catch(() => {});
    return { replaced: false, unsynced };
  }
  try {
    const kv = tx.objectStore(KV_STORE);
    const generation = (await kv.get(DATA_GENERATION_KEY)) ?? 0;
    const keep = new Set(keepKvKeys);
    for (const key of await kv.getAllKeys()) {
      // Earlier wipes' markers stay: a tab can sleep through several wipes.
      if (!keep.has(key) && !String(key).startsWith(DATA_REPLACED_PREFIX)) await kv.delete(key);
    }
    await tx.objectStore(EVENTS_STORE).clear();
    await tx.objectStore(SNAPSHOTS_STORE).clear();
    await tx.objectStore(READ_MODEL_STORE).clear();
    await kv.put(ownerId, DATA_OWNER_KEY);
    await kv.put(true, FIRST_PULL_PENDING_KEY);
    await kv.put(generation + 1, DATA_GENERATION_KEY);
    await kv.put(true, dataReplacedKey(generation));
    await tx.done;
  } catch (err) {
    // A transaction left to finish on its own would commit the part already done.
    try { tx.abort(); } catch { /* the failure already aborted it */ }
    await tx.done.catch(() => {});
    throw err;
  }
  return { replaced: true, unsynced };
}

export async function isFirstPullPending() {
  const db = await getDB();
  return Boolean(await db.get(KV_STORE, FIRST_PULL_PENDING_KEY));
}

export async function clearFirstPullPending() {
  await writeIfDataCurrent(KV_STORE, (store) => store.delete(FIRST_PULL_PENDING_KEY));
}

// A closed connection makes every later write fail, for a page about to reload after a wipe.
export function closeStore() {
  _db?.close();
}

/**
 * Wait for all fire-and-forget IDB writes to settle before a user-visible
 * operation such as reload can interrupt them.
 */
export async function flushPendingPersists() {
  await Promise.all([..._pendingPersists]);
}

export const _flushPersistsForTesting = flushPendingPersists;

export function keyFor(boardId, kind) {
  return `kanbanBoard:${boardId}:${kind}`;
}

export function readModelKeyFor(boardId, kind) {
  return `${boardId}:${kind}`;
}

export function getBoardEventsKey(boardId) {
  return `events:${boardId}`;
}

/**
 * Open (or return the cached) IDB connection. Called by storage.js during initStorage.
 * Returns the raw idb DB object so callers can run transactions directly.
 */
export async function openStore() {
  return getDB();
}

/**
 * Expose the raw db ref for direct IDB operations (e.g. transactions in migrations).
 * Returns null before openStore() has been called.
 */
export function getDbRef() {
  return _db;
}

/**
 * Close the IDB connection and reset all state.
 * Only intended for use in tests.
 */
export function _resetIdbForTesting() {
  if (_db) { _db.close(); _db = null; }
  _opening = null;
  _needsV2DataMigration = false;
  _pinnedGeneration = null;
  _dataReplaced = false;
  _writeBatch = null;
  _onDataReplaced = null;
  _pendingPersists.clear();
}

export { EVENTS_STORE, KV_STORE, READ_MODEL_STORE, SNAPSHOTS_STORE };

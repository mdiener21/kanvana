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

let _db = null;
let _needsV2DataMigration = false;

// In-flight persist Promises — used by _flushPersistsForTesting().
const _pendingPersists = new Set();

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
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
    await migrateReadModelFromKv(_db);
    _needsV2DataMigration = false;
  }
  return _db;
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
  const p = _db.put(KV_STORE, value, key).catch((err) => {
    console.error('[Kanvana] IDB persist failed for key', key, err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleDelete(key) {
  if (!_db) return;
  const p = _db.delete(KV_STORE, key).catch((err) => {
    console.error('[Kanvana] IDB delete failed for key', key, err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleReadModelPersist(boardId, kind, value) {
  if (!_db) return;
  const p = _db.put(READ_MODEL_STORE, value, readModelKeyFor(boardId, kind)).catch((err) => {
    console.error('[Kanvana] IDB read-model persist failed for key', readModelKeyFor(boardId, kind), err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export function scheduleReadModelDelete(boardId, kind) {
  if (!_db) return;
  const p = _db.delete(READ_MODEL_STORE, readModelKeyFor(boardId, kind)).catch((err) => {
    console.error('[Kanvana] IDB read-model delete failed for key', readModelKeyFor(boardId, kind), err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

export async function persistEvent(event) {
  const db = await getDB();
  await db.put(EVENTS_STORE, { ...event, synced: event.synced === true });
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
  const db = await getDB();
  const event = await db.get(EVENTS_STORE, id);
  if (!event) return;
  await db.put(EVENTS_STORE, { ...event, synced: true });
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

// One transaction, so an interruption leaves either the old owner with all its data or
// the new owner with none: there is no state where one account's data is the other's.
// Refuses, changing nothing, when more events are unsynced than the user agreed to lose.
export async function replaceLocalData({ ownerId, maxUnsynced, keepKvKeys = [] }) {
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
    const keep = new Set(keepKvKeys);
    for (const key of await kv.getAllKeys()) {
      if (!keep.has(key)) await kv.delete(key);
    }
    await tx.objectStore(EVENTS_STORE).clear();
    await tx.objectStore(SNAPSHOTS_STORE).clear();
    await tx.objectStore(READ_MODEL_STORE).clear();
    await kv.put(ownerId, DATA_OWNER_KEY);
    await kv.put(true, FIRST_PULL_PENDING_KEY);
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
  const db = await getDB();
  await db.delete(KV_STORE, FIRST_PULL_PENDING_KEY);
}

// A page about to reload after a wipe must not write the old account's state into the new
// account's database; a closed connection makes every later write fail.
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
  _needsV2DataMigration = false;
  _pendingPersists.clear();
}

export { EVENTS_STORE, KV_STORE, READ_MODEL_STORE, SNAPSHOTS_STORE };

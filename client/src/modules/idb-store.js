// IDB plumbing — singleton connection, key helpers, fire-and-forget persistence.
// Changes when: the storage backend or key scheme changes.

import { openDB } from 'idb';

const DB_NAME = 'kanvana-db';
const DB_VERSION = 2;
const KV_STORE = 'kv';
const EVENTS_STORE = 'events';
const SNAPSHOTS_STORE = 'snapshots';
const READ_MODEL_STORE = 'read_model';

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

/**
 * Wait for all fire-and-forget IDB writes to settle.
 * Only intended for use in tests — do not call in application code.
 */
export async function _flushPersistsForTesting() {
  await Promise.all([..._pendingPersists]);
}

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

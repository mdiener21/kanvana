// IDB plumbing — singleton connection, key helpers, fire-and-forget persistence.
// Changes when: the storage backend or key scheme changes.

import { openDB } from 'idb';

const DB_NAME = 'kanvana-db';
const DB_VERSION = 1;
const KV_STORE = 'kv';

let _db = null;

// In-flight persist Promises — used by _flushPersistsForTesting().
const _pendingPersists = new Set();

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(KV_STORE);
    }
  });
  return _db;
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
  _pendingPersists.clear();
}

export { KV_STORE };

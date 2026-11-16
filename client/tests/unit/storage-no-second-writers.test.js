// Storage reads never write, and board changes reach the board list only through
// their events (ADR-0005: the reducer is the sole read-model writer, #330).

import { test, expect, beforeEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from './setup.js';
import {
  initStorage,
  _flushPersistsForTesting,
  loadTasks
} from '../../src/modules/storage.js';
import { openStore, KV_STORE, READ_MODEL_STORE } from '../../src/modules/idb-store.js';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const TODO_ID = '22222222-2222-4222-8222-222222222222';
const DONE_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
});

async function allRecords(db) {
  const records = {};
  for (const storeName of [KV_STORE, READ_MODEL_STORE]) {
    const keys = await db.getAllKeys(storeName);
    for (const key of keys) records[`${storeName}/${key}`] = await db.get(storeName, key);
  }
  return records;
}

// A board as an older version left it: legacy priority, no column history, stale done dates.
async function seedLegacyBoard() {
  const db = await openStore();
  await db.put(KV_STORE, [{ id: BOARD_ID, name: 'Legacy', createdAt: '2024-01-01T00:00:00.000Z' }], 'kanbanBoards');
  await db.put(KV_STORE, BOARD_ID, 'kanbanActiveBoardId');
  await db.put(READ_MODEL_STORE, [
    { id: TODO_ID, name: 'To Do', order: 1, color: '#3b82f6' },
    { id: DONE_ID, name: 'Done', order: 2, color: '#16a34a', role: 'done' }
  ], `${BOARD_ID}:columns`);
  await db.put(READ_MODEL_STORE, [], `${BOARD_ID}:labels`);
  await db.put(READ_MODEL_STORE, [
    { id: '44444444-4444-4444-8444-444444444444', title: 'Open', column: TODO_ID, order: 1, priority: 'Bogus', creationDate: '2024-02-01T00:00:00.000Z', doneDate: '2024-02-03T00:00:00.000Z' },
    { id: '55555555-5555-4555-8555-555555555555', title: 'Finished', column: DONE_ID, order: 1, priority: 'High', creationDate: '2024-03-01T00:00:00.000Z', changeDate: '2024-03-05T00:00:00.000Z', columnHistory: [{ column: '', at: '' }] }
  ], `${BOARD_ID}:tasks`);
}

test('loading tasks causes no IDB write', async () => {
  await seedLegacyBoard();
  await initStorage();
  await _flushPersistsForTesting();
  const db = await openStore();
  const before = await allRecords(db);

  loadTasks();
  await _flushPersistsForTesting();

  expect(await allRecords(db)).toEqual(before);
});

test('legacy, un-normalised tasks still read normalised', async () => {
  await seedLegacyBoard();
  await initStorage();

  const [open, finished] = loadTasks();
  expect(open.priority).toBe('none');
  expect(open.doneDate).toBeUndefined();
  expect(open.columnHistory).toEqual([{ column: TODO_ID, at: '2024-02-01T00:00:00.000Z' }]);
  expect(finished.priority).toBe('high');
  expect(finished.doneDate).toBe('2024-03-05T00:00:00.000Z');
  expect(finished.columnHistory).toEqual([{ column: DONE_ID, at: '2024-03-05T00:00:00.000Z' }]);
  expect(finished.relationships).toEqual([]);
  expect(finished.subTasks).toEqual([]);
});

test('reading a legacy task without dates twice gives the same column history', async () => {
  const db = await openStore();
  await db.put(KV_STORE, [{ id: BOARD_ID, name: 'Legacy' }], 'kanbanBoards');
  await db.put(READ_MODEL_STORE, [{ id: TODO_ID, name: 'To Do', order: 1 }], `${BOARD_ID}:columns`);
  await db.put(READ_MODEL_STORE, [{ id: '44444444-4444-4444-8444-444444444444', title: 'Undated', column: TODO_ID, order: 1 }], `${BOARD_ID}:tasks`);
  await initStorage();

  const first = loadTasks()[0].columnHistory;
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(loadTasks()[0].columnHistory).toEqual(first);
});

// Fresh modules whose local events wait in `held` until the test admits them.
async function storageWithHeldEvents() {
  const held = [];
  let admit;
  vi.resetModules();
  vi.doMock('../../src/modules/event-sourcing/emitter.js', async (importOriginal) => {
    const original = await importOriginal();
    admit = original.scheduleDomainEvent;
    return { ...original, scheduleDomainEvent: (input) => { held.push(input); return Promise.resolve(); } };
  });
  const storage = await import('../../src/modules/storage.js');
  return { storage, held, admit: (input) => admit(input) };
}

test('renaming a board changes the board list only through its board.updated event', async () => {
  const db = await openStore();
  await db.put(KV_STORE, [{ id: BOARD_ID, name: 'Before', createdAt: '2024-01-01T00:00:00.000Z' }], 'kanbanBoards');
  const { storage, held, admit } = await storageWithHeldEvents();
  await storage.initStorage();
  held.length = 0; // boot's backfill events

  expect(storage.renameBoard(BOARD_ID, 'After')).toBe(true);
  expect(storage.listBoards()[0].name).toBe('Before');
  expect(held).toEqual([expect.objectContaining({ type: 'board.updated', entityId: BOARD_ID, payload: { fields: { name: 'After' } } })]);

  await admit(held[0]);
  expect(storage.listBoards()[0].name).toBe('After');
  await storage._flushPersistsForTesting();
  expect((await (await openStore()).get(KV_STORE, 'kanbanBoards'))[0].name).toBe('After');
  vi.doUnmock('../../src/modules/event-sourcing/emitter.js');
});

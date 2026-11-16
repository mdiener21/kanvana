// One normalised board read (#333): asking for a board by id gives the same normalised
// tasks, columns (always with a Done column), labels and settings whether or not the
// board is active, so export, reports, calendar and backfill all get the same guarantees.

import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from './setup.js';
import {
  initStorage,
  _flushPersistsForTesting,
  loadBoard,
  loadTasks,
  loadColumns,
  loadLabels,
  loadSettings,
  setActiveBoardId,
  _resetStorageForTesting
} from '../../src/modules/storage.js';
import { scheduleDomainEvent } from '../../src/modules/event-sourcing/emitter.js';
import { openStore, keyFor, EVENTS_STORE, KV_STORE, READ_MODEL_STORE } from '../../src/modules/idb-store.js';

const LEGACY_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '66666666-6666-4666-8666-666666666666';
const TODO_ID = '22222222-2222-4222-8222-222222222222';
const DONE_ID = '33333333-3333-4333-8333-333333333333';
const OPEN_ID = '44444444-4444-4444-8444-444444444444';
const FINISHED_ID = '55555555-5555-4555-8555-555555555555';
const UNDATED_ID = '77777777-7777-4777-8777-777777777777';

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
});

afterEach(() => {
  vi.useRealTimers();
});

// Two boards as an older version left them; the other board is active, so the legacy one is read cross-board.
async function seedLegacyBoards({ columns } = {}) {
  const db = await openStore();
  await db.put(KV_STORE, [
    { id: LEGACY_ID, name: 'Legacy', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: OTHER_ID, name: 'Other', createdAt: '2024-01-02T00:00:00.000Z' }
  ], 'kanbanBoards');
  await db.put(KV_STORE, OTHER_ID, 'kanbanActiveBoardId');
  await db.put(READ_MODEL_STORE, columns ?? [
    { id: TODO_ID, name: 'To Do', order: 1, color: '#3b82f6' },
    { id: DONE_ID, name: 'Done', order: 2, color: '#16a34a', role: 'done' }
  ], `${LEGACY_ID}:columns`);
  await db.put(READ_MODEL_STORE, [{ id: 'label-1', name: 'Urgent', color: '#ff0000' }], `${LEGACY_ID}:labels`);
  await db.put(READ_MODEL_STORE, [
    { id: OPEN_ID, title: 'Open', column: TODO_ID, order: 1, priority: 'Bogus', creationDate: '2024-02-01T00:00:00.000Z', doneDate: '2024-02-03T00:00:00.000Z' },
    { id: FINISHED_ID, title: 'Finished', column: DONE_ID, order: 2, priority: 'High', creationDate: '2024-03-01T00:00:00.000Z', changeDate: '2024-03-05T00:00:00.000Z', columnHistory: [{ column: '', at: '' }] },
    { id: UNDATED_ID, title: 'Undated', column: TODO_ID, order: 3 }
  ], `${LEGACY_ID}:tasks`);
  await db.put(KV_STORE, { swimLaneGroupBy: 'Bogus', notificationDays: 900 }, keyFor(LEGACY_ID, 'settings'));
}

test('a board read cross-board gives normalised tasks', async () => {
  await seedLegacyBoards();
  await initStorage();

  const [open, finished] = loadBoard(LEGACY_ID).tasks;

  expect(open.priority).toBe('none');
  expect(open.doneDate).toBeUndefined();
  expect(open.columnHistory).toEqual([{ column: TODO_ID, at: '2024-02-01T00:00:00.000Z' }]);
  expect(finished.priority).toBe('high');
  expect(finished.doneDate).toBe('2024-03-05T00:00:00.000Z');
  expect(finished.columnHistory).toEqual([{ column: DONE_ID, at: '2024-03-05T00:00:00.000Z' }]);
  expect(finished.relationships).toEqual([]);
  expect(finished.subTasks).toEqual([]);
});

test('a board stored without a Done column reads with one, cross-board as on the board itself', async () => {
  await seedLegacyBoards({ columns: [{ id: TODO_ID, name: 'To Do', order: 1 }] });
  await initStorage();

  const columns = loadBoard(LEGACY_ID).columns;

  expect(columns.map((column) => column.name)).toEqual(['To Do', 'Done']);
  expect(columns[1]).toMatchObject({ role: 'done', order: 2 });
  expect(columns[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  setActiveBoardId(LEGACY_ID);
  expect(loadColumns()).toEqual(columns);
});

test('the active-board reads give what the board read gives', async () => {
  await seedLegacyBoards();
  await initStorage();
  const crossBoard = loadBoard(LEGACY_ID);

  setActiveBoardId(LEGACY_ID);

  // Includes the undated task, whose column history the boot migration stamped.
  expect(loadTasks()).toEqual(crossBoard.tasks);
  expect(loadColumns()).toEqual(crossBoard.columns);
  expect(loadLabels()).toEqual(crossBoard.labels);
  expect(loadSettings()).toEqual(crossBoard.settings);
  expect(crossBoard.labels[0].group).toBe('');
  expect(crossBoard.settings).toMatchObject({ swimLaneGroupBy: 'label', notificationDays: 365 });
});

test('a task stored with no dates reads with the same column history in every session', async () => {
  await seedLegacyBoards();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2024-05-01T10:00:00.000Z'));
  await initStorage();
  const undated = () => loadBoard(LEGACY_ID).tasks.find((task) => task.id === UNDATED_ID);
  const firstSession = undated().columnHistory;
  await _flushPersistsForTesting();

  _resetStorageForTesting();
  vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
  await initStorage();

  expect(firstSession).toEqual([{ column: TODO_ID, at: '2024-05-01T10:00:00.000Z' }]);
  expect(undated().columnHistory).toEqual(firstSession);
});

test('a task that arrives with no dates after boot reads with no column history, the same in every session', async () => {
  await seedLegacyBoards();
  await initStorage();
  const task = { id: '88888888-8888-4888-8888-888888888888', title: 'Synced undated', column: TODO_ID };
  scheduleDomainEvent({ type: 'task.created', boardId: LEGACY_ID, entityId: task.id, payload: { task } });
  const synced = () => loadBoard(LEGACY_ID).tasks.find((t) => t.id === task.id);
  const firstSession = synced().columnHistory;
  await _flushPersistsForTesting();

  _resetStorageForTesting();
  await initStorage();

  expect(firstSession ?? []).toEqual([]);
  expect(synced().columnHistory).toEqual(firstSession);
});

test('a board that is not listed reads as null', async () => {
  await seedLegacyBoards();
  await initStorage();

  expect(loadBoard('no-such-board')).toBeNull();
});

test('backfill logs a legacy board as it reads: normalised tasks, and its Done column', async () => {
  await seedLegacyBoards({ columns: [{ id: TODO_ID, name: 'To Do', order: 1 }] });
  await initStorage();
  await _flushPersistsForTesting();

  const events = (await (await openStore()).getAll(EVENTS_STORE)).filter((event) => event.board_id === LEGACY_ID);
  const logged = (type) => events.filter((event) => event.type === type);

  // Stored events carry the entity id beside the payload, not in it.
  const asRead = (type, entity) => logged(type).map((event) => ({ ...event.payload[entity], id: event.entity_id }));
  const byId = (a, b) => a.id.localeCompare(b.id);
  expect(asRead('column.created', 'column').sort(byId)).toEqual(loadBoard(LEGACY_ID).columns.sort(byId));
  expect(loadBoard(LEGACY_ID).columns.map((column) => column.name)).toEqual(['To Do', 'Done']);
  expect(asRead('task.created', 'task').sort(byId)).toEqual(loadBoard(LEGACY_ID).tasks.sort(byId));
});

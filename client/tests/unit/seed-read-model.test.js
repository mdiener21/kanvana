import { test, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from './setup.js';
import {
  createBoard, getActiveBoardId, initStorage, loadColumns, loadColumnsForBoard, loadGlobalSettings, loadLabels, loadTasks,
  _flushPersistsForTesting
} from '../../src/modules/storage.js';
import { openStore, EVENTS_STORE } from '../../src/modules/idb-store.js';
import { seedBoard, seedGlobalSettings } from '../fixtures/seed-read-model.js';

const task = (id, fields = {}) => ({ id, title: id, column: 'todo', priority: 'none', order: 1, ...fields });

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
  createBoard('Seeded');
});

test('seedBoard puts the given tasks on the active board', () => {
  seedBoard({ tasks: [task('t1', { title: 'One' })] });
  expect(loadTasks().map((t) => [t.id, t.title])).toEqual([['t1', 'One']]);
});

test('seedBoard writes through events, which reach the event log', async () => {
  await initStorage();
  seedBoard({ tasks: [task('t1')] });
  await _flushPersistsForTesting();
  const events = await (await openStore()).getAll(EVENTS_STORE);
  expect(events.filter((e) => e.type === 'task.created').map((e) => e.entity_id)).toContain('t1');
});

test('seeding a slice again replaces it: missing items go, known ones are overwritten whole', () => {
  seedBoard({ tasks: [task('t1', { description: 'old', doneDate: '2024-01-01T00:00:00Z' }), task('t2')] });
  seedBoard({ tasks: [task('t1', { title: 'New' }), task('t3')] });
  const tasks = loadTasks();
  expect(tasks.map((t) => t.id)).toEqual(['t1', 't3']);
  expect(tasks[0]).toMatchObject({ title: 'New' });
  expect(tasks[0].description).toBeUndefined();
  expect(tasks[0].doneDate).toBeUndefined();
});

test('an empty list clears the slice', () => {
  seedBoard({ tasks: [task('t1')], labels: [{ id: 'l1', name: 'Bug', color: '#ff0000', group: '' }] });
  seedBoard({ tasks: [], labels: [] });
  expect(loadTasks()).toEqual([]);
  expect(loadLabels()).toEqual([]);
});

test('columns and labels keep the given order and leave other slices alone', () => {
  seedBoard({ tasks: [task('t1')] });
  seedBoard({
    columns: [
      { id: 'review', name: 'Review', color: '#aabbcc', order: 1 },
      { id: 'done', name: 'Done', color: '#505050', order: 2, role: 'done' }
    ],
    labels: [{ id: 'l2', name: 'B', color: '#000000', group: '' }, { id: 'l1', name: 'A', color: '#ffffff', group: 'G' }]
  });
  expect(loadColumns().map((c) => c.id)).toEqual(['review', 'done']);
  expect(loadLabels().map((l) => [l.id, l.group])).toEqual([['l2', ''], ['l1', 'G']]);
  expect(loadTasks().map((t) => t.id)).toEqual(['t1']);
});

test('a column seeded again after it was removed comes back', () => {
  const columns = [{ id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 }];
  seedBoard({ columns });
  seedBoard({ columns: [] });
  seedBoard({ columns });
  expect(loadColumnsForBoard(getActiveBoardId()).map((c) => c.id)).toEqual(['todo']);
});

test('seedBoard can target a board other than the active one', () => {
  const other = createBoard('Other').id;
  const active = createBoard('Active').id;
  seedBoard({ tasks: [task('o1')] }, { boardId: other });
  expect(getActiveBoardId()).toBe(active);
  expect(loadTasks()).toEqual([]);
});

test('seedGlobalSettings sets global settings through an event', () => {
  seedGlobalSettings({ timeTracking: { dateFormat: 'YYYY-MM-DD' } });
  expect(loadGlobalSettings()).toEqual({ timeTracking: { dateFormat: 'YYYY-MM-DD' } });
});

test('seedBoard refuses an order events cannot give, rather than seed a different one', () => {
  seedBoard({ tasks: [task('a'), task('b')] });
  expect(() => seedBoard({ tasks: [task('b'), task('a')] })).toThrow(/order/);
});

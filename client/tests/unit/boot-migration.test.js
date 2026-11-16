// Tests for the boot migration (#334): legacy data in, the Read Model's persisted state out.
// Seeds raw legacy localStorage / IDB data; never goes through storage's writers.

import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from './setup.js';
import { migrateLegacyState } from '../../src/modules/boot-migration.js';
import { initStorage, getActiveBoardId, loadBoard, loadTasks } from '../../src/modules/storage.js';
import { openStore, keyFor, readModelKeyFor, KV_STORE, READ_MODEL_STORE } from '../../src/modules/idb-store.js';
import { READ_MODEL_KEYS } from '../../src/modules/event-sourcing/read-model-projector.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
});

afterEach(() => {
  vi.useRealTimers();
});

async function migratedState() {
  const db = await openStore();
  await migrateLegacyState(db);
  const boards = await db.get(KV_STORE, READ_MODEL_KEYS.boards);
  const activeBoardId = await db.get(KV_STORE, 'kanbanActiveBoardId');
  const slice = async (boardId) => ({
    tasks: await db.get(READ_MODEL_STORE, readModelKeyFor(boardId, 'tasks')),
    columns: await db.get(READ_MODEL_STORE, readModelKeyFor(boardId, 'columns')),
    labels: await db.get(READ_MODEL_STORE, readModelKeyFor(boardId, 'labels')),
    settings: await db.get(KV_STORE, keyFor(boardId, 'settings'))
  });
  return { db, boards, activeBoardId, slice };
}

test('multi-board localStorage data becomes the persisted Read Model with UUID ids', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([{ id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' }]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([
    { id: 't1', title: 'Migrated', column: 'done', labels: ['l1'], columnHistory: [{ column: 'done', at: '2024-01-01T00:00:00Z' }] }
  ]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'todo', name: 'To Do', color: '#3b82f6' },
    { id: 'done', name: 'Done', color: '#505050' }
  ]));
  localStorage.setItem('kanbanBoard:board-a:labels', JSON.stringify([{ id: 'l1', name: 'Bug', color: '#ff0000', group: '' }]));
  localStorage.setItem('kanbanBoard:board-a:settings', JSON.stringify({ showAge: false }));

  const { boards, activeBoardId, slice } = await migratedState();

  expect(boards).toHaveLength(1);
  expect(boards[0]).toMatchObject({ name: 'Alpha' });
  expect(boards[0].id).toMatch(UUID_RE);
  expect(activeBoardId).toBe(boards[0].id);
  const { tasks, columns, labels, settings } = await slice(boards[0].id);
  const done = columns.find((column) => column.role === 'done');
  expect(done.id).toMatch(UUID_RE);
  expect(labels[0].id).toMatch(UUID_RE);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ title: 'Migrated', column: done.id, labels: [labels[0].id] });
  expect(tasks[0].columnHistory[0].column).toBe(done.id);
  expect(settings).toMatchObject({ showAge: false });
});

test('legacy single-board localStorage keys become one default board with the demo labels', async () => {
  localStorage.setItem('kanbanTasks', JSON.stringify([
    { id: 'task-done', title: 'Legacy done task', column: 'done', columnHistory: [{ column: 'done', at: '2024-01-01T00:00:00Z' }] },
    { id: 'task-todo', title: 'Legacy todo task', column: 'todo' }
  ]));

  const { boards, activeBoardId, slice } = await migratedState();

  expect(boards).toHaveLength(1);
  expect(boards[0].name).toBe('Default Board');
  expect(activeBoardId).toBe(boards[0].id);
  const { tasks, columns, labels, settings } = await slice(boards[0].id);
  expect(columns.map((column) => column.name)).toEqual(['To Do', 'In Progress', 'Done']);
  const byName = Object.fromEntries(columns.map((column) => [column.name, column.id]));
  expect(tasks.find((task) => task.title === 'Legacy done task').column).toBe(byName.Done);
  expect(tasks.find((task) => task.title === 'Legacy todo task').column).toBe(byName['To Do']);
  expect(labels.map((label) => label.name)).toEqual(['Task', 'Meeting', 'Email', 'Idea', 'Goal']);
  expect(settings).toMatchObject({ showPriority: true, defaultPriority: 'none' });
});

test('the migrated localStorage keys are removed, along with the stale legacy-sync keys', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([{ id: 'board-a', name: 'Alpha' }]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', '[]');
  localStorage.setItem('kanbanBoard:board-a:columns', '[]');
  localStorage.setItem('kanbanBoard:board-a:labels', '[]');
  localStorage.setItem('kanbanBoard:board-a:settings', '{}');
  localStorage.setItem('kanbanSyncMap', '{}');
  localStorage.setItem('kanbanAutoSyncEnabled', 'true');

  const keys = ['kanbanBoards', 'kanbanActiveBoardId', 'kanbanSyncMap', 'kanbanAutoSyncEnabled',
    ...['tasks', 'columns', 'labels', 'settings'].map((kind) => keyFor('board-a', kind))];

  await migratedState();

  expect(keys.filter((key) => localStorage.getItem(key) !== null)).toEqual([]);
});

test('localStorage is ignored once IDB holds boards', async () => {
  const db = await openStore();
  await db.put(KV_STORE, [{ id: '11111111-1111-4111-8111-111111111111', name: 'Kept' }], READ_MODEL_KEYS.boards);
  localStorage.setItem('kanbanBoards', JSON.stringify([{ id: 'board-a', name: 'Alpha' }]));

  const { boards } = await migratedState();

  expect(boards.map((board) => board.name)).toEqual(['Kept']);
  expect(localStorage.getItem('kanbanBoards')).not.toBeNull();
});

test('pre-read-model IDB kv slices move into the read-model store under UUID ids', async () => {
  const db = await openStore();
  await db.put(KV_STORE, [{ id: 'board-a', name: 'Alpha' }], READ_MODEL_KEYS.boards);
  await db.put(KV_STORE, 'board-a', 'kanbanActiveBoardId');
  await db.put(KV_STORE, [{ id: 't1', title: 'Old', column: 'todo' }], keyFor('board-a', 'tasks'));
  await db.put(KV_STORE, [{ id: 'todo', name: 'To Do' }, { id: 'done', name: 'Done' }], keyFor('board-a', 'columns'));

  const { boards, activeBoardId, slice } = await migratedState();

  const boardId = boards[0].id;
  expect(boardId).toMatch(UUID_RE);
  expect(activeBoardId).toBe(boardId);
  const { tasks, columns, labels } = await slice(boardId);
  const todo = columns.find((column) => column.name === 'To Do');
  expect(tasks).toEqual([expect.objectContaining({ title: 'Old', column: todo.id })]);
  expect(labels).toEqual([]);
  expect(await db.get(KV_STORE, keyFor('board-a', 'tasks'))).toBeUndefined();
  expect(await db.get(KV_STORE, keyFor('board-a', 'columns'))).toBeUndefined();
  expect(await db.get(READ_MODEL_STORE, readModelKeyFor('board-a', 'tasks'))).toBeUndefined();
});

test('a first boot with no data writes no boards and no Read Model', async () => {
  const { db, boards, activeBoardId } = await migratedState();

  expect(boards).toBeUndefined();
  expect(activeBoardId).toBeUndefined();
  expect(await db.getAllKeys(READ_MODEL_STORE)).toEqual([]);
});

test('running it again on migrated state changes nothing', async () => {
  localStorage.setItem('kanbanTasks', JSON.stringify([{ id: 't1', title: 'Legacy', column: 'todo' }]));
  const first = await migratedState();
  const before = { boards: first.boards, slice: await first.slice(first.boards[0].id) };

  const second = await migratedState();

  expect({ boards: second.boards, slice: await second.slice(second.boards[0].id) }).toEqual(before);
});

test('a task stored with no dates and no column history gets its history stamped once', async () => {
  localStorage.setItem('kanbanTasks', JSON.stringify([{ id: 't1', title: 'Undated', column: 'todo' }]));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2024-05-01T10:00:00.000Z'));
  const first = await migratedState();
  const { tasks: [stamped], columns } = await first.slice(first.boards[0].id);
  const todo = columns.find((column) => column.name === 'To Do');

  vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
  const second = await migratedState();
  const { tasks: [again] } = await second.slice(second.boards[0].id);

  expect(stamped.columnHistory).toEqual([{ column: todo.id, at: '2024-05-01T10:00:00.000Z' }]);
  expect(again.columnHistory).toEqual(stamped.columnHistory);
});

test('booting storage runs the migration: legacy localStorage data reads back through the board read', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([{ id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' }]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([
    { id: 't1', title: 'Migrated', column: 'todo', priority: 'HIGH', creationDate: '2024-01-02T00:00:00Z' }
  ]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'todo', name: 'To Do', color: '#3b82f6' },
    { id: 'done', name: 'Done', color: '#505050' }
  ]));

  await initStorage();

  const boardId = getActiveBoardId();
  expect(boardId).toMatch(UUID_RE);
  const board = loadBoard(boardId);
  const todo = board.columns.find((column) => column.name === 'To Do');
  expect(todo.id).toMatch(UUID_RE);
  expect(board.tasks).toEqual([expect.objectContaining({
    title: 'Migrated', column: todo.id, priority: 'high',
    columnHistory: [{ column: todo.id, at: '2024-01-02T00:00:00Z' }]
  })]);
  expect(loadTasks()).toEqual(board.tasks);
  expect(localStorage.getItem('kanbanBoards')).toBeNull();
});

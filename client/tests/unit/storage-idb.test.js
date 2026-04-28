/**
 * IDB-layer tests for storage.js.
 *
 * These tests exercise the paths that the unit tests in storage.test.js cannot:
 *   - initStorage() loading state from an IDB database
 *   - Both localStorage → IDB migration paths (multi-board and legacy single-board)
 *   - Cross-session persistence: write in session A, reload in session B
 *   - deleteBoard cleaning up IDB entries
 *   - The loadXxxForBoard() cross-board read helpers
 *
 * Each test gets a completely fresh IDB and localStorage via beforeEach.
 */

import { test, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from './setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  ensureBoardsInitialized,
  createBoard,
  listBoards,
  deleteBoard,
  getActiveBoardId,
  setActiveBoardId,
  loadTasks,
  saveTasks,
  loadColumns,
  saveColumns,
  loadLabels,
  saveLabels,
  loadSettings,
  saveSettings,
  loadTasksForBoard,
  loadColumnsForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
} from '../../src/modules/storage.js';

const DB_NAME = 'kanvana-db';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  // Reset in-memory state (also closes DB connection so deleteDB is not blocked).
  resetLocalStorage();
  // Wipe the fake IDB so every test starts with a completely empty database.
  await deleteDB(DB_NAME);
});

// ── initStorage: fresh-start behaviour ──────────────────────────────────────────

test('initStorage on empty IDB leaves boards list empty', async () => {
  await initStorage();
  expect(listBoards()).toEqual([]);
});

test('initStorage is safe to call twice in the same session', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const boardsAfterFirst = listBoards().length;

  await initStorage(); // second call: should not duplicate boards
  expect(listBoards().length).toBe(boardsAfterFirst);
});

// ── cross-session persistence ────────────────────────────────────────────────────

test('saveTasks persists to IDB and survives a session reset', async () => {
  // Session 1: write tasks
  await initStorage();
  ensureBoardsInitialized();
  saveTasks([{ id: 't1', title: 'Persisted task', column: 'todo', priority: 'none', order: 1 }]);

  await _flushPersistsForTesting();
  const boardId = getActiveBoardId();
  _resetStorageForTesting(); // drop in-memory state, IDB intact

  // Session 2: load from IDB
  await initStorage();
  setActiveBoardId(boardId);
  const tasks = loadTasks();
  expect(tasks.some(t => t.title === 'Persisted task')).toBe(true);
});

test('saveColumns persists to IDB and survives a session reset', async () => {
  await initStorage();
  ensureBoardsInitialized();
  saveColumns([
    { id: 'review', name: 'Review', color: '#aabbcc', order: 1, collapsed: false },
    { id: 'done',   name: 'Done',   color: '#505050', order: 2, collapsed: false },
  ]);

  await _flushPersistsForTesting();
  const boardId = getActiveBoardId();
  _resetStorageForTesting();

  await initStorage();
  setActiveBoardId(boardId);
  const columns = loadColumns();
  const reviewColumn = columns.find(c => c.name === 'Review');
  expect(reviewColumn?.id).toMatch(UUID_RE);
});

test('saveLabels persists to IDB and survives a session reset', async () => {
  await initStorage();
  ensureBoardsInitialized();
  saveLabels([{ id: 'lbl-1', name: 'Blocker', color: '#ff0000', group: '' }]);

  await _flushPersistsForTesting();
  const boardId = getActiveBoardId();
  _resetStorageForTesting();

  await initStorage();
  setActiveBoardId(boardId);
  const labels = loadLabels();
  const label = labels.find(l => l.name === 'Blocker');
  expect(label?.id).toMatch(UUID_RE);
});

test('saveSettings persists to IDB and survives a session reset', async () => {
  await initStorage();
  ensureBoardsInitialized();
  saveSettings({ swimLanesEnabled: true, notificationDays: 7 });

  await _flushPersistsForTesting();
  const boardId = getActiveBoardId();
  _resetStorageForTesting();

  await initStorage();
  setActiveBoardId(boardId);
  const settings = loadSettings();
  expect(settings.swimLanesEnabled).toBe(true);
  expect(settings.notificationDays).toBe(7);
});

test('createBoard persists board list and per-board defaults across sessions', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const board = createBoard('Persisted Board');
  saveTasks([{ id: 't1', title: 'Board task', column: 'todo', priority: 'none', order: 1 }]);

  await _flushPersistsForTesting();
  _resetStorageForTesting();

  await initStorage();
  expect(listBoards().some(b => b.id === board.id && b.name === 'Persisted Board')).toBe(true);
  setActiveBoardId(board.id);
  expect(loadTasks().some(t => t.title === 'Board task')).toBe(true);
});

test('active board id persists across sessions', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const b = createBoard('Switch Target');
  setActiveBoardId(b.id);

  await _flushPersistsForTesting();
  _resetStorageForTesting();

  await initStorage();
  expect(getActiveBoardId()).toBe(b.id);
});

// ── deleteBoard cleans up IDB ─────────────────────────────────────────────────────

test('deleteBoard removes per-board data from IDB', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const defaultId = getActiveBoardId();
  const other = createBoard('Doomed');
  setActiveBoardId(other.id);
  saveTasks([{ id: 't1', title: 'Doomed task', column: 'todo', priority: 'none', order: 1 }]);

  await _flushPersistsForTesting();

  setActiveBoardId(defaultId);
  deleteBoard(other.id);
  await _flushPersistsForTesting();
  _resetStorageForTesting();

  await initStorage();
  expect(listBoards().some(b => b.id === other.id)).toBe(false);
  // Board-scoped helpers should return empty arrays for the deleted board.
  expect(loadTasksForBoard(other.id)).toEqual([]);
  expect(loadColumnsForBoard(other.id)).toEqual([]);
});

// ── localStorage → IDB migration ─────────────────────────────────────────────────

test('migrates multi-board localStorage data on first initStorage', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([
    { id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' },
  ]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([
    { id: 't1', title: 'Migrated', column: 'todo', priority: 'none', order: 1 },
  ]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1, collapsed: false },
    { id: 'done', name: 'Done', color: '#505050', order: 2, collapsed: false },
  ]));
  localStorage.setItem('kanbanBoard:board-a:labels', JSON.stringify([]));

  await initStorage();

  expect(listBoards().length).toBe(1);
  expect(listBoards()[0].name).toBe('Alpha');
  expect(getActiveBoardId()).toMatch(UUID_RE);
  const columns = loadColumns();
  const todoColumn = columns.find((column) => column.name === 'To Do');
  const doneColumn = columns.find((column) => column.role === 'done');
  expect(todoColumn?.id).toMatch(UUID_RE);
  expect(doneColumn?.id).toMatch(UUID_RE);
  expect(loadTasks().some(t => t.title === 'Migrated' && t.column === todoColumn.id)).toBe(true);
});

test('migrates legacy done id to a UUID done role and rewrites task references', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([
    { id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' },
  ]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([
    {
      id: 'task-a',
      title: 'Done migrated',
      column: 'done',
      priority: 'none',
      order: 1,
      labels: ['label-a'],
      columnHistory: [{ column: 'done', at: '2024-01-01T00:00:00Z' }]
    },
  ]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1, collapsed: false },
    { id: 'done', name: 'Done', color: '#505050', order: 2, collapsed: false },
  ]));
  localStorage.setItem('kanbanBoard:board-a:labels', JSON.stringify([
    { id: 'label-a', name: 'Label A', color: '#ff0000', group: '' }
  ]));

  await initStorage();

  const doneColumn = loadColumns().find((column) => column.role === 'done');
  const label = loadLabels().find((entry) => entry.name === 'Label A');
  const task = loadTasks().find((entry) => entry.title === 'Done migrated');
  expect(doneColumn?.id).toMatch(UUID_RE);
  expect(label?.id).toMatch(UUID_RE);
  expect(task?.id).toMatch(UUID_RE);
  expect(task?.column).toBe(doneColumn.id);
  expect(task?.columnHistory?.[0]?.column).toBe(doneColumn.id);
  expect(task?.labels).toEqual([label.id]);
});

test('migration cleans up localStorage after completing', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([
    { id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' },
  ]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'done', name: 'Done', color: '#505050', order: 1, collapsed: false },
  ]));
  localStorage.setItem('kanbanBoard:board-a:labels', JSON.stringify([]));

  await initStorage();

  expect(localStorage.getItem('kanbanBoards')).toBeNull();
  expect(localStorage.getItem('kanbanActiveBoardId')).toBeNull();
  expect(localStorage.getItem('kanbanBoard:board-a:tasks')).toBeNull();
  expect(localStorage.getItem('kanbanBoard:board-a:columns')).toBeNull();
  expect(localStorage.getItem('kanbanBoard:board-a:labels')).toBeNull();
});

test('migrates legacy single-board localStorage keys (pre-multi-board format)', async () => {
  // Oldest format: no kanbanBoards key, data stored in kanbanTasks / kanbanColumns / kanbanLabels.
  localStorage.setItem('kanbanTasks', JSON.stringify([
    { id: 't1', title: 'Legacy task', column: 'todo', priority: 'none', order: 1 },
  ]));
  localStorage.setItem('kanbanColumns', JSON.stringify([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1, collapsed: false },
    { id: 'done', name: 'Done', color: '#505050', order: 2, collapsed: false },
  ]));
  localStorage.setItem('kanbanLabels', JSON.stringify([]));

  await initStorage();

  expect(listBoards().length).toBe(1);
  expect(loadTasks().some(t => t.title === 'Legacy task')).toBe(true);

  // Legacy keys should be gone.
  expect(localStorage.getItem('kanbanTasks')).toBeNull();
  expect(localStorage.getItem('kanbanColumns')).toBeNull();
  expect(localStorage.getItem('kanbanLabels')).toBeNull();
});

test('migrates legacy single-board tasks without columns using UUID default column mappings', async () => {
  localStorage.setItem('kanbanTasks', JSON.stringify([
    { id: 'task-done', title: 'Legacy done task', column: 'done', priority: 'none', order: 1, changeDate: '2024-01-01T00:00:00Z', columnHistory: [{ column: 'done', at: '2024-01-01T00:00:00Z' }] },
    { id: 'task-todo', title: 'Legacy todo task', column: 'todo', priority: 'none', order: 2 },
  ]));

  await initStorage();

  const columns = loadColumns();
  const doneColumn = columns.find((column) => column.role === 'done');
  const todoColumn = columns.find((column) => column.name === 'To Do');
  const tasks = loadTasks();
  const doneTask = tasks.find((task) => task.title === 'Legacy done task');
  const todoTask = tasks.find((task) => task.title === 'Legacy todo task');
  expect(doneColumn?.id).toMatch(UUID_RE);
  expect(todoColumn?.id).toMatch(UUID_RE);
  expect(doneTask?.column).toBe(doneColumn.id);
  expect(doneTask?.columnHistory?.[0]?.column).toBe(doneColumn.id);
  expect(doneTask?.doneDate).toBeTruthy();
  expect(todoTask?.column).toBe(todoColumn.id);
});

test('migration does not run again on a subsequent initStorage call (same IDB)', async () => {
  localStorage.setItem('kanbanBoards', JSON.stringify([
    { id: 'board-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' },
  ]));
  localStorage.setItem('kanbanActiveBoardId', 'board-a');
  localStorage.setItem('kanbanBoard:board-a:tasks', JSON.stringify([]));
  localStorage.setItem('kanbanBoard:board-a:columns', JSON.stringify([
    { id: 'done', name: 'Done', color: '#505050', order: 1, collapsed: false },
  ]));
  localStorage.setItem('kanbanBoard:board-a:labels', JSON.stringify([]));

  await initStorage(); // Session 1: migrates, clears localStorage

  _resetStorageForTesting(); // simulate new session (IDB kept, localStorage already empty)
  await initStorage(); // Session 2: loads from IDB

  expect(listBoards().length).toBe(1);
  expect(listBoards()[0].name).toBe('Alpha');
});

test('initStorage with corrupt kanbanBoards in IDB yields empty boards list', async () => {
  // Manually write a non-array to the IDB boards key to simulate corruption.
  const { openDB } = await import('idb');
  const db = await openDB(DB_NAME, 1, { upgrade(d) { d.createObjectStore('kv'); } });
  await db.put('kv', 'not-an-array', 'kanbanBoards');
  db.close();

  await initStorage();

  // state.boards will be 'not-an-array' but listBoards() guards with Array.isArray.
  expect(listBoards()).toEqual([]);
});

// ── cross-board read helpers ───────────────────────────────────────────────────────

test('loadTasksForBoard reads tasks for a non-active board without changing active board', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const defaultId = getActiveBoardId();
  const other = createBoard('Other');

  setActiveBoardId(other.id);
  saveTasks([{ id: 'o1', title: 'Other task', column: 'todo', priority: 'none', order: 1 }]);

  // Switch back to default before the assertion.
  setActiveBoardId(defaultId);

  const tasks = loadTasksForBoard(other.id);
  expect(tasks.some(t => t.id === 'o1')).toBe(true);
  expect(getActiveBoardId()).toBe(defaultId); // active board must be unchanged
});

test('loadColumnsForBoard reads columns for a non-active board', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const defaultId = getActiveBoardId();
  const other = createBoard('Other');

  setActiveBoardId(other.id);
  saveColumns([
    { id: 'special', name: 'Special', color: '#ff0000', order: 1, collapsed: false },
    { id: 'done',    name: 'Done',    color: '#505050', order: 2, collapsed: false },
  ]);

  setActiveBoardId(defaultId);

  const columns = loadColumnsForBoard(other.id);
  expect(columns.some(c => c.id === 'special')).toBe(true);
  expect(getActiveBoardId()).toBe(defaultId);
});

test('loadLabelsForBoard reads labels for a non-active board', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const defaultId = getActiveBoardId();
  const other = createBoard('Other');

  setActiveBoardId(other.id);
  saveLabels([{ id: 'lbl-x', name: 'X', color: '#123456', group: '' }]);

  setActiveBoardId(defaultId);

  const labels = loadLabelsForBoard(other.id);
  expect(labels.some(l => l.id === 'lbl-x')).toBe(true);
  expect(getActiveBoardId()).toBe(defaultId);
});

test('loadSettingsForBoard reads settings for a non-active board', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const defaultId = getActiveBoardId();
  const other = createBoard('Other');

  setActiveBoardId(other.id);
  saveSettings({ swimLanesEnabled: true, swimLaneGroupBy: 'priority' });

  setActiveBoardId(defaultId);

  const settings = loadSettingsForBoard(other.id);
  expect(settings?.swimLanesEnabled).toBe(true);
  expect(getActiveBoardId()).toBe(defaultId);
});

test('loadTasksForBoard returns empty array for unknown board id', async () => {
  await initStorage();
  expect(loadTasksForBoard('non-existent-board')).toEqual([]);
});

import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import {
  ensureBoardsInitialized,
  listBoards,
  getActiveBoardId,
  getActiveBoardName,
  createBoard,
  renameBoard,
  deleteBoard,
  loadColumns,
  saveColumns,
  loadTasks,
  saveTasks,
  loadLabels,
  saveLabels,
  loadSettings,
  saveSettings
} from '../../src/modules/storage.js';

beforeEach(() => {
  resetLocalStorage();
});

// ── Board CRUD ──────────────────────────────────────────────────────

test('ensureBoardsInitialized creates default board on empty storage', () => {
  ensureBoardsInitialized();
  const boards = listBoards();
  expect(boards.length).toBe(1);
  expect(boards[0].name).toBe('Default Board');
  expect(getActiveBoardId()).toBe(boards[0].id);
});

test('ensureBoardsInitialized is idempotent', () => {
  ensureBoardsInitialized();
  const boards1 = listBoards();
  ensureBoardsInitialized();
  const boards2 = listBoards();
  expect(boards1.length).toBe(boards2.length);
  expect(boards1[0].id).toBe(boards2[0].id);
});

test('listBoards returns empty array for corrupt data', () => {
  localStorage.setItem('kanbanBoards', 'not-json');
  const boards = listBoards();
  expect(boards).toEqual([]);
});

test('createBoard creates board with correct keys', () => {
  ensureBoardsInitialized();
  const board = createBoard('Test Board');
  expect(board.name).toBe('Test Board');
  expect(board.id.startsWith('board-')).toBe(true);

  const boards = listBoards();
  expect(boards.length).toBe(2);
  expect(getActiveBoardId()).toBe(board.id);
});

test('createBoard uses Untitled board for empty name', () => {
  ensureBoardsInitialized();
  const board = createBoard('');
  expect(board.name).toBe('Untitled board');
});

test('renameBoard updates board name', () => {
  ensureBoardsInitialized();
  const board = createBoard('Original');
  const result = renameBoard(board.id, 'Renamed');
  expect(result).toBe(true);

  const boards = listBoards();
  const renamed = boards.find(b => b.id === board.id);
  expect(renamed.name).toBe('Renamed');
});

test('renameBoard returns false for non-existent board', () => {
  ensureBoardsInitialized();
  expect(renameBoard('non-existent', 'Name')).toBe(false);
});

test('renameBoard returns false for empty name', () => {
  ensureBoardsInitialized();
  const board = createBoard('Board');
  expect(renameBoard(board.id, '')).toBe(false);
});

test('deleteBoard removes board and its data', () => {
  ensureBoardsInitialized();
  const board = createBoard('To Delete');
  expect(listBoards().length).toBe(2);

  const result = deleteBoard(board.id);
  expect(result).toBe(true);
  expect(listBoards().length).toBe(1);
});

test('deleteBoard returns false when only one board exists', () => {
  ensureBoardsInitialized();
  const boards = listBoards();
  expect(deleteBoard(boards[0].id)).toBe(false);
});

test('deleteBoard switches active board if deleted board was active', () => {
  ensureBoardsInitialized();
  const board = createBoard('Second');
  expect(getActiveBoardId()).toBe(board.id);

  deleteBoard(board.id);
  const active = getActiveBoardId();
  expect(active).not.toBe(board.id);
  expect(active).toBeTruthy();
});

test('getActiveBoardName returns board name', () => {
  ensureBoardsInitialized();
  const name = getActiveBoardName();
  expect(name).toBe('Default Board');
});

// ── Data loading/saving ─────────────────────────────────────────────

test('loadColumns returns default columns on fresh board', () => {
  createBoard('Fresh');
  const columns = loadColumns();
  expect(columns.length >= 3).toBe(true);
  const ids = columns.map(c => c.id);
  expect(ids).toContain('todo');
  expect(ids).toContain('inprogress');
  expect(ids).toContain('done');
});

test('loadColumns ensures Done column exists', () => {
  createBoard('No Done');
  saveColumns([{ id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 }]);
  const columns = loadColumns();
  expect(columns.some(c => c.id === 'done')).toBe(true);
});

test('saveColumns + loadColumns roundtrip', () => {
  createBoard('Roundtrip');
  const cols = [
    { id: 'a', name: 'A', color: '#111111', order: 1, collapsed: false },
    { id: 'done', name: 'Done', color: '#222222', order: 2, collapsed: false }
  ];
  saveColumns(cols);
  const loaded = loadColumns();
  expect(loaded.length).toBe(2);
  expect(loaded[0].id).toBe('a');
});

test('loadTasks normalizes priority on load', () => {
  createBoard('Priority Test');
  saveTasks([
    { id: 't1', title: 'Test', priority: 'INVALID', column: 'todo' }
  ]);
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === 't1');
  expect(task.priority).toBe('none');
});

test('loadTasks adds doneDate to tasks in Done column that lack it', () => {
  createBoard('Done Date Test');
  saveTasks([
    { id: 't1', title: 'Done task', column: 'done', priority: 'none', changeDate: '2024-01-01T00:00:00Z' }
  ]);
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === 't1');
  expect(task.doneDate).toBeTruthy();
});

test('loadTasks removes doneDate from tasks not in Done column', () => {
  createBoard('Not Done Test');
  saveTasks([
    { id: 't1', title: 'Active task', column: 'todo', priority: 'none', doneDate: '2024-01-01T00:00:00Z' }
  ]);
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === 't1');
  expect(task.doneDate).toBeUndefined();
});

test('saveTasks + loadTasks roundtrip', () => {
  createBoard('Task Roundtrip');
  const tasks = [
    { id: 't1', title: 'Task 1', column: 'todo', priority: 'high', order: 1 }
  ];
  saveTasks(tasks);
  const loaded = loadTasks();
  expect(loaded.length).toBe(1);
  expect(loaded[0].title).toBe('Task 1');
});

test('loadLabels adds empty group to labels missing it', () => {
  createBoard('Labels Test');
  saveLabels([
    { id: 'l1', name: 'Bug', color: '#ff0000' }
  ]);
  const labels = loadLabels();
  const label = labels.find(l => l.id === 'l1');
  expect(label.group).toBe('');
});

test('loadSettings returns defaults on fresh board', () => {
  createBoard('Settings Test');
  const settings = loadSettings();
  expect(settings.showPriority).toBe(true);
  expect(settings.swimLanesEnabled).toBe(false);
  expect(settings.swimLaneGroupBy).toBe('label');
  expect(settings.defaultPriority).toBe('none');
});

test('loadSettings normalizes invalid swimLaneGroupBy', () => {
  createBoard('Settings Normalize');
  saveSettings({ swimLaneGroupBy: 'invalid-value' });
  const settings = loadSettings();
  expect(settings.swimLaneGroupBy).toBe('label');
});

test('loadSettings clamps countdownWarningThreshold to be >= urgentThreshold', () => {
  createBoard('Threshold Test');
  saveSettings({ countdownUrgentThreshold: 10, countdownWarningThreshold: 5 });
  const settings = loadSettings();
  expect(settings.countdownWarningThreshold >= settings.countdownUrgentThreshold).toBe(true);
});

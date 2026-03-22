import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addTask, updateTask, deleteTask, moveTaskToTopInColumn } from '../../src/modules/tasks.js';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
  saveTasks([]);
});

// ── addTask ─────────────────────────────────────────────────────────

test('addTask creates task with order 1 (top of column)', () => {
  addTask('First', 'desc', 'medium', '', 'todo', []);
  const tasks = loadTasks();
  expect(tasks.length).toBe(1);
  expect(tasks[0].title).toBe('First');
  expect(tasks[0].order).toBe(1);
  expect(tasks[0].column).toBe('todo');
  expect(tasks[0].priority).toBe('medium');
});

test('addTask bumps existing task orders in same column', () => {
  addTask('First', '', 'none', '', 'todo', []);
  addTask('Second', '', 'none', '', 'todo', []);
  const tasks = loadTasks();
  const second = tasks.find(t => t.title === 'Second');
  const first = tasks.find(t => t.title === 'First');
  expect(second.order).toBe(1);
  expect(first.order > 1).toBe(true);
});

test('addTask does nothing for empty title', () => {
  addTask('', 'desc', 'none', '', 'todo', []);
  expect(loadTasks().length).toBe(0);
});

test('addTask sets creationDate, changeDate, and columnHistory', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(task.creationDate).toBeTruthy();
  expect(task.changeDate).toBeTruthy();
  expect(Array.isArray(task.columnHistory)).toBe(true);
  expect(task.columnHistory.length).toBe(1);
  expect(task.columnHistory[0].column).toBe('todo');
});

test('addTask sets doneDate when added to Done column', () => {
  addTask('Done Task', '', 'none', '', 'done', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeTruthy();
});

test('addTask does not set doneDate for non-Done column', () => {
  addTask('Active Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeUndefined();
});

test('addTask preserves labels', () => {
  addTask('Labeled', '', 'none', '', 'todo', ['label-1', 'label-2']);
  const task = loadTasks()[0];
  expect(task.labels).toEqual(['label-1', 'label-2']);
});

// ── updateTask ──────────────────────────────────────────────────────

test('updateTask updates title, description, priority', () => {
  addTask('Original', 'old desc', 'low', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Updated', 'new desc', 'high', '2024-12-31', 'todo', ['label-1']);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.title).toBe('Updated');
  expect(updated.description).toBe('new desc');
  expect(updated.priority).toBe('high');
  expect(updated.dueDate).toBe('2024-12-31');
  expect(updated.labels).toEqual(['label-1']);
});

test('updateTask does nothing for empty title', () => {
  addTask('Original', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, '', 'desc', 'high', '', 'todo', []);
  const after = loadTasks().find(t => t.id === task.id);
  expect(after.title).toBe('Original');
});

test('updateTask appends to columnHistory on column change', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', 'none', '', 'inprogress', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.column).toBe('inprogress');
  expect(updated.columnHistory.length).toBe(2);
  expect(updated.columnHistory[1].column).toBe('inprogress');
});

test('updateTask sets doneDate when moving to Done column', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', 'none', '', 'done', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeTruthy();
});

test('updateTask removes doneDate when moving from Done column', () => {
  addTask('Task', '', 'none', '', 'done', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeTruthy();

  updateTask(task.id, 'Task', '', 'none', '', 'todo', []);
  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeUndefined();
});

test('updateTask seeds columnHistory if missing', () => {
  saveTasks([
    { id: 't1', title: 'Legacy', column: 'todo', priority: 'none', creationDate: '2024-01-01T00:00:00Z' }
  ]);
  updateTask('t1', 'Legacy Updated', '', 'none', '', 'todo', []);

  const updated = loadTasks().find(t => t.id === 't1');
  expect(Array.isArray(updated.columnHistory)).toBe(true);
  expect(updated.columnHistory.length >= 1).toBe(true);
});

// ── deleteTask ──────────────────────────────────────────────────────

test('deleteTask removes task by ID', () => {
  addTask('Task 1', '', 'none', '', 'todo', []);
  addTask('Task 2', '', 'none', '', 'todo', []);
  const tasks = loadTasks();
  expect(tasks.length).toBe(2);

  deleteTask(tasks[0].id);
  expect(loadTasks().length).toBe(1);
});

// ── moveTaskToTopInColumn ───────────────────────────────────────────

test('moveTaskToTopInColumn moves specified task to order 1', () => {
  addTask('First', '', 'none', '', 'todo', []);
  addTask('Second', '', 'none', '', 'todo', []);
  addTask('Third', '', 'none', '', 'todo', []);

  const tasks = loadTasks();
  const first = tasks.find(t => t.title === 'First');

  moveTaskToTopInColumn(first.id, 'todo');

  const after = loadTasks();
  const moved = after.find(t => t.id === first.id);
  expect(moved.order).toBe(1);
});

test('moveTaskToTopInColumn returns null for missing args', () => {
  expect(moveTaskToTopInColumn(null, 'todo')).toBeNull();
  expect(moveTaskToTopInColumn('t1', null)).toBeNull();
});

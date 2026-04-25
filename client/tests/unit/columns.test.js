import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadColumns, saveColumns, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addColumn, toggleColumnCollapsed, updateColumn, deleteColumn } from '../../src/modules/columns.js';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
});

// ── addColumn ───────────────────────────────────────────────────────

test('addColumn creates a new column', () => {
  const before = loadColumns().length;
  addColumn('Review', '#ff0000');
  const after = loadColumns();
  expect(after.length).toBe(before + 1);
  const review = after.find(c => c.name === 'Review');
  expect(review).toBeTruthy();
  expect(review.id.startsWith('review-')).toBe(true);
});

test('addColumn does nothing for empty name', () => {
  const before = loadColumns().length;
  addColumn('', '#ff0000');
  expect(loadColumns().length).toBe(before);
});

test('addColumn normalizes color', () => {
  addColumn('Test Col', 'invalid-color');
  const col = loadColumns().find(c => c.name === 'Test Col');
  expect(col.color.startsWith('#')).toBe(true);
});

// ── toggleColumnCollapsed ───────────────────────────────────────────

test('toggleColumnCollapsed toggles from false to true', () => {
  const columns = loadColumns();
  const col = columns[0];
  expect(col.collapsed).toBe(false);

  const result = toggleColumnCollapsed(col.id);
  expect(result).toBe(true);

  const updated = loadColumns().find(c => c.id === col.id);
  expect(updated.collapsed).toBe(true);
});

test('toggleColumnCollapsed toggles from true to false', () => {
  const columns = loadColumns();
  const col = columns[0];
  toggleColumnCollapsed(col.id);
  toggleColumnCollapsed(col.id);

  const updated = loadColumns().find(c => c.id === col.id);
  expect(updated.collapsed).toBe(false);
});

test('toggleColumnCollapsed returns false for non-existent column', () => {
  expect(toggleColumnCollapsed('non-existent')).toBe(false);
});

test('toggleColumnCollapsed returns false for empty ID', () => {
  expect(toggleColumnCollapsed('')).toBe(false);
});

// ── updateColumn ────────────────────────────────────────────────────

test('updateColumn updates name and color', () => {
  const columns = loadColumns();
  const col = columns[0];
  updateColumn(col.id, 'Updated Name', '#00ff00');

  const updated = loadColumns().find(c => c.id === col.id);
  expect(updated.name).toBe('Updated Name');
  expect(updated.color).toBe('#00ff00');
});

test('updateColumn does nothing for empty name', () => {
  const columns = loadColumns();
  const col = columns[0];
  const originalName = col.name;
  updateColumn(col.id, '', '#00ff00');

  const updated = loadColumns().find(c => c.id === col.id);
  expect(updated.name).toBe(originalName);
});

// ── deleteColumn ────────────────────────────────────────────────────

test('deleteColumn returns false for Done column', () => {
  expect(deleteColumn('done')).toBe(false);
});

test('deleteColumn deletes column and its tasks', () => {
  addColumn('Temp', '#ff0000');
  const tempCol = loadColumns().find(c => c.name === 'Temp');
  saveTasks([
    { id: 't1', title: 'In temp', column: tempCol.id, priority: 'none' },
    { id: 't2', title: 'In todo', column: 'todo', priority: 'none' }
  ]);

  const result = deleteColumn(tempCol.id);
  expect(result).toBe(true);
  expect(loadColumns().some(c => c.id === tempCol.id)).toBe(false);

  const tasks = loadTasks();
  expect(tasks.some(t => t.column === tempCol.id)).toBe(false);
  expect(tasks.some(t => t.id === 't2')).toBe(true);
});

import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, getActiveBoardId, loadBoardEvents, loadColumns, saveColumns, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addColumn, toggleColumnCollapsed, updateColumn, deleteColumn, updateColumnPositions } from '../../src/modules/columns.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  expect(review.id).toMatch(UUID_RE);
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

test('addColumn appends column.created board event', () => {
  addColumn(' Review ', '#ff0000');
  const review = loadColumns().find(c => c.name === 'Review');

  const events = loadBoardEvents(getActiveBoardId());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'column.created',
    actor: { type: 'human', id: null },
    details: { columnId: review.id, columnName: 'Review' }
  });
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

test('updateColumn appends column.renamed board event when name changes', () => {
  const col = loadColumns()[0];

  updateColumn(col.id, 'Updated Name', col.color);

  const events = loadBoardEvents(getActiveBoardId());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'column.renamed',
    actor: { type: 'human', id: null },
    details: { columnId: col.id, from: col.name, to: 'Updated Name' }
  });
});

test('updateColumn does not append rename event when name is unchanged', () => {
  const col = loadColumns()[0];

  updateColumn(col.id, col.name, '#00ff00');

  expect(loadBoardEvents(getActiveBoardId())).toEqual([]);
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

test('deleteColumn returns false and logs no event for missing column', () => {
  expect(deleteColumn('missing-id')).toBe(false);
  expect(loadBoardEvents(getActiveBoardId())).toEqual([]);
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

test('deleteColumn appends column.deleted and task.deleted board events for destroyed tasks', () => {
  saveColumns([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
    { id: 'review', name: 'Review', color: '#ff0000', order: 2 }
  ]);
  saveTasks([
    { id: 't1', title: 'First', column: 'review', priority: 'none' },
    { id: 't2', title: 'Second', column: 'review', priority: 'none' },
    { id: 't3', title: 'Keep', column: 'todo', priority: 'none' }
  ]);

  deleteColumn('review');

  expect(loadBoardEvents(getActiveBoardId()).map((event) => ({ type: event.type, details: event.details }))).toEqual([
    { type: 'column.deleted', details: { columnName: 'Review', tasksDestroyed: 2 } },
    { type: 'task.deleted', details: { taskId: 't1', taskTitle: 'First', column: 'review', columnName: 'Review' } },
    { type: 'task.deleted', details: { taskId: 't2', taskTitle: 'Second', column: 'review', columnName: 'Review' } }
  ]);
});

// ── updateColumnPositions ───────────────────────────────────────────

test('updateColumnPositions appends a single column.reordered event when columns actually moved', () => {
  saveColumns([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
    { id: 'review', name: 'Review', color: '#ff0000', order: 2 }
  ]);
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => ({
      querySelectorAll: () => [
        { dataset: { column: 'review' } },
        { dataset: { column: 'todo' } }
      ]
    })
  };

  try {
    updateColumnPositions();
  } finally {
    globalThis.document = previousDocument;
  }

  const events = loadBoardEvents(getActiveBoardId());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'column.reordered' });
});

test('updateColumnPositions emits no event when order is unchanged', () => {
  saveColumns([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
    { id: 'review', name: 'Review', color: '#ff0000', order: 2 }
  ]);
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => ({
      querySelectorAll: () => [
        { dataset: { column: 'todo' } },
        { dataset: { column: 'review' } }
      ]
    })
  };

  try {
    updateColumnPositions();
  } finally {
    globalThis.document = previousDocument;
  }

  expect(loadBoardEvents(getActiveBoardId())).toEqual([]);
});

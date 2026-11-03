import { describe, test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadColumns, saveColumns, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addColumn, toggleColumnCollapsed, updateColumn, deleteColumn, updateColumnPositions } from '../../src/modules/columns.js';
import { byColumnOrder, byOrder } from '../../src/modules/utils.js';
import { applyEvents, createProjectionState } from '../../src/modules/reducer.js';

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

const boardOrder = () => [...loadColumns()].sort(byOrder).map((c) => c.name);

test('addColumn places new columns before Done on a default board, whose columns have no order', () => {
  addColumn('Review', '#ff0000');
  expect(boardOrder()).toEqual(['To Do', 'In Progress', 'Review', 'Done']);
  addColumn('QA', '#ff0000');
  expect(boardOrder()).toEqual(['To Do', 'In Progress', 'Review', 'QA', 'Done']);
});

test('addColumn places a new column directly before Done when Done is not last', () => {
  addColumn('Review', '#ff0000');
  const orderByName = { Review: 1, Done: 2, 'To Do': 3, 'In Progress': 4 };
  saveColumns(loadColumns().map((c) => ({ ...c, order: orderByName[c.name] })));
  addColumn('QA', '#ff0000');
  expect(boardOrder()).toEqual(['Review', 'QA', 'Done', 'To Do', 'In Progress']);
});

describe('columns that tie on order', () => {
  const column = (name, order, extra = {}) => ({ id: name, name, order, ...extra });
  const done = (order) => column('Done', order, { role: 'done' });
  const sortedNames = (columns) => [...columns].sort(byColumnOrder).map((c) => c.name);

  test('two offline devices adding columns leave Done last on both, whichever event came first', () => {
    const event = (id, wallTime, type, entityId, payload) => ({ id, type, hlc: { wallTime, counter: 0, nodeId: 'n' }, scope: 'board', board_id: 'b', entity_id: entityId, payload });
    const base = createProjectionState({ boards: [{ id: 'b' }], columns: [column('To Do', 1), column('In Progress', 2), done(3)] });
    // Device A adds X and X2, leaving X=3, X2=4, Done=5; device B adds Y, leaving Y=3, Done=4, with the later HLC.
    const fromA = [
      event('a1', 1, 'column.reordered', '', { order: [{ id: 'Done', order: 4 }] }),
      event('a2', 2, 'column.created', 'X', { column: column('X', 3) }),
      event('a3', 3, 'column.reordered', '', { order: [{ id: 'Done', order: 5 }] }),
      event('a4', 4, 'column.created', 'X2', { column: column('X2', 4) }),
    ];
    const fromB = [
      event('b1', 5, 'column.reordered', '', { order: [{ id: 'Done', order: 4 }] }),
      event('b2', 6, 'column.created', 'Y', { column: column('Y', 3) }),
    ];
    const merged = applyEvents(base, [...fromA, ...fromB]);

    expect(merged.columns.find((c) => c.name === 'Done').order).toBe(4);
    expect(merged.columns.find((c) => c.name === 'X2').order).toBe(4);
    expect(sortedNames(merged.columns).at(-1)).toBe('Done');
  });

  test('Done sorts after its tie in any starting order', () => {
    expect(sortedNames([done(4), column('X2', 4)])).toEqual(['X2', 'Done']);
    expect(sortedNames([column('X2', 4), done(4)])).toEqual(['X2', 'Done']);
  });

  test('Done dragged elsewhere stays there, and only yields on a tie', () => {
    expect(sortedNames([column('To Do', 2), done(1), column('X', 3)])).toEqual(['Done', 'To Do', 'X']);
    expect(sortedNames([done(2), column('To Do', 2), column('X', 3)])).toEqual(['To Do', 'Done', 'X']);
  });

  test('a default board without orders keeps Done last', () => {
    expect(sortedNames([done(undefined), column('To Do', undefined)])).toEqual(['To Do', 'Done']);
  });
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

test('deleteColumn returns false for missing column', () => {
  expect(deleteColumn('missing-id')).toBe(false);
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

// ── updateColumnPositions ───────────────────────────────────────────

// ── soft-delete columns ─────────────────────────────────────────────

test('deleteColumn hides the column from loadColumns', () => {
  addColumn('Sprint 1', '#fff');
  const [col] = loadColumns().filter(c => c.id !== 'done');

  deleteColumn(col.id);

  expect(loadColumns().find(c => c.id === col.id)).toBeUndefined();
});

test('deleteColumn deletes tasks in the column', () => {
  addColumn('Sprint 1', '#fff');
  const [col] = loadColumns().filter(c => c.id !== 'done');
  saveTasks([{ id: 't1', title: 'Task', column: col.id, order: 1, priority: 'none', labels: [] }]);

  deleteColumn(col.id);

  expect(loadTasks().find(t => t.id === 't1')).toBeUndefined();
});

// ── WIP limits ──────────────────────────────────────────────────────

test('addColumn defaults to an unlimited WIP limit', () => {
  addColumn('No Limit', '#ff0000');
  const col = loadColumns().find(c => c.name === 'No Limit');
  expect(col.wipLimit).toBe(0);
});

test('addColumn stores and normalizes a WIP limit', () => {
  addColumn('Limited', '#ff0000', '5');
  expect(loadColumns().find(c => c.name === 'Limited').wipLimit).toBe(5);

  addColumn('Junk', '#ff0000', -4);
  expect(loadColumns().find(c => c.name === 'Junk').wipLimit).toBe(0);
});

test('updateColumn persists a WIP limit change', () => {
  addColumn('Doing', '#ff0000', 3);
  const id = loadColumns().find(c => c.name === 'Doing').id;

  updateColumn(id, 'Doing', '#ff0000', 8);
  expect(loadColumns().find(c => c.id === id).wipLimit).toBe(8);
});

test('updateColumn accepts a limit below the current task count', () => {
  addColumn('Doing', '#ff0000', 10);
  const id = loadColumns().find(c => c.name === 'Doing').id;
  saveTasks([
    { id: 'a', title: 'a', column: id, order: 1 },
    { id: 'b', title: 'b', column: id, order: 2 },
    { id: 'c', title: 'c', column: id, order: 3 }
  ]);

  updateColumn(id, 'Doing', '#ff0000', 1);
  expect(loadColumns().find(c => c.id === id).wipLimit).toBe(1);
  expect(loadTasks().filter(t => t.column === id)).toHaveLength(3);
});

test('omitting the WIP limit on updateColumn preserves the existing one', () => {
  addColumn('Doing', '#ff0000', 3);
  const id = loadColumns().find(c => c.name === 'Doing').id;

  updateColumn(id, 'Doing', '#00ff00');
  const col = loadColumns().find(c => c.id === id);
  expect(col.wipLimit).toBe(3);
  expect(col.color).toBe('#00ff00');
});

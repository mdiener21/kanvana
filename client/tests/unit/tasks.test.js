import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, getActiveBoardId, loadBoardEvents, loadDeletedTasksForBoard, loadTasks, saveColumns, saveLabels, saveSettings, saveTasks } from '../../src/modules/storage.js';
import { addTask, updateTask, deleteTask, moveTaskToTopInColumn, updateTaskPositionsFromDrop } from '../../src/modules/tasks.js';

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

test('addTask appends task.created activity with column details', () => {
  saveColumns([{ id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 }]);

  addTask('Task', '', 'none', '', 'todo', []);

  const task = loadTasks()[0];
  expect(task.activityLog).toHaveLength(1);
  expect(task.activityLog[0]).toMatchObject({
    type: 'task.created',
    actor: { type: 'human', id: null },
    details: { column: 'todo', columnName: 'To Do' }
  });
  expect(task.activityLog[0].at).toBeTruthy();
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

test('updateTask appends activity for changed task fields', () => {
  addTask('Original', 'old desc', 'low', '2024-01-01', 'todo', []);
  const task = loadTasks()[0];

  updateTask(task.id, 'Updated', 'new desc', 'high', '2024-12-31', 'inprogress', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.activityLog.slice(1).map(event => event.type)).toEqual([
    'task.title_changed',
    'task.description_changed',
    'task.priority_changed',
    'task.due_date_changed',
    'task.column_moved'
  ]);
  expect(updated.activityLog.slice(1).map(event => event.details)).toEqual([
    { from: 'Original', to: 'Updated' },
    { changed: true },
    { from: 'low', to: 'high' },
    { from: '2024-01-01', to: '2024-12-31' },
    { from: 'todo', to: 'inprogress' }
  ]);
  expect(JSON.stringify(updated.activityLog)).not.toContain('old desc');
  expect(JSON.stringify(updated.activityLog)).not.toContain('new desc');
});

test('updateTask appends activity when labels are added and removed', () => {
  saveLabels([
    { id: 'label-1', name: 'Bug', color: '#ff0000' },
    { id: 'label-2', name: 'Feature', color: '#00ff00' }
  ]);
  addTask('Task', '', 'none', '', 'todo', ['label-1']);
  const task = loadTasks()[0];

  updateTask(task.id, 'Task', '', 'none', '', 'todo', ['label-2']);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.activityLog.slice(1).map(event => event.type)).toEqual([
    'task.label_added',
    'task.label_removed'
  ]);
  expect(updated.activityLog.slice(1).map(event => event.details)).toEqual([
    { labelId: 'label-2', labelName: 'Feature' },
    { labelId: 'label-1', labelName: 'Bug' }
  ]);
});

test('updateTask appends activity when relationships are added and removed', () => {
  saveTasks([
    {
      id: 'source',
      title: 'Source',
      description: '',
      priority: 'none',
      dueDate: '',
      column: 'todo',
      labels: [],
      relationships: [{ type: 'prerequisite', targetTaskId: 'target-1' }],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    },
    { id: 'target-1', title: 'Old Target', column: 'todo', labels: [], relationships: [] },
    { id: 'target-2', title: 'New Target', column: 'todo', labels: [], relationships: [] }
  ]);

  updateTask('source', 'Source', '', 'none', '', 'todo', [], [{ type: 'related', targetTaskId: 'target-2' }]);

  const updated = loadTasks().find(t => t.id === 'source');
  expect(updated.activityLog.map(event => event.type)).toEqual([
    'task.relationship_added',
    'task.relationship_removed'
  ]);
  expect(updated.activityLog.map(event => event.details)).toEqual([
    { targetTaskId: 'target-2', targetTaskTitle: 'New Target', type: 'related' },
    { targetTaskId: 'target-1', targetTaskTitle: 'Old Target', type: 'prerequisite' }
  ]);
});

test('updateTask appends inverse relationship added activity to target task', () => {
  saveTasks([
    {
      id: 'source',
      title: 'Source',
      description: '',
      priority: 'none',
      dueDate: '',
      column: 'todo',
      labels: [],
      relationships: [],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    },
    { id: 'target', title: 'Target', column: 'todo', labels: [], relationships: [], activityLog: [] }
  ]);

  updateTask('source', 'Source', '', 'none', '', 'todo', [], [{ type: 'prerequisite', targetTaskId: 'target' }]);

  const target = loadTasks().find(t => t.id === 'target');
  expect(target.relationships).toEqual([{ type: 'dependent', targetTaskId: 'source' }]);
  expect(target.activityLog).toHaveLength(1);
  expect(target.activityLog[0]).toMatchObject({
    type: 'task.relationship_added',
    actor: { type: 'human', id: null },
    details: { targetTaskId: 'source', targetTaskTitle: 'Source', type: 'dependent' }
  });
});

test('updateTask appends inverse relationship removed activity to target task', () => {
  saveTasks([
    {
      id: 'source',
      title: 'Source',
      description: '',
      priority: 'none',
      dueDate: '',
      column: 'todo',
      labels: [],
      relationships: [{ type: 'prerequisite', targetTaskId: 'target' }],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    },
    {
      id: 'target',
      title: 'Target',
      column: 'todo',
      labels: [],
      relationships: [{ type: 'dependent', targetTaskId: 'source' }],
      activityLog: []
    }
  ]);

  updateTask('source', 'Source', '', 'none', '', 'todo', [], []);

  const target = loadTasks().find(t => t.id === 'target');
  expect(target.relationships).toEqual([]);
  expect(target.activityLog).toHaveLength(1);
  expect(target.activityLog[0]).toMatchObject({
    type: 'task.relationship_removed',
    actor: { type: 'human', id: null },
    details: { targetTaskId: 'source', targetTaskTitle: 'Source', type: 'dependent' }
  });
});

test('updateTask appends inverse relationship removed and added activity when target inverse type changes', () => {
  saveTasks([
    {
      id: 'source',
      title: 'Source',
      description: '',
      priority: 'none',
      dueDate: '',
      column: 'todo',
      labels: [],
      relationships: [{ type: 'prerequisite', targetTaskId: 'target' }],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    },
    {
      id: 'target',
      title: 'Target',
      column: 'todo',
      labels: [],
      relationships: [{ type: 'dependent', targetTaskId: 'source' }],
      activityLog: []
    }
  ]);

  updateTask('source', 'Source', '', 'none', '', 'todo', [], [{ type: 'related', targetTaskId: 'target' }]);

  const target = loadTasks().find(t => t.id === 'target');
  expect(target.relationships).toEqual([{ type: 'related', targetTaskId: 'source' }]);
  expect(target.activityLog.map(event => event.type)).toEqual([
    'task.relationship_removed',
    'task.relationship_added'
  ]);
  expect(target.activityLog.map(event => event.details)).toEqual([
    { targetTaskId: 'source', targetTaskTitle: 'Source', type: 'dependent' },
    { targetTaskId: 'source', targetTaskTitle: 'Source', type: 'related' }
  ]);
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

test('deleteTask appends task.deleted board event with task and column details', () => {
  saveColumns([{ id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 }]);
  addTask('Task 1', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  deleteTask(task.id);

  const events = loadBoardEvents(getActiveBoardId());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'task.deleted',
    actor: { type: 'human', id: null },
    details: { taskId: task.id, taskTitle: 'Task 1', column: 'todo', columnName: 'To Do' }
  });
});

// ── soft-delete ────────────────────────────────────────────────────

test('deleteTask soft-deletes: task hidden from loadTasks but present in loadDeletedTasksForBoard', () => {
  addTask('Task 1', '', 'none', '', 'todo', []);
  const [task] = loadTasks();

  deleteTask(task.id);

  expect(loadTasks().find(t => t.id === task.id)).toBeUndefined();
  const deleted = loadDeletedTasksForBoard(getActiveBoardId());
  expect(deleted).toHaveLength(1);
  expect(deleted[0].id).toBe(task.id);
  expect(deleted[0].deleted).toBe(true);
});

test('purgeDeleted hard-removes soft-deleted tasks from storage', async () => {
  const { purgeDeleted } = await import('../../src/modules/storage.js');
  addTask('Task 1', '', 'none', '', 'todo', []);
  const [task] = loadTasks();
  deleteTask(task.id);

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);

  purgeDeleted(getActiveBoardId());

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(0);
});

// ── updateTaskPositionsFromDrop ─────────────────────────────────────

test('updateTaskPositionsFromDrop appends activity when task moves columns', () => {
  saveTasks([
    {
      id: 't1',
      title: 'Task',
      column: 'todo',
      order: 1,
      priority: 'none',
      labels: [],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    }
  ]);
  const item = { dataset: { taskId: 't1' } };
  const from = { dataset: { column: 'todo' }, closest: () => from };
  const to = { dataset: { column: 'inprogress' }, closest: () => to };
  const fromColumn = { dataset: { column: 'todo' }, querySelectorAll: () => [] };
  const toColumn = { dataset: { column: 'inprogress' }, querySelectorAll: () => [item] };
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [fromColumn, toColumn]
  };

  try {
    updateTaskPositionsFromDrop({ from, to, item });
  } finally {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }

  const updated = loadTasks().find(t => t.id === 't1');
  expect(updated.activityLog).toHaveLength(1);
  expect(updated.activityLog[0]).toMatchObject({
    type: 'task.column_moved',
    actor: { type: 'human', id: null },
    details: { from: 'todo', to: 'inprogress' }
  });
  expect(updated.columnHistory.length).toBe(2);
});

test('updateTaskPositionsFromDrop appends activity when swimlane drag changes priority', () => {
  saveSettings({ swimLanesEnabled: true, swimLaneGroupBy: 'priority' });
  saveTasks([
    {
      id: 't1',
      title: 'Task',
      column: 'todo',
      order: 1,
      priority: 'low',
      labels: [],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    }
  ]);
  const item = { dataset: { taskId: 't1' } };
  const from = { dataset: { column: 'todo', laneKey: 'low' }, closest: () => from };
  const to = { dataset: { column: 'todo', laneKey: 'high' }, closest: () => to };
  const cell = { dataset: { column: 'todo' }, querySelectorAll: () => [item] };
  const row = { querySelectorAll: () => [cell] };
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => ({ dataset: { viewMode: 'swimlanes' } }),
    querySelectorAll: () => [row]
  };

  try {
    updateTaskPositionsFromDrop({ from, to, item });
  } finally {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }

  const updated = loadTasks().find(t => t.id === 't1');
  expect(updated.priority).toBe('high');
  expect(updated.activityLog).toHaveLength(1);
  expect(updated.activityLog[0]).toMatchObject({
    type: 'task.priority_changed',
    details: { from: 'low', to: 'high' }
  });
});

test('updateTaskPositionsFromDrop appends activity when swimlane drag changes labels', () => {
  saveLabels([{ id: 'label-1', name: 'Bug', color: '#ff0000' }]);
  saveSettings({ swimLanesEnabled: true, swimLaneGroupBy: 'label' });
  saveTasks([
    {
      id: 't1',
      title: 'Task',
      column: 'todo',
      order: 1,
      priority: 'none',
      labels: [],
      columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }],
      activityLog: []
    }
  ]);
  const item = { dataset: { taskId: 't1' } };
  const from = { dataset: { column: 'todo', laneKey: '__no-group__' }, closest: () => from };
  const to = { dataset: { column: 'todo', laneKey: 'label-1' }, closest: () => to };
  const cell = { dataset: { column: 'todo' }, querySelectorAll: () => [item] };
  const row = { querySelectorAll: () => [cell] };
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => ({ dataset: { viewMode: 'swimlanes' } }),
    querySelectorAll: () => [row]
  };

  try {
    updateTaskPositionsFromDrop({ from, to, item });
  } finally {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }

  const updated = loadTasks().find(t => t.id === 't1');
  expect(updated.labels).toEqual(['label-1']);
  expect(updated.activityLog).toHaveLength(1);
  expect(updated.activityLog[0]).toMatchObject({
    type: 'task.label_added',
    details: { labelId: 'label-1', labelName: 'Bug' }
  });
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

// ── subTasks ────────────────────────────────────────────────────────

test('addTask stores subTasks when provided', () => {
  const subTasks = [
    { id: 'st1', title: 'Step one', completed: false, order: 1 },
    { id: 'st2', title: 'Step two', completed: true, order: 2 }
  ];
  addTask('Parent', '', 'none', '', 'todo', [], [], subTasks);
  const task = loadTasks()[0];
  expect(Array.isArray(task.subTasks)).toBe(true);
  expect(task.subTasks.length).toBe(2);
  expect(task.subTasks[0].title).toBe('Step one');
  expect(task.subTasks[0].completed).toBe(false);
  expect(task.subTasks[1].title).toBe('Step two');
  expect(task.subTasks[1].completed).toBe(true);
});

test('addTask stores empty subTasks array when none provided', () => {
  addTask('Plain', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(Array.isArray(task.subTasks)).toBe(true);
  expect(task.subTasks.length).toBe(0);
});

test('updateTask persists updated subTasks', () => {
  addTask('Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Original', completed: false, order: 1 }
  ]);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Updated', completed: true, order: 1 },
    { id: 'st2', title: 'New step', completed: false, order: 2 }
  ]);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(2);
  expect(updated.subTasks[0].title).toBe('Updated');
  expect(updated.subTasks[0].completed).toBe(true);
  expect(updated.subTasks[1].title).toBe('New step');
});

test('updateTask clears subTasks when empty array passed', () => {
  addTask('Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Step', completed: false, order: 1 }
  ]);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(0);
});

test('updateTask normalizes invalid subTask entries', () => {
  addTask('Parent', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Valid', completed: false, order: 1 },
    { id: '', title: 'No id', completed: false, order: 2 },
    { id: 'st3', title: '', completed: false, order: 3 }
  ]);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(1);
  expect(updated.subTasks[0].id).toBe('st1');
});

test('subTasks persist through storage round-trip', () => {
  const subTasks = [
    { id: 'st1', title: 'Persist me', completed: true, order: 1 }
  ];
  addTask('Parent', '', 'none', '', 'todo', [], [], subTasks);

  // Re-load from storage
  const reloaded = loadTasks();
  const task = reloaded[0];
  expect(task.subTasks[0].title).toBe('Persist me');
  expect(task.subTasks[0].completed).toBe(true);
});

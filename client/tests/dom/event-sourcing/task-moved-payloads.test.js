import { beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import {
  createBoard,
  initStorage,
  loadTasks,
  saveColumns,
  saveTasks,
  _flushPersistsForTesting,
  _resetStorageForTesting
} from '../../../src/modules/storage.js';
import {
  addTask,
  moveTaskToTopInColumn,
  sortColumnTasks,
  updateTask,
  updateTaskPositionsFromDrop
} from '../../../src/modules/tasks.js';

const DB_NAME = 'kanvana-db';

const COLUMNS = [
  { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
  { id: 'doing', name: 'Doing', color: '#f59e0b', order: 2 }
];

function task(id, column, order, extra = {}) {
  return { id, title: id, description: '', priority: 'none', dueDate: '', column, order, labels: [], relationships: [], subTasks: [], columnHistory: [], ...extra };
}

beforeEach(async () => {
  _resetStorageForTesting();
  await deleteDB(DB_NAME);
  await initStorage();
  createBoard('Moves');
  saveColumns(COLUMNS.map((column) => ({ ...column })));
  saveTasks([task('a', 'todo', 1), task('b', 'todo', 2), task('c', 'doing', 1)]);
  await _flushPersistsForTesting();
});

async function movedEvents(action) {
  const events = [];
  const handler = (customEvent) => events.push(customEvent.detail);
  on(EVENT_EMITTED, handler);
  action();
  await _flushPersistsForTesting();
  off(EVENT_EMITTED, handler);
  return events
    .filter((event) => event.type === 'task.moved')
    .map(({ entity_id, payload }) => ({ entity_id, payload }));
}

test('addTask emits the renumbered column with the new task first', async () => {
  const events = await movedEvents(() => addTask('new', '', 'none', '', 'todo'));
  const newId = loadTasks().find((t) => t.title === 'new').id;

  expect(events).toEqual([{
    entity_id: newId,
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'a', column: 'todo', order: 2 },
        { id: 'b', column: 'todo', order: 3 },
        { id: newId, column: 'todo', order: 1 }
      ]
    }
  }]);
});

test('updateTask to another column emits every task on the board', async () => {
  const events = await movedEvents(() => updateTask('a', 'a', '', 'none', '', 'doing', []));

  expect(events).toEqual([{
    entity_id: 'a',
    payload: {
      from_column: 'todo',
      to_column: 'doing',
      order: [
        { id: 'a', column: 'doing', order: 1 },
        { id: 'b', column: 'todo', order: 2 },
        { id: 'c', column: 'doing', order: 1 }
      ]
    }
  }]);
});

test('a drop to another column emits every task on the board', async () => {
  const item = { dataset: { taskId: 'b' } };
  const from = { dataset: {}, closest: () => ({ dataset: { column: 'todo' } }) };
  const to = { dataset: {}, closest: () => ({ dataset: { column: 'doing' } }) };

  const events = await movedEvents(() => {
    vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });
    try {
      updateTaskPositionsFromDrop({ item, from, to });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  expect(events).toEqual([{
    entity_id: 'b',
    payload: {
      from_column: 'todo',
      to_column: 'doing',
      order: [
        { id: 'a', column: 'todo', order: 1 },
        { id: 'b', column: 'doing', order: 2 },
        { id: 'c', column: 'doing', order: 1 }
      ]
    }
  }]);
});

test('moveTaskToTopInColumn emits every task on the board', async () => {
  const events = await movedEvents(() => moveTaskToTopInColumn('b', 'todo'));

  expect(events).toEqual([{
    entity_id: 'b',
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'a', column: 'todo', order: 2 },
        { id: 'b', column: 'todo', order: 1 },
        { id: 'c', column: 'doing', order: 1 }
      ]
    }
  }]);
});

test('sortColumnTasks emits the sorted column with the column id as entity id', async () => {
  saveTasks([task('a', 'todo', 1), task('b', 'todo', 2, { priority: 'urgent' }), task('c', 'doing', 1)]);
  await _flushPersistsForTesting();

  const events = await movedEvents(() => sortColumnTasks('todo', 'priority'));

  expect(events).toEqual([{
    entity_id: 'todo',
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'b', column: 'todo', order: 1 },
        { id: 'a', column: 'todo', order: 2 }
      ]
    }
  }]);
});

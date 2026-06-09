import { beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import { createBoard, initStorage, saveColumns, saveTasks, _flushPersistsForTesting, _resetStorageForTesting } from '../../../src/modules/storage.js';
import { addColumn } from '../../../src/modules/columns.js';
import { addLabel, deleteLabel } from '../../../src/modules/labels.js';
import { deleteTask, updateTask } from '../../../src/modules/tasks.js';

const DB_NAME = 'kanvana-db';

beforeEach(async () => {
  _resetStorageForTesting();
  await deleteDB(DB_NAME);
  await initStorage();
  createBoard('Events');
  await _flushPersistsForTesting();
});

function settleEvents() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

async function collectEvents(action) {
  const events = [];
  const handler = (customEvent) => events.push(customEvent.detail);
  on(EVENT_EMITTED, handler);
  action();
  await _flushPersistsForTesting();
  off(EVENT_EMITTED, handler);
  return events;
}

test('updateTask emits one task.updated event with HLC entity id and minimal fields', async () => {
  saveTasks([
    {
      id: 'task-a',
      title: 'Before',
      description: '',
      priority: 'none',
      dueDate: '',
      column: 'todo',
      labels: [],
      relationships: [],
      subTasks: [],
      columnHistory: []
    }
  ]);

  const events = await collectEvents(() => {
    updateTask('task-a', 'After', '', 'none', '', 'todo', []);
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'task.updated',
    entity_id: 'task-a',
    scope: 'board',
    payload: { fields: { title: 'After' } }
  });
  expect(events[0].hlc).toEqual({
    wallTime: expect.any(Number),
    counter: expect.any(Number),
    nodeId: expect.any(String)
  });
});

test('addColumn emits column.created with the created column payload', async () => {
  const events = await collectEvents(() => {
    addColumn('Review', '#ff0000');
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'column.created',
    payload: { column: { name: 'Review', color: '#ff0000' } }
  });
});

test('label mutations emit label entity and task membership events', async () => {
  saveTasks([{ id: 'task-a', title: 'Task', column: 'todo', labels: [] }]);

  const addEvents = await collectEvents(() => {
    addLabel('Bug', '#ff0000', 'Type');
  });
  const labelId = addEvents[0].entity_id;
  const updateEvents = await collectEvents(() => {
    updateTask('task-a', 'Task', '', 'none', '', 'todo', [labelId]);
  });
  const deleteEvents = await collectEvents(() => {
    deleteLabel(labelId);
  });

  expect(addEvents.map((event) => event.type)).toEqual(['label.created']);
  expect(updateEvents.map((event) => event.type)).toContain('label.added_to_task');
  expect(deleteEvents.map((event) => event.type)).toEqual(['label.removed_from_task', 'label.deleted']);
});

test('updateTask emits collection-op and move events for non-scalar changes', async () => {
  saveColumns([
    { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
    { id: 'doing', name: 'Doing', color: '#f59e0b', order: 2 }
  ]);
  saveTasks([
    { id: 'task-a', title: 'Task', column: 'todo', labels: [], relationships: [], subTasks: [], columnHistory: [] },
    { id: 'task-b', title: 'Other', column: 'todo', labels: [], relationships: [], subTasks: [], columnHistory: [] }
  ]);

  const events = await collectEvents(() => {
    updateTask('task-a', 'Task', '', 'none', '', 'doing', ['label-a'], [{ type: 'related', targetTaskId: 'task-b' }], [
      { id: 'sub-a', title: 'Check', completed: false }
    ]);
  });

  expect(events.map((event) => event.type)).toEqual([
    'task.moved',
    'label.added_to_task',
    'relationship.added',
    'relationship.added',
    'subtask.added'
  ]);
  // The forward link is emitted for task-a and its inverse for task-b, so the
  // bidirectional relationship replays from events alone (ADR-0005).
  const relationshipEvents = events.filter((event) => event.type === 'relationship.added');
  expect(relationshipEvents.map((event) => event.entity_id)).toEqual(['task-a', 'task-b']);
  expect(relationshipEvents[1].payload.relationship).toEqual({ type: 'related', targetTaskId: 'task-a' });
});

test('deleteTask emits task.deleted', async () => {
  saveTasks([{ id: 'task-a', title: 'Task', column: 'todo', labels: [] }]);

  const events = await collectEvents(() => {
    deleteTask('task-a');
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'task.deleted', entity_id: 'task-a' });
});

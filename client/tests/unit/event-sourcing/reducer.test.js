import { expect, test, vi } from 'vitest';
import { applyEvent, applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

function event(overrides) {
  return {
    id: overrides.id || crypto.randomUUID(),
    type: overrides.type,
    hlc: overrides.hlc || { wallTime: 1000, counter: 0, nodeId: 'node-a' },
    at: overrides.at || '2026-05-26T00:00:00.000Z',
    actor: overrides.actor || { type: 'human', id: null },
    scope: overrides.scope || 'board',
    board_id: Object.hasOwn(overrides, 'board_id') ? overrides.board_id : 'board-a',
    entity_id: overrides.entity_id || 'task-a',
    payload: overrides.payload || {}
  };
}

test('applyEvent is idempotent by event id', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }]
  });
  const update = event({
    id: 'event-a',
    type: 'task.updated',
    payload: { fields: { title: 'After' } }
  });

  const once = applyEvent(state, update);
  const twice = applyEvent(once, update);

  expect(twice).toEqual(once);
  expect(twice.tasks).toEqual([{ id: 'task-a', title: 'After', column: 'todo', columnHistory: [] }]);
});

test('task.deleted tombstones prevent later task updates from resurrecting the task', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }]
  });

  const deleted = applyEvent(state, event({ id: 'delete-a', type: 'task.deleted' }));
  const updated = applyEvent(deleted, event({
    id: 'update-a',
    type: 'task.updated',
    payload: { fields: { title: 'After' } }
  }));

  expect(updated.tasks).toEqual([]);
  expect(updated.taskTombstones.has('task-a')).toBe(true);
});

test('task.updated merges different field events on the same task', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', description: '', column: 'todo', columnHistory: [] }]
  });

  const withTitle = applyEvent(state, event({
    id: 'title-a',
    type: 'task.updated',
    payload: { fields: { title: 'After' } }
  }));
  const withDescription = applyEvent(withTitle, event({
    id: 'description-a',
    type: 'task.updated',
    payload: { fields: { description: 'Details' } }
  }));

  expect(withDescription.tasks[0]).toMatchObject({
    id: 'task-a',
    title: 'After',
    description: 'Details'
  });
});

test('task.moved updates column order and columnHistory', () => {
  const state = createProjectionState({
    tasks: [
      { id: 'task-a', title: 'A', column: 'todo', order: 1, columnHistory: [{ column: 'todo', at: '2026-05-25T00:00:00.000Z' }] },
      { id: 'task-b', title: 'B', column: 'doing', order: 1, columnHistory: [] }
    ]
  });

  const moved = applyEvent(state, event({
    id: 'move-a',
    type: 'task.moved',
    payload: {
      from_column: 'todo',
      to_column: 'doing',
      order: [
        { id: 'task-a', column: 'doing', order: 1 },
        { id: 'task-b', column: 'doing', order: 2 }
      ]
    }
  }));

  expect(moved.tasks.find((task) => task.id === 'task-a')).toMatchObject({
    column: 'doing',
    order: 1,
    columnHistory: [
      { column: 'todo', at: '2026-05-25T00:00:00.000Z' },
      { column: 'doing', at: '2026-05-26T00:00:00.000Z' }
    ]
  });
  expect(moved.tasks.find((task) => task.id === 'task-b')).toMatchObject({ column: 'doing', order: 2 });
});

test('unknown event types warn and leave projection unchanged', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }]
  });

  const next = applyEvent(state, event({ id: 'unknown-a', type: 'unknown.event' }));

  expect(next).toEqual(state);
  expect(warn).toHaveBeenCalledWith('Unknown event type: unknown.event');
});

test.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
  'an inherited object key %s is an unknown event type, not a handler (#181)',
  (type) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = createProjectionState({ tasks: [{ id: 'task-a', title: 'Before', column: 'todo' }] });

    const next = applyEvent(state, event({ id: `inherited-${type}`, type }));

    expect(next).toEqual(state);
    expect(warn).toHaveBeenCalledWith(`Unknown event type: ${type}`);
  }
);

test('label events create update and tombstone labels', () => {
  const created = applyEvent(createProjectionState(), event({
    id: 'label-create',
    type: 'label.created',
    entity_id: 'label-a',
    payload: { label: { name: 'Bug', color: '#ff0000', group: 'Type' } }
  }));
  const updated = applyEvent(created, event({
    id: 'label-update',
    type: 'label.updated',
    entity_id: 'label-a',
    payload: { fields: { name: 'Feature' } }
  }));
  const deleted = applyEvent(updated, event({
    id: 'label-delete',
    type: 'label.deleted',
    entity_id: 'label-a'
  }));

  expect(created.labels).toEqual([{ id: 'label-a', name: 'Bug', color: '#ff0000', group: 'Type' }]);
  expect(updated.labels).toEqual([{ id: 'label-a', name: 'Feature', color: '#ff0000', group: 'Type' }]);
  expect(deleted.labels).toEqual([{ id: 'label-a', name: 'Feature', color: '#ff0000', group: 'Type', deleted: true }]);
});

test('label task membership events update task label refs', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Task', labels: [], column: 'todo', columnHistory: [] }]
  });

  const added = applyEvent(state, event({
    id: 'label-add',
    type: 'label.added_to_task',
    entity_id: 'task-a',
    payload: { label_id: 'label-a' }
  }));
  const removed = applyEvent(added, event({
    id: 'label-remove',
    type: 'label.removed_from_task',
    entity_id: 'task-a',
    payload: { label_id: 'label-a' }
  }));

  expect(added.tasks[0].labels).toEqual(['label-a']);
  expect(removed.tasks[0].labels).toEqual([]);
});

test('column events create update delete and reorder columns', () => {
  const created = applyEvent(createProjectionState(), event({
    id: 'column-create',
    type: 'column.created',
    entity_id: 'column-a',
    payload: { column: { name: 'Todo', color: '#000000', order: 2 } }
  }));
  const updated = applyEvent(created, event({
    id: 'column-update',
    type: 'column.updated',
    entity_id: 'column-a',
    payload: { fields: { name: 'Doing' } }
  }));
  const reordered = applyEvent(updated, event({
    id: 'column-reorder',
    type: 'column.reordered',
    entity_id: 'column-a',
    payload: { order: [{ id: 'column-a', order: 1 }] }
  }));
  const deleted = applyEvent(reordered, event({
    id: 'column-delete',
    type: 'column.deleted',
    entity_id: 'column-a'
  }));

  expect(reordered.columns).toEqual([{ id: 'column-a', name: 'Doing', color: '#000000', order: 1 }]);
  expect(deleted.columns).toEqual([{ id: 'column-a', name: 'Doing', color: '#000000', order: 1, deleted: true }]);
});

test('settings.updated handles board and global settings', () => {
  const boardSettings = applyEvent(createProjectionState(), event({
    id: 'settings-board',
    type: 'settings.updated',
    payload: { fields: { showPriority: false } }
  }));
  const globalSettings = applyEvent(boardSettings, event({
    id: 'settings-global',
    type: 'settings.updated',
    scope: 'global',
    board_id: null,
    payload: { fields: { locale: 'de-DE' } }
  }));

  expect(boardSettings.settings).toEqual({ showPriority: false });
  expect(globalSettings.globalSettings).toEqual({ locale: 'de-DE' });
});

test('settings.updated in the timetracking scope touches neither board nor global settings', () => {
  const next = applyEvent(createProjectionState(), event({
    id: 'settings-tt',
    type: 'settings.updated',
    scope: 'timetracking',
    board_id: null,
    payload: { fields: { locale: 'de-DE' } }
  }));

  expect(next.settings).toEqual({});
  expect(next.globalSettings).toEqual({});
  expect(next.appliedEventIds.has('settings-tt')).toBe(true);
});

test('projection state carries an empty time-tracking slot that survives events', () => {
  const state = createProjectionState();
  expect(state.timeTracking).toEqual({ customers: [], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } });

  const next = applyEvent(state, event({ id: 'board-ev', type: 'settings.updated', payload: { fields: { a: 1 } } }));
  expect(next.timeTracking).toEqual({ customers: [], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } });
});

test('subtask and relationship events update embedded task collections', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Task', subTasks: [], relationships: [], column: 'todo', columnHistory: [] }]
  });

  const withSubtask = applyEvent(state, event({
    id: 'subtask-add',
    type: 'subtask.added',
    payload: { subtask: { id: 'sub-a', text: 'Check', completed: false } }
  }));
  const toggled = applyEvent(withSubtask, event({
    id: 'subtask-toggle',
    type: 'subtask.toggled',
    payload: { subtask_id: 'sub-a', completed: true }
  }));
  const withRelationship = applyEvent(toggled, event({
    id: 'relationship-add',
    type: 'relationship.added',
    payload: { relationship: { type: 'related', targetTaskId: 'task-b' } }
  }));
  const withoutRelationship = applyEvent(withRelationship, event({
    id: 'relationship-remove',
    type: 'relationship.removed',
    payload: { targetTaskId: 'task-b', relationship_type: 'related' }
  }));

  expect(toggled.tasks[0].subTasks).toEqual([{ id: 'sub-a', text: 'Check', completed: true }]);
  expect(withRelationship.tasks[0].relationships).toEqual([{ type: 'related', targetTaskId: 'task-b' }]);
  expect(withoutRelationship.tasks[0].relationships).toEqual([]);
});

function hlcAt(wallTime) {
  return { wallTime, counter: 0, nodeId: 'node-a' };
}

function richState() {
  return createProjectionState({
    boards: [{ id: 'board-a', name: 'Board' }],
    tasks: [
      { id: 'task-a', title: 'A', column: 'todo', order: 1, labels: ['label-a'], subTasks: [{ id: 'sub-a', title: 'S', completed: false }], relationships: [], columnHistory: [{ column: 'todo', at: 't0' }] },
      { id: 'task-b', title: 'B', column: 'todo', order: 2, labels: [], subTasks: [], relationships: [], columnHistory: [] }
    ],
    columns: [{ id: 'todo', name: 'To do', order: 1 }, { id: 'done', name: 'Done', order: 2 }],
    labels: [{ id: 'label-a', name: 'Bug' }],
    settings: { swimlanes: false },
    timeTracking: { customers: [{ id: 'cust-a', name: 'Acme' }], projects: [{ id: 'proj-a', customerId: 'cust-a', name: 'Site' }] }
  });
}

function mixedEvents() {
  const list = [
    event({ id: 'e1', type: 'task.created', entity_id: 'task-c', payload: { task: { title: 'C', column: 'todo', order: 3 } } }),
    event({ id: 'e2', type: 'task.updated', entity_id: 'task-a', payload: { fields: { title: 'A2' } } }),
    event({ id: 'e3', type: 'task.moved', entity_id: 'task-a', payload: { order: [{ id: 'task-a', column: 'done', order: 1 }] } }),
    event({ id: 'e4', type: 'subtask.toggled', entity_id: 'task-a', payload: { subtask_id: 'sub-a', completed: true } }),
    event({ id: 'e5', type: 'label.added_to_task', entity_id: 'task-b', payload: { label_id: 'label-a' } }),
    event({ id: 'e6', type: 'relationship.added', entity_id: 'task-b', payload: { relationship: { type: 'related', targetTaskId: 'task-a' } } }),
    event({ id: 'e7', type: 'task.deleted', entity_id: 'task-c' }),
    event({ id: 'e8', type: 'task.updated', entity_id: 'task-c', payload: { fields: { title: 'resurrected?' } } }),
    event({ id: 'e9', type: 'column.created', entity_id: 'doing', payload: { column: { name: 'Doing', order: 3 } } }),
    event({ id: 'e10', type: 'column.reordered', entity_id: 'doing', payload: { order: [{ id: 'doing', order: 2 }, { id: 'done', order: 3 }] } }),
    event({ id: 'e11', type: 'label.updated', entity_id: 'label-a', payload: { fields: { name: 'Defect' } } }),
    event({ id: 'e12', type: 'settings.updated', payload: { fields: { swimlanes: true } } }),
    event({ id: 'e13', type: 'settings.updated', scope: 'global', board_id: null, payload: { fields: { theme: 'dark' } } }),
    event({ id: 'e14', type: 'board.updated', entity_id: 'board-a', payload: { fields: { name: 'Renamed' } } }),
    event({ id: 'e15', type: 'time_entry.created', scope: 'timetracking', board_id: null, entity_id: 'entry-a', payload: { timeEntry: { projectId: 'proj-a', minutes: 30 } } }),
    event({ id: 'e16', type: 'project.archived', scope: 'timetracking', board_id: null, entity_id: 'proj-a' }),
    event({ id: 'e17', type: 'customer.deleted', scope: 'timetracking', board_id: null, entity_id: 'cust-a' })
  ].map((entry, index) => ({ ...entry, hlc: hlcAt(1000 + index) }));
  return [...list, list[1], list[6]];
}

test('applying a list of events equals applying them one by one, duplicates and tombstones included', () => {
  const events = mixedEvents();

  const oneByOne = events.reduce((state, entry) => applyEvent(state, entry), richState());
  const asList = applyEvents(richState(), events);

  expect(asList).toEqual(oneByOne);
  expect(asList.tasks.map((task) => task.id)).toEqual(['task-a', 'task-b']);
  expect(asList.tasks[0]).toMatchObject({ title: 'A2', column: 'done', doneDate: '2026-05-26T00:00:00.000Z' });
});

test('applying a list of events leaves the input state unchanged', () => {
  const input = richState();
  const before = structuredClone(input);

  const next = applyEvents(input, mixedEvents());

  expect(input).toEqual(before);
  expect(next).not.toBe(input);
  expect(next.tasks[0]).not.toBe(input.tasks[0]);
  expect(next.tasks[0].subTasks[0]).not.toBe(input.tasks[0].subTasks[0]);
  expect(next.appliedEventIds).not.toBe(input.appliedEventIds);
});

// Copying the state once per event made a list cost tasks x events copies (#238); one copy keeps it linear.
// Copying the task list means walking it; this list counts its walks, and its copies (via Symbol.species) keep counting.
test('applying a list of events copies the state once, not once per event', () => {
  let walks = 0;
  class CountingTasks extends Array {
    map(...args) {
      walks += 1;
      return super.map(...args);
    }
  }
  const tasks = CountingTasks.from([{ id: 'task-a', title: 'A', column: 'todo', order: 1 }]);
  const events = Array.from({ length: 50 }, (_, index) => event({
    id: `settings-${index}`, type: 'settings.updated', hlc: hlcAt(index), payload: { fields: { n: index } }
  }));

  const next = applyEvents(createProjectionState({ tasks }), events);

  expect(next.settings).toEqual({ n: 49 });
  expect(walks).toBe(1);
});

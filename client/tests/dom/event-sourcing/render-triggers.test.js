import { expect, test } from 'vitest';
import { DATA_CHANGED, off, on } from '../../../src/modules/events.js';
import { createProjectionState } from '../../../src/modules/reducer.js';
import { reduceEventAndNotify } from '../../../src/modules/event-sourcing/dispatcher.js';

test('reducer-applied events emit DATA_CHANGED from the outer dispatcher', () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }]
  });
  const observed = [];
  const handler = (event) => observed.push(event.detail);
  on(DATA_CHANGED, handler);

  reduceEventAndNotify(state, {
    id: 'event-a',
    type: 'task.updated',
    hlc: { wallTime: 1000, counter: 0, nodeId: 'node-a' },
    at: '2026-05-26T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: 'board-a',
    entity_id: 'task-a',
    payload: { fields: { title: 'After' } }
  });

  off(DATA_CHANGED, handler);

  expect(observed).toHaveLength(1);
  expect(observed[0].event.type).toBe('task.updated');
});

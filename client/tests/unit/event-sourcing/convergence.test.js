import { expect, test } from 'vitest';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

function taskUpdated(id, wallTime, fields) {
  return {
    id,
    type: 'task.updated',
    hlc: { wallTime, counter: 0, nodeId: 'node-a' },
    at: new Date(wallTime).toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: 'board-a',
    entity_id: 'task-a',
    payload: { fields }
  };
}

test('same event set converges regardless of input order', () => {
  const seed = {
    tasks: [{ id: 'task-a', title: 'Before', description: '', priority: 'none', column: 'todo', columnHistory: [] }]
  };
  const events = [
    taskUpdated('event-title', 1000, { title: 'After' }),
    taskUpdated('event-description', 1001, { description: 'Details' }),
    taskUpdated('event-priority', 1002, { priority: 'high' })
  ];

  const forward = applyEvents(createProjectionState(seed), events);
  const reverse = applyEvents(createProjectionState(seed), [...events].reverse());

  expect(reverse.tasks).toEqual(forward.tasks);
});

import { expect, test } from 'vitest';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

function event(id, type, wallTime, payload = {}) {
  return {
    id,
    type,
    hlc: { wallTime, counter: 0, nodeId: 'node-a' },
    at: new Date(wallTime).toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: 'board-a',
    entity_id: 'task-a',
    payload
  };
}

test('later task edit is dropped after task delete tombstone', () => {
  const seed = createProjectionState({
    tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }]
  });

  const projected = applyEvents(seed, [
    event('delete-a', 'task.deleted', 1000),
    event('update-a', 'task.updated', 1001, { fields: { title: 'After' } })
  ]);

  expect(projected.tasks).toEqual([]);
  expect(projected.taskTombstones.has('task-a')).toBe(true);
});

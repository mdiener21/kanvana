import { expect, test } from 'vitest';

import { DEFAULT_HUMAN_ACTOR, appendTaskActivity, createActivityEvent } from '../../src/modules/activity-log.js';

test('createActivityEvent returns an event envelope with caller data', () => {
  const actor = { type: 'agent', id: 'agent-1' };
  const details = { taskId: 'task-1' };

  expect(createActivityEvent('task.created', details, actor, '2026-05-01T00:00:00.000Z')).toEqual({
    type: 'task.created',
    at: '2026-05-01T00:00:00.000Z',
    actor,
    details
  });
});

test('createActivityEvent uses an ISO timestamp by default', () => {
  const event = createActivityEvent('task.created', {}, DEFAULT_HUMAN_ACTOR);

  expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(Number.isNaN(Date.parse(event.at))).toBe(false);
});

test('createActivityEvent accepts valid actors and exposes the default human actor', () => {
  expect(DEFAULT_HUMAN_ACTOR).toEqual({ type: 'human', id: null });
  expect(createActivityEvent('task.created', {}, DEFAULT_HUMAN_ACTOR).actor).toBe(DEFAULT_HUMAN_ACTOR);
  expect(createActivityEvent('task.created', {}, { type: 'agent', id: 'agent-1' }).actor).toEqual({ type: 'agent', id: 'agent-1' });
  expect(createActivityEvent('task.created', {}, { type: 'user', id: 'user-1' }).actor).toEqual({ type: 'user', id: 'user-1' });
});

test('createActivityEvent throws for invalid actors', () => {
  expect(() => createActivityEvent('task.created', {}, { type: 'human', id: 'human-1' })).toThrow();
  expect(() => createActivityEvent('task.created', {}, { type: 'agent', id: '' })).toThrow();
  expect(() => createActivityEvent('task.created', {}, { type: 'user', id: '   ' })).toThrow();
  expect(() => createActivityEvent('task.created', {}, { type: 'bot', id: 'bot-1' })).toThrow();
  expect(() => createActivityEvent('task.created', {}, null)).toThrow();
});

test('appendTaskActivity initializes activityLog and appends the event', () => {
  const task = { id: 'task-1', title: 'Task' };
  const event = createActivityEvent('task.created', { taskId: 'task-1' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:00:00.000Z');

  const result = appendTaskActivity(task, event);

  expect(result).toEqual({ ...task, activityLog: [event] });
  expect(task.activityLog).toBeUndefined();
});

test('appendTaskActivity appends to an existing activityLog', () => {
  const firstEvent = createActivityEvent('task.created', { taskId: 'task-1' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:00:00.000Z');
  const secondEvent = createActivityEvent('task.updated', { field: 'title' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:01:00.000Z');
  const task = { id: 'task-1', title: 'Task', activityLog: [firstEvent] };

  const result = appendTaskActivity(task, secondEvent);

  expect(result.activityLog).toEqual([firstEvent, secondEvent]);
  expect(task.activityLog).toEqual([firstEvent]);
});

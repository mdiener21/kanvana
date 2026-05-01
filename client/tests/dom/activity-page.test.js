import { expect, test } from 'vitest';
import { formatActivityEvent, createTaskActivitySection } from '../../src/modules/activity-log-ui.js';
import { mountToBody } from './setup.js';

// Smoke test: activity-log-ui module loads and renders empty state without error
test('activity-log-ui renders empty state container without throwing', () => {
  const task = { id: 'test-1', activityLog: [] };
  let el;
  expect(() => { el = createTaskActivitySection(task); }).not.toThrow();
  mountToBody(el);
  expect(document.body.querySelector('.activity-empty')).toBeTruthy();
  expect(document.body.textContent).toContain('No activity yet');
});

test('formatActivityEvent does not throw for all PRD event types', () => {
  const human = { type: 'human', id: null };
  const types = [
    ['task.created', { columnName: 'Todo' }],
    ['task.title_changed', { from: 'A', to: 'B' }],
    ['task.description_changed', {}],
    ['task.priority_changed', { from: 'low', to: 'high' }],
    ['task.due_date_changed', { from: '2024-01-01', to: '2024-02-01' }],
    ['task.column_moved', { to: 'Done' }],
    ['task.label_added', { labelName: 'Bug' }],
    ['task.label_removed', { labelName: 'Bug' }],
    ['task.relationship_added', { type: 'related', targetTaskId: 'abc' }],
    ['task.relationship_removed', { type: 'related', targetTaskId: 'abc' }],
    ['column.created', { columnName: 'Sprint' }],
    ['column.renamed', { from: 'Old', to: 'New' }],
    ['column.deleted', { columnName: 'Old', tasksDestroyed: 0 }],
    ['column.reordered', {}],
    ['task.deleted', { taskTitle: 'Fix', columnName: 'Todo' }],
  ];
  for (const [type, details] of types) {
    const event = { type, actor: human, at: '2024-01-01T00:00:00Z', details };
    expect(() => formatActivityEvent(event)).not.toThrow();
    expect(typeof formatActivityEvent(event)).toBe('string');
  }
});

import { expect, test, describe } from 'vitest';
import { formatActivityEvent, createTaskActivitySection } from '../../src/modules/activity-log-ui.js';
import { mountToBody } from './setup.js';

// --- formatActivityEvent ---

describe('formatActivityEvent', () => {
  const human = { type: 'human', id: null };
  const agent = { type: 'agent', id: 'bot-1' };

  test('task.created', () => {
    const e = { type: 'task.created', actor: human, at: '2024-01-01T00:00:00Z', details: { columnName: 'Backlog' } };
    expect(formatActivityEvent(e)).toContain('Task created in Backlog');
  });

  test('task.title_changed', () => {
    const e = { type: 'task.title_changed', actor: human, at: '2024-01-01T00:00:00Z', details: { from: 'Old', to: 'New' } };
    expect(formatActivityEvent(e)).toContain('Title changed from "Old" to "New"');
  });

  test('task.description_changed', () => {
    const e = { type: 'task.description_changed', actor: human, at: '2024-01-01T00:00:00Z', details: {} };
    expect(formatActivityEvent(e)).toContain('Description updated');
  });

  test('task.priority_changed', () => {
    const e = { type: 'task.priority_changed', actor: human, at: '2024-01-01T00:00:00Z', details: { from: 'low', to: 'high' } };
    expect(formatActivityEvent(e)).toContain('Priority changed from low to high');
  });

  test('task.due_date_changed with a date', () => {
    const e = { type: 'task.due_date_changed', actor: human, at: '2024-01-01T00:00:00Z', details: { from: '2024-01-01', to: '2024-02-01' } };
    expect(formatActivityEvent(e)).toContain('Due date changed from 2024-01-01 to 2024-02-01');
  });

  test('task.due_date_changed cleared', () => {
    const e = { type: 'task.due_date_changed', actor: human, at: '2024-01-01T00:00:00Z', details: { from: '2024-01-01', to: null } };
    expect(formatActivityEvent(e)).toContain('Due date cleared');
  });

  test('task.column_moved', () => {
    const e = { type: 'task.column_moved', actor: human, at: '2024-01-01T00:00:00Z', details: { to: 'Done' } };
    expect(formatActivityEvent(e)).toContain('Moved to column Done');
  });

  test('task.label_added', () => {
    const e = { type: 'task.label_added', actor: human, at: '2024-01-01T00:00:00Z', details: { labelName: 'Bug' } };
    expect(formatActivityEvent(e)).toContain('Label "Bug" added');
  });

  test('task.label_removed', () => {
    const e = { type: 'task.label_removed', actor: human, at: '2024-01-01T00:00:00Z', details: { labelName: 'Bug' } };
    expect(formatActivityEvent(e)).toContain('Label "Bug" removed');
  });

  test('task.relationship_added', () => {
    const e = { type: 'task.relationship_added', actor: human, at: '2024-01-01T00:00:00Z', details: { type: 'related', targetTaskId: 'abc123' } };
    expect(formatActivityEvent(e)).toContain('related relationship added to task #abc123');
  });

  test('task.relationship_removed', () => {
    const e = { type: 'task.relationship_removed', actor: human, at: '2024-01-01T00:00:00Z', details: { type: 'prerequisite', targetTaskId: 'xyz99' } };
    expect(formatActivityEvent(e)).toContain('prerequisite relationship removed from task #xyz99');
  });

  test('column.created', () => {
    const e = { type: 'column.created', actor: human, at: '2024-01-01T00:00:00Z', details: { columnName: 'Sprint 1' } };
    expect(formatActivityEvent(e)).toContain('Column "Sprint 1" created');
  });

  test('column.renamed', () => {
    const e = { type: 'column.renamed', actor: human, at: '2024-01-01T00:00:00Z', details: { from: 'Old Name', to: 'New Name' } };
    expect(formatActivityEvent(e)).toContain('Column renamed from "Old Name" to "New Name"');
  });

  test('column.deleted', () => {
    const e = { type: 'column.deleted', actor: human, at: '2024-01-01T00:00:00Z', details: { columnName: 'Old Col', tasksDestroyed: 3 } };
    expect(formatActivityEvent(e)).toContain('Column "Old Col" deleted (3 tasks destroyed)');
  });

  test('column.reordered', () => {
    const e = { type: 'column.reordered', actor: human, at: '2024-01-01T00:00:00Z', details: {} };
    expect(formatActivityEvent(e)).toContain('Columns reordered');
  });

  test('task.deleted', () => {
    const e = { type: 'task.deleted', actor: human, at: '2024-01-01T00:00:00Z', details: { taskTitle: 'Fix bug', columnName: 'In Progress' } };
    expect(formatActivityEvent(e)).toContain('Task "Fix bug" deleted from column "In Progress"');
  });

  test('unknown type fallback', () => {
    const e = { type: 'some.unknown', actor: human, at: '2024-01-01T00:00:00Z', details: {} };
    expect(formatActivityEvent(e)).toContain('Activity: some.unknown');
  });

  test('agent actor adds prefix', () => {
    const e = { type: 'task.created', actor: agent, at: '2024-01-01T00:00:00Z', details: { columnName: 'Todo' } };
    const result = formatActivityEvent(e);
    expect(result).toContain('[bot-1]');
  });

  test('human actor has no prefix', () => {
    const e = { type: 'task.created', actor: human, at: '2024-01-01T00:00:00Z', details: { columnName: 'Todo' } };
    const result = formatActivityEvent(e);
    expect(result).not.toContain('[');
  });
});

// --- createTaskActivitySection ---

describe('createTaskActivitySection', () => {
  test('returns an accordion DOM element', () => {
    const task = { id: '1', activityLog: [] };
    const el = createTaskActivitySection(task);
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains('accordion')).toBe(true);
  });

  test('is collapsed by default', () => {
    const task = { id: '1', activityLog: [] };
    const el = createTaskActivitySection(task);
    const header = el.querySelector('.accordion-header');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    const body = el.querySelector('.accordion-body');
    expect(body?.classList.contains('collapsed')).toBe(true);
  });

  test('empty activityLog shows "No activity yet"', () => {
    const task = { id: '1', activityLog: [] };
    const el = createTaskActivitySection(task);
    mountToBody(el);
    expect(document.body.textContent).toContain('No activity yet');
  });

  test('renders events newest-first', () => {
    const human = { type: 'human', id: null };
    const task = {
      id: '1',
      activityLog: [
        { type: 'task.created', actor: human, at: '2024-01-01T00:00:00Z', details: { columnName: 'Todo' } },
        { type: 'task.title_changed', actor: human, at: '2024-01-02T00:00:00Z', details: { from: 'A', to: 'B' } }
      ]
    };
    const el = createTaskActivitySection(task);
    mountToBody(el);
    const items = el.querySelectorAll('.activity-item');
    // newest first means title_changed (2024-01-02) should be before task.created (2024-01-01)
    expect(items[0].textContent).toContain('Title changed');
    expect(items[1].textContent).toContain('Task created');
  });

  test('missing activityLog does not throw', () => {
    const task = { id: '1' };
    expect(() => createTaskActivitySection(task)).not.toThrow();
  });
});

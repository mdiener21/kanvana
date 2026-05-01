import { createAccordionSection } from './accordion.js';

/**
 * Returns a human-readable string for a single activity event.
 * Agent actors are prefixed with [actor.id].
 *
 * @param {object} event
 * @returns {string}
 */
export function formatActivityEvent(event) {
  const { type, details = {}, actor } = event;
  const actorPrefix = actor?.type === 'agent' ? `[${actor.id}] ` : '';

  let message;
  switch (type) {
    case 'task.created':
      message = `Task created in ${details.columnName ?? details.column ?? '?'}`;
      break;
    case 'task.title_changed':
      message = `Title changed from "${details.from}" to "${details.to}"`;
      break;
    case 'task.description_changed':
      message = 'Description updated';
      break;
    case 'task.priority_changed':
      message = `Priority changed from ${details.from} to ${details.to}`;
      break;
    case 'task.due_date_changed':
      if (!details.to) {
        message = 'Due date cleared';
      } else {
        message = `Due date changed from ${details.from} to ${details.to}`;
      }
      break;
    case 'task.column_moved':
      message = `Moved to column ${details.to}`;
      break;
    case 'task.label_added':
      message = `Label "${details.labelName}" added`;
      break;
    case 'task.label_removed':
      message = `Label "${details.labelName}" removed`;
      break;
    case 'task.relationship_added':
      message = `${details.type} relationship added to task #${details.targetTaskId}`;
      break;
    case 'task.relationship_removed':
      message = `${details.type} relationship removed from task #${details.targetTaskId}`;
      break;
    case 'column.created':
      message = `Column "${details.columnName}" created`;
      break;
    case 'column.renamed':
      message = `Column renamed from "${details.from}" to "${details.to}"`;
      break;
    case 'column.deleted':
      message = `Column "${details.columnName}" deleted (${details.tasksDestroyed} tasks destroyed)`;
      break;
    case 'column.reordered':
      message = 'Columns reordered';
      break;
    case 'task.deleted':
      message = `Task "${details.taskTitle}" deleted from column "${details.columnName}"`;
      break;
    default:
      message = `Activity: ${type}`;
  }

  return `${actorPrefix}${message}`;
}

/**
 * Creates a collapsible accordion DOM element showing task activity.
 * Collapsed by default. Events are rendered newest-first.
 *
 * @param {object} task - Task object with optional activityLog array
 * @returns {HTMLElement}
 */
export function createTaskActivitySection(task) {
  const log = Array.isArray(task?.activityLog) ? [...task.activityLog] : [];
  // Newest-first
  const sorted = log.slice().sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));

  if (sorted.length === 0) {
    return createAccordionSection('Activity', [null], false, () => {
      const el = document.createElement('div');
      el.classList.add('activity-item', 'activity-empty');
      el.textContent = 'No activity yet';
      return el;
    });
  }

  return createAccordionSection('Activity', sorted, false, (event) => {
    const el = document.createElement('div');
    el.classList.add('activity-item');

    const ts = document.createElement('span');
    ts.classList.add('activity-timestamp');
    ts.textContent = new Date(event.at).toLocaleString();

    const msg = document.createElement('span');
    msg.classList.add('activity-message');
    msg.textContent = formatActivityEvent(event);

    el.appendChild(ts);
    el.appendChild(msg);
    return el;
  });
}

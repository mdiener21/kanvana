// Ingest-time event validation (#181). Every event, local or remote, passes
// through validateEvent() before it is persisted or projected, so a malformed
// or hostile remote event (stolen token, compromised device, buggy older
// client) cannot break the view, and a bug in a feature module surfaces at
// once. Synchronous, because local projection is (ADR-0005).

const EVENT_TYPES = new Map([
  ['task.created', {}],
  ['task.updated', {}],
  ['task.moved', {}],
  ['task.deleted', {}],
  ['subtask.added', {}],
  ['subtask.removed', {}],
  ['subtask.toggled', {}],
  ['subtask.text_changed', {}],
  ['relationship.added', {}],
  ['relationship.removed', {}],
  ['label.added_to_task', {}],
  ['label.removed_from_task', {}],
  ['label.created', {}],
  ['label.updated', {}],
  ['label.deleted', {}],
  ['column.created', {}],
  ['column.updated', {}],
  ['column.deleted', {}],
  ['column.reordered', {}],
  ['board.created', {}],
  ['board.updated', {}],
  ['board.deleted', {}],
  ['settings.updated', {}],
  ['customer.created', {}],
  ['customer.archived', {}],
  ['customer.unarchived', {}],
  ['customer.deleted', {}],
  ['project.created', {}],
  ['project.archived', {}],
  ['project.unarchived', {}],
  ['project.deleted', {}],
  ['time_entry.created', {}],
  ['time_entry.updated', {}],
  ['time_entry.deleted', {}]
]);

const loggedRejections = new Set();

function findProblem(event) {
  if (typeof event?.type !== 'string' || !EVENT_TYPES.has(event.type)) return 'unknown type';
  return null;
}

function logRejection(event, problem) {
  const key = typeof event?.id === 'string' ? event.id : null;
  if (key !== null) {
    if (loggedRejections.has(key)) return;
    loggedRejections.add(key);
  }
  console.error(`[Kanvana] Rejected event ${key ?? '(no id)'} (${String(event?.type)}): ${problem}`);
}

// Returns the event to ingest (with payload entity fields sanitised), or null
// when the event is rejected. A rejection is logged once per event id.
export function validateEvent(event) {
  const problem = findProblem(event);
  if (problem) {
    logRejection(event, problem);
    return null;
  }
  return event;
}

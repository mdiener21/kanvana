// Ingest-time event validation (#181). Every event, local or remote, passes
// through validateEvent() before it is persisted or projected, so a malformed
// or hostile remote event (stolen token, compromised device, buggy older
// client) cannot break the view, and a bug in a feature module surfaces at
// once. Synchronous, because local projection is (ADR-0005).

import { EVENT_SCOPE } from '../constants.js';

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
  ['customer.created', { requires: 'customer' }],
  ['customer.archived', {}],
  ['customer.unarchived', {}],
  ['customer.deleted', {}],
  ['project.created', { requires: 'project' }],
  ['project.archived', {}],
  ['project.unarchived', {}],
  ['project.deleted', {}],
  ['time_entry.created', { requires: 'timeEntry' }],
  ['time_entry.updated', {}],
  ['time_entry.deleted', {}]
]);

const SCOPES = new Set(Object.values(EVENT_SCOPE));

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// The shape compareHlc() needs to order events.
function isValidHlc(hlc) {
  return !!hlc && typeof hlc === 'object'
    && Number.isFinite(hlc.wallTime)
    && Number.isFinite(hlc.counter)
    && isNonEmptyString(hlc.nodeId);
}

const loggedRejections = new Set();

function findProblem(event) {
  if (!event || typeof event !== 'object') return 'not an object';
  if (!isNonEmptyString(event.id)) return 'missing id';
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return 'unknown type';
  if (!isValidHlc(event.hlc)) return 'malformed hlc';
  if (!SCOPES.has(event.scope)) return 'unknown scope';
  if (event.scope === EVENT_SCOPE.BOARD && !isNonEmptyString(event.board_id)) return 'board event without board_id';
  if (!isPlainObject(event.payload)) return 'payload is not an object';
  const { requires } = EVENT_TYPES.get(event.type);
  if (requires && !isPlainObject(event.payload[requires])) return `payload.${requires} is not an object`;
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

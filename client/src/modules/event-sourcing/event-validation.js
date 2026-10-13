// Ingest-time event validation (#181). Every event, local or remote, passes
// through validateEvent() before it is persisted or projected, so a malformed
// or hostile remote event (stolen token, compromised device, buggy older
// client) cannot break the view, and a bug in a feature module surfaces at
// once. Synchronous, because local projection is (ADR-0005).

import { EVENT_SCOPE } from '../constants.js';
import {
  createBoard, createColumn, createCustomer, createLabel, createProject, createTask, createTimeEntry
} from '../schema.js';

const keysOf = (factory, extra = []) => new Set([...Object.keys(factory()), ...extra]);

// Entity field allow-lists, taken from the schema factories. Task keys the
// factory leaves out by default are named explicitly.
const ENTITY_FIELDS = {
  task: keysOf(createTask, ['doneDate', 'swimlaneLabelGroup']),
  column: keysOf(createColumn),
  label: keysOf(createLabel),
  board: keysOf(createBoard),
  customer: keysOf(createCustomer),
  project: keysOf(createProject),
  timeEntry: keysOf(createTimeEntry)
};

// type -> spec. `entities` maps a payload key to the entity whose fields it
// carries; `requires` names a payload entity the reducer dereferences without
// a guard. Lookup is through a Map, so inherited keys such as `toString` or
// `__proto__` are unknown types.
const EVENT_TYPES = new Map([
  ['task.created', { entities: { task: 'task', fields: 'task' } }],
  ['task.updated', { entities: { fields: 'task' } }],
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
  ['label.created', { entities: { label: 'label', fields: 'label' } }],
  ['label.updated', { entities: { fields: 'label' } }],
  ['label.deleted', {}],
  ['column.created', { entities: { column: 'column', fields: 'column' } }],
  ['column.updated', { entities: { fields: 'column' } }],
  ['column.deleted', {}],
  ['column.reordered', {}],
  ['board.created', { entities: { board: 'board', fields: 'board' } }],
  ['board.updated', { entities: { fields: 'board' } }],
  ['board.deleted', {}],
  ['settings.updated', {}],
  ['customer.created', { requires: 'customer', entities: { customer: 'customer' } }],
  ['customer.archived', {}],
  ['customer.unarchived', {}],
  ['customer.deleted', { entities: { customer: 'customer' } }],
  ['project.created', { requires: 'project', entities: { project: 'project' } }],
  ['project.archived', {}],
  ['project.unarchived', {}],
  ['project.deleted', { entities: { project: 'project' } }],
  ['time_entry.created', { requires: 'timeEntry', entities: { timeEntry: 'timeEntry' } }],
  ['time_entry.updated', { entities: { fields: 'timeEntry' } }],
  ['time_entry.deleted', { entities: { timeEntry: 'timeEntry' } }]
]);

const SCOPES = new Set(Object.values(EVENT_SCOPE));

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// The shape compareHlc() needs to order events.
function isValidHlc(hlc) {
  return isPlainObject(hlc)
    && Number.isFinite(hlc.wallTime)
    && Number.isFinite(hlc.counter)
    && isNonEmptyString(hlc.nodeId);
}

function findProblem(event) {
  if (!isPlainObject(event)) return 'not an object';
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

function pickFields(entity, source) {
  const allowed = ENTITY_FIELDS[entity];
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
}

function sanitise(event) {
  const { entities } = EVENT_TYPES.get(event.type);
  if (!entities) return event;
  const payload = { ...event.payload };
  for (const [key, entity] of Object.entries(entities)) {
    if (isPlainObject(payload[key])) payload[key] = pickFields(entity, payload[key]);
  }
  return { ...event, payload };
}

const loggedRejections = new Set();

function logRejection(event, problem) {
  const id = typeof event?.id === 'string' && event.id ? event.id : null;
  if (id !== null) {
    if (loggedRejections.has(id)) return;
    loggedRejections.add(id);
  }
  console.error(`[Kanvana] Rejected event ${id ?? '(no id)'} (${String(event?.type)}): ${problem}`);
}

// Returns the event to ingest, with payload entity fields allow-listed, or null
// when the event is rejected. A rejection is logged once per event id.
export function validateEvent(event) {
  const problem = findProblem(event);
  if (problem) {
    logRejection(event, problem);
    return null;
  }
  return sanitise(event);
}

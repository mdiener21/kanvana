// Ingest-time event validation (#181). Every event, local or remote, passes
// through validateEvent() before it is persisted or projected, so a malformed
// or hostile remote event (stolen token, compromised device, buggy older
// client) cannot break the view, and a bug in a feature module surfaces at
// once. Synchronous, because local projection is (ADR-0005).

import { DEFAULT_COLUMN_COLOR, EVENT_SCOPE, TT_COLOR_PALETTE } from '../constants.js';
import { isHexColor, normalizeHexColor } from '../normalize.js';
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

// Colours end up in style attributes (e.g. timetracking colorDotHtml), and
// escapeHtml does not stop CSS injection, so they must be hex.
const COLOR_FALLBACK = {
  column: DEFAULT_COLUMN_COLOR,
  label: DEFAULT_COLUMN_COLOR,
  customer: TT_COLOR_PALETTE[0],
  project: TT_COLOR_PALETTE[0]
};

// type -> spec. `entities` maps a payload key to the entity it carries in full;
// `patches` maps a payload key to the entity it partially updates. `requires` names a payload entity the reducer dereferences without
// a guard. Lookup is through a Map, so inherited keys such as `toString` or
// `__proto__` are unknown types.
const EVENT_TYPES = new Map([
  ['task.created', { entities: { task: 'task', fields: 'task' } }],
  ['task.updated', { patches: { fields: 'task' } }],
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
  ['label.updated', { patches: { fields: 'label' } }],
  ['label.deleted', {}],
  ['column.created', { entities: { column: 'column', fields: 'column' } }],
  ['column.updated', { patches: { fields: 'column' } }],
  ['column.deleted', {}],
  ['column.reordered', {}],
  ['board.created', { entities: { board: 'board', fields: 'board' } }],
  ['board.updated', { patches: { fields: 'board' } }],
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
  ['time_entry.updated', { patches: { fields: 'timeEntry' } }],
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

// A full entity gets a hex fallback for a bad colour; a patch drops it, so the
// current colour stays.
function pickFields(entity, source, { patch }) {
  const allowed = ENTITY_FIELDS[entity];
  const fields = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
  const fallback = COLOR_FALLBACK[entity];
  if (fallback && 'color' in fields) {
    if (patch && !isHexColor(fields.color)) delete fields.color;
    else fields.color = normalizeHexColor(fields.color, fallback);
  }
  return fields;
}

function sanitise(event) {
  const { entities = {}, patches = {} } = EVENT_TYPES.get(event.type);
  const targets = [
    ...Object.entries(entities).map(([key, entity]) => [key, entity, false]),
    ...Object.entries(patches).map(([key, entity]) => [key, entity, true])
  ];
  if (targets.length === 0) return event;
  const payload = { ...event.payload };
  for (const [key, entity, patch] of targets) {
    if (isPlainObject(payload[key])) payload[key] = pickFields(entity, payload[key], { patch });
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

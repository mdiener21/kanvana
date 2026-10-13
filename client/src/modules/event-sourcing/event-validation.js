// Synchronous, because local projection is (ADR-0005).

import { DEFAULT_COLUMN_COLOR, EVENT_SCOPE, TT_COLOR_PALETTE } from '../constants.js';
import { isHexColor, normalizeHexColor } from '../normalize.js';
import {
  createBoard, createColumn, createCustomer, createLabel, createProject, createTask, createTimeEntry
} from '../schema.js';
import { MAX_DRIFT_MS } from './hlc.js';

// `id` is left out: an entity's id comes only from the event's entity_id.
const keysOf = (factory, extra = []) => new Set([...Object.keys(factory()), ...extra].filter((key) => key !== 'id'));

// Task keys the schema factory leaves out by default are named explicitly.
const ENTITY_FIELDS = {
  task: keysOf(createTask, ['doneDate', 'swimlaneLabelGroup']),
  column: keysOf(createColumn),
  label: keysOf(createLabel),
  board: keysOf(createBoard),
  customer: keysOf(createCustomer),
  project: keysOf(createProject),
  timeEntry: keysOf(createTimeEntry)
};

// Colours reach style attributes, where escapeHtml does not stop CSS injection, so they must be hex.
const COLOR_FALLBACK = {
  column: DEFAULT_COLUMN_COLOR,
  label: DEFAULT_COLUMN_COLOR,
  customer: TT_COLOR_PALETTE[0],
  project: TT_COLOR_PALETTE[0]
};

// A Map, so `toString`/`__proto__` are unknown types. payloadEntities/payloadPatches: payload key -> entity type, in full / as a patch.
const EVENT_TYPES = new Map([
  ['task.created', { payloadEntities: { task: 'task', fields: 'task' } }],
  ['task.updated', { payloadPatches: { fields: 'task' } }],
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
  ['label.created', { payloadEntities: { label: 'label', fields: 'label' } }],
  ['label.updated', { payloadPatches: { fields: 'label' } }],
  ['label.deleted', {}],
  ['column.created', { payloadEntities: { column: 'column', fields: 'column' } }],
  ['column.updated', { payloadPatches: { fields: 'column' } }],
  ['column.deleted', {}],
  ['column.reordered', {}],
  ['board.created', { payloadEntities: { board: 'board', fields: 'board' } }],
  ['board.updated', { payloadPatches: { fields: 'board' } }],
  ['board.deleted', {}],
  ['settings.updated', {}],
  ['customer.created', { requires: 'customer', payloadEntities: { customer: 'customer' } }],
  ['customer.archived', {}],
  ['customer.unarchived', {}],
  ['customer.deleted', { payloadEntities: { customer: 'customer' } }],
  ['project.created', { requires: 'project', payloadEntities: { project: 'project' } }],
  ['project.archived', {}],
  ['project.unarchived', {}],
  ['project.deleted', { payloadEntities: { project: 'project' } }],
  ['time_entry.created', { requires: 'timeEntry', payloadEntities: { timeEntry: 'timeEntry' } }],
  ['time_entry.updated', { payloadPatches: { fields: 'timeEntry' } }],
  ['time_entry.deleted', { payloadEntities: { timeEntry: 'timeEntry' } }]
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
  if (event.hlc.wallTime > Date.now() + MAX_DRIFT_MS) return 'hlc too far in the future';
  if (!SCOPES.has(event.scope)) return 'unknown scope';
  if (event.scope === EVENT_SCOPE.BOARD && !isNonEmptyString(event.board_id)) return 'board event without board_id';
  if (!isPlainObject(event.payload)) return 'payload is not an object';
  const { requires } = EVENT_TYPES.get(event.type);
  if (requires && !isPlainObject(event.payload[requires])) return `payload.${requires} is not an object`;
  return null;
}

// A patch drops a bad colour, so the current one stays.
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
  const { payloadEntities = {}, payloadPatches = {} } = EVENT_TYPES.get(event.type);
  const targets = [
    ...Object.entries(payloadEntities).map(([key, entity]) => [key, entity, false]),
    ...Object.entries(payloadPatches).map(([key, entity]) => [key, entity, true])
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

export function validateEvent(event) {
  const problem = findProblem(event);
  if (problem) {
    logRejection(event, problem);
    return null;
  }
  return sanitise(event);
}

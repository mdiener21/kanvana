import { loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { createCustomer, createProject, createTimeEntry } from './schema.js';
import { EVENT_SCOPE, TT_COLOR_PALETTE } from './constants.js';
import { floorToMinute } from './timetracking-time.js';
import {
  CRUD_ERROR, projectById, customerById, isCustomerInUse, isProjectInUse,
  validateCustomerName, validateProjectName, validateTimeEntry,
  WORK_WEEK_FIELDS, resolveWorkWeek, patchWorkWeek
} from './timetracking-model.js';

const EDITABLE_ENTRY_FIELDS = ['projectId', 'description', 'start', 'end'];

// ── Color auto-assignment ──────────────────────────────────────────────────────

function nextColorIndex(collection) {
  return collection.length % TT_COLOR_PALETTE.length;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export function addCustomer(rawName) {
  const tt = loadTimeTracking();
  const validation = validateCustomerName(rawName, tt.customers);
  if (!validation.ok) return validation;

  const customer = createCustomer(
    { name: validation.name },
    nextColorIndex(tt.customers)
  );

  scheduleDomainEvent({
    type: 'customer.created',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: customer.id,
    payload: { customer }
  });
  return { ok: true, customer };
}

function updateName(entity, item, validation) {
  if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  if (!validation.ok) return validation;
  if (item.name !== validation.name) scheduleDomainEvent({
    type: `${entity}.updated`, scope: EVENT_SCOPE.TIMETRACKING, entityId: item.id,
    payload: { fields: { name: validation.name }, before: { name: item.name } }
  });
  return { ok: true };
}

export function updateCustomerName(id, rawName) {
  const tt = loadTimeTracking();
  return updateName('customer', customerById(tt, id), validateCustomerName(rawName, tt.customers, id));
}

// Archived Customers stay editable: their Work week still shapes their past Balance.
export function updateCustomerWorkWeek(id, patch) {
  const customer = customerById(loadTimeTracking(), id);
  if (!customer) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  const current = resolveWorkWeek(customer);
  const next = patchWorkWeek(current, patch);
  if (!next) return { ok: false, reason: CRUD_ERROR.INVALID_WORK_WEEK };
  const changed = WORK_WEEK_FIELDS.filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]));
  if (changed.length === 0) return { ok: true, changed: false };
  scheduleDomainEvent({
    type: 'customer.updated', scope: EVENT_SCOPE.TIMETRACKING, entityId: id,
    payload: {
      fields: Object.fromEntries(changed.map((key) => [key, next[key]])),
      before: Object.fromEntries(changed.map((key) => [key, current[key]]))
    }
  });
  return { ok: true, changed: true };
}

export function addProject(customerId, rawName) {
  const tt = loadTimeTracking();
  const validation = validateProjectName(rawName, customerId, tt.projects);
  if (!validation.ok) return validation;

  const project = createProject(
    { customerId, name: validation.name },
    nextColorIndex(tt.projects)
  );

  scheduleDomainEvent({
    type: 'project.created',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: project.id,
    payload: { project }
  });
  return { ok: true, project };
}

export function updateProjectName(id, rawName) {
  const tt = loadTimeTracking();
  const project = projectById(tt, id);
  return updateName('project', project, validateProjectName(rawName, project?.customerId, tt.projects, id));
}

function normaliseEntryFields({ projectId, description = '', start, end }) {
  return {
    projectId,
    description: description.trim(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  };
}

export function addTimeEntry(fields) {
  const validation = validateTimeEntry(fields, loadTimeTracking());
  if (!validation.ok) return validation;

  const timeEntry = createTimeEntry(normaliseEntryFields(fields));

  scheduleDomainEvent({
    type: 'time_entry.created',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: timeEntry.id,
    payload: { timeEntry }
  });
  return { ok: true, timeEntry };
}

function findTimeEntry(tt, id) {
  return tt.timeEntries.find((e) => e.id === id) ?? null;
}

export function updateTimeEntry(id, fields) {
  const tt = loadTimeTracking();
  const entry = findTimeEntry(tt, id);
  if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  const validation = validateTimeEntry(fields, tt, { keepProjectId: entry.projectId });
  if (!validation.ok) return validation;

  const next = normaliseEntryFields(fields);
  const changedKeys = EDITABLE_ENTRY_FIELDS.filter((key) => next[key] !== entry[key]);
  if (changedKeys.length === 0) return { ok: true, changed: false };

  scheduleDomainEvent({
    type: 'time_entry.updated',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: id,
    payload: {
      fields: Object.fromEntries(changedKeys.map((key) => [key, next[key]])),
      before: Object.fromEntries(changedKeys.map((key) => [key, entry[key]]))
    }
  });
  return { ok: true, changed: true };
}

export function duplicateTimeEntry(id, now = Date.now()) {
  const entry = findTimeEntry(loadTimeTracking(), id);
  if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  const startMs = floorToMinute(now);
  const durationMs = Date.parse(entry.end) - Date.parse(entry.start);
  return addTimeEntry({
    projectId: entry.projectId,
    description: entry.description,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + durationMs).toISOString()
  });
}

export function deleteTimeEntry(id) {
  const entry = findTimeEntry(loadTimeTracking(), id);
  if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  scheduleDomainEvent({
    type: 'time_entry.deleted',
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: id,
    payload: { timeEntry: { ...entry } }
  });
  return { ok: true };
}

// ── Archive / delete customers and projects ────────────────────────────────────

function setArchived(entity, collection, id, archived) {
  const item = loadTimeTracking()[collection].find((x) => x.id === id);
  if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  if (!!item.archived === archived) return { ok: true };
  scheduleDomainEvent({
    type: `${entity}.${archived ? 'archived' : 'unarchived'}`,
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: id,
    payload: {}
  });
  return { ok: true };
}

export const setCustomerArchived = (id, archived) => setArchived('customer', 'customers', id, archived);
export const setProjectArchived = (id, archived) => setArchived('project', 'projects', id, archived);

function deleteGuarded(entity, collection, id, inUse) {
  const tt = loadTimeTracking();
  const item = tt[collection].find((x) => x.id === id);
  if (!item) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  if (inUse(tt, id)) return { ok: false, reason: CRUD_ERROR.IN_USE };
  scheduleDomainEvent({
    type: `${entity}.deleted`,
    scope: EVENT_SCOPE.TIMETRACKING,
    entityId: id,
    payload: { [entity]: { ...item } }
  });
  return { ok: true };
}

export const deleteCustomer = (id) => deleteGuarded('customer', 'customers', id, isCustomerInUse);
export const deleteProject = (id) => deleteGuarded('project', 'projects', id, isProjectInUse);

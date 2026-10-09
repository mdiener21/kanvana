import { loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { createCustomer, createProject, createTimeEntry } from './schema.js';
import { EVENT_SCOPE, TT_COLOR_PALETTE } from './constants.js';

export const CRUD_ERROR = Object.freeze({
  EMPTY_NAME: 'EMPTY_NAME',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  NO_CUSTOMER: 'NO_CUSTOMER',
  NO_PROJECT: 'NO_PROJECT',
  ARCHIVED_PROJECT: 'ARCHIVED_PROJECT',
  INVALID_TIME: 'INVALID_TIME',
  ZERO_DURATION: 'ZERO_DURATION',
  NOT_FOUND: 'NOT_FOUND'
});

const EDITABLE_ENTRY_FIELDS = ['projectId', 'description', 'start', 'end'];
const MINUTE_MS = 60000;

// ── Color auto-assignment ──────────────────────────────────────────────────────

function nextColorIndex(collection) {
  return collection.length % TT_COLOR_PALETTE.length;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateCustomerName(name, customers, skipId = null) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: CRUD_ERROR.EMPTY_NAME };
  const lower = trimmed.toLowerCase();
  const dup = customers.find((c) => c.id !== skipId && c.name.trim().toLowerCase() === lower);
  if (dup) return { ok: false, reason: CRUD_ERROR.DUPLICATE_NAME };
  return { ok: true, name: trimmed };
}

export function validateProjectName(name, customerId, projects, skipId = null) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: CRUD_ERROR.EMPTY_NAME };
  if (!customerId) return { ok: false, reason: CRUD_ERROR.NO_CUSTOMER };
  const lower = trimmed.toLowerCase();
  const dup = projects.find(
    (p) => p.id !== skipId && p.customerId === customerId && p.name.trim().toLowerCase() === lower
  );
  if (dup) return { ok: false, reason: CRUD_ERROR.DUPLICATE_NAME };
  return { ok: true, name: trimmed };
}

export function isProjectActive(project, customers) {
  if (!project || project.archived) return false;
  return !customers.find((c) => c.id === project.customerId)?.archived;
}

// keepProjectId: an edited entry may stay on its own project even after that project was archived.
export function validateTimeEntry({ projectId, start, end }, tt, { keepProjectId = null } = {}) {
  const project = projectId ? tt.projects.find((p) => p.id === projectId) : null;
  if (!project) return { ok: false, reason: CRUD_ERROR.NO_PROJECT };
  if (project.id !== keepProjectId && !isProjectActive(project, tt.customers)) {
    return { ok: false, reason: CRUD_ERROR.ARCHIVED_PROJECT };
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { ok: false, reason: CRUD_ERROR.INVALID_TIME };
  if (endMs <= startMs) return { ok: false, reason: CRUD_ERROR.ZERO_DURATION };
  return { ok: true };
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

export function addTimeEntry({ projectId, description = '', start, end }) {
  const validation = validateTimeEntry({ projectId, start, end }, loadTimeTracking());
  if (!validation.ok) return validation;

  const timeEntry = createTimeEntry({
    projectId,
    description: description.trim(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  });

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

export function updateTimeEntry(id, { projectId, description = '', start, end }) {
  const tt = loadTimeTracking();
  const entry = findTimeEntry(tt, id);
  if (!entry) return { ok: false, reason: CRUD_ERROR.NOT_FOUND };
  const validation = validateTimeEntry({ projectId, start, end }, tt, { keepProjectId: entry.projectId });
  if (!validation.ok) return validation;

  const next = {
    projectId,
    description: description.trim(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString()
  };
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
  const startMs = Math.floor(now / MINUTE_MS) * MINUTE_MS;
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

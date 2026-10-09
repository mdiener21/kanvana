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
  ZERO_DURATION: 'ZERO_DURATION'
});

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

export function validateTimeEntry({ projectId, start, end }, tt) {
  const project = projectId ? tt.projects.find((p) => p.id === projectId) : null;
  if (!project) return { ok: false, reason: CRUD_ERROR.NO_PROJECT };
  if (!isProjectActive(project, tt.customers)) return { ok: false, reason: CRUD_ERROR.ARCHIVED_PROJECT };
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

// Pure Time Tracking rules over a Time Tracking state (`{ customers, projects, timeEntries }`).
// Imports nothing that touches storage, IndexedDB or the emitter, so panels and the reducer can share it.
import { DEFAULT_WORKDAYS } from './timetracking-time.js';

export const CRUD_ERROR = Object.freeze({
  EMPTY_NAME: 'EMPTY_NAME',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  NO_CUSTOMER: 'NO_CUSTOMER',
  NO_PROJECT: 'NO_PROJECT',
  ARCHIVED_PROJECT: 'ARCHIVED_PROJECT',
  INVALID_TIME: 'INVALID_TIME',
  ZERO_DURATION: 'ZERO_DURATION',
  NOT_FOUND: 'NOT_FOUND',
  IN_USE: 'IN_USE',
  INVALID_WORK_WEEK: 'INVALID_WORK_WEEK'
});

// ── Lookups ────────────────────────────────────────────────────────────────────

export const projectById = (tt, id) => tt.projects.find((p) => p.id === id) ?? null;
export const customerById = (tt, id) => tt.customers.find((c) => c.id === id) ?? null;

// ── Active and in-use rules ────────────────────────────────────────────────────

export function isProjectActive(project, tt) {
  if (!project || project.archived) return false;
  const customer = customerById(tt, project.customerId);
  return !!customer && !customer.archived;
}

export function activeProjectsOf(tt, customerId) {
  return tt.projects.filter((p) => p.customerId === customerId && isProjectActive(p, tt));
}

// Shared by CRUD (UI guard) and the reducer (replay guard):
// a referenced Customer or Project can be archived but never deleted.
export const isCustomerInUse = (tt, customerId) => tt.projects.some((p) => p.customerId === customerId);
export const isProjectInUse = (tt, projectId) => tt.timeEntries.some((e) => e.projectId === projectId);

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

// keepProjectId: an edited entry may stay on its own project even after that project was archived.
export function validateTimeEntry({ projectId, start, end }, tt, { keepProjectId = null } = {}) {
  const project = projectById(tt, projectId);
  if (!project) return { ok: false, reason: CRUD_ERROR.NO_PROJECT };
  if (project.id !== keepProjectId && !isProjectActive(project, tt)) {
    return { ok: false, reason: CRUD_ERROR.ARCHIVED_PROJECT };
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { ok: false, reason: CRUD_ERROR.INVALID_TIME };
  if (endMs <= startMs) return { ok: false, reason: CRUD_ERROR.ZERO_DURATION };
  return { ok: true };
}

// ── Work week ──────────────────────────────────────────────────────────────────

// The Customer fields that make up its Work week.
export const WORK_WEEK_FIELDS = ['weeklyHours', 'workdays'];

const isWeeklyHours = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isWorkday = (day) => Number.isInteger(day) && day >= 1 && day <= 7;
const sortedDays = (days) => [...new Set(days)].sort((a, b) => a - b);

// A Work week with Weekly hours has a Target; without, it doesn't.
export const hasTarget = (workWeek) => workWeek.weeklyHours > 0;

// Anything stored, including a Customer from before Work weeks, resolves to a valid Work week.
export function resolveWorkWeek(raw) {
  const workdays = Array.isArray(raw?.workdays) ? sortedDays(raw.workdays.filter(isWorkday)) : [];
  return {
    weeklyHours: isWeeklyHours(raw?.weeklyHours) ? raw.weeklyHours : null,
    workdays: workdays.length ? workdays : [...DEFAULT_WORKDAYS]
  };
}

// A user's edit is rejected (null) rather than repaired, so nothing is saved that they didn't enter.
// `weeklyHours: null` switches the Target off; Workdays must stay a non-empty set of ISO weekdays.
export function patchWorkWeek(workWeek, patch) {
  const next = { ...workWeek };
  if ('weeklyHours' in patch) {
    if (patch.weeklyHours !== null && !isWeeklyHours(patch.weeklyHours)) return null;
    next.weeklyHours = patch.weeklyHours;
  }
  if ('workdays' in patch) {
    const days = patch.workdays;
    if (!Array.isArray(days) || days.length === 0 || !days.every(isWorkday)) return null;
    next.workdays = sortedDays(days);
  }
  return next;
}

// A Customer's Work week; an unknown Customer, or one without Weekly hours, has no Target.
export const customerWorkWeek = (tt, customerId) => resolveWorkWeek(customerById(tt, customerId));

// ── Prefill ────────────────────────────────────────────────────────────────────

const activeProjectId = (tt, id) => {
  const project = projectById(tt, id);
  return project && isProjectActive(project, tt) ? project.id : null;
};

// The project a new Time Entry starts on: the last-used one, else the default, while still active.
export function prefillProjectId(tt, settings, lastUsedProjectId = null) {
  return activeProjectId(tt, lastUsedProjectId) ?? activeProjectId(tt, settings.defaultProjectId);
}

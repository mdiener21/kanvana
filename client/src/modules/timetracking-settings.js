import { loadGlobalSettings, loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { EVENT_SCOPE } from './constants.js';
import { isProjectActive, projectById } from './timetracking-crud.js';
import { DATE_FORMATS, TIME_FORMATS, DURATION_FORMATS, browserTimezone } from './timetracking-time.js';

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Falls back to the first (default) format.
const oneOf = (value, formats) => {
  const options = Object.keys(formats);
  return options.includes(value) ? value : options[0];
};
const idOrNull = (value) => (typeof value === 'string' && value ? value : null);
const positiveOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

export function resolveTimeTrackingSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    defaultCustomerId: idOrNull(s.defaultCustomerId),
    defaultProjectId: idOrNull(s.defaultProjectId),
    dateFormat: oneOf(s.dateFormat, DATE_FORMATS),
    timeFormat: oneOf(s.timeFormat, TIME_FORMATS),
    timezone: isValidTimezone(s.timezone) ? s.timezone : browserTimezone(),
    durationFormat: oneOf(s.durationFormat, DURATION_FORMATS),
    weeklyHours: positiveOrNull(s.weeklyHours)
  };
}

const storedTimeTrackingSettings = () => {
  const stored = loadGlobalSettings().timeTracking;
  return stored && typeof stored === 'object' ? stored : {};
};

export const loadTimeTrackingSettings = () => resolveTimeTrackingSettings(storedTimeTrackingSettings());

export function activeProjectsOf(tt, customerId) {
  return tt.projects.filter((p) => p.customerId === customerId && isProjectActive(p, tt));
}

// Persists only what the user chose: unset fields (notably timezone) keep resolving per device.
export function saveTimeTrackingSettings(patch) {
  const next = { ...storedTimeTrackingSettings(), ...patch };
  if ('defaultCustomerId' in patch) {
    next.defaultProjectId = next.defaultCustomerId
      ? activeProjectsOf(loadTimeTracking(), next.defaultCustomerId)[0]?.id ?? null
      : null;
  }
  if (next.weeklyHours === null) delete next.weeklyHours;
  scheduleDomainEvent({
    type: 'settings.updated',
    scope: EVENT_SCOPE.GLOBAL,
    entityId: 'timeTracking',
    payload: { fields: { timeTracking: next } }
  });
  return resolveTimeTrackingSettings(next);
}

// Per-device convenience state: deliberately local storage, not a domain event, so it never syncs.
const LAST_USED_PROJECT_KEY = 'kanvana:timetracking:lastUsedProjectId';

export const loadLastUsedProjectId = () => idOrNull(localStorage.getItem(LAST_USED_PROJECT_KEY));

export function rememberLastUsedProject(projectId) {
  if (idOrNull(projectId)) localStorage.setItem(LAST_USED_PROJECT_KEY, projectId);
}

const REPORT_PERIOD_KIND_KEY = 'kanvana:timetracking:reportPeriodKind';

export const loadReportPeriodKind = () => localStorage.getItem(REPORT_PERIOD_KIND_KEY);

export function rememberReportPeriodKind(kind) {
  localStorage.setItem(REPORT_PERIOD_KIND_KEY, kind);
}

const activeProjectId = (tt, id) => {
  const project = projectById(tt, id);
  return project && isProjectActive(project, tt) ? project.id : null;
};

export function prefillProjectId(tt, settings, lastUsedProjectId = null) {
  return activeProjectId(tt, lastUsedProjectId) ?? activeProjectId(tt, settings.defaultProjectId);
}

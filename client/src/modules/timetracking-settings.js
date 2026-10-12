import { loadGlobalSettings, loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { EVENT_SCOPE } from './constants.js';
import { isProjectActive, projectById } from './timetracking-crud.js';
import { DATE_FORMATS, browserTimezone } from './timetracking-time.js';

export const TT_DATE_FORMATS = Object.keys(DATE_FORMATS);
export const TT_TIME_FORMATS = ['24h', '12h'];
export const TT_DURATION_FORMATS = ['h:mm', 'decimal'];

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const oneOf = (value, options) => (options.includes(value) ? value : options[0]);
const idOrNull = (value) => (typeof value === 'string' && value ? value : null);

export function resolveTimeTrackingSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    defaultCustomerId: idOrNull(s.defaultCustomerId),
    defaultProjectId: idOrNull(s.defaultProjectId),
    dateFormat: oneOf(s.dateFormat, TT_DATE_FORMATS),
    timeFormat: oneOf(s.timeFormat, TT_TIME_FORMATS),
    timezone: isValidTimezone(s.timezone) ? s.timezone : browserTimezone(),
    durationFormat: oneOf(s.durationFormat, TT_DURATION_FORMATS)
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

const activeProjectId = (tt, id) => {
  const project = projectById(tt, id);
  return project && isProjectActive(project, tt) ? project.id : null;
};

// Single resolution point for the entry bar's project prefill.
export function prefillProjectId(tt, settings, lastUsedProjectId = null) {
  return activeProjectId(tt, lastUsedProjectId) ?? activeProjectId(tt, settings.defaultProjectId);
}

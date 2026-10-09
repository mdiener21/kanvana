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

export const loadTimeTrackingSettings = () => resolveTimeTrackingSettings(loadGlobalSettings().timeTracking);

export function activeProjectsOf(tt, customerId) {
  return tt.projects.filter((p) => p.customerId === customerId && isProjectActive(p, tt));
}

export function saveTimeTrackingSettings(patch) {
  const next = { ...loadTimeTrackingSettings(), ...patch };
  if ('defaultCustomerId' in patch) {
    next.defaultProjectId = next.defaultCustomerId
      ? activeProjectsOf(loadTimeTracking(), next.defaultCustomerId)[0]?.id ?? null
      : null;
  }
  const resolved = resolveTimeTrackingSettings(next);
  scheduleDomainEvent({
    type: 'settings.updated',
    scope: EVENT_SCOPE.GLOBAL,
    entityId: 'timeTracking',
    payload: { fields: { timeTracking: resolved } }
  });
  return resolved;
}

// Single resolution point for the entry bar's project prefill.
export function prefillProjectId(tt, settings) {
  const project = projectById(tt, settings.defaultProjectId);
  return project && isProjectActive(project, tt) ? project.id : null;
}

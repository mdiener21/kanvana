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

export function resolveTimeTrackingSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    defaultCustomerId: idOrNull(s.defaultCustomerId),
    defaultProjectId: idOrNull(s.defaultProjectId),
    dateFormat: oneOf(s.dateFormat, DATE_FORMATS),
    timeFormat: oneOf(s.timeFormat, TIME_FORMATS),
    timezone: isValidTimezone(s.timezone) ? s.timezone : browserTimezone(),
    durationFormat: oneOf(s.durationFormat, DURATION_FORMATS)
  };
}

// Per-device convenience state: deliberately local storage, not a domain event, so it never syncs.
const LAST_USED_PROJECT_KEY = 'kanvana:timetracking:lastUsedProjectId';

// A project of the account that used this browser last; it does not outlive that account here.
export const clearLastUsedProjectId = (device = localStorage) => device.removeItem(LAST_USED_PROJECT_KEY);
export const loadLastUsedProjectId = (device = localStorage) => idOrNull(device.getItem(LAST_USED_PROJECT_KEY));

export function rememberLastUsedProject(projectId, device = localStorage) {
  if (idOrNull(projectId)) device.setItem(LAST_USED_PROJECT_KEY, projectId);
}

const REPORT_PERIOD_KIND_KEY = 'kanvana:timetracking:reportPeriodKind';

export const loadReportPeriodKind = (device = localStorage) => device.getItem(REPORT_PERIOD_KIND_KEY);

export function rememberReportPeriodKind(kind, device = localStorage) {
  device.setItem(REPORT_PERIOD_KIND_KEY, kind);
}

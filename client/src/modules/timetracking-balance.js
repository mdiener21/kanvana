import { zonedParts, formatDuration, dayNumber, MINUTE_MS, HOUR_MS, DEFAULT_WORKDAYS } from './timetracking-time.js';

// Judged on the displayed minutes, so a few seconds short never shows as "−0:00".
const isDeficit = (balanceMs) => Math.round(balanceMs / MINUTE_MS) < 0;

export function formatBalance(ms, durationFormat) {
  const sign = isDeficit(ms) ? '−' : '+';
  return `${sign}${formatDuration(Math.abs(ms), durationFormat)}`;
}

export function showBalance(element, balanceMs, durationFormat, toneElement = element) {
  const text = formatBalance(balanceMs, durationFormat);
  element.textContent = text;
  toneElement.classList.toggle('is-deficit', isDeficit(balanceMs));
  toneElement.classList.toggle('is-surplus', !isDeficit(balanceMs));
  return text;
}

const startDay = (entry, tz) => dayNumber(zonedParts(Date.parse(entry.start), tz));

// Attribution: an entry counts wholly toward the period containing its start.
function loggedIn(entries, from, to, tz) {
  return entries
    .filter((e) => { const day = startDay(e, tz); return day >= from && day <= to; })
    .reduce((sum, e) => sum + Date.parse(e.end) - Date.parse(e.start), 0);
}

// Day number 0 (1 Jan 1970) was a Thursday.
const isoWeekdayOf = (day) => ((((day + 3) % 7) + 7) % 7) + 1;

function workdaysBefore(day, workdays) {
  const rest = Array.from({ length: ((day % 7) + 7) % 7 }, (_, i) => isoWeekdayOf(day - 1 - i));
  return Math.floor(day / 7) * workdays.length + rest.filter((wd) => workdays.includes(wd)).length;
}

// Target of all days before `day`, rounded once. Differences of it telescope, so the Targets of
// adjoining periods (the months of a year, the days of a week) add up exactly to their union.
const targetBefore = (day, weeklyHours, workdays) =>
  Math.round((weeklyHours * HOUR_MS * workdaysBefore(day, workdays)) / workdays.length);

// Counted days: from the later of period start and first entry day, to the earliest of period end,
// today and (with `endsAtLastEntry`, for an archived Customer) the last entry day.
function periodTarget(entries, period, { weeklyHours, workdays = DEFAULT_WORKDAYS }, { now, tz, endsAtLastEntry = false }) {
  if (!(weeklyHours > 0) || entries.length === 0) return null;
  const entryDays = entries.map((e) => startDay(e, tz));
  const first = Math.max(dayNumber(period.start), Math.min(...entryDays));
  const last = Math.min(
    dayNumber(period.end), dayNumber(zonedParts(now, tz)), endsAtLastEntry ? Math.max(...entryDays) : Infinity
  );
  return last >= first
    ? targetBefore(last + 1, weeklyHours, workdays) - targetBefore(first, weeklyHours, workdays)
    : null;
}

// A Work week with Weekly hours has a Target; without, it doesn't.
export const hasTarget = (workWeek) => workWeek.weeklyHours > 0;

const positiveOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

function workdaysOf(value) {
  const days = Array.isArray(value) ? value.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [];
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_WORKDAYS];
}

// Anything stored, including a Customer from before Work weeks, resolves to a valid Work week.
export const resolveWorkWeek = (raw) => ({ weeklyHours: positiveOrNull(raw?.weeklyHours), workdays: workdaysOf(raw?.workdays) });

const customerOf = (tt, customerId) => tt.customers.find((c) => c.id === customerId) ?? null;

/**
 * A Customer's Work week. `legacyWorkWeek` is the temporary fallback to the global Time Tracking
 * setting for a Customer without Weekly hours; the legacy migration removes it.
 */
export function customerWorkWeek(tt, customerId, legacyWorkWeek = null) {
  const customer = customerOf(tt, customerId);
  const own = resolveWorkWeek(customer);
  if (!customer || hasTarget(own) || !legacyWorkWeek || !hasTarget(legacyWorkWeek)) return own;
  return resolveWorkWeek(legacyWorkWeek);
}

/**
 * The one entry point for every Balance view: Logged, Target and Balance of `entries` over
 * `period` against a Work week ({ weeklyHours, workdays }). Target and Balance are null when the
 * Work week has no Weekly hours, or no counted day falls in the period.
 */
export function periodBalance(entries, period, workWeek, { now, tz, endsAtLastEntry = false }) {
  const loggedMs = loggedIn(entries, dayNumber(period.start), dayNumber(period.end), tz);
  const targetMs = periodTarget(entries, period, workWeek, { now, tz, endsAtLastEntry });
  return { loggedMs, targetMs, balanceMs: targetMs === null ? null : loggedMs - targetMs };
}

/**
 * A Customer's Balance over `period`: only Time Entries booked to its Projects, against its Work
 * week. Its Target starts on its own first entry day and, while it is archived, stops at its last.
 */
export function customerBalance(tt, customerId, period, { now, tz, legacyWorkWeek = null }) {
  const customer = customerOf(tt, customerId);
  const projectIds = new Set(tt.projects.filter((p) => p.customerId === customer?.id).map((p) => p.id));
  const entries = customer ? (tt.timeEntries ?? []).filter((e) => projectIds.has(e.projectId)) : [];
  return periodBalance(entries, period, customerWorkWeek(tt, customerId, legacyWorkWeek), {
    now, tz, endsAtLastEntry: !!customer?.archived
  });
}

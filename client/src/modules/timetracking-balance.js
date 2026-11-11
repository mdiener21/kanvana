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

// Counted days: from the later of period start and first entry day, to the earlier of period end and today.
function periodTarget(entries, period, { weeklyHours, workdays = DEFAULT_WORKDAYS }, { now, tz }) {
  if (!(weeklyHours > 0) || entries.length === 0) return null;
  const firstEntryDay = Math.min(...entries.map((e) => startDay(e, tz)));
  const first = Math.max(dayNumber(period.start), firstEntryDay);
  const last = Math.min(dayNumber(period.end), dayNumber(zonedParts(now, tz)));
  return last >= first
    ? targetBefore(last + 1, weeklyHours, workdays) - targetBefore(first, weeklyHours, workdays)
    : null;
}

// A Work week with Weekly hours has a Target; without, it doesn't.
export const hasTarget = (workWeek) => workWeek.weeklyHours > 0;

/**
 * The one entry point for every Balance view: Logged, Target and Balance of `entries` over
 * `period` against a Work week ({ weeklyHours, workdays }). Target and Balance are null when the
 * Work week has no Weekly hours, or no counted day falls in the period.
 */
export function periodBalance(entries, period, workWeek, { now, tz }) {
  const loggedMs = loggedIn(entries, dayNumber(period.start), dayNumber(period.end), tz);
  const targetMs = periodTarget(entries, period, workWeek, { now, tz });
  return { loggedMs, targetMs, balanceMs: targetMs === null ? null : loggedMs - targetMs };
}

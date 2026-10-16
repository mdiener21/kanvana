import { zonedParts, formatDuration, dayNumber, MINUTE_MS, HOUR_MS } from './timetracking-time.js';

// Judged on the displayed minutes, so a few seconds short never shows as "−0:00".
export const isDeficit = (balanceMs) => Math.round(balanceMs / MINUTE_MS) < 0;

export function formatBalance(ms, durationFormat) {
  const sign = isDeficit(ms) ? '−' : '+';
  return `${sign}${formatDuration(Math.abs(ms), durationFormat)}`;
}

const startDay = (entry, tz) => dayNumber(zonedParts(Date.parse(entry.start), tz));

// Attribution: an entry counts wholly toward the period containing its start.
function loggedIn(entries, from, to, tz) {
  return entries
    .filter((e) => { const day = startDay(e, tz); return day >= from && day <= to; })
    .reduce((sum, e) => sum + Date.parse(e.end) - Date.parse(e.start), 0);
}

// Target of all days before `day`, rounded once. Differences of it telescope, so the Targets of
// adjoining periods (the months of a year, the days of a week) add up exactly to their union.
const targetBefore = (day, weeklyHours) => Math.round((weeklyHours * HOUR_MS * day) / 7);

// Counted days: from the later of period start and first-ever entry day, to the earlier of period end and today.
function targetMs(entries, from, to, { now, tz, weeklyHours }) {
  if (!(weeklyHours > 0) || entries.length === 0) return null;
  const firstEntryDay = Math.min(...entries.map((e) => startDay(e, tz)));
  const first = Math.max(from, firstEntryDay);
  const last = Math.min(to, dayNumber(zonedParts(now, tz)));
  return last >= first ? targetBefore(last + 1, weeklyHours) - targetBefore(first, weeklyHours) : null;
}

// `period` is any { start, end } pair of calendar days, e.g. a period from timetracking-report.js.
export function periodBalance(entries, period, options) {
  const from = dayNumber(period.start);
  const to = dayNumber(period.end);
  const loggedMs = loggedIn(entries, from, to, options.tz);
  const target = targetMs(entries, from, to, options);
  return { loggedMs, targetMs: target, balanceMs: target === null ? null : loggedMs - target };
}

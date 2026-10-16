import { zonedParts, formatDuration } from './timetracking-time.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dayNumber = ({ y, m, d }) => Date.UTC(y, m - 1, d) / DAY_MS;

const ymdOfDay = (day) => {
  const date = new Date(day * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};

export function currentWeekRange(now, tz) {
  const today = dayNumber(zonedParts(now, tz));
  const monday = today - ((new Date(today * DAY_MS).getUTCDay() + 6) % 7);
  return { start: ymdOfDay(monday), end: ymdOfDay(monday + 6) };
}

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

// Counted days: from the later of period start and first-ever entry day, to the earlier of period end and today.
function targetMs(entries, from, to, { now, tz, weeklyHours }) {
  if (!(weeklyHours > 0) || entries.length === 0) return null;
  const firstEntryDay = Math.min(...entries.map((e) => startDay(e, tz)));
  const countedDays = Math.min(to, dayNumber(zonedParts(now, tz))) - Math.max(from, firstEntryDay) + 1;
  return countedDays > 0 ? Math.round((weeklyHours * HOUR_MS * countedDays) / 7) : null;
}

export function periodBalance(entries, range, options) {
  const from = dayNumber(range.start);
  const to = dayNumber(range.end);
  const loggedMs = loggedIn(entries, from, to, options.tz);
  const target = targetMs(entries, from, to, options);
  return { loggedMs, targetMs: target, balanceMs: target === null ? null : loggedMs - target };
}

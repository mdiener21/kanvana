import { projectById, customerById } from './timetracking-crud.js';
import { periodBalance } from './timetracking-balance.js';
import { zonedParts, addDays, daysInMonth, daysBetween, startOfIsoWeek, isoWeek } from './timetracking-time.js';

const UNKNOWN_COLOR = '#9ca3af';
const UNKNOWN_PROJECT = { id: 'unknown-project', name: 'Unknown project', color: UNKNOWN_COLOR };
const UNKNOWN_CUSTOMER = { id: 'unknown-customer', name: 'Unknown customer', color: UNKNOWN_COLOR };

// ── Periods ────────────────────────────────────────────────────────────────────
// A period is { kind, start, end }: inclusive calendar days ({ y, m, d }) in the
// Time Tracking timezone. Weeks run Monday to Sunday.

const utc = ({ y, m, d }) => Date.UTC(y, m - 1, d);
const monthYearFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const shortMonth = (ymd) => shortMonthFormat.format(utc(ymd));

function weekRangeLabel(start, end) {
  if (start.y !== end.y) return `${start.d} ${shortMonth(start)} ${start.y} – ${end.d} ${shortMonth(end)} ${end.y}`;
  if (start.m !== end.m) return `${start.d} ${shortMonth(start)} – ${end.d} ${shortMonth(end)} ${end.y}`;
  return `${start.d}–${end.d} ${shortMonth(end)} ${end.y}`;
}

const DAY_BUCKETS = (period) => Array.from({ length: daysBetween(period.start, period.end) + 1 }, (_, i) => addDays(period.start, i));
const DAY_INDEX = (period, ymd) => daysBetween(period.start, ymd);

const KINDS = {
  week: {
    of(ymd) {
      const start = startOfIsoWeek(ymd);
      return { start, end: addDays(start, 6) };
    },
    shift: ({ start }, delta) => addDays(start, 7 * delta),
    label: ({ start, end }) => `W${isoWeek(start).week} · ${weekRangeLabel(start, end)}`,
    buckets: DAY_BUCKETS,
    bucketIndex: DAY_INDEX
  },
  month: {
    of: ({ y, m }) => ({ start: { y, m, d: 1 }, end: { y, m, d: daysInMonth(y, m) } }),
    shift({ start: { y, m } }, delta) {
      const index = y * 12 + (m - 1) + delta;
      return { y: Math.floor(index / 12), m: (index % 12) + 1, d: 1 };
    },
    label: ({ start }) => monthYearFormat.format(utc(start)),
    buckets: DAY_BUCKETS,
    bucketIndex: DAY_INDEX
  },
  year: {
    of: ({ y }) => ({ start: { y, m: 1, d: 1 }, end: { y, m: 12, d: 31 } }),
    shift: ({ start }, delta) => ({ y: start.y + delta, m: 1, d: 1 }),
    label: ({ start }) => String(start.y),
    buckets: ({ start }) => Array.from({ length: 12 }, (_, i) => ({ y: start.y, m: i + 1, d: 1 })),
    bucketIndex: ({ start }, { y, m }) => (y === start.y ? m - 1 : -1)
  }
};

export const PERIOD_KINDS = Object.keys(KINDS);

export function periodOf(kind, ymd) {
  return { kind, ...KINDS[kind].of(ymd) };
}

export const currentPeriod = (kind, now, tz) => periodOf(kind, zonedParts(now, tz));

export const shiftPeriod = (period, delta) => periodOf(period.kind, KINDS[period.kind].shift(period, delta));

export const isSamePeriod = (a, b) => a.kind === b.kind && utc(a.start) === utc(b.start);

export const periodLabel = (period) => KINDS[period.kind].label(period);

const byTotalThenName = (a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name);

function bucketFor(map, item, extra) {
  if (!map.has(item.id)) map.set(item.id, { id: item.id, name: item.name, color: item.color, totalMs: 0, ...extra });
  return map.get(item.id);
}

// Target counts from the first-ever entry, so it reads all of tt.timeEntries, not just `entries`.
export function summarizePeriod(tt, entries, period, { tz, now, weeklyHours = null }) {
  const kind = KINDS[period.kind];
  const buckets = kind.buckets(period).map((start) => ({ start, totalMs: 0, byProject: {} }));
  const customers = new Map();
  const projects = new Map();
  let totalMs = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const startMs = Date.parse(entry.start);
    const bucket = buckets[kind.bucketIndex(period, zonedParts(startMs, tz))];
    if (!bucket) continue;
    const durationMs = Date.parse(entry.end) - startMs;
    const project = projectById(tt, entry.projectId) ?? UNKNOWN_PROJECT;
    const customer = customerById(tt, project.customerId) ?? UNKNOWN_CUSTOMER;

    const customerBucket = bucketFor(customers, customer, { projects: new Map() });
    const projectBucket = bucketFor(customerBucket.projects, project);
    customerBucket.totalMs += durationMs;
    projectBucket.totalMs += durationMs;
    projects.set(project.id, projectBucket);

    bucket.totalMs += durationMs;
    bucket.byProject[project.id] = (bucket.byProject[project.id] ?? 0) + durationMs;
    totalMs += durationMs;
    entryCount += 1;
  }

  const target = weeklyHours > 0 ? periodBalance(tt.timeEntries, period, { now, tz, weeklyHours }).targetMs : null;
  const withShare = (bucket) => ({ ...bucket, share: totalMs > 0 ? bucket.totalMs / totalMs : 0 });
  return {
    period,
    label: periodLabel(period),
    totalMs,
    entryCount,
    projectCount: projects.size,
    buckets,
    projects: [...projects.values()].sort(byTotalThenName).map(withShare),
    customers: [...customers.values()].sort(byTotalThenName).map((customer) => ({
      ...customer,
      projects: [...customer.projects.values()].sort(byTotalThenName).map(withShare)
    })),
    target,
    balance: target === null ? null : totalMs - target
  };
}

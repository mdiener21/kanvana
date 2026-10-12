import { projectById, customerById } from './timetracking-crud.js';
import { zonedParts } from './timetracking-time.js';

const UNKNOWN_COLOR = '#9ca3af';
const UNKNOWN_PROJECT = { id: 'unknown-project', name: 'Unknown project', color: UNKNOWN_COLOR };
const UNKNOWN_CUSTOMER = { id: 'unknown-customer', name: 'Unknown customer', color: UNKNOWN_COLOR };

export function currentMonth(now, tz) {
  const { y, m } = zonedParts(now, tz);
  return { y, m };
}

export function shiftMonth({ y, m }, delta) {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

const monthLabelFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const monthLabel = ({ y, m }) => monthLabelFormat.format(Date.UTC(y, m - 1, 1));

const daysInMonth = ({ y, m }) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const byTotalThenName = (a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name);

function bucketFor(map, item, extra) {
  if (!map.has(item.id)) map.set(item.id, { id: item.id, name: item.name, color: item.color, totalMs: 0, ...extra });
  return map.get(item.id);
}

// Attribution: an entry counts wholly to the day and month of its start in the user's timezone.
export function summarizeMonth(tt, entries, month, tz) {
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1, totalMs: 0, byProject: {} }));
  const customers = new Map();
  const projects = new Map();
  let totalMs = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const startMs = Date.parse(entry.start);
    const start = zonedParts(startMs, tz);
    if (start.y !== month.y || start.m !== month.m) continue;
    const durationMs = Date.parse(entry.end) - startMs;
    const project = projectById(tt, entry.projectId) ?? UNKNOWN_PROJECT;
    const customer = customerById(tt, project.customerId) ?? UNKNOWN_CUSTOMER;

    const customerBucket = bucketFor(customers, customer, { projects: new Map() });
    const projectBucket = bucketFor(customerBucket.projects, project);
    customerBucket.totalMs += durationMs;
    projectBucket.totalMs += durationMs;
    projects.set(project.id, projectBucket);

    const day = days[start.d - 1];
    day.totalMs += durationMs;
    day.byProject[project.id] = (day.byProject[project.id] ?? 0) + durationMs;
    totalMs += durationMs;
    entryCount += 1;
  }

  const withShare = (bucket) => ({ ...bucket, share: totalMs > 0 ? bucket.totalMs / totalMs : 0 });
  return {
    month,
    totalMs,
    entryCount,
    projectCount: projects.size,
    days,
    projects: [...projects.values()].sort(byTotalThenName).map(withShare),
    customers: [...customers.values()].sort(byTotalThenName).map((customer) => ({
      ...customer,
      projects: [...customer.projects.values()].sort(byTotalThenName).map(withShare)
    }))
  };
}

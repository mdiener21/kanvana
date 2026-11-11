import { DEFAULT_WORKDAYS } from './timetracking-time.js';

// The Customer fields that make up its Work week.
export const WORK_WEEK_FIELDS = ['weeklyHours', 'workdays'];

const isWeeklyHours = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isWorkday = (day) => Number.isInteger(day) && day >= 1 && day <= 7;
const sortedDays = (days) => [...new Set(days)].sort((a, b) => a - b);

// A Work week with Weekly hours has a Target; without, it doesn't.
export const hasTarget = (workWeek) => workWeek.weeklyHours > 0;

// Anything stored, including a Customer from before Work weeks, resolves to a valid Work week.
export function resolveWorkWeek(raw) {
  const workdays = Array.isArray(raw?.workdays) ? sortedDays(raw.workdays.filter(isWorkday)) : [];
  return {
    weeklyHours: isWeeklyHours(raw?.weeklyHours) ? raw.weeklyHours : null,
    workdays: workdays.length ? workdays : [...DEFAULT_WORKDAYS]
  };
}

// A user's edit is rejected (null) rather than repaired, so nothing is saved that they didn't enter.
// `weeklyHours: null` switches the Target off; Workdays must stay a non-empty set of ISO weekdays.
export function patchWorkWeek(workWeek, patch) {
  const next = { ...workWeek };
  if ('weeklyHours' in patch) {
    if (patch.weeklyHours !== null && !isWeeklyHours(patch.weeklyHours)) return null;
    next.weeklyHours = patch.weeklyHours;
  }
  if ('workdays' in patch) {
    const days = patch.workdays;
    if (!Array.isArray(days) || days.length === 0 || !days.every(isWorkday)) return null;
    next.workdays = sortedDays(days);
  }
  return next;
}

export const customerOf = (tt, customerId) => tt.customers.find((c) => c.id === customerId) ?? null;

// A Customer's Work week; an unknown Customer, or one without Weekly hours, has no Target.
export const customerWorkWeek = (tt, customerId) => resolveWorkWeek(customerOf(tt, customerId));

import { loadGlobalSettings, loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { EVENT_SCOPE } from './constants.js';
import { hasTarget, resolveWorkWeek } from './timetracking-balance.js';

const LEGACY_FIELDS = ['weeklyHours', 'workdays'];

/**
 * The events that move the legacy global Weekly hours and Workdays (stored Time Tracking settings)
 * onto the Default customer's Work week, when it has none yet, and drop them from the settings.
 * Pure and deterministic, so two devices running it on the same state emit the same values.
 */
export function legacyWorkWeekMigration(storedSettings, tt) {
  const stored = storedSettings && typeof storedSettings === 'object' ? storedSettings : {};
  if (!LEGACY_FIELDS.some((key) => key in stored)) return [];

  const events = [];
  const legacy = resolveWorkWeek(stored);
  const customer = tt.customers.find((c) => c.id === stored.defaultCustomerId) ?? null;
  const current = resolveWorkWeek(customer);
  if (customer && hasTarget(legacy) && !hasTarget(current)) {
    events.push({
      type: 'customer.updated', scope: EVENT_SCOPE.TIMETRACKING, entityId: customer.id,
      payload: { fields: legacy, before: current }
    });
  }
  const timeTracking = Object.fromEntries(Object.entries(stored).filter(([key]) => !LEGACY_FIELDS.includes(key)));
  events.push({
    type: 'settings.updated', scope: EVENT_SCOPE.GLOBAL, entityId: 'timeTracking',
    payload: { fields: { timeTracking } }
  });
  return events;
}

// Runs once the read model is loaded on the Time Tracking page; a no-op once migrated.
export function migrateLegacyWorkWeek() {
  const events = legacyWorkWeekMigration(loadGlobalSettings().timeTracking, loadTimeTracking());
  return Promise.all(events.map((event) => scheduleDomainEvent(event)));
}

import { loadGlobalSettings, loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { EVENT_SCOPE } from './constants.js';
import { WORK_WEEK_FIELDS, hasTarget, resolveWorkWeek } from './timetracking-work-week-model.js';

// Moves the legacy global Work week onto the Default customer when it has none yet. Pure and
// deterministic, so two devices migrating the same state emit the same values.
export function legacyWorkWeekMigration(storedSettings, tt) {
  const stored = storedSettings && typeof storedSettings === 'object' ? storedSettings : {};
  if (!WORK_WEEK_FIELDS.some((key) => key in stored)) return [];

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
  const timeTracking = Object.fromEntries(Object.entries(stored).filter(([key]) => !WORK_WEEK_FIELDS.includes(key)));
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

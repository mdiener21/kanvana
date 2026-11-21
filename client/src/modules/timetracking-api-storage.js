import { loadGlobalSettings, loadTimeTracking } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';
import { on, off, DATA_CHANGED } from './events.js';
import { createTimeTracking } from './timetracking-api.js';

// The app's adapter: reads the Read Model, emits domain events, and redraws on DATA_CHANGED.
export const createStorageTimeTracking = () => createTimeTracking({
  readTimeTracking: () => loadTimeTracking(),
  readGlobalSettings: () => loadGlobalSettings(),
  emit: (event) => scheduleDomainEvent(event),
  subscribe(listener) {
    on(DATA_CHANGED, listener);
    return () => off(DATA_CHANGED, listener);
  },
  device: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key)
  }
});

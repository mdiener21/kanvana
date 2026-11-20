// The Time Tracking interface for tests: no storage, IndexedDB or emitter. Every emitted event is
// folded through the real reducer, so archive, restore and guarded-delete rules hold as in the app.
// Changes fire DATA_CHANGED on the events.js bus, as the Read Model does, so panels redraw together.
import { applyEvent, createProjectionState } from '../../src/modules/reducer.js';
import { createTimeTracking } from '../../src/modules/timetracking-api.js';
import { on, off, emit, DATA_CHANGED } from '../../src/modules/events.js';

// A localStorage stand-in, so device prefs survive a remount of the same adapter (a reload).
export function createMemoryDevice() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };
}

let sequence = 0;

// Mirrors the emitter's envelope; the reducer reads type, scope, entity_id and payload.
const toEnvelope = ({ type, scope = 'board', boardId = null, entityId = '', payload = {}, actor = { type: 'human', id: null } }) => {
  sequence += 1;
  return {
    id: `test-event-${sequence}`,
    type,
    hlc: { wallTime: Date.now(), counter: sequence, nodeId: 'test' },
    at: new Date().toISOString(),
    actor,
    scope,
    board_id: scope === 'board' ? boardId : null,
    entity_id: entityId,
    payload
  };
};

// seed: { customers, projects, timeEntries, settings (stored timeTracking settings), device }
// Returns the interface plus `emitted` (the emitter inputs its commands produced, in order) and
// `receive(event)`, which folds an event as if it arrived from another device.
export function createTestTimeTracking({ customers = [], projects = [], timeEntries = [], settings, device = createMemoryDevice() } = {}) {
  let state = createProjectionState({
    timeTracking: { customers, projects, timeEntries },
    globalSettings: settings ? { timeTracking: settings } : {}
  });
  const emitted = [];

  function fold(input) {
    state = applyEvent(state, toEnvelope(input));
    emit(DATA_CHANGED);
  }

  const timeTracking = createTimeTracking({
    readTimeTracking: () => state.timeTracking,
    readGlobalSettings: () => state.globalSettings,
    emit(input) {
      emitted.push(input);
      fold(input);
      return Promise.resolve();
    },
    subscribe(listener) {
      on(DATA_CHANGED, listener);
      return () => off(DATA_CHANGED, listener);
    },
    device
  });

  return { ...timeTracking, emitted, receive: fold, device };
}

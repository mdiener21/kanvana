import { applyEvent, createProjectionState } from '../reducer.js';
import { keyFor } from '../idb-store.js';
import { GLOBAL_SNAPSHOT_KEY } from './snapshot.js';
import { DATA_CHANGED, EVENT_EMITTED, emit, off, on } from '../events.js';

// Sole writer of the IDB read model (ADR-0005). Extracted from storage.js so the
// projection layer owns the read model independent of CRUD. storage.js wires the
// closure `state` + schedulers in via createReadModelProjector(); the reducer
// (applyEvent/createProjectionState) stays pure and is imported directly.
export function createReadModelProjector(ctx) {
  const {
    state,
    taskCacheByBoard,
    loadGlobalSettings,
    safeParseArray,
    safeParseObject,
    schedulePersist,
    scheduleReadModelPersist,
    checkAndScheduleSnapshot,
    boardsKey,
    globalSettingsKey
  } = ctx;

  const appliedDomainEventIds = new Set();
  let registered = false;
  let handler = null;

  function project(event) {
    if (!event?.id || appliedDomainEventIds.has(event.id)) return;
    appliedDomainEventIds.add(event.id);

    if (event.scope === 'global') {
      const projected = applyEvent(createProjectionState({ globalSettings: loadGlobalSettings() }), event);
      state.globalSettings = projected.globalSettings;
      schedulePersist(globalSettingsKey, state.globalSettings);
      checkAndScheduleSnapshot(GLOBAL_SNAPSHOT_KEY, projected, event.hlc);
      emit(DATA_CHANGED, { event });
      return;
    }

    const boardId = event.board_id;
    if (typeof boardId !== 'string' || !boardId) return;

    const projected = applyEvent(createProjectionState({
      boards: state.boards,
      tasks: safeParseArray(state.tasks[boardId]) || [],
      columns: safeParseArray(state.columns[boardId]) || [],
      labels: safeParseArray(state.labels[boardId]) || [],
      settings: safeParseObject(state.settings[boardId]) || {}
    }), event);

    state.boards = projected.boards;
    state.tasks[boardId] = projected.tasks;
    state.columns[boardId] = projected.columns;
    state.labels[boardId] = projected.labels;
    state.settings[boardId] = projected.settings;
    taskCacheByBoard.set(boardId, projected.tasks);
    schedulePersist(boardsKey, state.boards);
    scheduleReadModelPersist(boardId, 'tasks', projected.tasks);
    scheduleReadModelPersist(boardId, 'columns', projected.columns);
    scheduleReadModelPersist(boardId, 'labels', projected.labels);
    schedulePersist(keyFor(boardId, 'settings'), projected.settings);
    checkAndScheduleSnapshot(boardId, projected, event.hlc);
    emit(DATA_CHANGED, { event });
  }

  function register() {
    if (registered) return;
    registered = true;
    handler = (event) => project(event.detail);
    on(EVENT_EMITTED, handler);
  }

  function reset() {
    appliedDomainEventIds.clear();
    if (handler) off(EVENT_EMITTED, handler);
    handler = null;
    registered = false;
  }

  return { register, reset, project };
}

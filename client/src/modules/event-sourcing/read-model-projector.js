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

    writeBoard(boardId, projected);
    checkAndScheduleSnapshot(boardId, projected, event.hlc);
    emit(DATA_CHANGED, { event });
  }

  function writeBoard(boardId, projected) {
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
  }

  // Adopt a snapshot's projected state as the read model. Kept here rather than
  // in the sync layer so the projector stays the sole writer (ADR-0005). Boards
  // merge by id: a board-scoped snapshot carries the whole board list as of the
  // snapshotting device, which must not clobber boards only this device knows.
  function hydrate(key, snapshotState) {
    if (key === GLOBAL_SNAPSHOT_KEY) {
      state.globalSettings = snapshotState.globalSettings || {};
      schedulePersist(globalSettingsKey, state.globalSettings);
      emit(DATA_CHANGED, { hydrated: key });
      return;
    }

    const known = new Map((state.boards || []).map((board) => [board.id, board]));
    for (const board of snapshotState.boards || []) {
      if (!known.has(board.id)) known.set(board.id, board);
    }

    writeBoard(key, {
      boards: [...known.values()],
      tasks: snapshotState.tasks || [],
      columns: snapshotState.columns || [],
      labels: snapshotState.labels || [],
      settings: snapshotState.settings || {}
    });
    emit(DATA_CHANGED, { hydrated: key });
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

  return { register, reset, project, hydrate };
}

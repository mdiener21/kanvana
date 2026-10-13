import { applyEvent, createProjectionState, createTimeTrackingState } from '../reducer.js';
import { keyFor } from '../idb-store.js';
import { scopeForSnapshotKey, snapshotKeyForEvent } from './snapshot.js';
import { EVENT_SCOPE } from '../constants.js';
import { DATA_CHANGED, emit } from '../events.js';
import { connectProjector } from './ingest.js';

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
    globalSettingsKey,
    timeTrackingKey
  } = ctx;

  // Board-less scopes each own one read-model slot. `normalize` applies only at
  // the snapshot boundary; projected slots are already normalised by the reducer.
  const boardlessSlots = new Map([
    [EVENT_SCOPE.GLOBAL, {
      field: 'globalSettings',
      persistKey: globalSettingsKey,
      seed: loadGlobalSettings,
      normalize: (value) => value || {}
    }],
    [EVENT_SCOPE.TIMETRACKING, {
      field: 'timeTracking',
      persistKey: timeTrackingKey,
      seed: () => state.timeTracking,
      normalize: createTimeTrackingState
    }]
  ]);

  // Board-less scopes keep a session-only applied-id guard; board scopes answer
  // "already applied" from the board's durable memory (#178, CONTEXT.md §3).
  const appliedBoardlessIds = new Set();
  let disconnect = null;

  // Called only by the ingest interface. Returns true when the read model changed.
  function project(event) {
    if (!event?.id) return false;

    const slot = boardlessSlots.get(event.scope);
    if (slot) {
      if (appliedBoardlessIds.has(event.id)) return false;
      appliedBoardlessIds.add(event.id);
      const projected = applyEvent(createProjectionState({ [slot.field]: slot.seed() }), event);
      writeBoardless(slot, projected[slot.field]);
      checkAndScheduleSnapshot(snapshotKeyForEvent(event), projected, event.hlc);
      return true;
    }

    const boardId = event.board_id;
    if (typeof boardId !== 'string' || !boardId) return false;

    const memory = boardMemory(boardId);
    if (memory.appliedEventIds.has(event.id)) return false;

    const projected = applyEvent(createProjectionState({
      boards: state.boards,
      tasks: safeParseArray(state.tasks[boardId]) || [],
      columns: safeParseArray(state.columns[boardId]) || [],
      labels: safeParseArray(state.labels[boardId]) || [],
      settings: safeParseObject(state.settings[boardId]) || {},
      ...memory
    }), event);

    writeBoard(boardId, projected);
    checkAndScheduleSnapshot(boardId, projected, event.hlc, onBoardSnapshotSaved);
    return true;
  }

  // The board's delete records and applied ids: the live set plus the ids its
  // latest snapshot holds. A snapshot taken from this state holds them all.
  function boardMemory(boardId) {
    return {
      taskTombstones: new Set(safeParseArray(state.taskTombstones[boardId]) || []),
      appliedEventIds: new Set([...snapshotAppliedIds(boardId), ...(safeParseArray(state.appliedEventIds[boardId]) || [])])
    };
  }

  function snapshotAppliedIds(boardId) {
    return state.snapshotAppliedIds[boardId] instanceof Set ? state.snapshotAppliedIds[boardId] : new Set();
  }

  // Once a snapshot holds a board's applied ids, prune them from the live set.
  function onBoardSnapshotSaved(boardId, snapshotState) {
    state.snapshotAppliedIds[boardId] = new Set(snapshotState.appliedEventIds);
    writeAppliedIds(boardId, safeParseArray(state.appliedEventIds[boardId]) || []);
  }

  function writeAppliedIds(boardId, appliedIds) {
    const covered = snapshotAppliedIds(boardId);
    state.appliedEventIds[boardId] = [...appliedIds].filter((id) => !covered.has(id));
    scheduleReadModelPersist(boardId, 'appliedEventIds', state.appliedEventIds[boardId]);
  }

  function writeBoardless(slot, value) {
    state[slot.field] = value;
    schedulePersist(slot.persistKey, value);
  }

  function writeBoard(boardId, projected) {
    state.boards = projected.boards;
    state.tasks[boardId] = projected.tasks;
    state.columns[boardId] = projected.columns;
    state.labels[boardId] = projected.labels;
    state.settings[boardId] = projected.settings;
    state.taskTombstones[boardId] = [...projected.taskTombstones];
    taskCacheByBoard.set(boardId, projected.tasks);
    schedulePersist(boardsKey, state.boards);
    scheduleReadModelPersist(boardId, 'tasks', projected.tasks);
    scheduleReadModelPersist(boardId, 'columns', projected.columns);
    scheduleReadModelPersist(boardId, 'labels', projected.labels);
    schedulePersist(keyFor(boardId, 'settings'), projected.settings);
    scheduleReadModelPersist(boardId, 'taskTombstones', state.taskTombstones[boardId]);
    writeAppliedIds(boardId, projected.appliedEventIds);
  }

  // Adopt a snapshot's projected state as the read model. Kept here rather than
  // in the sync layer so the projector stays the sole writer (ADR-0005). Boards
  // merge only the snapshot's own board: older snapshots include unrelated
  // board metadata without the corresponding columns, tasks or settings.
  function hydrate(key, snapshotState) {
    const slot = boardlessSlots.get(scopeForSnapshotKey(key));
    if (slot) {
      writeBoardless(slot, slot.normalize(snapshotState[slot.field]));
      emit(DATA_CHANGED, { hydrated: key });
      return;
    }

    const known = new Map((state.boards || []).map((board) => [board.id, board]));
    for (const board of snapshotState.boards || []) {
      if (board.id === key) known.set(board.id, board);
    }

    // Delete records are permanent, so the snapshot's are added to the board's.
    // The adopted snapshot now holds its applied ids; ours that it lacks stay live.
    const memory = boardMemory(key);
    state.snapshotAppliedIds[key] = new Set(snapshotState.appliedEventIds || []);
    writeBoard(key, {
      boards: [...known.values()],
      tasks: snapshotState.tasks || [],
      columns: snapshotState.columns || [],
      labels: snapshotState.labels || [],
      settings: snapshotState.settings || {},
      taskTombstones: new Set([...memory.taskTombstones, ...(snapshotState.taskTombstones || [])]),
      appliedEventIds: memory.appliedEventIds
    });
    emit(DATA_CHANGED, { hydrated: key });
  }

  function register() {
    if (disconnect) return;
    disconnect = connectProjector(project);
  }

  function reset() {
    appliedBoardlessIds.clear();
    disconnect?.();
    disconnect = null;
  }

  return { register, reset, hydrate };
}

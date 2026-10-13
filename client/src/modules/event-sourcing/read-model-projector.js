import { applyEvent, applyEvents, createProjectionState, createTimeTrackingState } from '../reducer.js';
import { keyFor } from '../idb-store.js';
import { scopeForSnapshotKey, snapshotKeyForEvent } from './snapshot.js';
import { EVENT_SCOPE } from '../constants.js';
import { DATA_CHANGED, emit } from '../events.js';
import { EVENT_ORDER, connectProjector } from './ingest.js';
import { compareHlc } from './hlc.js';

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
    timeTrackingKey,
    newestAppliedKey
  } = ctx;

  // Board-less scopes each own one read-model slot. `normalize` applies only at
  // the snapshot boundary; projected slots are already normalised by the reducer.
  // `foldBase` is the slot a fold starts from; with `live`, global settings,
  // which merge field by field, keep live fields under the snapshot's.
  const boardlessSlots = new Map([
    [EVENT_SCOPE.GLOBAL, {
      field: 'globalSettings',
      persistKey: globalSettingsKey,
      seed: loadGlobalSettings,
      foldBase: (snapshotState, live) => ({ ...(live ? loadGlobalSettings() : {}), ...(snapshotState?.globalSettings || {}) }),
      normalize: (value) => value || {}
    }],
    [EVENT_SCOPE.TIMETRACKING, {
      field: 'timeTracking',
      persistKey: timeTrackingKey,
      seed: () => state.timeTracking,
      foldBase: (snapshotState) => snapshotState?.timeTracking,
      normalize: createTimeTrackingState
    }]
  ]);

  // Board-less scopes keep a session-only applied-id guard; board scopes answer
  // "already applied" from the board's durable memory (#178, CONTEXT.md §3).
  const appliedBoardlessIds = new Set();
  let disconnect = null;

  // Whether the event was applied already, is newer than everything applied for
  // its scope key, or is late and needs the key rebuilt (#179).
  function classify(event) {
    if (hasApplied(event)) return EVENT_ORDER.APPLIED;
    const newest = state.newestAppliedHlc[snapshotKeyForEvent(event)];
    return newest && event.hlc && compareHlc(event.hlc, newest) < 0 ? EVENT_ORDER.LATE : EVENT_ORDER.IN_ORDER;
  }

  function hasApplied(event) {
    if (boardlessSlots.has(event.scope)) return appliedBoardlessIds.has(event.id);
    const boardId = event.board_id;
    if (typeof boardId !== 'string' || !boardId) return false;
    return snapshotAppliedIds(boardId).has(event.id)
      || (safeParseArray(state.appliedEventIds[boardId]) || []).includes(event.id);
  }

  function noteApplied(key, hlc) {
    const newest = state.newestAppliedHlc[key];
    if (!hlc || (newest && compareHlc(newest, hlc) >= 0)) return;
    state.newestAppliedHlc[key] = hlc;
    schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
  }

  // Called only by the ingest interface. Folds one event onto the live view.
  // Returns true when the read model changed.
  function project(event) {
    if (!event?.id) return false;

    const slot = boardlessSlots.get(event.scope);
    if (slot) {
      if (appliedBoardlessIds.has(event.id)) return false;
      appliedBoardlessIds.add(event.id);
      const projected = applyEvent(createProjectionState({ [slot.field]: slot.seed() }), event);
      writeBoardless(slot, projected[slot.field]);
      const key = snapshotKeyForEvent(event);
      noteApplied(key, event.hlc);
      checkAndScheduleSnapshot(key, { fold: (snapshot, events) => fold(key, snapshot, events) });
      return true;
    }

    const boardId = event.board_id;
    if (typeof boardId !== 'string' || !boardId) return false;

    const memory = boardMemory(boardId);
    if (memory.appliedEventIds.has(event.id)) return false;

    const projected = applyEvent(createProjectionState({
      boards: state.boards,
      ...liveBoard(boardId),
      ...memory
    }), event);

    writeBoard(boardId, projected);
    noteApplied(boardId, event.hlc);
    checkAndScheduleSnapshot(boardId, {
      fold: (snapshot, events) => fold(boardId, snapshot, events),
      onSaved: onBoardSnapshotSaved
    });
    return true;
  }

  function liveBoard(boardId) {
    return {
      tasks: safeParseArray(state.tasks[boardId]) || [],
      columns: safeParseArray(state.columns[boardId]) || [],
      labels: safeParseArray(state.labels[boardId]) || [],
      settings: safeParseObject(state.settings[boardId]) || {}
    };
  }

  // The key's state as `snapshot` plus `events` in HLC order. A snapshot is
  // folded from events alone; a rebuild (`live`) starts board and global
  // settings from the live value under the snapshot's, so settings written
  // without an event (swimlanes) survive it.
  function fold(key, snapshot, events, { live = false } = {}) {
    const base = snapshot?.state;
    const slot = boardlessSlots.get(scopeForSnapshotKey(key));
    if (slot) {
      return applyEvents(createProjectionState({
        [slot.field]: slot.foldBase(base, live),
        appliedEventIds: base?.appliedEventIds
      }), events);
    }
    return applyEvents(createProjectionState({
      boards: (base?.boards || []).filter((board) => board.id === key),
      tasks: base?.tasks,
      columns: base?.columns,
      labels: base?.labels,
      settings: { ...(live ? liveBoard(key).settings : {}), ...(base?.settings || {}) },
      appliedEventIds: base?.appliedEventIds,
      taskTombstones: base?.taskTombstones
    }), events);
  }

  // Replaces the key's view with fold(). Delete records are permanent, so the
  // board's own are kept. Entities no event or snapshot knows of come from
  // writes that emit no event yet (import, column sort); they are kept as is.
  function rebuild(key, snapshot, events) {
    const projected = fold(key, snapshot, events, { live: true });
    const newest = [snapshot?.hlc, ...events.map((event) => event.hlc)]
      .filter(Boolean)
      .reduce((max, hlc) => (!max || compareHlc(hlc, max) > 0 ? hlc : max), null);

    const slot = boardlessSlots.get(scopeForSnapshotKey(key));
    if (slot) {
      for (const id of projected.appliedEventIds) appliedBoardlessIds.add(id);
      writeBoardless(slot, slot.normalize(projected[slot.field]));
      noteApplied(key, newest);
      return true;
    }

    const live = liveBoard(key);
    const mentioned = new Set(events.map((event) => event.entity_id));
    const taskTombstones = new Set([...boardMemory(key).taskTombstones, ...projected.taskTombstones]);
    const keepUnknown = (rebuilt, current) => [
      ...rebuilt,
      ...current.filter((item) => item?.id && !mentioned.has(item.id) && !rebuilt.some((x) => x.id === item.id))
    ].filter((item) => !taskTombstones.has(item.id));

    const boards = state.boards || [];
    const rebuiltBoard = projected.boards.find((board) => board.id === key);
    if (snapshot) state.snapshotAppliedIds[key] = new Set(snapshot.state.appliedEventIds);

    writeBoard(key, {
      boards: !rebuiltBoard ? boards
        : boards.some((board) => board.id === key) ? boards.map((board) => (board.id === key ? rebuiltBoard : board))
          : [...boards, rebuiltBoard],
      tasks: keepUnknown(projected.tasks, live.tasks),
      columns: keepUnknown(projected.columns, live.columns),
      labels: keepUnknown(projected.labels, live.labels),
      settings: projected.settings,
      taskTombstones,
      appliedEventIds: projected.appliedEventIds
    });
    noteApplied(key, newest);
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
    disconnect = connectProjector({ classify, project, rebuild });
  }

  function reset() {
    appliedBoardlessIds.clear();
    disconnect?.();
    disconnect = null;
  }

  return { register, reset, hydrate };
}

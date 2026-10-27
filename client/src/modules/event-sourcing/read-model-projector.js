import { applyEvent, applyEvents, createProjectionState, createTimeTrackingState } from '../reducer.js';
import { keyFor } from '../idb-store.js';
import { scopeForSnapshotKey, snapshotKeyForEvent } from './snapshot.js';
import { EVENT_SCOPE } from '../constants.js';
import { EVENT_ORDER, connectProjector, createSuperseded } from './ingest.js';
import { compareHlc, laterHlc } from './hlc.js';

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

  // With `live`, global settings (merged field by field) keep live fields under the snapshot's.
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

  // Board scopes answer "already applied" from durable memory instead (#178, CONTEXT.md §3).
  const appliedBoardlessIds = new Set();
  let disconnect = null;
  // A remote catch-up batch keeps projecting in memory but saves each board it touched once, at its end (#237).
  let batch = null;

  function classify(event) {
    if (hasApplied(event)) return EVENT_ORDER.APPLIED;
    const newest = state.newestAppliedHlc[snapshotKeyForEvent(event)];
    return newest && event.hlc && compareHlc(event.hlc, newest) < 0 ? EVENT_ORDER.LATE : EVENT_ORDER.IN_ORDER;
  }

  function hasApplied(event) {
    if (boardlessSlots.has(event.scope)) return appliedBoardlessIds.has(event.id);
    const boardId = event.board_id;
    if (typeof boardId !== 'string' || !boardId) return false;
    return Boolean(batch?.pending.get(boardId)?.ids.has(event.id)) || boardMemory(boardId).appliedEventIds.has(event.id);
  }

  function noteApplied(key, hlc, { batched = false } = {}) {
    const newest = laterHlc(state.newestAppliedHlc[key], hlc);
    if (!newest || newest === state.newestAppliedHlc[key]) return;
    state.newestAppliedHlc[key] = newest;
    if (batched) batch.newestApplied = true;
    else schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
  }

  function beginBatch() {
    batch ??= { boards: new Set(), newestApplied: false, pending: new Map() };
  }

  // Writes what the batch deferred; the caller awaits the scheduled writes before advancing its watermark.
  function endBatch() {
    if (!batch) return;
    for (const boardId of [...batch.pending.keys()]) applyPending(boardId);
    const { boards, newestApplied } = batch;
    batch = null;
    if (newestApplied) schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
    if (boards.size) schedulePersist(boardsKey, state.boards);
    for (const boardId of boards) {
      // deleteBoard() drops a board's state and stored read model; saving it now would bring the keys back.
      if (!(boardId in state.tasks)) continue;
      persistBoard(boardId);
      scheduleBoardSnapshot(boardId);
    }
  }

  function project(event, { batched = false } = {}) {
    if (!event?.id || hasApplied(event)) return false;

    const slot = boardlessSlots.get(event.scope);
    if (slot) {
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

    if (batched && batch) {
      const pending = batch.pending.get(boardId) ?? { events: [], ids: new Set() };
      pending.events.push(event);
      pending.ids.add(event.id);
      batch.pending.set(boardId, pending);
      batch.boards.add(boardId);
      noteApplied(boardId, event.hlc, { batched: true });
      return true;
    }

    applyPending(boardId);
    writeBoard(boardId, applyEvent(boardProjection(boardId), event));
    noteApplied(boardId, event.hlc);
    scheduleBoardSnapshot(boardId);
    return true;
  }

  // A batch takes each board's in-order events as one list, so the board is copied once per run, not per event (#238).
  // Anything that reads or replaces the board mid-batch applies its pending run first.
  function applyPending(boardId) {
    const pending = batch?.pending.get(boardId);
    if (!pending) return;
    batch.pending.delete(boardId);
    writeBoard(boardId, applyEvents(boardProjection(boardId), pending.events), { deferred: true });
  }

  function boardProjection(boardId) {
    return createProjectionState({ boards: state.boards, ...liveBoard(boardId), ...boardMemory(boardId) });
  }

  function scheduleBoardSnapshot(boardId) {
    checkAndScheduleSnapshot(boardId, {
      fold: (snapshot, events) => fold(boardId, snapshot, events),
      onSaved: onBoardSnapshotSaved
    });
  }

  function liveBoard(boardId) {
    return {
      tasks: safeParseArray(state.tasks[boardId]) || [],
      columns: safeParseArray(state.columns[boardId]) || [],
      labels: safeParseArray(state.labels[boardId]) || [],
      settings: safeParseObject(state.settings[boardId]) || {}
    };
  }

  // A rebuild (`live`) keeps settings written without an event (swimlanes) under the snapshot's.
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

  // Entities nothing in the event log knows of come from writes that emit no event yet (import), so they stay.
  function rebuild(key, snapshot, events, superseded = createSuperseded()) {
    applyPending(key);
    const projected = fold(key, snapshot, events, { live: true });
    const newest = [snapshot?.hlc, ...events.map((event) => event.hlc)].reduce(laterHlc, null);

    const slot = boardlessSlots.get(scopeForSnapshotKey(key));
    if (slot) {
      for (const id of projected.appliedEventIds) appliedBoardlessIds.add(id);
      writeBoardless(slot, slot.normalize(projected[slot.field]));
      noteApplied(key, newest);
      return true;
    }

    const live = liveBoard(key);
    const mentioned = new Set([...events, ...superseded.events].map((event) => event.entity_id));
    for (const { state: held } of superseded.snapshots) {
      for (const item of [...held.tasks, ...held.columns, ...held.labels]) mentioned.add(item?.id);
    }
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
    setAppliedIds(boardId, appliedIds);
    scheduleReadModelPersist(boardId, 'appliedEventIds', state.appliedEventIds[boardId]);
  }

  function setAppliedIds(boardId, appliedIds) {
    const covered = snapshotAppliedIds(boardId);
    state.appliedEventIds[boardId] = [...appliedIds].filter((id) => !covered.has(id));
  }

  function writeBoardless(slot, value) {
    state[slot.field] = value;
    schedulePersist(slot.persistKey, value);
  }

  function writeBoard(boardId, projected, { deferred = false } = {}) {
    state.boards = projected.boards;
    state.tasks[boardId] = projected.tasks;
    state.columns[boardId] = projected.columns;
    state.labels[boardId] = projected.labels;
    state.settings[boardId] = projected.settings;
    state.taskTombstones[boardId] = [...projected.taskTombstones];
    taskCacheByBoard.set(boardId, projected.tasks);
    setAppliedIds(boardId, projected.appliedEventIds);
    if (deferred) return;
    schedulePersist(boardsKey, state.boards);
    persistBoard(boardId);
  }

  function persistBoard(boardId) {
    scheduleReadModelPersist(boardId, 'tasks', state.tasks[boardId]);
    scheduleReadModelPersist(boardId, 'columns', state.columns[boardId]);
    scheduleReadModelPersist(boardId, 'labels', state.labels[boardId]);
    schedulePersist(keyFor(boardId, 'settings'), state.settings[boardId]);
    scheduleReadModelPersist(boardId, 'taskTombstones', state.taskTombstones[boardId]);
    scheduleReadModelPersist(boardId, 'appliedEventIds', state.appliedEventIds[boardId]);
  }

  // Null when the snapshot already holds the event.
  function foldOntoSnapshot(key, snapshot, event) {
    if (snapshot.state.appliedEventIds.has(event.id)) return null;
    return fold(key, snapshot, [event]);
  }

  function register() {
    if (disconnect) return;
    disconnect = connectProjector({ classify, project, rebuild, foldOntoSnapshot, beginBatch, endBatch });
  }

  function reset() {
    appliedBoardlessIds.clear();
    batch = null;
    disconnect?.();
    disconnect = null;
  }

  return { register, reset };
}

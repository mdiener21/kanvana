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
    batch ??= { boards: new Set(), saved: new Set(), dropped: new Set(), newestApplied: false, pending: new Map() };
  }

  function persistBatch() {
    applyAllPending();
    if (batch.newestApplied) schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
    if (batch.boards.size) schedulePersist(boardsKey, state.boards);
    batch.boards.forEach(persistBoard);
    batch.boards.forEach((boardId) => batch.saved.add(boardId));
    batch.boards.clear();
    batch.newestApplied = false;
  }

  function endBatch() {
    if (!batch) return;
    persistBatch();
    const { saved } = batch;
    batch = null;
    saved.forEach(scheduleBoardSnapshot);
  }

  // A tab closed mid catch-up keeps the batch's stored events, which catch-up then skips, so save the board so far.
  function persistBatchOnPageHide() {
    if (batch) persistBatch();
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
      // deleteBoard() removed the board's state and stored read model; queuing would bring them back.
      if (batch.dropped.has(boardId)) return false;
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
    saveBoard(boardId);
    noteApplied(boardId, event.hlc);
    scheduleBoardSnapshot(boardId);
    return true;
  }

  // One list per board copies it once per run, not once per event (#238).
  function applyPending(boardId) {
    const pending = batch?.pending.get(boardId);
    if (!pending) return;
    batch.pending.delete(boardId);
    writeBoard(boardId, applyEvents(boardProjection(boardId), pending.events));
  }

  // Reads mid-batch must see the queued events, or a local command builds its payload from a stale board.
  function applyAllPending() {
    if (batch) [...batch.pending.keys()].forEach(applyPending);
  }

  function dropBoard(boardId) {
    if (!batch) return;
    batch.pending.delete(boardId);
    batch.boards.delete(boardId);
    batch.saved.delete(boardId);
    batch.dropped.add(boardId);
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
    saveBoard(key);
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
    setAppliedIds(boardId, safeParseArray(state.appliedEventIds[boardId]) || []);
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

  function writeBoard(boardId, projected) {
    state.boards = projected.boards;
    state.tasks[boardId] = projected.tasks;
    state.columns[boardId] = projected.columns;
    state.labels[boardId] = projected.labels;
    state.settings[boardId] = projected.settings;
    state.taskTombstones[boardId] = [...projected.taskTombstones];
    taskCacheByBoard.set(boardId, projected.tasks);
    setAppliedIds(boardId, projected.appliedEventIds);
  }

  function saveBoard(boardId) {
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
    window.addEventListener('pagehide', persistBatchOnPageHide);
  }

  function reset() {
    appliedBoardlessIds.clear();
    batch = null;
    window.removeEventListener('pagehide', persistBatchOnPageHide);
    disconnect?.();
    disconnect = null;
  }

  return { register, reset, applyAllPending, dropBoard };
}

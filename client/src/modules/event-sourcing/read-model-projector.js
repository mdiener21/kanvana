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

// What IDB stores per board. The board list is one key shared by every board, so it is tracked apart.
const BOARD_SLICES = ['tasks', 'columns', 'labels', 'settings', 'taskTombstones', 'appliedEventIds'];

export function createReadModelProjector(ctx) {
  const {
    state,
    taskCacheByBoard,
    loadGlobalSettings,
    safeParseArray,
    safeParseObject,
    demoTasksForReplay,
    withoutUnheldDemoTasks,
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
  // What changed in memory since it was last stored. A save writes these and nothing else.
  const unsavedSlices = new Map();
  let boardsUnsaved = false;

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

  // Board-less scopes remember ids per session, so newer-than-newest counts as missed; a deleted board's events must not revive it.
  function missedEvents(events) {
    const deleted = new Set(events.filter((event) => event.type === 'board.deleted').map((event) => event.board_id));
    const removedHere = (boardId) => deleted.has(boardId) && !state.boards.some((board) => board.id === boardId);
    return events.filter((event) => {
      if (hasApplied(event)) return false;
      if (!boardlessSlots.has(event.scope)) return !removedHere(event.board_id);
      const newest = state.newestAppliedHlc[snapshotKeyForEvent(event)];
      return !newest || compareHlc(event.hlc, newest) > 0;
    });
  }

  function noteApplied(key, hlc, { batched = false } = {}) {
    const newest = laterHlc(state.newestAppliedHlc[key], hlc);
    if (!newest || newest === state.newestAppliedHlc[key]) return;
    state.newestAppliedHlc[key] = newest;
    if (batched) batch.newestApplied = true;
    else schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
  }

  function beginBatch() {
    batch ??= { boards: new Set(), saved: new Set(), dropped: new Set(), newestApplied: false, pending: new Map(), changed: false };
  }

  function persistBatch() {
    applyAllPending();
    if (batch.newestApplied) schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
    persistBoards();
    batch.boards.forEach(persistBoard);
    batch.boards.forEach((boardId) => batch.saved.add(boardId));
    batch.boards.clear();
    batch.newestApplied = false;
  }

  // Whether the batch changed anything a render would show; queued events only reveal that once applied.
  function endBatch() {
    if (!batch) return false;
    persistBatch();
    const { saved, changed } = batch;
    batch = null;
    saved.forEach(scheduleBoardSnapshot);
    return changed;
  }

  // A tab closed mid catch-up keeps the batch's stored events, which catch-up then skips, so save the board so far.
  function persistBatchOnPageHide() {
    if (batch) persistBatch();
  }

  // True when the event changed the read model now. A no-op is still remembered and counts towards a snapshot.
  function project(event, { batched = false } = {}) {
    if (!event?.id || hasApplied(event)) return false;

    const slot = boardlessSlots.get(event.scope);
    if (slot) {
      appliedBoardlessIds.add(event.id);
      const seeded = createProjectionState({ [slot.field]: slot.seed() });
      const projected = applyEvent(seeded, event);
      const changed = projected[slot.field] !== seeded[slot.field];
      if (changed) writeBoardless(slot, projected[slot.field]);
      const key = snapshotKeyForEvent(event);
      noteApplied(key, event.hlc);
      checkAndScheduleSnapshot(key, { fold: (snapshot, events) => fold(key, snapshot, events) });
      return changed;
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
      return false;
    }

    applyPending(boardId);
    const changed = writeBoard(boardId, applyEvent(boardProjection(boardId), event));
    saveBoard(boardId);
    noteApplied(boardId, event.hlc);
    scheduleBoardSnapshot(boardId);
    return changed;
  }

  // One list per board copies it once per run, not once per event (#238).
  function applyPending(boardId) {
    const pending = batch?.pending.get(boardId);
    if (!pending) return;
    batch.pending.delete(boardId);
    if (writeBoard(boardId, applyEvents(boardProjection(boardId), pending.events))) batch.changed = true;
  }

  // Reads mid-batch must see the queued events, or a local command builds its payload from a stale board.
  function applyAllPending() {
    if (batch) [...batch.pending.keys()].forEach(applyPending);
  }

  function dropBoard(boardId) {
    unsavedSlices.delete(boardId);
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
      tasks: base?.tasks ?? demoTasksForReplay(key, liveBoard(key).tasks),
      columns: base?.columns,
      labels: base?.labels,
      settings: { ...(live ? liveBoard(key).settings : {}), ...(base?.settings || {}) },
      appliedEventIds: base?.appliedEventIds,
      taskTombstones: base?.taskTombstones
    }), events);
  }

  function snapshotToAdopt(key, snapshotState) {
    if (boardlessSlots.has(scopeForSnapshotKey(key))) return snapshotState;
    return { ...snapshotState, tasks: withoutUnheldDemoTasks(key, snapshotState.tasks, liveBoard(key).tasks) };
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
    // A rebuild replaces every list and may swap applied ids for a snapshot's, so all of it is stored.
    BOARD_SLICES.forEach((slice) => markUnsaved(key, slice));
    boardsUnsaved = true;
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

  function markUnsaved(boardId, slice) {
    if (!unsavedSlices.has(boardId)) unsavedSlices.set(boardId, new Set());
    unsavedSlices.get(boardId).add(slice);
  }

  // True when a slice other than the event memory changed. A slice never stored counts as changed, so a reload keeps it.
  function writeBoard(boardId, projected) {
    const tombstonesBefore = (safeParseArray(state.taskTombstones[boardId]) || []).length;
    const appliedBefore = (safeParseArray(state.appliedEventIds[boardId]) || []).length;
    const changed = ['tasks', 'columns', 'labels', 'settings'].filter((slice) => projected[slice] !== state[slice][boardId]);
    if (projected.taskTombstones.size !== tombstonesBefore) changed.push('taskTombstones');
    const boardsChanged = projected.boards !== state.boards;

    state.boards = projected.boards;
    state.tasks[boardId] = projected.tasks;
    state.columns[boardId] = projected.columns;
    state.labels[boardId] = projected.labels;
    state.settings[boardId] = projected.settings;
    state.taskTombstones[boardId] = [...projected.taskTombstones];
    taskCacheByBoard.set(boardId, projected.tasks);
    setAppliedIds(boardId, projected.appliedEventIds);

    changed.forEach((slice) => markUnsaved(boardId, slice));
    if (boardsChanged) boardsUnsaved = true;
    if (state.appliedEventIds[boardId].length !== appliedBefore) markUnsaved(boardId, 'appliedEventIds');
    return boardsChanged || changed.length > 0;
  }

  function saveBoard(boardId) {
    persistBoards();
    persistBoard(boardId);
  }

  function persistBoards() {
    if (!boardsUnsaved) return;
    boardsUnsaved = false;
    schedulePersist(boardsKey, state.boards);
  }

  function persistBoard(boardId) {
    const slices = unsavedSlices.get(boardId);
    if (!slices) return;
    unsavedSlices.delete(boardId);
    for (const slice of slices) {
      if (slice === 'settings') schedulePersist(keyFor(boardId, 'settings'), state.settings[boardId]);
      else scheduleReadModelPersist(boardId, slice, state[slice][boardId]);
    }
  }

  // Null when the snapshot already holds the event.
  function foldOntoSnapshot(key, snapshot, event) {
    if (snapshot.state.appliedEventIds.has(event.id)) return null;
    return fold(key, snapshot, [event]);
  }

  function register() {
    if (disconnect) return;
    disconnect = connectProjector({ classify, project, rebuild, snapshotToAdopt, foldOntoSnapshot, beginBatch, endBatch, missedEvents });
    window.addEventListener('pagehide', persistBatchOnPageHide);
  }

  function reset() {
    appliedBoardlessIds.clear();
    batch = null;
    unsavedSlices.clear();
    boardsUnsaved = false;
    window.removeEventListener('pagehide', persistBatchOnPageHide);
    disconnect?.();
    disconnect = null;
  }

  return { register, reset, applyAllPending, dropBoard };
}

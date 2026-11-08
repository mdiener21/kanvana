import { applyEvent, applyEvents, createProjectionState, createTimeTrackingState } from '../reducer.js';
import { EVENTS_STORE, KV_STORE, READ_MODEL_STORE, SNAPSHOTS_STORE, keyFor, openStore, readModelKeyFor, writeIfDataCurrent } from '../idb-store.js';
import {
  GLOBAL_SNAPSHOT_KEY, TIMETRACKING_SNAPSHOT_KEY, loadEventsAfter, loadSnapshot, saveSnapshot, scopeForSnapshotKey, snapshotKeyForEvent
} from './snapshot.js';
import { EVENT_SCOPE } from '../constants.js';
import { compareHlc, laterHlc } from './hlc.js';
import { DATA_CHANGED, emit } from '../events.js';
import { safeParseArray, safeParseObject } from '../utils.js';
import { normalizeGlobalSettings } from '../normalize.js';

// The Read Model, sole writer of the IDB read model (ADR-0005); ingest.js makes the one instance and alone projects into it.

export const EVENT_ORDER = Object.freeze({ APPLIED: 'applied', IN_ORDER: 'in-order', LATE: 'late' });

// What an adopted snapshot replaced: the old snapshots and the stored events the new one covers.
function createSuperseded() {
  return { snapshots: [], events: [] };
}

// What IDB stores per board. The board list is one key shared by every board, so it is tracked apart.
const VIEW_SLICES = ['tasks', 'columns', 'labels', 'settings'];
const BOARD_SLICES = [...VIEW_SLICES, 'taskTombstones', 'appliedEventIds'];

function emptyState() {
  return {
    boards: [],
    tasks: {},    // { [boardId]: task[] | null }
    columns: {},  // { [boardId]: column[] | null }
    labels: {},   // { [boardId]: label[] | null }
    settings: {},  // { [boardId]: object | null }
    taskTombstones: {},  // { [boardId]: taskId[] } — task delete records (#178)
    appliedEventIds: {},  // { [boardId]: eventId[] } — applied ids not yet held by a snapshot (#178)
    snapshotAppliedIds: {},  // { [boardId]: Set<eventId> } — applied ids held by the board's latest snapshot
    newestAppliedHlc: {},  // { [scopeKey]: hlc } — newest event folded into each key's view (#179)
    globalSettings: null,
    timeTracking: null
  };
}

export function createReadModelProjector(ctx) {
  const {
    demoTasksForReplay,
    withoutUnheldDemoTasks,
    schedulePersist,
    scheduleDelete,
    scheduleReadModelPersist,
    scheduleReadModelDelete,
    checkAndScheduleSnapshot,
    boardsKey,
    globalSettingsKey,
    timeTrackingKey,
    newestAppliedKey
  } = ctx;

  let state = emptyState();
  // Per-board default-task cache (keeps defaults stable within a session).
  const taskCacheByBoard = new Map();

  function loadGlobalSettings() {
    const parsed = safeParseObject(state.globalSettings);
    return parsed ? normalizeGlobalSettings(parsed) : {};
  }

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

  // The one copy of the scope state (#280); overlapping batches, or nested commits, share one.
  let batch = null;
  // What changed in memory since it was last stored. A save writes these and nothing else.
  const unsavedSlices = new Map();
  let boardsUnsaved = false;
  // A local commit scope (#142) projects each event at once; it saves, redraws and announces once, when it closes.
  let commit = null;
  // Off during boot-time backfill, so its events are persisted without a render each.
  let projecting = false;

  function classify(event) {
    if (hasApplied(event)) return EVENT_ORDER.APPLIED;
    const newest = state.newestAppliedHlc[snapshotKeyForEvent(event)];
    return newest && event.hlc && compareHlc(event.hlc, newest) < 0 ? EVENT_ORDER.LATE : EVENT_ORDER.IN_ORDER;
  }

  // Every scope answers "already applied" from durable memory, so a stale tab's write can not hide a gap (#178, CONTEXT.md §3).
  function hasApplied(event) {
    const key = boardlessSlots.has(event.scope) ? snapshotKeyForEvent(event) : event.board_id;
    if (typeof key !== 'string' || !key) return false;
    return Boolean(batch?.pending.get(key)?.ids.has(event.id)) || boardMemory(key).appliedEventIds.has(event.id);
  }

  // A deleted board's events must not revive it.
  function missedEvents(events) {
    const deleted = new Set(events.filter((event) => event.type === 'board.deleted').map((event) => event.board_id));
    const removedHere = (boardId) => deleted.has(boardId) && !state.boards.some((board) => board.id === boardId);
    return events.filter((event) => !hasApplied(event) && (boardlessSlots.has(event.scope) || !removedHere(event.board_id)));
  }

  function noteApplied(key, hlc, { batched = false } = {}) {
    const newest = laterHlc(state.newestAppliedHlc[key], hlc);
    if (!newest || newest === state.newestAppliedHlc[key]) return;
    state.newestAppliedHlc[key] = newest;
    if (batched) batch.newestApplied = true;
    else if (commit) commit.newestApplied = true;
    else schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
  }

  function beginCommit() {
    commit ??= { depth: 0, boards: new Set(), boardless: new Map(), newestApplied: false, changed: false, stored: [] };
    commit.depth += 1;
  }

  // `onClosed` gets what the closing commit changed and stored, even if saving it throws.
  function endCommit(onClosed) {
    if (!commit) return;
    commit.depth -= 1;
    if (commit.depth > 0) return;
    const closing = commit;
    commit = null;
    try {
      closing.boardless.forEach(({ slot, viewChanged }, key) => persistBoardless(slot, key, viewChanged));
      persistTouched(closing);
    } finally {
      onClosed?.({ changed: closing.changed, stored: closing.stored });
    }
  }

  // True when an open scope takes the change, to signal it once when it closes; a batch takes only remote changes.
  function holdChange({ local = false } = {}) {
    if (commit) commit.changed = true;
    else if (batch && !local) batch.changed = true;
    else return false;
    return true;
  }

  // True when an open commit takes the event, to announce it with the commit's others once stored.
  function holdStored(persisted, eventId) {
    if (!commit) return false;
    commit.stored.push(persisted.then(() => eventId));
    return true;
  }

  function persistTouched({ boards, newestApplied }) {
    if (newestApplied) schedulePersist(newestAppliedKey, { ...state.newestAppliedHlc });
    persistBoards();
    boards.forEach((boardId) => persistBoard(boardId));
  }

  function beginBatch() {
    batch ??= { depth: 0, boards: new Set(), saved: new Set(), dropped: new Set(), newestApplied: false, pending: new Map(), changed: false };
    batch.depth += 1;
  }

  function persistBatch() {
    applyAllPending();
    persistTouched(batch);
    batch.boards.forEach((boardId) => batch.saved.add(boardId));
    batch.boards.clear();
    batch.newestApplied = false;
  }

  // Each end stores what the batch touched so far (#237); true when the last one closes and a render would show a change.
  function endBatch() {
    if (!batch) return false;
    batch.depth -= 1;
    persistBatch();
    batch.saved.forEach(scheduleBoardSnapshot);
    batch.saved.clear();
    if (batch.depth > 0) return false;
    const { changed } = batch;
    batch = null;
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
      const key = snapshotKeyForEvent(event);
      const seeded = createProjectionState({ [slot.field]: slot.seed() });
      const projected = applyEvent(seeded, event);
      const changed = projected[slot.field] !== seeded[slot.field];
      const appliedIds = [...(safeParseArray(state.appliedEventIds[key]) || []), event.id];
      writeBoardless(slot, key, changed ? projected[slot.field] : undefined, appliedIds);
      noteApplied(key, event.hlc);
      checkAndScheduleSnapshot(key, { fold: (snapshot, events) => fold(key, snapshot, events), onSaved: onSnapshotSaved });
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
    if (commit) commit.boards.add(boardId);
    else saveBoard(boardId);
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
    for (const slice of [...BOARD_SLICES, 'snapshotAppliedIds']) delete state[slice][boardId];
    taskCacheByBoard.delete(boardId);
    unsavedSlices.delete(boardId);
    BOARD_SLICES.forEach((slice) => deleteSlice(boardId, slice));
    if (!batch) return;
    batch.pending.delete(boardId);
    batch.boards.delete(boardId);
    batch.saved.delete(boardId);
    batch.dropped.add(boardId);
  }

  // A board made without replaying events (created or seeded here) is stored like any projected change, so a failed save is retried.
  function addBoard(boards, boardId, slices) {
    state.boards = boards;
    boardsUnsaved = true;
    for (const slice of VIEW_SLICES) {
      state[slice][boardId] = slices[slice];
      markUnsaved(boardId, slice);
    }
    saveBoard(boardId);
  }

  // The board leaves the list before `announce` emits its board.deleted; projecting that writes its slices once more, so they go after.
  function removeBoard(boardId, boards, announce) {
    state.boards = boards;
    boardsUnsaved = true;
    persistBoards();
    announce();
    dropBoard(boardId);
  }

  function boardProjection(boardId) {
    return createProjectionState({ boards: state.boards, ...liveBoard(boardId), ...boardMemory(boardId) });
  }

  function scheduleBoardSnapshot(boardId) {
    checkAndScheduleSnapshot(boardId, {
      fold: (snapshot, events) => fold(boardId, snapshot, events),
      onSaved: onSnapshotSaved
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
  function rebuild(key, snapshot, events, replaced = createSuperseded()) {
    applyPending(key);
    const projected = fold(key, snapshot, events, { live: true });
    const newest = [snapshot?.hlc, ...events.map((event) => event.hlc)].reduce(laterHlc, null);

    const slot = boardlessSlots.get(scopeForSnapshotKey(key));
    if (slot) {
      if (snapshot) state.snapshotAppliedIds[key] = new Set(snapshot.state.appliedEventIds);
      writeBoardless(slot, key, slot.normalize(projected[slot.field]), projected.appliedEventIds);
      noteApplied(key, newest);
      return true;
    }

    const live = liveBoard(key);
    const mentioned = new Set([...events, ...replaced.events].map((event) => event.entity_id));
    for (const { state: held } of replaced.snapshots) {
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

  // Once a snapshot holds a key's applied ids, prune them from the live set.
  function onSnapshotSaved(key, snapshotState) {
    state.snapshotAppliedIds[key] = new Set(snapshotState.appliedEventIds);
    setAppliedIds(key, safeParseArray(state.appliedEventIds[key]) || []);
    scheduleReadModelPersist(key, 'appliedEventIds', state.appliedEventIds[key]);
  }

  function setAppliedIds(boardId, appliedIds) {
    const covered = snapshotAppliedIds(boardId);
    state.appliedEventIds[boardId] = [...appliedIds].filter((id) => !covered.has(id));
  }

  // The view and its applied ids are written together, so a stale tab's copy leaves its gap detectable.
  // An undefined `value` means the event changed nothing: only its id is remembered (#138).
  function writeBoardless(slot, key, value, appliedIds) {
    const viewChanged = value !== undefined;
    if (viewChanged) state[slot.field] = value;
    setAppliedIds(key, appliedIds);
    if (!commit) return persistBoardless(slot, key, viewChanged);
    const pending = commit.boardless.get(key);
    commit.boardless.set(key, { slot, viewChanged: viewChanged || Boolean(pending?.viewChanged) });
  }

  function persistBoardless(slot, key, viewChanged) {
    if (viewChanged) schedulePersist(slot.persistKey, state[slot.field]);
    scheduleReadModelPersist(key, 'appliedEventIds', state.appliedEventIds[key]);
  }

  function markUnsaved(boardId, slice) {
    if (!unsavedSlices.has(boardId)) unsavedSlices.set(boardId, new Set());
    unsavedSlices.get(boardId).add(slice);
  }

  // True when a slice other than the event memory changed. A slice never stored counts as changed, so a reload keeps it.
  function writeBoard(boardId, projected) {
    const tombstonesBefore = (safeParseArray(state.taskTombstones[boardId]) || []).length;
    const appliedBefore = (safeParseArray(state.appliedEventIds[boardId]) || []).length;
    const changed = VIEW_SLICES.filter((slice) => projected[slice] !== state[slice][boardId]);
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
    schedulePersist(boardsKey, state.boards, () => { boardsUnsaved = true; });
  }

  // A failed write stored nothing (#256) and a later save only writes what is marked, so it marks the slice again.
  function persistBoard(boardId) {
    const slices = unsavedSlices.get(boardId);
    if (!slices) return;
    unsavedSlices.delete(boardId);
    for (const slice of slices) {
      const onFailed = () => markUnsaved(boardId, slice);
      if (slice === 'settings') schedulePersist(keyFor(boardId, 'settings'), state.settings[boardId], onFailed);
      else scheduleReadModelPersist(boardId, slice, state[slice][boardId], onFailed);
    }
  }

  // Board settings live in the key-value store, the other slices in the read-model store.
  function deleteSlice(boardId, slice) {
    if (slice === 'settings') scheduleDelete(keyFor(boardId, 'settings'));
    else scheduleReadModelDelete(boardId, slice);
  }

  // ── Late events (CONTEXT.md §9): folded onto the snapshot that covers them, then put in order by a rebuild.

  // Committed events the store may not hold yet, which a rebuild reading the store would miss.
  const unstored = new Map();
  const committedDuringRebuild = new Map();
  const rebuilds = new Map();
  const superseded = new Map();

  function noteCommitted(event, stored) {
    committedDuringRebuild.get(snapshotKeyForEvent(event))?.set(event.id, event);
    if (!stored) return;
    unstored.set(event.id, event);
    const forget = () => unstored.delete(event.id);
    stored.then(forget, forget);
  }

  // The events before a covered late event may be gone, so it folds onto the snapshot; false when that already holds it.
  async function foldOntoCoveringSnapshot(event) {
    if (!projecting || classify(event) !== EVENT_ORDER.LATE) return true;
    const key = snapshotKeyForEvent(event);
    const snapshot = await loadSnapshot(key);
    if (!snapshot || compareHlc(event.hlc, snapshot.hlc) > 0) return true;
    if (snapshot.state.appliedEventIds.has(event.id)) return false;
    await saveSnapshot(key, fold(key, snapshot, [event]), snapshot.hlc);
    return true;
  }

  // The rebuild keeps this device's newer stored events (#180) and drops what only the replaced history knew; resolves to what it forgot.
  async function adoptSnapshot(key, snapshotState, hlc) {
    const replaced = await loadSnapshot(key);
    const covered = (await loadEventsAfter(key, replaced?.hlc ?? null)).filter((event) => compareHlc(event.hlc, hlc) <= 0);
    await saveSnapshot(key, projecting ? snapshotToAdopt(key, snapshotState) : snapshotState, hlc);
    const entry = superseded.get(key) ?? createSuperseded();
    if (replaced) entry.snapshots.push(replaced);
    entry.events.push(...covered);
    superseded.set(key, entry);
    await rebuildScope(key);
    const held = replaced ? [...replaced.state.tasks, ...replaced.state.columns, ...replaced.state.labels] : [];
    return [...covered.map((event) => event.entity_id), ...held.map((item) => item?.id)];
  }

  // Another tab adopted a snapshot (#222): only it knows what was replaced, and this rebuild must drop the same.
  function rebuildAfterPeerAdoption(key, forgotten) {
    const entry = superseded.get(key) ?? createSuperseded();
    entry.events.push(...forgotten.map((entity_id) => ({ entity_id })));
    superseded.set(key, entry);
    return rebuildScope(key);
  }

  // Requests for a key that is already waiting to rebuild share that run.
  function rebuildScope(key) {
    const current = rebuilds.get(key);
    if (current?.waiting) return current.promise;
    const entry = { waiting: true };
    entry.promise = (current?.promise ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        entry.waiting = false;
        return runRebuild(key);
      })
      .finally(() => {
        if (rebuilds.get(key) === entry) rebuilds.delete(key);
      });
    rebuilds.set(key, entry);
    return entry.promise;
  }

  // Events committed while the store is read may be missing from the read; the reducer dedups by id.
  async function runRebuild(key) {
    if (!projecting) return;
    const collected = new Map([...unstored].filter(([, event]) => snapshotKeyForEvent(event) === key));
    const replaced = superseded.get(key);
    superseded.delete(key);
    committedDuringRebuild.set(key, collected);
    try {
      const snapshot = await loadSnapshot(key);
      const stored = await loadEventsAfter(key, snapshot?.hlc ?? null);
      const pending = [...collected.values()].filter((event) => !snapshot || compareHlc(event.hlc, snapshot.hlc) > 0);
      if (projecting && rebuild(key, snapshot, [...stored, ...pending], replaced) && !holdChange()) emit(DATA_CHANGED, { rebuilt: key });
    } finally {
      committedDuringRebuild.delete(key);
    }
  }

  // Adding the same listener again is a no-op, so this is idempotent.
  function startProjecting() {
    projecting = true;
    window.addEventListener('pagehide', persistBatchOnPageHide);
  }

  function isProjecting() {
    return projecting;
  }

  // Devices from before #179 never recorded it, so it is derived once from the stored events and snapshots.
  async function loadNewestAppliedHlc(db) {
    const stored = safeParseObject(await db.get(KV_STORE, newestAppliedKey));
    if (stored) return { ...stored };

    const newest = {};
    const note = (key, hlc) => {
      if (key && hlc) newest[key] = laterHlc(newest[key], hlc);
    };
    for (const event of await db.getAll(EVENTS_STORE)) note(snapshotKeyForEvent(event), event.hlc);
    for (const key of await db.getAllKeys(SNAPSHOTS_STORE)) note(key, (await db.get(SNAPSHOTS_STORE, key))?.hlc);
    await writeIfDataCurrent(KV_STORE, (store) => store.put(newest, newestAppliedKey));
    return newest;
  }

  async function load() {
    const db = await openStore();
    state.boards = safeParseArray(await db.get(KV_STORE, boardsKey)) || [];
    state.globalSettings = normalizeGlobalSettings(await db.get(KV_STORE, globalSettingsKey));
    state.timeTracking = createTimeTrackingState(await db.get(KV_STORE, timeTrackingKey));

    const loadSlice = (key, slice) => (slice === 'settings'
      ? db.get(KV_STORE, keyFor(key, slice))
      : db.get(READ_MODEL_STORE, readModelKeyFor(key, slice)));
    for (const board of state.boards) {
      for (const slice of VIEW_SLICES) state[slice][board.id] = (await loadSlice(board.id, slice)) ?? null;
      state.taskTombstones[board.id] = (await loadSlice(board.id, 'taskTombstones')) ?? [];
    }
    for (const key of [...state.boards.map((board) => board.id), GLOBAL_SNAPSHOT_KEY, TIMETRACKING_SNAPSHOT_KEY]) {
      state.appliedEventIds[key] = (await loadSlice(key, 'appliedEventIds')) ?? [];
      state.snapshotAppliedIds[key] = (await loadSnapshot(key))?.state.appliedEventIds ?? new Set();
    }
    state.newestAppliedHlc = await loadNewestAppliedHlc(db);
  }

  // ── Reads: queued catch-up events are applied first, so a read never sees a stale board.

  function boards() {
    applyAllPending();
    return state.boards;
  }

  // Each slice parsed, or null when the board has never stored it.
  function board(boardId) {
    applyAllPending();
    return {
      tasks: safeParseArray(state.tasks[boardId]),
      columns: safeParseArray(state.columns[boardId]),
      labels: safeParseArray(state.labels[boardId]),
      settings: safeParseObject(state.settings[boardId])
    };
  }

  function timeTracking() {
    return createTimeTrackingState(state.timeTracking);
  }

  function cachedTasks(boardId) {
    return taskCacheByBoard.get(boardId);
  }

  function cacheTasks(boardId, tasks) {
    taskCacheByBoard.set(boardId, tasks);
  }

  // ── Writes storage still makes without an event (save* paths).

  function setBoards(next) {
    state.boards = next;
  }

  function setBoardSlice(boardId, slice, value) {
    state[slice][boardId] = value;
  }

  function setGlobalSettings(value) {
    state.globalSettings = value;
  }

  // ── Board settings no event carries (swimlanes, display toggles); a rebuild keeps them (see fold).

  function writeBoardSettings(boardId, settings) {
    state.settings[boardId] = settings;
    schedulePersist(keyFor(boardId, 'settings'), settings);
  }

  // Another tab stored them (#222); this tab's old copy would undo them on its next board save. True when taken.
  async function refreshBoardSettings(boardId) {
    const db = await openStore();
    const stored = safeParseObject(await db.get(KV_STORE, keyFor(boardId, 'settings')));
    if (!stored) return false;
    state.settings[boardId] = stored;
    return true;
  }

  function reset() {
    state = emptyState();
    taskCacheByBoard.clear();
    batch = null;
    commit = null;
    unsavedSlices.clear();
    boardsUnsaved = false;
    projecting = false;
    window.removeEventListener('pagehide', persistBatchOnPageHide);
  }

  return {
    load, startProjecting, isProjecting, reset, addBoard, removeBoard,
    boards, board, globalSettings: loadGlobalSettings, timeTracking, cachedTasks, cacheTasks,
    setBoards, setBoardSlice, setGlobalSettings, writeBoardSettings, refreshBoardSettings,
    classify, project, missedEvents, beginBatch, endBatch, beginCommit, endCommit, holdChange, holdStored,
    noteCommitted, foldOntoCoveringSnapshot, adoptSnapshot, rebuildAfterPeerAdoption, rebuildScope
  };
}

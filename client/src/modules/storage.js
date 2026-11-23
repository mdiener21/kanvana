import { generateUUID, nowIso } from './utils.js';
import { normalizePriority, isHexColor, normalizeCountdownThreshold, defaultColumnColor, normalizeStringKeys, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import { ACTIVE_BOARD_KEY, DEFAULT_BOARD_ID, DONE_COLUMN_ID, DONE_COLUMN_ROLE, isDoneColumn } from './constants.js';
import { openStore, KV_STORE, EVENTS_STORE, SNAPSHOTS_STORE, isFirstPullPending, schedulePersist, scheduleDelete, scheduleReadModelPersist, scheduleReadModelDelete, _flushPersistsForTesting as _flushIdbPersistsForTesting, _resetIdbForTesting } from './idb-store.js';
import { initHlc } from './event-sourcing/hlc.js';
import { _flushDomainEventsForTesting, scheduleDomainEvent } from './event-sourcing/emitter.js';
import { checkAndScheduleSnapshot, _resetSnapshotSchedulerForTesting } from './event-sourcing/snapshot.js';
import { createReadModel } from './event-sourcing/ingest.js';
import { STABLE_DEFAULT_BOARD_ID, defaultBoardData, defaultColumns, defaultLabels, defaultSettings, defaultTasks, stableDefaultBoardData } from './event-sourcing/read-model-seed.js';
import { migrateLegacyState } from './boot-migration.js';
import { backfillEventLog } from './event-sourcing/backfill.js';
import { BOARD_SETTINGS_WRITTEN, DATA_CHANGED, emit } from './events.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_SWIMLANE_GROUP_BY = new Set(['label', 'label-group', 'priority']);

// ── In-memory state ────────────────────────────────────────────────────────────
//
// The Read Model holds the board data in memory; public CRUD functions read it synchronously.
// IDB persistence happens asynchronously via schedulePersist().
// Call initStorage() once at app startup to populate from IDB.

let activeBoardId = null;
const syntheticDoneIdByBoard = new Map();

// After an account switch the default board's events wait for the first catch-up (#221).
let defaultBoardDeferred = false;

// Made once; only ingest projects into it (ADR-0005, #281).
const readModel = createReadModel({
  schedulePersist,
  scheduleDelete,
  scheduleReadModelPersist,
  scheduleReadModelDelete,
  checkAndScheduleSnapshot
});

// ── Public initialisation ──────────────────────────────────────────────────────

/**
 * Must be called once at app startup (before any board renders).
 * Opens the IDB database, runs the boot migration (boot-migration.js), and loads all
 * board data into the in-memory state so subsequent reads are synchronous.
 */
export async function initStorage() {
  const db = await openStore();
  await initHlc();

  await migrateLegacyState(db);

  // Load everything into in-memory state.
  await readModel.load();
  activeBoardId = (await db.get(KV_STORE, ACTIVE_BOARD_KEY)) || null;
  defaultBoardDeferred = await isFirstPullPending();

  // One-shot: give pre-event-sourcing state an event log so it can sync at all.
  const backfillStartedAt = globalThis.__kanvanaPerfMarks ? performance.now() : null;
  await backfillEventLog({ boards: listBoards(), boardFor: loadBoard });
  if (backfillStartedAt !== null) {
    performance.measure('kanvana:startup:backfill', { start: backfillStartedAt, end: performance.now() });
  }

  // Backfill emits synthetic create events only to populate the event log. The
  // read model is already loaded above, so projecting those events during boot
  // would trigger one DATA_CHANGED/full render per entity (hundreds for a
  // large board) before the initial render is even allowed to run.
  readModel.startProjecting();

  // Non-blocking quota warning at 80%.
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (!quota) return;
      const pct = Math.round((usage / quota) * 100);
      if (pct >= 80) {
        console.warn(`[Kanvana] Storage at ${pct}% of browser quota. Consider archiving old boards.`);
      }
    }).catch(() => {});
  }
}

export async function _flushPersistsForTesting() {
  await _flushDomainEventsForTesting();
  await _flushIdbPersistsForTesting();
}

/**
 * Resets the in-memory state and IDB connection.
 * Call this in unit test beforeEach hooks to get a clean slate.
 */
export function _resetStorageForTesting() {
  // Close the open IDB connection so a subsequent deleteDB() call is not blocked.
  _resetIdbForTesting();
  activeBoardId = null;
  syntheticDoneIdByBoard.clear();
  defaultBoardDeferred = false;
  readModel.reset();
  _resetSnapshotSchedulerForTesting();
}

// ── Boards ─────────────────────────────────────────────────────────────────────

export function listBoards() {
  const boards = readModel.boards();
  if (!Array.isArray(boards)) return [];
  return boards
    // `deleted` is the reducer's soft-delete tombstone (applyBoardDeleted). Local
    // deleteBoard() hard-removes, but a device replaying board.deleted from the
    // event log only gets the flag — without this filter the board resurrects.
    .filter((b) => b && typeof b.id === 'string' && !b.deleted)
    .map((b) => ({
      id: b.id,
      name: typeof b.name === 'string' ? b.name : 'Untitled board',
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : undefined
    }));
}

export function getBoardById(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return null;
  return listBoards().find((b) => b.id === id) || null;
}

export function getActiveBoardName() {
  const id = getActiveBoardId();
  const board = id ? getBoardById(id) : null;
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
}

export function getActiveBoardId() {
  const boards = listBoards();
  const stored = activeBoardId;
  if (stored && boards.some((b) => b.id === stored)) return stored;
  return boards[0]?.id || null;
}

export function setActiveBoardId(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return false;
  const boards = listBoards();
  if (!boards.some((b) => b.id === id)) return false;
  activeBoardId = id;
  schedulePersist(ACTIVE_BOARD_KEY, id);
  return true;
}

export function ensureBoardsInitialized() {
  // Local mutations emit events that the projection folds into the read model
  // synchronously (ADR-0005). Start projecting here so every storage entry point —
  // not just initStorage() — has the sole writer projecting (e.g. unit tests that
  // never call initStorage). Idempotent.
  readModel.startProjecting();
  const boards = listBoards();
  if (boards.length > 0) {
    if (!getActiveBoardId()) setActiveBoardId(boards[0].id);
    return;
  }

  // First run: seed the default board through the Read Model (IDB is either empty or
  // not yet initialised — migration from localStorage is handled in initStorage()).
  const created = nowIso();
  const boardId = STABLE_DEFAULT_BOARD_ID;
  const defaults = stableDefaultBoardData();
  if (defaultBoardDeferred) defaults.tasks = [];
  const board = { id: boardId, name: 'Default Board', createdAt: created };
  readModel.addBoard([...boards, board], boardId, defaults);
  activeBoardId = boardId;
  schedulePersist(ACTIVE_BOARD_KEY, boardId);
  if (defaultBoardDeferred) return;

  // Emit the scaffold to the event log so a second device reconstructs the
  // default board's columns/labels (and converges with this one via the stable
  // ids above). Demo tasks are not emitted (see stableDefaultBoardData).
  scheduleDomainEvent({
    type: 'board.created',
    boardId,
    entityId: boardId,
    payload: { board }
  });
  emitBoardScaffoldEvents(boardId, { columns: defaults.columns, labels: defaults.labels });
}

// Emit a column.created / label.created event for every column and label in a
// freshly scaffolded board, so a remote device can reconstruct the board's
// contents from the event log alone (the board.created event only carries the
// board row). entity_id matches each column/label id so live projection and
// catch-up replay dedup against the locally written read-model.
function emitBoardScaffoldEvents(boardId, { columns = [], labels = [] }) {
  for (const column of columns) {
    scheduleDomainEvent({
      type: 'column.created',
      boardId,
      entityId: column.id,
      payload: { column }
    });
  }
  for (const label of labels) {
    scheduleDomainEvent({
      type: 'label.created',
      boardId,
      entityId: label.id,
      payload: { label }
    });
  }
}

// Newer create events for the stable ids could bring back what this account deleted, so they wait for the first catch-up (#221).
export async function publishDeferredDefaultBoard() {
  if (!defaultBoardDeferred) return;
  ensureBoardsInitialized(); // going live can come before this page's first read of a board
  defaultBoardDeferred = false;
  const board = readModel.boards().find((b) => b.id === STABLE_DEFAULT_BOARD_ID);
  if (!board) return;

  const db = await openStore();
  const events = await db.getAll(EVENTS_STORE);
  const known = events.some((e) => e.type === 'board.created' && e.entity_id === board.id)
    || await db.get(SNAPSHOTS_STORE, board.id);
  if (known) return;
  scheduleDomainEvent({ type: 'board.created', boardId: board.id, entityId: board.id, payload: { board } });
  const live = (items) => (items || []).filter((item) => !item.deleted);
  const { columns, labels } = readModel.board(board.id);
  emitBoardScaffoldEvents(board.id, { columns: live(columns), labels: live(labels) });
}

export function createBoard(name, initialData = {}) {
  ensureBoardsInitialized();
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const boardName = trimmed || 'Untitled board';
  const boards = listBoards();
  const id = generateUUID();
  const defaults = defaultBoardData(false);
  const data = {
    columns: initialData.columns ?? defaults.columns,
    tasks: initialData.tasks ?? [],
    labels: initialData.labels ?? defaults.labels,
    settings: { ...defaults.settings, ...initialData.settings }
  };
  const board = { id, name: boardName, createdAt: nowIso() };
  readModel.addBoard([...boards, board], id, data);

  activeBoardId = id;
  schedulePersist(ACTIVE_BOARD_KEY, id);
  scheduleDomainEvent({
    type: 'board.created',
    boardId: id,
    entityId: id,
    payload: { board }
  });
  emitBoardScaffoldEvents(id, data);
  for (const task of data.tasks) {
    scheduleDomainEvent({ type: 'task.created', boardId: id, entityId: task.id, payload: { task } });
  }
  scheduleDomainEvent({ type: 'settings.updated', boardId: id, entityId: id, payload: { fields: data.settings } });

  return board;
}

export function renameBoard(boardId, newName) {
  ensureBoardsInitialized();
  const id = typeof boardId === 'string' ? boardId : '';
  const name = typeof newName === 'string' ? newName.trim() : '';
  if (!id || !name) return false;

  if (!getBoardById(id)) return false;

  // The board list changes only when the reducer folds this event (ADR-0005, #330).
  scheduleDomainEvent({
    type: 'board.updated',
    boardId: id,
    entityId: id,
    payload: { fields: { name } }
  });
  return true;
}

export function deleteBoard(boardId) {
  ensureBoardsInitialized();
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return false;

  const boards = listBoards();
  if (!boards.some((b) => b.id === id)) return false;
  if (boards.length <= 1) return false; // never delete last board

  const remaining = boards.filter((b) => b.id !== id);
  if (activeBoardId === id) {
    activeBoardId = remaining[0].id;
    schedulePersist(ACTIVE_BOARD_KEY, remaining[0].id);
  }

  readModel.removeBoard(id, remaining, () => scheduleDomainEvent({
    type: 'board.deleted',
    boardId: id,
    entityId: id,
    payload: {}
  }));
  return true;
}

// ── One board read ─────────────────────────────────────────────────────────────
//
// Asking for a board by id gives normalised tasks, columns (always with a Done column),
// labels and settings. The active-board reads below are this read for the active board,
// so export, reports, the calendar and backfill get what the board itself shows (#333).
// Reads never write the Read Model or IDB (ADR-0005, #330).

// Null when no listed board has that id (e.g. it was deleted).
export function loadBoard(boardId) {
  if (!getBoardById(boardId)) return null;
  const stored = readModel.board(boardId);
  const columns = boardColumns(stored, boardId);
  const labels = boardLabels(stored);
  return { tasks: boardTasks(stored, boardId, columns, labels), columns, labels, settings: boardSettings(stored) };
}

function activeBoard() {
  ensureBoardsInitialized();
  return getActiveBoardId() || DEFAULT_BOARD_ID;
}

export function loadColumns() {
  const boardId = activeBoard();
  return boardColumns(readModel.board(boardId), boardId);
}

export function loadTasks() {
  const boardId = activeBoard();
  const stored = readModel.board(boardId);
  return boardTasks(stored, boardId, boardColumns(stored, boardId), boardLabels(stored));
}

export function loadLabels() {
  return boardLabels(readModel.board(activeBoard()));
}

export function loadSettings() {
  return boardSettings(readModel.board(activeBoard()));
}

// ── Columns ────────────────────────────────────────────────────────────────────

function normalizeColumn(c) {
  const color = isHexColor(c?.color) ? c.color.trim() : defaultColumnColor(c?.id);
  const collapsed = c?.collapsed === true;
  return { ...c, color, collapsed, ...(isDoneColumn(c) ? { role: DONE_COLUMN_ROLE } : {}) };
}

function ensureDoneColumn(columns, boardId) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  if (list.some((c) => isDoneColumn(c))) {
    return list.map((column) => (isDoneColumn(column) ? { ...column, role: DONE_COLUMN_ROLE } : column));
  }
  const maxOrder = list.reduce((max, c) => Math.max(max, Number.isFinite(c?.order) ? c.order : 0), 0);
  list.push({ id: syntheticDoneId(boardId), name: 'Done', color: '#16a34a', order: maxOrder + 1, collapsed: false, role: DONE_COLUMN_ROLE });
  return list;
}

function syntheticDoneId(boardId) {
  if (!syntheticDoneIdByBoard.has(boardId)) syntheticDoneIdByBoard.set(boardId, generateUUID());
  return syntheticDoneIdByBoard.get(boardId);
}

function boardColumns(stored, boardId) {
  const parsed = stored.columns;
  // View-only fallback: a synced board's Done column may not have arrived yet,
  // and persisting a synthetic one here duplicates it once the real one lands.
  const live = parsed ? parsed.filter((c) => !c.deleted) : defaultColumns();
  return ensureDoneColumn(live.map(normalizeColumn), boardId);
}

function doneColumnIdIn(columns) {
  return columns.find((column) => isDoneColumn(column))?.id || DONE_COLUMN_ID;
}

export function getDoneColumnId() {
  return doneColumnIdIn(loadColumns());
}

export function isDoneColumnId(columnId) {
  const id = typeof columnId === 'string' ? columnId.trim() : '';
  if (!id) return false;
  return id === DONE_COLUMN_ID || id === getDoneColumnId();
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

function normalizeTask(t, doneColumnId) {
  const task = t && typeof t === 'object' ? { ...t } : t;
  if (!task || typeof task !== 'object') return task;

  // Detach the mutable nested fields from the stored read model. Feature
  // modules mutate the loaded task in place (e.g. columnHistory.push); since
  // the projection is now the sole writer of state (ADR-0005), those edits
  // must not leak back into the read model and double-apply with events.
  if (Array.isArray(task.columnHistory)) task.columnHistory = task.columnHistory.map((e) => ({ ...e }));
  if (Array.isArray(task.subTasks)) task.subTasks = task.subTasks.map((s) => ({ ...s }));
  if (Array.isArray(task.labels)) task.labels = [...task.labels];
  if (Array.isArray(task.relationships)) task.relationships = task.relationships.map((r) => ({ ...r }));

  task.priority = normalizePriority(task.priority);

  const column = typeof task.column === 'string' ? task.column.trim() : '';
  const isDone = column !== '' && (column === DONE_COLUMN_ID || column === doneColumnId);
  const hasDoneDate = typeof task.doneDate === 'string' && task.doneDate.trim() !== '';
  const changeDate = typeof task.changeDate === 'string' && task.changeDate.trim() ? task.changeDate.trim() : '';
  const creationDate = typeof task.creationDate === 'string' && task.creationDate.trim() ? task.creationDate.trim() : '';

  if (isDone && !hasDoneDate) {
    const inferred = changeDate ? changeDate : creationDate;
    if (inferred) task.doneDate = inferred;
  }

  if (!isDone && hasDoneDate) delete task.doneDate;

  const history = Array.isArray(task.columnHistory)
    ? task.columnHistory
      .map((e) => {
        const entryColumn = typeof e?.column === 'string' ? e.column.trim() : '';
        const at = typeof e?.at === 'string' ? e.at.trim() : '';
        return entryColumn && at ? { column: entryColumn, at } : null;
      })
      .filter(Boolean)
    : [];
  // The boot migration stamps stored tasks with no dates; one that arrives later undated keeps no history,
  // as reports read it, rather than a time that would differ per session (#330).
  const seededAt = changeDate || creationDate;
  if (history.length > 0) task.columnHistory = history;
  else if (seededAt && column) task.columnHistory = [{ column, at: seededAt }];
  else if (Array.isArray(task.columnHistory)) task.columnHistory = [];

  task.relationships = normalizeRelationships(task.relationships);
  task.subTasks = normalizeSubTasks(task.subTasks);

  return task;
}

function boardTasks(stored, boardId, columns, labels) {
  const parsed = stored.tasks;
  if (parsed) {
    const doneColumnId = doneColumnIdIn(columns);
    return parsed.filter((t) => !t?.deleted).map((t) => normalizeTask(t, doneColumnId));
  }

  // Empty state: return stable in-memory defaults for the session.
  const cached = readModel.cachedTasks(boardId);
  if (Array.isArray(cached)) return cached.filter(t => !t.deleted);

  const defaults = defaultTasks(columns, labels);
  readModel.cacheTasks(boardId, defaults);
  return defaults;
}

// ── Labels ─────────────────────────────────────────────────────────────────────

function boardLabels(stored) {
  const parsed = stored.labels;
  if (!parsed) return defaultLabels();
  return parsed
    .filter(l => !l.deleted)
    .map((label) => ({
      ...label,
      group: typeof label.group === 'string' ? label.group : ''
    }));
}

// ── Settings ───────────────────────────────────────────────────────────────────

function normalizeSwimLaneGroupBy(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return ALLOWED_SWIMLANE_GROUP_BY.has(normalized) ? normalized : 'label';
}

function normalizeSwimLaneLabelGroup(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSettings(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const locale = typeof obj.locale === 'string' && obj.locale.trim() ? obj.locale.trim() : defaultSettings().locale;
  const showPriority = obj.showPriority !== false;
  const showDueDate = obj.showDueDate !== false;
  const showAge = obj.showAge !== false;
  const showChangeDate = obj.showChangeDate !== false;
  const priority = (obj.defaultPriority || '').toString().trim().toLowerCase();
  const defaultPriority = normalizePriority(priority);
  const rawNotificationDays = Number.parseInt((obj.notificationDays ?? '').toString(), 10);
  const notificationDays = Number.isFinite(rawNotificationDays)
    ? Math.min(365, Math.max(0, rawNotificationDays))
    : 3;

  const countdownUrgentThreshold = normalizeCountdownThreshold(obj.countdownUrgentThreshold) ?? 3;
  const countdownWarningThreshold = normalizeCountdownThreshold(obj.countdownWarningThreshold, countdownUrgentThreshold) ?? 10;

  const swimLanesEnabled = obj.swimLanesEnabled === true;
  const swimLaneGroupBy = normalizeSwimLaneGroupBy(obj.swimLaneGroupBy);
  const swimLaneLabelGroup = normalizeSwimLaneLabelGroup(obj.swimLaneLabelGroup);
  const swimLaneCollapsedKeys = normalizeStringKeys(obj.swimLaneCollapsedKeys);
  const swimLaneCellCollapsedKeys = normalizeStringKeys(obj.swimLaneCellCollapsedKeys);
  const swimLaneOrder = normalizeStringKeys(obj.swimLaneOrder);

  return {
    showPriority,
    showDueDate,
    showAge,
    showChangeDate,
    locale,
    defaultPriority,
    notificationDays,
    countdownUrgentThreshold,
    countdownWarningThreshold,
    swimLanesEnabled,
    swimLaneGroupBy,
    swimLaneLabelGroup,
    swimLaneCollapsedKeys,
    swimLaneCellCollapsedKeys,
    swimLaneOrder
  };
}

function boardSettings(stored) {
  const parsed = stored.settings;
  return parsed ? normalizeSettings(parsed) : defaultSettings();
}

export function saveSettings(settings) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const normalized = normalizeSettings(settings);
  readModel.writeBoardSettings(boardId, normalized);
  emit(BOARD_SETTINGS_WRITTEN, { boardId });
}

// Another tab wrote settings no event carries (#222).
export async function refreshBoardSettings(boardId) {
  if (!(await readModel.refreshBoardSettings(boardId))) return;
  emit(DATA_CHANGED, { settings: boardId });
}

export function loadGlobalSettings() {
  return readModel.globalSettings();
}

export function loadTimeTracking() {
  return readModel.timeTracking();
}


// Tests that check what the reducer stored read it here: live items as stored, not normalised.
export function _loadStoredBoardForTesting(boardId) {
  const { tasks, columns, labels, settings } = readModel.board(boardId);
  const live = (items) => (items || []).filter((item) => !item.deleted);
  return { tasks: live(tasks), columns: live(columns), labels: live(labels), settings };
}

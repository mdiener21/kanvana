import { generateUUID } from './utils.js';
import { normalizePriority as sharedNormalizePriority, isHexColor, defaultColumnColor, normalizeStringKeys, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import { DONE_COLUMN_ID, DONE_COLUMN_ROLE, isDoneColumn } from './constants.js';
import { openStore, KV_STORE, READ_MODEL_STORE, schedulePersist, scheduleDelete, scheduleReadModelPersist, scheduleReadModelDelete, keyFor, readModelKeyFor, _flushPersistsForTesting as _flushIdbPersistsForTesting, _resetIdbForTesting } from './idb-store.js';
// Re-export IDB helpers that tests import from this module for backward compatibility.
import { normalizeBoardModelIds } from './board-serializer.js';
import { initHlc } from './event-sourcing/hlc.js';
import { _flushDomainEventsForTesting, scheduleDomainEvent } from './event-sourcing/emitter.js';
import { checkAndScheduleSnapshot, GLOBAL_SNAPSHOT_KEY, _resetSnapshotSchedulerForTesting } from './event-sourcing/snapshot.js';
import { DATA_CHANGED, EVENT_EMITTED, emit, off, on } from './events.js';
import { applyEvent, createProjectionState } from './reducer.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const BOARDS_KEY = 'kanbanBoards';
const ACTIVE_BOARD_KEY = 'kanbanActiveBoardId';
const GLOBAL_SETTINGS_KEY = 'kanvana:settings:global';

const LEGACY_COLUMNS_KEY = 'kanbanColumns';
const LEGACY_TASKS_KEY = 'kanbanTasks';
const LEGACY_LABELS_KEY = 'kanbanLabels';

const DEFAULT_BOARD_ID = 'default';
// Well-known stable id for the auto-seeded "Default Board". Every fresh device
// mints the default board with THIS id (not a random UUID) so two devices on the
// same account converge onto a single board instead of accruing duplicates.
// Valid uuid-v4 shape so it passes existing id validation/UUID_RE checks.
const STABLE_DEFAULT_BOARD_ID = '00000000-0000-4000-8000-000000000001';
const ALLOWED_SWIMLANE_GROUP_BY = new Set(['label', 'label-group', 'priority']);

// ── In-memory state ────────────────────────────────────────────────────────────
//
// All public CRUD functions read/write this object synchronously.
// IDB persistence happens asynchronously via schedulePersist().
// Call initStorage() once at app startup to populate from IDB.

const state = {
  boards: [],
  activeBoardId: null,
  tasks: {},    // { [boardId]: task[] | null }
  columns: {},  // { [boardId]: column[] | null }
  labels: {},   // { [boardId]: label[] | null }
  settings: {},  // { [boardId]: object | null }
  globalSettings: null
};

// Per-board default-task cache (keeps defaults stable within a session).
const taskCacheByBoard = new Map();
const appliedDomainEventIds = new Set();
let domainEventProjectionRegistered = false;
let domainEventProjectionHandler = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

async function normalizeIdbState(db) {
  const rawBoards = safeParseArray(await db.get(KV_STORE, BOARDS_KEY));
  if (!rawBoards) return;

  const rawActiveId = await db.get(KV_STORE, ACTIVE_BOARD_KEY);
  const nextBoards = [];
  const activeIdMap = new Map();
  const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
  const store = tx.objectStore(KV_STORE);
  const readModel = tx.objectStore(READ_MODEL_STORE);

  for (const rawBoard of rawBoards) {
    if (!rawBoard || typeof rawBoard !== 'object') continue;
    const oldBoardId = typeof rawBoard.id === 'string' ? rawBoard.id.trim() : '';
    const normalized = normalizeBoardModelIds({
      board: rawBoard,
      tasks: safeParseArray(await readModel.get(readModelKeyFor(oldBoardId, 'tasks')) ?? await store.get(keyFor(oldBoardId, 'tasks'))) || [],
      columns: safeParseArray(await readModel.get(readModelKeyFor(oldBoardId, 'columns')) ?? await store.get(keyFor(oldBoardId, 'columns'))) || legacyDefaultColumns(),
      labels: safeParseArray(await readModel.get(readModelKeyFor(oldBoardId, 'labels')) ?? await store.get(keyFor(oldBoardId, 'labels'))) || [],
      settings: safeParseObject(await store.get(keyFor(oldBoardId, 'settings'))) || defaultSettings()
    });

    const newBoardId = normalized.board.id;
    activeIdMap.set(oldBoardId, newBoardId);
    nextBoards.push(normalized.board);
    await readModel.put(normalized.tasks, readModelKeyFor(newBoardId, 'tasks'));
    await readModel.put(normalized.columns, readModelKeyFor(newBoardId, 'columns'));
    await readModel.put(normalized.labels, readModelKeyFor(newBoardId, 'labels'));
    await store.put(normalized.settings, keyFor(newBoardId, 'settings'));

    if (oldBoardId && oldBoardId !== newBoardId) {
      await readModel.delete(readModelKeyFor(oldBoardId, 'tasks'));
      await readModel.delete(readModelKeyFor(oldBoardId, 'columns'));
      await readModel.delete(readModelKeyFor(oldBoardId, 'labels'));
      await store.delete(keyFor(oldBoardId, 'settings'));
    }
    if (oldBoardId) {
      await store.delete(keyFor(oldBoardId, 'tasks'));
      await store.delete(keyFor(oldBoardId, 'columns'));
      await store.delete(keyFor(oldBoardId, 'labels'));
    }
  }

  await store.put(nextBoards, BOARDS_KEY);
  const nextActiveId = activeIdMap.get(rawActiveId) || nextBoards[0]?.id || null;
  if (nextActiveId) await store.put(nextActiveId, ACTIVE_BOARD_KEY);
  await tx.done;
}

// Handles both pre-parsed objects (from IDB) and JSON strings (from legacy localStorage).
function safeParseArray(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }
  return null;
}

function safeParseObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }
  return null;
}

// ── Default data ───────────────────────────────────────────────────────────────

function defaultColumns() {
  return [
    { id: generateUUID(), name: 'To Do', color: '#3583ff' },
    { id: generateUUID(), name: 'In Progress', color: '#f59e0b' },
    { id: generateUUID(), name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

function legacyDefaultColumns() {
  return [
    { id: 'todo', name: 'To Do', color: '#3583ff' },
    { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
    { id: DONE_COLUMN_ID, name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

function defaultLabels() {
  return [
    { id: generateUUID(), name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: generateUUID(), name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: generateUUID(), name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: generateUUID(), name: 'Idea', color: '#25b631', group: '' },
    { id: generateUUID(), name: 'Goal', color: '#1b7cbd', group: '' },
  ];
}

function columnIdByName(columns, name) {
  return columns.find((column) => column.name === name)?.id || columns[0]?.id || '';
}

function labelIdByName(labels, name) {
  return labels.find((label) => label.name === name)?.id || '';
}

function defaultTasks(columns = defaultColumns(), labels = defaultLabels()) {
  const created = nowIso();
  const todoColumnId = columnIdByName(columns, 'To Do');
  const inProgressColumnId = columnIdByName(columns, 'In Progress');
  const doneColumnId = columns.find((column) => column.role === DONE_COLUMN_ROLE)?.id || columnIdByName(columns, 'Done');
  const taskLabelId = labelIdByName(labels, 'Task');
  const ideaLabelId = labelIdByName(labels, 'Idea');
  return [
    {
      id: generateUUID(),
      title: 'Find out where the Soul Stone is',
      description: 'Identify current location and access requirements.',
      priority: 'high',
      dueDate: '',
      column: todoColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: todoColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Steal the Time Stone',
      description: 'Coordinate with Dr. Strange and plan retrieval.',
      priority: 'urgent',
      dueDate: '',
      column: inProgressColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Mind Stone',
      description: 'Determine safe extraction approach.',
      priority: 'medium',
      dueDate: '',
      column: inProgressColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Hide the Reality Stone',
      description: 'Dig a deep hole to hide the stone from the Collector, avoid escalation.',
      priority: 'low',
      dueDate: '',
      column: inProgressColumnId,
      labels: taskLabelId ? [taskLabelId] : [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Find a bag for stones',
      description: 'A bag with good durability and space is needed to hold all the stones securely.',
      priority: 'none',
      dueDate: '',
      column: inProgressColumnId,
      labels: taskLabelId ? [taskLabelId] : [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Power Stone',
      description: 'Verify secure containment after retrieval.',
      priority: 'high',
      dueDate: '',
      column: doneColumnId,
      labels: ideaLabelId ? [ideaLabelId] : [],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: doneColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Space Stone',
      description: '',
      priority: 'low',
      dueDate: '',
      column: doneColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: doneColumnId, at: created }]
    }
  ];
}

function defaultBoardData(includeTasks = true) {
  const columns = defaultColumns();
  const labels = defaultLabels();
  return {
    columns,
    labels,
    tasks: includeTasks ? defaultTasks(columns, labels) : [],
    settings: defaultSettings()
  };
}

// Deterministic column/label ids for the well-known default board, so two
// devices seeding their own default board emit identical column.created /
// label.created events that dedup on merge (see STABLE_DEFAULT_BOARD_ID).
function stableDefaultColumns() {
  return [
    { id: '00000000-0000-4000-8000-000000000010', name: 'To Do', color: '#3583ff' },
    { id: '00000000-0000-4000-8000-000000000011', name: 'In Progress', color: '#f59e0b' },
    { id: '00000000-0000-4000-8000-000000000012', name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

function stableDefaultLabels() {
  return [
    { id: '00000000-0000-4000-8000-000000000020', name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000021', name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000022', name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000023', name: 'Idea', color: '#25b631', group: '' },
    { id: '00000000-0000-4000-8000-000000000024', name: 'Goal', color: '#1b7cbd', group: '' }
  ];
}

// Default board scaffold with stable ids. Demo tasks keep random ids and are
// intentionally local-only (not event-sourced): they are first-run flavour and
// random ids would duplicate on merge across devices.
function stableDefaultBoardData() {
  const columns = stableDefaultColumns();
  const labels = stableDefaultLabels();
  return {
    columns,
    labels,
    tasks: defaultTasks(columns, labels),
    settings: defaultSettings()
  };
}

function defaultSettings() {
  const locale = (typeof navigator !== 'undefined' && typeof navigator.language === 'string')
    ? navigator.language
    : 'en-US';

  return {
    showPriority: true,
    showDueDate: true,
    showAge: true,
    showChangeDate: false,
    locale,
    defaultPriority: 'none',
    notificationDays: 3,
    countdownUrgentThreshold: 3,
    countdownWarningThreshold: 10,
    swimLanesEnabled: false,
    swimLaneGroupBy: 'label',
    swimLaneLabelGroup: '',
    swimLaneCollapsedKeys: [],
    swimLaneCellCollapsedKeys: [],
    swimLaneOrder: []
  };
}

function defaultGlobalSettings() {
  return {};
}

// ── Migration from localStorage ────────────────────────────────────────────────

async function migrateFromLocalStorage(db) {
  const lsBoards = safeParseArray(localStorage.getItem(BOARDS_KEY));
  const lsActiveId = localStorage.getItem(ACTIVE_BOARD_KEY);

  // Legacy single-board keys (pre multi-board)
  const legacyColumns = safeParseArray(localStorage.getItem(LEGACY_COLUMNS_KEY));
  const legacyTasks = safeParseArray(localStorage.getItem(LEGACY_TASKS_KEY));
  const legacyLabels = safeParseArray(localStorage.getItem(LEGACY_LABELS_KEY));

  let boards = lsBoards;

  if (!boards && (legacyColumns || legacyTasks || legacyLabels)) {
    // Oldest migration path: single-board localStorage → IDB default board
    boards = [{ id: DEFAULT_BOARD_ID, name: 'Default Board', createdAt: nowIso() }];
    const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
    const store = tx.objectStore(KV_STORE);
    const readModel = tx.objectStore(READ_MODEL_STORE);
    await store.put(boards, BOARDS_KEY);
    await store.put(DEFAULT_BOARD_ID, ACTIVE_BOARD_KEY);
    await readModel.put(legacyColumns || legacyDefaultColumns(), readModelKeyFor(DEFAULT_BOARD_ID, 'columns'));
    await readModel.put(legacyTasks || defaultTasks(), readModelKeyFor(DEFAULT_BOARD_ID, 'tasks'));
    await readModel.put(legacyLabels || defaultLabels(), readModelKeyFor(DEFAULT_BOARD_ID, 'labels'));
    await store.put(defaultSettings(), keyFor(DEFAULT_BOARD_ID, 'settings'));
    await tx.done;

    localStorage.removeItem(LEGACY_COLUMNS_KEY);
    localStorage.removeItem(LEGACY_TASKS_KEY);
    localStorage.removeItem(LEGACY_LABELS_KEY);
    localStorage.removeItem(BOARDS_KEY);
    localStorage.removeItem(ACTIVE_BOARD_KEY);
    return;
  }

  if (!boards) return;

  // Multi-board localStorage → IDB
  const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
  const store = tx.objectStore(KV_STORE);
  const readModel = tx.objectStore(READ_MODEL_STORE);

  await store.put(boards, BOARDS_KEY);
  if (lsActiveId) await store.put(lsActiveId, ACTIVE_BOARD_KEY);

  for (const board of boards) {
    const tasks = safeParseArray(localStorage.getItem(keyFor(board.id, 'tasks'))) || [];
    const columns = safeParseArray(localStorage.getItem(keyFor(board.id, 'columns'))) || [];
    const labels = safeParseArray(localStorage.getItem(keyFor(board.id, 'labels'))) || [];
    const settings = safeParseObject(localStorage.getItem(keyFor(board.id, 'settings')));

    await readModel.put(tasks, readModelKeyFor(board.id, 'tasks'));
    await readModel.put(columns, readModelKeyFor(board.id, 'columns'));
    await readModel.put(labels, readModelKeyFor(board.id, 'labels'));
    if (settings) await store.put(settings, keyFor(board.id, 'settings'));

    localStorage.removeItem(keyFor(board.id, 'tasks'));
    localStorage.removeItem(keyFor(board.id, 'columns'));
    localStorage.removeItem(keyFor(board.id, 'labels'));
    localStorage.removeItem(keyFor(board.id, 'settings'));
  }

  await tx.done;
  localStorage.removeItem(BOARDS_KEY);
  localStorage.removeItem(ACTIVE_BOARD_KEY);
}

// ── Public initialisation ──────────────────────────────────────────────────────

/**
 * Must be called once at app startup (before any board renders).
 * Opens the IDB database, migrates from localStorage if needed, and loads all
 * board data into the in-memory state so subsequent reads are synchronous.
 */
export async function initStorage() {
  const db = await openStore();
  await initHlc();
  registerDomainEventProjection();

  // Migrate from localStorage if IDB is empty but localStorage has data.
  const idbBoards = await db.get(KV_STORE, BOARDS_KEY);
  const hasLocalStorageData = Boolean(
    localStorage.getItem(BOARDS_KEY) ||
    localStorage.getItem(LEGACY_COLUMNS_KEY) ||
    localStorage.getItem(LEGACY_TASKS_KEY) ||
    localStorage.getItem(LEGACY_LABELS_KEY)
  );

  if (!idbBoards && hasLocalStorageData) {
    await migrateFromLocalStorage(db);
  }

  await normalizeIdbState(db);

  // Load everything into in-memory state.
  state.boards = safeParseArray(await db.get(KV_STORE, BOARDS_KEY)) || [];
  state.activeBoardId = (await db.get(KV_STORE, ACTIVE_BOARD_KEY)) || null;
  state.globalSettings = normalizeGlobalSettings(await db.get(KV_STORE, GLOBAL_SETTINGS_KEY));

  for (const board of state.boards) {
    state.tasks[board.id] = (await db.get(READ_MODEL_STORE, readModelKeyFor(board.id, 'tasks'))) ?? null;
    state.columns[board.id] = (await db.get(READ_MODEL_STORE, readModelKeyFor(board.id, 'columns'))) ?? null;
    state.labels[board.id] = (await db.get(READ_MODEL_STORE, readModelKeyFor(board.id, 'labels'))) ?? null;
    state.settings[board.id] = (await db.get(KV_STORE, keyFor(board.id, 'settings'))) ?? null;
  }

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

function registerDomainEventProjection() {
  if (domainEventProjectionRegistered) return;
  domainEventProjectionRegistered = true;
  domainEventProjectionHandler = (event) => {
    projectDomainEvent(event.detail);
  };
  on(EVENT_EMITTED, domainEventProjectionHandler);
}

function projectDomainEvent(event) {
  if (!event?.id || appliedDomainEventIds.has(event.id)) return;
  appliedDomainEventIds.add(event.id);

  if (event.scope === 'global') {
    const projected = applyEvent(createProjectionState({ globalSettings: loadGlobalSettings() }), event);
    state.globalSettings = projected.globalSettings;
    schedulePersist(GLOBAL_SETTINGS_KEY, state.globalSettings);
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
  schedulePersist(BOARDS_KEY, state.boards);
  scheduleReadModelPersist(boardId, 'tasks', projected.tasks);
  scheduleReadModelPersist(boardId, 'columns', projected.columns);
  scheduleReadModelPersist(boardId, 'labels', projected.labels);
  schedulePersist(keyFor(boardId, 'settings'), projected.settings);
  checkAndScheduleSnapshot(boardId, projected, event.hlc);
  emit(DATA_CHANGED, { event });
}

/**
 * Resets the in-memory state and IDB connection.
 * Call this in unit test beforeEach hooks to get a clean slate.
 */
export function _resetStorageForTesting() {
  // Close the open IDB connection so a subsequent deleteDB() call is not blocked.
  _resetIdbForTesting();
  state.boards = [];
  state.activeBoardId = null;
  for (const k in state.tasks) delete state.tasks[k];
  for (const k in state.columns) delete state.columns[k];
  for (const k in state.labels) delete state.labels[k];
  for (const k in state.settings) delete state.settings[k];
  state.globalSettings = null;
  taskCacheByBoard.clear();
  appliedDomainEventIds.clear();
  if (domainEventProjectionHandler) off(EVENT_EMITTED, domainEventProjectionHandler);
  domainEventProjectionHandler = null;
  domainEventProjectionRegistered = false;
  _resetSnapshotSchedulerForTesting();
}

// ── Boards ─────────────────────────────────────────────────────────────────────

export function listBoards() {
  const boards = state.boards;
  if (!Array.isArray(boards)) return [];
  return boards
    .filter((b) => b && typeof b.id === 'string')
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

function saveBoards(boards) {
  state.boards = boards;
  schedulePersist(BOARDS_KEY, boards);
}

export function getActiveBoardId() {
  const boards = listBoards();
  const stored = state.activeBoardId;
  if (stored && boards.some((b) => b.id === stored)) return stored;
  return boards[0]?.id || null;
}

export function setActiveBoardId(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return;
  const boards = listBoards();
  if (!boards.some((b) => b.id === id)) return;
  state.activeBoardId = id;
  schedulePersist(ACTIVE_BOARD_KEY, id);
}

export function ensureBoardsInitialized() {
  const boards = listBoards();
  if (boards.length > 0) {
    if (!getActiveBoardId()) setActiveBoardId(boards[0].id);
    return;
  }

  // First run: seed default board directly into state (IDB is either empty or
  // not yet initialised — migration from localStorage is handled in initStorage()).
  const created = nowIso();
  const boardId = STABLE_DEFAULT_BOARD_ID;
  const defaults = stableDefaultBoardData();
  const board = { id: boardId, name: 'Default Board', createdAt: created };
  state.boards = [board];
  state.activeBoardId = boardId;
  state.columns[boardId] = defaults.columns;
  state.tasks[boardId] = defaults.tasks;
  state.labels[boardId] = defaults.labels;
  state.settings[boardId] = defaults.settings;

  schedulePersist(BOARDS_KEY, state.boards);
  schedulePersist(ACTIVE_BOARD_KEY, boardId);
  scheduleReadModelPersist(boardId, 'columns', state.columns[boardId]);
  scheduleReadModelPersist(boardId, 'tasks', state.tasks[boardId]);
  scheduleReadModelPersist(boardId, 'labels', state.labels[boardId]);
  schedulePersist(keyFor(boardId, 'settings'), state.settings[boardId]);

  // Emit the scaffold to the event log so a second device reconstructs the
  // default board's columns/labels (and converges with this one via the stable
  // ids above). Demo tasks are deliberately not emitted (local-only flavour).
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

export function createBoard(name) {
  ensureBoardsInitialized();
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const boardName = trimmed || 'Untitled board';
  const boards = listBoards();

  const id = generateUUID();
  const defaults = defaultBoardData(false);
  const board = { id, name: boardName, createdAt: nowIso() };
  saveBoards([...boards, board]);

  state.columns[id] = defaults.columns;
  state.tasks[id] = [];
  state.labels[id] = defaults.labels;
  state.settings[id] = defaults.settings;

  scheduleReadModelPersist(id, 'columns', state.columns[id]);
  scheduleReadModelPersist(id, 'tasks', state.tasks[id]);
  scheduleReadModelPersist(id, 'labels', state.labels[id]);
  schedulePersist(keyFor(id, 'settings'), state.settings[id]);

  state.activeBoardId = id;
  schedulePersist(ACTIVE_BOARD_KEY, id);
  scheduleDomainEvent({
    type: 'board.created',
    boardId: id,
    entityId: id,
    payload: { board }
  });
  emitBoardScaffoldEvents(id, { columns: defaults.columns, labels: defaults.labels });

  return board;
}

export function renameBoard(boardId, newName) {
  ensureBoardsInitialized();
  const id = typeof boardId === 'string' ? boardId : '';
  const name = typeof newName === 'string' ? newName.trim() : '';
  if (!id || !name) return false;

  const boards = listBoards();
  if (!boards.some((b) => b.id === id)) return false;

  const updated = boards.map((b) => (b.id === id ? { ...b, name } : b));
  saveBoards(updated);
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
  saveBoards(remaining);

  // Remove per-board state
  delete state.tasks[id];
  delete state.columns[id];
  delete state.labels[id];
  delete state.settings[id];
  taskCacheByBoard.delete(id);

  // Remove from IDB
  scheduleReadModelDelete(id, 'tasks');
  scheduleReadModelDelete(id, 'columns');
  scheduleReadModelDelete(id, 'labels');
  scheduleDelete(keyFor(id, 'settings'));

  if (state.activeBoardId === id) {
    state.activeBoardId = remaining[0].id;
    schedulePersist(ACTIVE_BOARD_KEY, remaining[0].id);
  }

  scheduleDomainEvent({
    type: 'board.deleted',
    boardId: id,
    entityId: id,
    payload: {}
  });
  return true;
}

// ── Columns ────────────────────────────────────────────────────────────────────

function normalizeColumn(c) {
  const color = isHexColor(c?.color) ? c.color.trim() : defaultColumnColor(c?.id);
  const collapsed = c?.collapsed === true;
  return { ...c, color, collapsed, ...(isDoneColumn(c) ? { role: DONE_COLUMN_ROLE } : {}) };
}

function ensureDoneColumn(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  if (list.some((c) => isDoneColumn(c))) {
    return list.map((column) => (isDoneColumn(column) ? { ...column, role: DONE_COLUMN_ROLE } : column));
  }
  const maxOrder = list.reduce((max, c) => Math.max(max, Number.isFinite(c?.order) ? c.order : 0), 0);
  list.push({ id: generateUUID(), name: 'Done', color: '#16a34a', order: maxOrder + 1, collapsed: false, role: DONE_COLUMN_ROLE });
  return list;
}

export function getDoneColumnId() {
  const columns = loadColumns();
  return columns.find((column) => isDoneColumn(column))?.id || DONE_COLUMN_ID;
}

export function isDoneColumnId(columnId) {
  const id = typeof columnId === 'string' ? columnId.trim() : '';
  if (!id) return false;
  return id === DONE_COLUMN_ID || id === getDoneColumnId();
}

export function loadColumns() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.columns[boardId];
  const parsed = safeParseArray(raw);
  if (parsed) {
    const live = parsed.filter(c => !c.deleted);
    const normalized = ensureDoneColumn(live.map(normalizeColumn));
    // Persist back if done column was added (length check uses live count vs normalized).
    if (!raw || !Array.isArray(raw) || normalized.length !== live.length) {
      // Merge normalized live columns back with deleted records for persistence
      const deleted = parsed.filter(c => c.deleted);
      const merged = [...normalized, ...deleted];
      state.columns[boardId] = merged;
      scheduleReadModelPersist(boardId, 'columns', merged);
    }
    return normalized;
  }
  return ensureDoneColumn(defaultColumns().map(normalizeColumn));
}

export function saveColumns(columns) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  state.columns[boardId] = columns;
  scheduleReadModelPersist(boardId, 'columns', columns);
  emitLocalChange(boardId, 'column');
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

function normalizePriority(value) {
  return sharedNormalizePriority(value);
}

export function loadTasks() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.tasks[boardId];
  const parsed = safeParseArray(raw);

  if (parsed) {
    let didChange = false;
    const normalized = parsed.map((t) => {
      const task = t && typeof t === 'object' ? { ...t } : t;
      if (!task || typeof task !== 'object') return task;

      const nextPriority = normalizePriority(task.priority);
      if (task.priority !== nextPriority) {
        task.priority = nextPriority;
        didChange = true;
      }

      const isDone = isDoneColumnId(task.column);
      const hasDoneDate = typeof task.doneDate === 'string' && task.doneDate.trim() !== '';
      const changeDate = typeof task.changeDate === 'string' && task.changeDate.trim() ? task.changeDate.trim() : '';
      const creationDate = typeof task.creationDate === 'string' && task.creationDate.trim() ? task.creationDate.trim() : '';

      if (isDone && !hasDoneDate) {
        const inferred = changeDate ? changeDate : creationDate;
        if (inferred) {
          task.doneDate = inferred;
          didChange = true;
        }
      }

      if (!isDone && hasDoneDate) {
        delete task.doneDate;
        didChange = true;
      }

      const rawHistory = task.columnHistory;
      const history = Array.isArray(rawHistory) ? rawHistory : null;
      const seededAt = changeDate || creationDate || nowIso();
      const seededColumn = typeof task.column === 'string' ? task.column.trim() : '';

      if (!history || history.length === 0) {
        if (seededAt && seededColumn) {
          task.columnHistory = [{ column: seededColumn, at: seededAt }];
          didChange = true;
        }
      } else {
        const cleaned = history
          .map((e) => {
            const column = typeof e?.column === 'string' ? e.column.trim() : '';
            const at = typeof e?.at === 'string' ? e.at.trim() : '';
            if (!column || !at) return null;
            return { column, at };
          })
          .filter(Boolean);

        if (cleaned.length === 0) {
          if (seededAt && seededColumn) {
            task.columnHistory = [{ column: seededColumn, at: seededAt }];
            didChange = true;
          }
        } else if (cleaned.length !== history.length) {
          task.columnHistory = cleaned;
          didChange = true;
        }
      }

      const nextRelationships = normalizeRelationships(task.relationships);
      if (JSON.stringify(task.relationships) !== JSON.stringify(nextRelationships)) {
        task.relationships = nextRelationships;
        didChange = true;
      }

      const nextSubTasks = normalizeSubTasks(task.subTasks);
      if (JSON.stringify(task.subTasks) !== JSON.stringify(nextSubTasks)) {
        task.subTasks = nextSubTasks;
        didChange = true;
      }

      return task;
    });

    if (didChange) {
      state.tasks[boardId] = normalized;
      scheduleReadModelPersist(boardId, 'tasks', normalized);
    }

    taskCacheByBoard.set(boardId, normalized);
    return normalized.filter(t => !t.deleted);
  }

  // Empty state: return stable in-memory defaults for the session.
  const cached = taskCacheByBoard.get(boardId);
  if (Array.isArray(cached)) return cached.filter(t => !t.deleted);

  const defaults = defaultTasks(loadColumns(), loadLabels());
  taskCacheByBoard.set(boardId, defaults);
  return defaults;
}

function emitLocalChange(boardId, entity) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kanban-local-change', { detail: { boardId, entity } }));
}

export function saveTasks(tasks) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const normalized = (Array.isArray(tasks) ? tasks : []).map((task) => ({
    ...task
  }));
  state.tasks[boardId] = normalized;
  taskCacheByBoard.set(boardId, normalized);
  scheduleReadModelPersist(boardId, 'tasks', normalized);
  emitLocalChange(boardId, 'task');
}

// Persist a live-task set without destroying the board's task tombstones.
// loadTasks() returns live tasks only, so callers that mutate the live set
// must route through here to preserve deleted records until sync cleanup.
export function saveLiveTasks(liveTasks) {
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const live = Array.isArray(liveTasks) ? liveTasks : [];
  saveTasks([...live, ...loadDeletedTasksForBoard(boardId)]);
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export function loadLabels() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.labels[boardId];
  const parsed = safeParseArray(raw);
  if (parsed) {
    return parsed
      .filter(l => !l.deleted)
      .map((label) => ({
        ...label,
        group: typeof label.group === 'string' ? label.group : ''
      }));
  }
  return defaultLabels();
}

export function saveLabels(labels) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  state.labels[boardId] = labels;
  scheduleReadModelPersist(boardId, 'labels', labels);
  emitLocalChange(boardId, 'label');
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

  const rawUrgentThreshold = Number.parseInt((obj.countdownUrgentThreshold ?? '').toString(), 10);
  const countdownUrgentThreshold = Number.isFinite(rawUrgentThreshold)
    ? Math.min(365, Math.max(1, rawUrgentThreshold))
    : 3;

  const rawWarningThreshold = Number.parseInt((obj.countdownWarningThreshold ?? '').toString(), 10);
  const countdownWarningThreshold = Number.isFinite(rawWarningThreshold)
    ? Math.min(365, Math.max(countdownUrgentThreshold, rawWarningThreshold))
    : 10;

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

function normalizeGlobalSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return {};
}

export function loadSettings() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.settings[boardId];
  const parsed = safeParseObject(raw);
  if (parsed) return normalizeSettings(parsed);

  const defaults = defaultSettings();
  state.settings[boardId] = defaults;
  schedulePersist(keyFor(boardId, 'settings'), defaults);
  return defaults;
}

export function saveSettings(settings) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const normalized = normalizeSettings(settings);
  state.settings[boardId] = normalized;
  schedulePersist(keyFor(boardId, 'settings'), normalized);
}

export function loadGlobalSettings() {
  const parsed = safeParseObject(state.globalSettings);
  return parsed ? normalizeGlobalSettings(parsed) : defaultGlobalSettings();
}

export function saveGlobalSettings(settings) {
  const normalized = normalizeGlobalSettings(settings);
  state.globalSettings = normalized;
  schedulePersist(GLOBAL_SETTINGS_KEY, normalized);
}

// ── Cross-board read helpers

export function loadTasksForBoard(boardId) {
  const raw = state.tasks[boardId];
  return (safeParseArray(raw) || []).filter(t => !t.deleted);
}

export function loadColumnsForBoard(boardId) {
  const raw = state.columns[boardId];
  return (safeParseArray(raw) || []).filter(c => !c.deleted);
}

export function loadLabelsForBoard(boardId) {
  const raw = state.labels[boardId];
  return (safeParseArray(raw) || []).filter(l => !l.deleted);
}

export function loadSettingsForBoard(boardId) {
  const raw = state.settings[boardId];
  return safeParseObject(raw) || null;
}

export function loadDeletedTasksForBoard(boardId) {
  const raw = state.tasks[boardId];
  return (safeParseArray(raw) || []).filter(t => t.deleted === true);
}

export function loadDeletedColumnsForBoard(boardId) {
  const raw = state.columns[boardId];
  return (safeParseArray(raw) || []).filter(c => c.deleted === true);
}

export function loadDeletedLabelsForBoard(boardId) {
  const raw = state.labels[boardId];
  return (safeParseArray(raw) || []).filter(l => l.deleted === true);
}

// Hard-removes deleted records. The opts flags allow a caller to purge
// only some entity types — e.g. a sync push purges deleted column/label
// tombstones while leaving other deleted records for a later cleanup.
export function purgeDeleted(boardId, { tasks = true, columns = true, labels = true } = {}) {
  if (tasks && state.tasks[boardId]) {
    const live = (safeParseArray(state.tasks[boardId]) || []).filter(t => !t.deleted);
    state.tasks[boardId] = live;
    taskCacheByBoard.set(boardId, live);
    scheduleReadModelPersist(boardId, 'tasks', live);
  }
  if (columns && state.columns[boardId]) {
    const live = (safeParseArray(state.columns[boardId]) || []).filter(c => !c.deleted);
    state.columns[boardId] = live;
    scheduleReadModelPersist(boardId, 'columns', live);
  }
  if (labels && state.labels[boardId]) {
    const live = (safeParseArray(state.labels[boardId]) || []).filter(l => !l.deleted);
    state.labels[boardId] = live;
    scheduleReadModelPersist(boardId, 'labels', live);
  }
}

export function saveColumnsForBoard(boardId, columns) {
  state.columns[boardId] = Array.isArray(columns) ? columns : [];
  scheduleReadModelPersist(boardId, 'columns', state.columns[boardId]);
}

export function saveTasksForBoard(boardId, tasks) {
  const normalized = (Array.isArray(tasks) ? tasks : []).map((task) => ({
    ...task,
  }));
  state.tasks[boardId] = normalized;
  taskCacheByBoard.set(boardId, normalized);
  scheduleReadModelPersist(boardId, 'tasks', normalized);
}

export function saveLabelsForBoard(boardId, labels) {
  state.labels[boardId] = Array.isArray(labels) ? labels : [];
  scheduleReadModelPersist(boardId, 'labels', state.labels[boardId]);
}

export function saveSettingsForBoard(boardId, settings) {
  state.settings[boardId] = settings && typeof settings === 'object' ? settings : {};
  schedulePersist(keyFor(boardId, 'settings'), state.settings[boardId]);
}

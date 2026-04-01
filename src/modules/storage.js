import { openDB } from 'idb';
import { generateUUID } from './utils.js';
import { normalizePriority as sharedNormalizePriority, isHexColor as sharedIsHexColor, normalizeStringKeys, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import { DONE_COLUMN_ID } from './constants.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_NAME = 'kanvana-db';
const DB_VERSION = 1;
const KV_STORE = 'kv';

const BOARDS_KEY = 'kanbanBoards';
const ACTIVE_BOARD_KEY = 'kanbanActiveBoardId';

const LEGACY_COLUMNS_KEY = 'kanbanColumns';
const LEGACY_TASKS_KEY = 'kanbanTasks';
const LEGACY_LABELS_KEY = 'kanbanLabels';

const DEFAULT_BOARD_ID = 'default';
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
  settings: {}  // { [boardId]: object | null }
};

// Per-board default-task cache (keeps defaults stable within a session).
const taskCacheByBoard = new Map();

// ── IDB singleton ──────────────────────────────────────────────────────────────

let _db = null;

// In-flight persist Promises — used by _flushPersistsForTesting().
const _pendingPersists = new Set();

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(KV_STORE);
    }
  });
  return _db;
}

function schedulePersist(key, value) {
  if (!_db) return; // IDB not yet initialised (e.g. during testing without initStorage)
  const p = _db.put(KV_STORE, value, key).catch((err) => {
    console.error('[Kanvana] IDB persist failed for key', key, err);
  });
  _pendingPersists.add(p);
  p.finally(() => _pendingPersists.delete(p));
}

/**
 * Wait for all fire-and-forget IDB writes to settle.
 * Only intended for use in tests — do not call in application code.
 */
export async function _flushPersistsForTesting() {
  await Promise.all([..._pendingPersists]);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function keyFor(boardId, kind) {
  return `kanbanBoard:${boardId}:${kind}`;
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
    { id: 'todo', name: 'To Do', color: '#3583ff' },
    { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
    { id: DONE_COLUMN_ID, name: 'Done', color: '#505050' }
  ];
}

function defaultLabels() {
  return [
    { id: 'task-ez2522q8', name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: 'meeting-gy2462e7', name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: 'email-gy2462e7', name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: 'idea-ju2554t6', name: 'Idea', color: '#25b631', group: '' },
    { id: 'goal-hr2475r4', name: 'Goal', color: '#1b7cbd', group: '' },
  ];
}

function defaultTasks() {
  const created = nowIso();
  return [
    {
      id: generateUUID(),
      title: 'Find out where the Soul Stone is',
      description: 'Identify current location and access requirements.',
      priority: 'high',
      dueDate: '',
      column: 'todo',
      labels: ['urgent'],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: 'todo', at: created }]
    },
    {
      id: generateUUID(),
      title: 'Steal the Time Stone',
      description: 'Coordinate with Dr. Strange and plan retrieval.',
      priority: 'urgent',
      dueDate: '',
      column: 'inprogress',
      labels: ['feature'],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: 'inprogress', at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Mind Stone',
      description: 'Determine safe extraction approach.',
      priority: 'medium',
      dueDate: '',
      column: 'inprogress',
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: 'inprogress', at: created }]
    },
    {
      id: generateUUID(),
      title: 'Hide the Reality Stone',
      description: 'Dig a deep hole to hide the stone from the Collector, avoid escalation.',
      priority: 'low',
      dueDate: '',
      column: 'inprogress',
      labels: ['task'],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: 'inprogress', at: created }]
    },
    {
      id: generateUUID(),
      title: 'Find a bag for stones',
      description: 'A bag with good durability and space is needed to hold all the stones securely.',
      priority: 'none',
      dueDate: '',
      column: 'inprogress',
      labels: ['task'],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: 'inprogress', at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Power Stone',
      description: 'Verify secure containment after retrieval.',
      priority: 'high',
      dueDate: '',
      column: DONE_COLUMN_ID,
      labels: ['urgent', 'feature'],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: DONE_COLUMN_ID, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Space Stone',
      description: '',
      priority: 'low',
      dueDate: '',
      column: DONE_COLUMN_ID,
      labels: [],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: DONE_COLUMN_ID, at: created }]
    }
  ];
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
    const tx = db.transaction(KV_STORE, 'readwrite');
    const store = tx.objectStore(KV_STORE);
    await store.put(boards, BOARDS_KEY);
    await store.put(DEFAULT_BOARD_ID, ACTIVE_BOARD_KEY);
    await store.put(legacyColumns || defaultColumns(), keyFor(DEFAULT_BOARD_ID, 'columns'));
    await store.put(legacyTasks || defaultTasks(), keyFor(DEFAULT_BOARD_ID, 'tasks'));
    await store.put(legacyLabels || defaultLabels(), keyFor(DEFAULT_BOARD_ID, 'labels'));
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
  const tx = db.transaction(KV_STORE, 'readwrite');
  const store = tx.objectStore(KV_STORE);

  await store.put(boards, BOARDS_KEY);
  if (lsActiveId) await store.put(lsActiveId, ACTIVE_BOARD_KEY);

  for (const board of boards) {
    const tasks = safeParseArray(localStorage.getItem(keyFor(board.id, 'tasks'))) || [];
    const columns = safeParseArray(localStorage.getItem(keyFor(board.id, 'columns'))) || [];
    const labels = safeParseArray(localStorage.getItem(keyFor(board.id, 'labels'))) || [];
    const settings = safeParseObject(localStorage.getItem(keyFor(board.id, 'settings')));

    await store.put(tasks, keyFor(board.id, 'tasks'));
    await store.put(columns, keyFor(board.id, 'columns'));
    await store.put(labels, keyFor(board.id, 'labels'));
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
  const db = await getDB();

  // Migrate from localStorage if IDB is empty but localStorage has data.
  const idbBoards = await db.get(KV_STORE, BOARDS_KEY);
  const hasLocalStorageData = Boolean(
    localStorage.getItem(BOARDS_KEY) ||
    localStorage.getItem(LEGACY_COLUMNS_KEY)
  );

  if (!idbBoards && hasLocalStorageData) {
    await migrateFromLocalStorage(db);
  }

  // Load everything into in-memory state.
  state.boards = (await db.get(KV_STORE, BOARDS_KEY)) || [];
  state.activeBoardId = (await db.get(KV_STORE, ACTIVE_BOARD_KEY)) || null;

  for (const board of state.boards) {
    state.tasks[board.id] = (await db.get(KV_STORE, keyFor(board.id, 'tasks'))) ?? null;
    state.columns[board.id] = (await db.get(KV_STORE, keyFor(board.id, 'columns'))) ?? null;
    state.labels[board.id] = (await db.get(KV_STORE, keyFor(board.id, 'labels'))) ?? null;
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

/**
 * Resets the in-memory state and IDB connection.
 * Call this in unit test beforeEach hooks to get a clean slate.
 */
export function _resetStorageForTesting() {
  // Close the open IDB connection so a subsequent deleteDB() call is not blocked.
  if (_db) { _db.close(); _db = null; }
  _pendingPersists.clear();
  state.boards = [];
  state.activeBoardId = null;
  for (const k in state.tasks) delete state.tasks[k];
  for (const k in state.columns) delete state.columns[k];
  for (const k in state.labels) delete state.labels[k];
  for (const k in state.settings) delete state.settings[k];
  taskCacheByBoard.clear();
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
  const board = { id: DEFAULT_BOARD_ID, name: 'Default Board', createdAt: created };
  state.boards = [board];
  state.activeBoardId = DEFAULT_BOARD_ID;
  state.columns[DEFAULT_BOARD_ID] = defaultColumns();
  state.tasks[DEFAULT_BOARD_ID] = defaultTasks();
  state.labels[DEFAULT_BOARD_ID] = defaultLabels();
  state.settings[DEFAULT_BOARD_ID] = defaultSettings();

  schedulePersist(BOARDS_KEY, state.boards);
  schedulePersist(ACTIVE_BOARD_KEY, DEFAULT_BOARD_ID);
  schedulePersist(keyFor(DEFAULT_BOARD_ID, 'columns'), state.columns[DEFAULT_BOARD_ID]);
  schedulePersist(keyFor(DEFAULT_BOARD_ID, 'tasks'), state.tasks[DEFAULT_BOARD_ID]);
  schedulePersist(keyFor(DEFAULT_BOARD_ID, 'labels'), state.labels[DEFAULT_BOARD_ID]);
  schedulePersist(keyFor(DEFAULT_BOARD_ID, 'settings'), state.settings[DEFAULT_BOARD_ID]);
}

export function createBoard(name) {
  ensureBoardsInitialized();
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const boardName = trimmed || 'Untitled board';
  const boards = listBoards();

  const id = `board-${generateUUID()}`;
  const board = { id, name: boardName, createdAt: nowIso() };
  saveBoards([...boards, board]);

  state.columns[id] = defaultColumns();
  state.tasks[id] = [];
  state.labels[id] = defaultLabels();
  state.settings[id] = defaultSettings();

  schedulePersist(keyFor(id, 'columns'), state.columns[id]);
  schedulePersist(keyFor(id, 'tasks'), state.tasks[id]);
  schedulePersist(keyFor(id, 'labels'), state.labels[id]);
  schedulePersist(keyFor(id, 'settings'), state.settings[id]);

  state.activeBoardId = id;
  schedulePersist(ACTIVE_BOARD_KEY, id);

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
  if (_db) {
    Promise.all([
      _db.delete(KV_STORE, keyFor(id, 'tasks')),
      _db.delete(KV_STORE, keyFor(id, 'columns')),
      _db.delete(KV_STORE, keyFor(id, 'labels')),
      _db.delete(KV_STORE, keyFor(id, 'settings'))
    ]).catch((err) => console.error('[Kanvana] IDB delete failed for board', id, err));
  }

  if (state.activeBoardId === id) {
    state.activeBoardId = remaining[0].id;
    schedulePersist(ACTIVE_BOARD_KEY, remaining[0].id);
  }

  return true;
}

// ── Columns ────────────────────────────────────────────────────────────────────

function isHexColor(value) {
  return sharedIsHexColor(value);
}

function defaultColumnColor(id) {
  if (id === 'todo') return '#3b82f6';
  if (id === 'inprogress') return '#f59e0b';
  if (id === DONE_COLUMN_ID) return '#16a34a';
  return '#3b82f6';
}

function normalizeColumn(c) {
  const color = isHexColor(c?.color) ? c.color.trim() : defaultColumnColor(c?.id);
  const collapsed = c?.collapsed === true;
  return { ...c, color, collapsed };
}

function ensureDoneColumn(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  if (list.some((c) => c && c.id === DONE_COLUMN_ID)) return list;
  const maxOrder = list.reduce((max, c) => Math.max(max, Number.isFinite(c?.order) ? c.order : 0), 0);
  list.push({ id: DONE_COLUMN_ID, name: 'Done', color: '#16a34a', order: maxOrder + 1, collapsed: false });
  return list;
}

export function loadColumns() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.columns[boardId];
  const parsed = safeParseArray(raw);
  if (parsed) {
    const normalized = ensureDoneColumn(parsed.map(normalizeColumn));
    // Persist back if done column was added or array length changed.
    if (!raw || !Array.isArray(raw) || normalized.length !== raw.length) {
      state.columns[boardId] = normalized;
      schedulePersist(keyFor(boardId, 'columns'), normalized);
    }
    return normalized;
  }
  return ensureDoneColumn(defaultColumns().map(normalizeColumn));
}

export function saveColumns(columns) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  state.columns[boardId] = columns;
  schedulePersist(keyFor(boardId, 'columns'), columns);
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

      const isDone = task.column === DONE_COLUMN_ID;
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
      schedulePersist(keyFor(boardId, 'tasks'), normalized);
    }

    taskCacheByBoard.set(boardId, normalized);
    return normalized;
  }

  // Empty state: return stable in-memory defaults for the session.
  const cached = taskCacheByBoard.get(boardId);
  if (Array.isArray(cached)) return cached;

  const defaults = defaultTasks();
  taskCacheByBoard.set(boardId, defaults);
  return defaults;
}

export function saveTasks(tasks) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  state.tasks[boardId] = tasks;
  taskCacheByBoard.set(boardId, tasks);
  schedulePersist(keyFor(boardId, 'tasks'), tasks);
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export function loadLabels() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.labels[boardId];
  const parsed = safeParseArray(raw);
  if (parsed) {
    return parsed.map((label) => ({
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
  schedulePersist(keyFor(boardId, 'labels'), labels);
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

// ── Cross-board read helpers (used by exportBoard in importexport.js) ──────────

export function loadTasksForBoard(boardId) {
  const raw = state.tasks[boardId];
  return safeParseArray(raw) || [];
}

export function loadColumnsForBoard(boardId) {
  const raw = state.columns[boardId];
  return safeParseArray(raw) || [];
}

export function loadLabelsForBoard(boardId) {
  const raw = state.labels[boardId];
  return safeParseArray(raw) || [];
}

export function loadSettingsForBoard(boardId) {
  const raw = state.settings[boardId];
  return safeParseObject(raw) || null;
}

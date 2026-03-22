import { generateUUID } from './utils.js';
import { normalizePriority as sharedNormalizePriority, isHexColor as sharedIsHexColor, normalizeStringKeys } from './normalize.js';
import { DONE_COLUMN_ID } from './constants.js';

const BOARDS_KEY = 'kanbanBoards';
const ACTIVE_BOARD_KEY = 'kanbanActiveBoardId';

const LEGACY_COLUMNS_KEY = 'kanbanColumns';
const LEGACY_TASKS_KEY = 'kanbanTasks';
const LEGACY_LABELS_KEY = 'kanbanLabels';

const DEFAULT_BOARD_ID = 'default';
const ALLOWED_SWIMLANE_GROUP_BY = new Set(['label', 'label-group', 'priority']);

// Per-board in-memory cache to keep defaults stable within a session.
const taskCacheByBoard = new Map();

function nowIso() {
  return new Date().toISOString();
}

function keyFor(boardId, kind) {
  return `kanbanBoard:${boardId}:${kind}`;
}

function safeParseArray(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeParseObject(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function listBoards() {
  const boards = safeParseArray(localStorage.getItem(BOARDS_KEY));
  if (!boards) return [];

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
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
}

export function getActiveBoardId() {
  const stored = localStorage.getItem(ACTIVE_BOARD_KEY);
  const boards = listBoards();
  if (stored && boards.some((b) => b.id === stored)) return stored;
  return boards[0]?.id || null;
}

export function setActiveBoardId(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return;
  const boards = listBoards();
  if (!boards.some((b) => b.id === id)) return;
  localStorage.setItem(ACTIVE_BOARD_KEY, id);
}

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
    // Number of days ahead (inclusive) to consider tasks "upcoming" for notifications.
    // Overdue tasks are always included.
    notificationDays: 3,
    // Countdown color thresholds
    countdownUrgentThreshold: 3,   // Red: tasks due within this many days
    countdownWarningThreshold: 10,  // Amber: tasks due within this many days (must be >= urgent threshold)
    swimLanesEnabled: false,
    swimLaneGroupBy: 'label',
    swimLaneLabelGroup: '',
    swimLaneCollapsedKeys: [],
    swimLaneCellCollapsedKeys: [],
    swimLaneOrder: []
  };
}

function normalizePriority(value) {
  return sharedNormalizePriority(value);
}

function normalizeSwimLaneGroupBy(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return ALLOWED_SWIMLANE_GROUP_BY.has(normalized) ? normalized : 'label';
}

function normalizeSwimLaneLabelGroup(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSwimLaneCollapsedKeys(value) {
  return normalizeStringKeys(value);
}

function normalizeSwimLaneCellCollapsedKeys(value) {
  return normalizeStringKeys(value);
}

function migrateLegacySingleBoardIntoDefault() {
  const legacyColumns = safeParseArray(localStorage.getItem(LEGACY_COLUMNS_KEY));
  const legacyTasks = safeParseArray(localStorage.getItem(LEGACY_TASKS_KEY));
  const legacyLabels = safeParseArray(localStorage.getItem(LEGACY_LABELS_KEY));

  const hadLegacy = Boolean(legacyColumns || legacyTasks || legacyLabels);

  // Always create the default board metadata.
  const boards = [{ id: DEFAULT_BOARD_ID, name: 'Default Board', createdAt: nowIso() }];
  saveBoards(boards);
  localStorage.setItem(ACTIVE_BOARD_KEY, DEFAULT_BOARD_ID);

  // Prefer legacy data if present; otherwise initialize defaults.
  localStorage.setItem(keyFor(DEFAULT_BOARD_ID, 'columns'), JSON.stringify(legacyColumns || defaultColumns()));
  localStorage.setItem(keyFor(DEFAULT_BOARD_ID, 'tasks'), JSON.stringify(legacyTasks || defaultTasks()));
  localStorage.setItem(keyFor(DEFAULT_BOARD_ID, 'labels'), JSON.stringify(legacyLabels || defaultLabels()));
  localStorage.setItem(keyFor(DEFAULT_BOARD_ID, 'settings'), JSON.stringify(defaultSettings()));

  return hadLegacy;
}

export function ensureBoardsInitialized() {
  const boards = listBoards();
  if (boards.length > 0) {
    // Ensure active board is valid
    if (!getActiveBoardId()) setActiveBoardId(boards[0].id);
    return;
  }

  migrateLegacySingleBoardIntoDefault();
}

export function createBoard(name) {
  ensureBoardsInitialized();

  const trimmed = typeof name === 'string' ? name.trim() : '';
  const boardName = trimmed || 'Untitled board';
  const boards = listBoards();

  const id = `board-${generateUUID()}`;
  const board = { id, name: boardName, createdAt: nowIso() };
  saveBoards([...boards, board]);

  localStorage.setItem(keyFor(id, 'columns'), JSON.stringify(defaultColumns()));
  localStorage.setItem(keyFor(id, 'tasks'), JSON.stringify([]));
  localStorage.setItem(keyFor(id, 'labels'), JSON.stringify(defaultLabels()));
  localStorage.setItem(keyFor(id, 'settings'), JSON.stringify(defaultSettings()));

  localStorage.setItem(ACTIVE_BOARD_KEY, id);
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
  if (boards.length <= 1) return false; // never delete the last board

  const remaining = boards.filter((b) => b.id !== id);
  saveBoards(remaining);

  // Remove per-board data
  localStorage.removeItem(keyFor(id, 'columns'));
  localStorage.removeItem(keyFor(id, 'tasks'));
  localStorage.removeItem(keyFor(id, 'labels'));
  localStorage.removeItem(keyFor(id, 'settings'));
  taskCacheByBoard.delete(id);

  // If the active board was deleted, switch to first remaining
  const active = localStorage.getItem(ACTIVE_BOARD_KEY);
  if (active === id) {
    localStorage.setItem(ACTIVE_BOARD_KEY, remaining[0].id);
  }

  return true;
}

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

// Load columns from localStorage
export function loadColumns() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const stored = localStorage.getItem(keyFor(boardId, 'columns'));
  const parsed = safeParseArray(stored);
  if (parsed) {
    const normalized = ensureDoneColumn(parsed.map(normalizeColumn));
    // Persist back if done column was missing.
    if (!normalized.some((c) => c && c.id === DONE_COLUMN_ID) || normalized.length !== parsed.length) {
      localStorage.setItem(keyFor(boardId, 'columns'), JSON.stringify(normalized));
    }
    return normalized;
  }

  // Safety fallback
  return ensureDoneColumn(defaultColumns().map(normalizeColumn));
}

// Save columns to localStorage
export function saveColumns(columns) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  localStorage.setItem(keyFor(boardId, 'columns'), JSON.stringify(columns));
}

// Load tasks from localStorage
export function loadTasks() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const stored = localStorage.getItem(keyFor(boardId, 'tasks'));
  const parsed = safeParseArray(stored);
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
        // One-time legacy migration: doneDate mirrors changeDate for tasks in Done.
        // Safety fallback to creationDate only if changeDate is missing.
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

      // One-time migration: ensure a usable column history exists for reports (CFD).
      // We cannot reconstruct past moves for legacy tasks, so seed with the current column
      // at the earliest known timestamp.
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

      return task;
    });

    if (didChange) {
      localStorage.setItem(keyFor(boardId, 'tasks'), JSON.stringify(normalized));
    }

    taskCacheByBoard.set(boardId, normalized);
    return normalized;
  }

  // If localStorage is empty, keep a stable in-memory default set for this session.
  const cached = taskCacheByBoard.get(boardId);
  if (Array.isArray(cached)) return cached;

  const defaults = defaultTasks();
  taskCacheByBoard.set(boardId, defaults);
  return defaults;
}

// Save tasks to localStorage
export function saveTasks(tasks) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  localStorage.setItem(keyFor(boardId, 'tasks'), JSON.stringify(tasks));
  taskCacheByBoard.set(boardId, tasks);
}

// Load labels from localStorage
export function loadLabels() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const stored = localStorage.getItem(keyFor(boardId, 'labels'));
  const parsed = safeParseArray(stored);
  if (parsed) {
    return parsed.map(label => ({
      ...label,
      group: typeof label.group === 'string' ? label.group : ''
    }));
  }

  return defaultLabels();
}

// Save labels to localStorage
export function saveLabels(labels) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  localStorage.setItem(keyFor(boardId, 'labels'), JSON.stringify(labels));
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
  const swimLaneCollapsedKeys = normalizeSwimLaneCollapsedKeys(obj.swimLaneCollapsedKeys);
  const swimLaneCellCollapsedKeys = normalizeSwimLaneCellCollapsedKeys(obj.swimLaneCellCollapsedKeys);
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
  const stored = localStorage.getItem(keyFor(boardId, 'settings'));
  const parsed = safeParseObject(stored);
  if (parsed) return normalizeSettings(parsed);

  const defaults = defaultSettings();
  localStorage.setItem(keyFor(boardId, 'settings'), JSON.stringify(defaults));
  return defaults;
}

export function saveSettings(settings) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const normalized = normalizeSettings(settings);
  localStorage.setItem(keyFor(boardId, 'settings'), JSON.stringify(normalized));
}

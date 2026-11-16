// Boot-time migration of legacy persisted state (#334): localStorage → IndexedDB, then IDB state normalisation.
// Runs before the Read Model loads, so it is the only code besides the Read Model that writes its keys.

import { nowIso, safeParseArray, safeParseObject } from './utils.js';
import { ACTIVE_BOARD_KEY, DEFAULT_BOARD_ID } from './constants.js';
import { isDataCurrent, writeIfDataCurrent, KV_STORE, READ_MODEL_STORE, keyFor, readModelKeyFor } from './idb-store.js';
import { normalizeBoardModelIds } from './board-serializer.js';
import { READ_MODEL_KEYS } from './event-sourcing/read-model-projector.js';
import { defaultLabels, defaultSettings, defaultTasks, legacyDefaultColumns } from './event-sourcing/read-model-seed.js';

// The Read Model owns it; only these one-shot migrations write it, before the Read Model loads.
const BOARDS_KEY = READ_MODEL_KEYS.boards;

// The legacy localStorage key; it only shares its name with the Read Model's IDB key and need not follow it.
const LEGACY_BOARDS_KEY = 'kanbanBoards';
const LEGACY_COLUMNS_KEY = 'kanbanColumns';
const LEGACY_TASKS_KEY = 'kanbanTasks';
const LEGACY_LABELS_KEY = 'kanbanLabels';
// Left behind by the removed whole-record LWW sync path (ADR-0004).
const LEGACY_SYNC_KEYS = ['kanbanSyncMap', 'kanbanAutoSyncEnabled'];
// Set once undated tasks stored before it have their column history stamped; tasks that arrive undated later are not (#330).
const UNDATED_HISTORY_FLAG_KEY = 'kanvana:migrations:undatedColumnHistory:v1';

// Migrates localStorage into IDB if IDB has no boards yet, then normalises the IDB state; a no-op once it is current.
export async function migrateLegacyState(db) {
  // Migrate from localStorage if IDB is empty but localStorage has data.
  const idbBoards = await db.get(KV_STORE, BOARDS_KEY);
  const hasLocalStorageData = Boolean(
    localStorage.getItem(LEGACY_BOARDS_KEY) ||
    localStorage.getItem(LEGACY_COLUMNS_KEY) ||
    localStorage.getItem(LEGACY_TASKS_KEY) ||
    localStorage.getItem(LEGACY_LABELS_KEY)
  );

  if (!idbBoards && hasLocalStorageData) {
    await migrateFromLocalStorage(db);
  }

  await normalizeIdbState(db);
  for (const key of LEGACY_SYNC_KEYS) localStorage.removeItem(key);
}

async function normalizeIdbState(db) {
  const rawBoards = safeParseArray(await db.get(KV_STORE, BOARDS_KEY));
  const historyStamped = Boolean(await db.get(KV_STORE, UNDATED_HISTORY_FLAG_KEY));
  if (!rawBoards) {
    if (!historyStamped) await writeIfDataCurrent(KV_STORE, (store) => store.put({ at: nowIso() }, UNDATED_HISTORY_FLAG_KEY));
    return;
  }

  const rawActiveId = await db.get(KV_STORE, ACTIVE_BOARD_KEY);
  const stampedAt = historyStamped ? null : nowIso();
  const stamp = (task) => (stampedAt ? withSeededHistory(task, stampedAt) : task);
  const nextBoards = [];
  const activeIdMap = new Map();
  const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
  if (!await isDataCurrent(tx)) return;
  const store = tx.objectStore(KV_STORE);
  const readModelStore = tx.objectStore(READ_MODEL_STORE);

  for (const rawBoard of rawBoards) {
    if (!rawBoard || typeof rawBoard !== 'object') continue;
    const oldBoardId = typeof rawBoard.id === 'string' ? rawBoard.id.trim() : '';
    const normalized = normalizeBoardModelIds({
      board: rawBoard,
      tasks: safeParseArray(await readModelStore.get(readModelKeyFor(oldBoardId, 'tasks')) ?? await store.get(keyFor(oldBoardId, 'tasks'))) || [],
      columns: safeParseArray(await readModelStore.get(readModelKeyFor(oldBoardId, 'columns')) ?? await store.get(keyFor(oldBoardId, 'columns'))) || legacyDefaultColumns(),
      labels: safeParseArray(await readModelStore.get(readModelKeyFor(oldBoardId, 'labels')) ?? await store.get(keyFor(oldBoardId, 'labels'))) || [],
      settings: safeParseObject(await store.get(keyFor(oldBoardId, 'settings'))) || defaultSettings()
    });

    const newBoardId = normalized.board.id;
    activeIdMap.set(oldBoardId, newBoardId);
    nextBoards.push(normalized.board);
    await readModelStore.put(normalized.tasks.map(stamp), readModelKeyFor(newBoardId, 'tasks'));
    await readModelStore.put(normalized.columns, readModelKeyFor(newBoardId, 'columns'));
    await readModelStore.put(normalized.labels, readModelKeyFor(newBoardId, 'labels'));
    await store.put(normalized.settings, keyFor(newBoardId, 'settings'));

    if (oldBoardId && oldBoardId !== newBoardId) {
      await readModelStore.delete(readModelKeyFor(oldBoardId, 'tasks'));
      await readModelStore.delete(readModelKeyFor(oldBoardId, 'columns'));
      await readModelStore.delete(readModelKeyFor(oldBoardId, 'labels'));
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
  if (stampedAt) await store.put({ at: stampedAt }, UNDATED_HISTORY_FLAG_KEY);
  await tx.done;
}

// A task with no dates has nothing to date its column history from, so it is stamped once here (#330).
function withSeededHistory(task, stampedAt) {
  if (!task || typeof task !== 'object' || hasUsableColumnHistory(task.columnHistory)) return task;
  const column = typeof task.column === 'string' ? task.column.trim() : '';
  if (!column || isNonEmptyString(task.changeDate) || isNonEmptyString(task.creationDate)) return task;
  return { ...task, columnHistory: [{ column, at: stampedAt }] };
}

function hasUsableColumnHistory(history) {
  return Array.isArray(history) && history.some((e) => isNonEmptyString(e?.column) && isNonEmptyString(e?.at));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

async function migrateFromLocalStorage(db) {
  const lsBoards = safeParseArray(localStorage.getItem(LEGACY_BOARDS_KEY));
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
    const readModelStore = tx.objectStore(READ_MODEL_STORE);
    await store.put(boards, BOARDS_KEY);
    await store.put(DEFAULT_BOARD_ID, ACTIVE_BOARD_KEY);
    await readModelStore.put(legacyColumns || legacyDefaultColumns(), readModelKeyFor(DEFAULT_BOARD_ID, 'columns'));
    await readModelStore.put(legacyTasks || defaultTasks(), readModelKeyFor(DEFAULT_BOARD_ID, 'tasks'));
    await readModelStore.put(legacyLabels || defaultLabels(), readModelKeyFor(DEFAULT_BOARD_ID, 'labels'));
    await store.put(defaultSettings(), keyFor(DEFAULT_BOARD_ID, 'settings'));
    await tx.done;

    localStorage.removeItem(LEGACY_COLUMNS_KEY);
    localStorage.removeItem(LEGACY_TASKS_KEY);
    localStorage.removeItem(LEGACY_LABELS_KEY);
    localStorage.removeItem(LEGACY_BOARDS_KEY);
    localStorage.removeItem(ACTIVE_BOARD_KEY);
    return;
  }

  if (!boards) return;

  // Multi-board localStorage → IDB
  const tx = db.transaction([KV_STORE, READ_MODEL_STORE], 'readwrite');
  const store = tx.objectStore(KV_STORE);
  const readModelStore = tx.objectStore(READ_MODEL_STORE);

  await store.put(boards, BOARDS_KEY);
  if (lsActiveId) await store.put(lsActiveId, ACTIVE_BOARD_KEY);

  for (const board of boards) {
    const tasks = safeParseArray(localStorage.getItem(keyFor(board.id, 'tasks'))) || [];
    const columns = safeParseArray(localStorage.getItem(keyFor(board.id, 'columns'))) || [];
    const labels = safeParseArray(localStorage.getItem(keyFor(board.id, 'labels'))) || [];
    const settings = safeParseObject(localStorage.getItem(keyFor(board.id, 'settings')));

    await readModelStore.put(tasks, readModelKeyFor(board.id, 'tasks'));
    await readModelStore.put(columns, readModelKeyFor(board.id, 'columns'));
    await readModelStore.put(labels, readModelKeyFor(board.id, 'labels'));
    if (settings) await store.put(settings, keyFor(board.id, 'settings'));

    localStorage.removeItem(keyFor(board.id, 'tasks'));
    localStorage.removeItem(keyFor(board.id, 'columns'));
    localStorage.removeItem(keyFor(board.id, 'labels'));
    localStorage.removeItem(keyFor(board.id, 'settings'));
  }

  await tx.done;
  localStorage.removeItem(LEGACY_BOARDS_KEY);
  localStorage.removeItem(ACTIVE_BOARD_KEY);
}

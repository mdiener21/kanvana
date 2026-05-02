import { ensureAuthenticated, pushBoardFull } from './sync.js';

const AUTO_SYNC_KEY = 'kanbanAutoSyncEnabled';
const LOCAL_CHANGE_EVENT = 'kanban-local-change';
const BOARDS_KEY = 'kanbanBoards';
const ACTIVE_BOARD_KEY = 'kanbanActiveBoardId';

let debounceTimer = null;
let syncInFlight = false;
let syncQueued = false;

function hasWindow() {
  return typeof window !== 'undefined';
}

export function isAutoSyncEnabled() {
  return localStorage.getItem(AUTO_SYNC_KEY) === 'true';
}

export function enableAutoSync() {
  localStorage.setItem(AUTO_SYNC_KEY, 'true');
}

export function disableAutoSync() {
  localStorage.setItem(AUTO_SYNC_KEY, 'false');
}

export function notifyLocalDataChanged(detail = {}) {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail }));
}

function safeParseArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseObject(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function listBoardsLocal() {
  const boards = safeParseArray(localStorage.getItem(BOARDS_KEY));
  return boards.filter((b) => b && typeof b.id === 'string');
}

function keyFor(boardId, kind) {
  return `kanbanBoard:${boardId}:${kind}`;
}

function getActiveBoardIdLocal() {
  return localStorage.getItem(ACTIVE_BOARD_KEY);
}

function setActiveBoardIdLocal(boardId) {
  localStorage.setItem(ACTIVE_BOARD_KEY, boardId);
}

function loadColumnsLocal(boardId) {
  return safeParseArray(localStorage.getItem(keyFor(boardId, 'columns')));
}

function loadTasksLocal(boardId) {
  return safeParseArray(localStorage.getItem(keyFor(boardId, 'tasks')));
}

function loadLabelsLocal(boardId) {
  return safeParseArray(localStorage.getItem(keyFor(boardId, 'labels')));
}

function loadSettingsLocal(boardId) {
  return safeParseObject(localStorage.getItem(keyFor(boardId, 'settings')), {});
}

async function pushAllBoardsNow() {
  const boards = listBoardsLocal();
  const originalActiveBoard = getActiveBoardIdLocal();

  for (const board of boards) {
    setActiveBoardIdLocal(board.id);
    const columns = loadColumnsLocal(board.id);
    const tasks = loadTasksLocal(board.id);
    const labels = loadLabelsLocal(board.id);
    const settings = loadSettingsLocal(board.id);
    await pushBoardFull(board, columns, tasks, labels, settings);
  }

  if (originalActiveBoard) {
    setActiveBoardIdLocal(originalActiveBoard);
  }
}

async function runAutoSyncOnce() {
  if (!isAutoSyncEnabled()) return;
  if (!(await ensureAuthenticated())) return;

  if (syncInFlight) {
    syncQueued = true;
    return;
  }

  syncInFlight = true;
  try {
    await pushAllBoardsNow();
  } catch (err) {
    console.error('Auto sync failed', err);
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      scheduleAutoSync();
    }
  }
}

export function scheduleAutoSync() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runAutoSyncOnce();
  }, 700);
}

export function initializeAutoSync() {
  if (!hasWindow()) return;

  window.addEventListener(LOCAL_CHANGE_EVENT, () => {
    scheduleAutoSync();
  });

  // Catch up once per page load when auto-sync is enabled.
  if (isAutoSyncEnabled()) {
    scheduleAutoSync();
  }
}

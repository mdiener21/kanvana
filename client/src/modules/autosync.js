import { ensureAuthenticated, pushBoardFull } from './sync.js';
import { listBoards } from './storage.js';

const AUTO_SYNC_KEY = 'kanbanAutoSyncEnabled';
const LOCAL_CHANGE_EVENT = 'kanban-local-change';
const DEBOUNCE_MS = 700;

// Per-board state — keyed by boardId
const debounceTimers = new Map();
const inFlight = new Map();
const queued = new Map();
let _initialized = false;
let _localChangeHandler = null;

export function _resetAutoSyncForTesting() {
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  inFlight.clear();
  queued.clear();
  if (_initialized && _localChangeHandler && typeof window !== 'undefined') {
    window.removeEventListener(LOCAL_CHANGE_EVENT, _localChangeHandler);
  }
  _initialized = false;
  _localChangeHandler = null;
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

async function runSyncForBoard(boardId) {
  if (!isAutoSyncEnabled()) return;
  if (!(await ensureAuthenticated())) return;

  if (inFlight.get(boardId)) {
    queued.set(boardId, true);
    return;
  }

  inFlight.set(boardId, true);
  try {
    await pushBoardFull(boardId);
  } catch (err) {
    console.error(`[autosync] board ${boardId} push failed:`, err);
  } finally {
    inFlight.set(boardId, false);
    if (queued.get(boardId)) {
      queued.set(boardId, false);
      scheduleAutoSync(boardId);
    }
  }
}

export function scheduleAutoSync(boardId) {
  if (!boardId) return;
  const existing = debounceTimers.get(boardId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(boardId);
    runSyncForBoard(boardId);
  }, DEBOUNCE_MS);
  debounceTimers.set(boardId, timer);
}

export function initializeAutoSync() {
  if (typeof window === 'undefined' || _initialized) return;
  _initialized = true;

  _localChangeHandler = (e) => {
    const { boardId } = e.detail || {};
    if (boardId) scheduleAutoSync(boardId);
  };
  window.addEventListener(LOCAL_CHANGE_EVENT, _localChangeHandler);

  if (isAutoSyncEnabled()) {
    for (const board of listBoards()) {
      scheduleAutoSync(board.id);
    }
  }
}

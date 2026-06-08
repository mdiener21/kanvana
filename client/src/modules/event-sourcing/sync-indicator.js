// Header sync-state indicator (#115). Single read-only element that derives its
// state from existing plumbing — never mutates sync state. Four states per PRD §5.7:
//   Live ●        green   — online, logged in, queue empty
//   Syncing… (N)  yellow  — N events draining
//   ⚠ N unsynced  orange  — events stuck (network/5xx retry, or auth-paused)
//   Offline       gray    — no network or not logged in
// Re-renders (no reload, AC-005) on DATA_CHANGED + auth-changed/online/offline.

import { on, off, DATA_CHANGED } from '../events.js';
import { isAuthenticated } from '../sync.js';
import { getSyncStatus } from './sync-queue.js';

const ELEMENT_ID = 'sync-indicator';

const STATE = {
  offline: () => ({ text: 'Offline', cls: 'sync-indicator--offline' }),
  live: () => ({ text: 'Live ●', cls: 'sync-indicator--live' }),
  syncing: (n) => ({ text: `Syncing… (${n})`, cls: 'sync-indicator--syncing' }),
  unsynced: (n) => ({ text: `⚠ ${n} unsynced`, cls: 'sync-indicator--unsynced' }),
};

async function deriveState() {
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (!online || !isAuthenticated()) return STATE.offline();

  const { depth, retrying, paused } = await getSyncStatus();
  if (depth === 0) return STATE.live();
  if (retrying || paused) return STATE.unsynced(depth);
  return STATE.syncing(depth);
}

let _el = null;
let _handlers = null;

export async function renderSyncIndicator() {
  if (!_el) return;
  const { text, cls } = await deriveState();
  _el.textContent = text;
  _el.className = `sync-indicator ${cls}`;
}

export function initSyncIndicator() {
  if (typeof document === 'undefined') return;
  _el = document.getElementById(ELEMENT_ID);
  if (!_el || _handlers) return;

  const rerender = () => {
    renderSyncIndicator().catch((err) =>
      console.error('[Kanvana] Sync indicator render failed', err)
    );
  };
  _handlers = { rerender };
  on(DATA_CHANGED, rerender);
  window.addEventListener('auth-changed', rerender);
  window.addEventListener('online', rerender);
  window.addEventListener('offline', rerender);

  rerender();
}

export function _resetSyncIndicatorForTesting() {
  if (_handlers) {
    off(DATA_CHANGED, _handlers.rerender);
    window.removeEventListener('auth-changed', _handlers.rerender);
    window.removeEventListener('online', _handlers.rerender);
    window.removeEventListener('offline', _handlers.rerender);
  }
  _handlers = null;
  _el = null;
}

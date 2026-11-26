// A follow-up pull can run while the session is already live.

import { on, off, emit, DATA_CHANGED, PEER_SYNC_CHANGED, SYNC_INDICATOR_CHANGED, SYNC_PULL_CHANGED } from '../events.js';
import { isPullingRemoteChanges } from './realtime.js';
import { getSyncStatus, SYNC_STATUS_CHANGED } from './sync-queue.js';
import { getSyncSessionState, SESSION_STATE } from './sync-session.js';

const ELEMENT_ID = 'sync-indicator';

const STATE = {
  offline: () => ({ text: 'Offline', label: 'Offline', cls: 'sync-indicator--offline' }),
  live: () => ({ text: 'Live ●', label: 'Live', cls: 'sync-indicator--live' }),
  catchingUp: () => ({ text: 'Syncing changes', label: 'Syncing changes', cls: 'sync-indicator--catching-up' }),
  syncing: (n) => ({ text: `Syncing… (${n})`, label: `Syncing… (${n})`, cls: 'sync-indicator--syncing' }),
  unsynced: (n) => ({ text: `⚠ ${n} unsynced`, label: `${n} unsynced`, cls: 'sync-indicator--unsynced' }),
};

async function deriveState() {
  const session = getSyncSessionState();
  if (session === SESSION_STATE.SIGNED_OUT || session === SESSION_STATE.OFFLINE || session === SESSION_STATE.PAUSED_OFFLINE) return STATE.offline();
  if (session === SESSION_STATE.CATCHING_UP || (session === SESSION_STATE.LIVE && isPullingRemoteChanges())) {
    return STATE.catchingUp();
  }

  const { depth, retrying } = await getSyncStatus();
  if (depth === 0) return STATE.live();
  if (retrying || session === SESSION_STATE.PAUSED) return STATE.unsynced(depth);
  return STATE.syncing(depth);
}

let _el = null;
let _handlers = null;
let _label = STATE.offline().label;
let _renderVersion = 0;

// The shown state without its glyphs, for accessible names elsewhere in the header.
export function getSyncStateLabel() {
  return _label;
}

export async function renderSyncIndicator() {
  const el = _el;
  if (!el) return;
  const version = ++_renderVersion;
  const { text, label, cls } = await deriveState();
  if (el !== _el || version !== _renderVersion) return;
  if (el.textContent !== text) el.textContent = text;
  el.className = `sync-indicator ${cls}`;
  _label = label;
  emit(SYNC_INDICATOR_CHANGED);
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
  on(PEER_SYNC_CHANGED, rerender);
  on(SYNC_PULL_CHANGED, rerender);
  window.addEventListener(SYNC_STATUS_CHANGED, rerender);

  rerender();
}

export function _resetSyncIndicatorForTesting() {
  if (_handlers) {
    off(DATA_CHANGED, _handlers.rerender);
    off(PEER_SYNC_CHANGED, _handlers.rerender);
    off(SYNC_PULL_CHANGED, _handlers.rerender);
    window.removeEventListener(SYNC_STATUS_CHANGED, _handlers.rerender);
  }
  _handlers = null;
  _el = null;
  _label = STATE.offline().label;
}

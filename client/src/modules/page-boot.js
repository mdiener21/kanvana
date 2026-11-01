import { initStorage, publishDeferredDefaultBoard } from './storage.js';
import { initializeThemeToggle } from './theme.js';
import { initAuthRefresh } from './sync.js';
import { initializeAuthSyncUI } from './authsync.js';
import { initSyncQueue, SYNC_STATUS_CHANGED } from './event-sourcing/sync-queue.js';
import { getSyncSessionState, initSyncSession, SESSION_STATE } from './event-sourcing/sync-session.js';
import { checkDataOwner, listenForDataOwnerWipe } from './event-sourcing/data-owner.js';
import { initSyncIndicator } from './event-sourcing/sync-indicator.js';

export async function bootPage({ mountAuthUi = false } = {}) {
  listenForDataOwnerWipe();
  try {
    await initStorage();
  } catch (err) {
    // Render with empty state rather than a blank page.
    console.error('[Kanvana] Failed to initialise storage:', err);
  }
  initializeThemeToggle();
  initAuthRefresh();
  if (mountAuthUi) initializeAuthSyncUI();
  initSyncQueue();
  initSyncSession({ beforeSignIn: checkDataOwner });
  initSyncIndicator();
  window.addEventListener(SYNC_STATUS_CHANGED, () => {
    if (getSyncSessionState() !== SESSION_STATE.LIVE) return;
    publishDeferredDefaultBoard().catch((err) => console.error('[Kanvana] Default board publish failed', err));
  });
}

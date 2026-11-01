import { initStorage } from './storage.js';
import { initializeThemeToggle } from './theme.js';
import { initAuthRefresh } from './sync.js';
import { initializeAuthSyncUI } from './authsync.js';
import { initSyncQueue } from './event-sourcing/sync-queue.js';
import { initSyncSession } from './event-sourcing/sync-session.js';
import { initSyncIndicator } from './event-sourcing/sync-indicator.js';

export async function bootPage({ mountAuthUi = false } = {}) {
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
  initSyncSession();
  initSyncIndicator();
}

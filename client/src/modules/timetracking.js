import { initStorage } from './storage.js';
import { initializeThemeToggle } from './theme.js';
import { initSyncQueue } from './event-sourcing/sync-queue.js';
import { initRealtime } from './event-sourcing/realtime.js';
import { mountTimeTracking } from './timetracking-ui.js';

function main() {
  initializeThemeToggle();
  mountTimeTracking(document);
  initSyncQueue();
  initRealtime();
}

initStorage().then(main).catch((err) => {
  console.error('[Kanvana] Failed to initialise storage for time tracking:', err);
  main();
});

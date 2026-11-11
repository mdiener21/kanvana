import { bootPage } from './page-boot.js';
import { mountTimeTracking } from './timetracking-ui.js';
import { migrateLegacyWorkWeek } from './timetracking-legacy-work-week.js';

bootPage().then(async () => {
  // Migrated first so the first render shows the moved Work week; a failure must not block the page.
  try {
    await migrateLegacyWorkWeek();
  } catch (err) {
    console.error('[Kanvana] Legacy Work week migration failed', err);
  }
  mountTimeTracking(document);
});

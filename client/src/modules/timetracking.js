import { bootPage } from './page-boot.js';
import { mountTimeTracking } from './timetracking-ui.js';
import { migrateLegacyWorkWeek } from './timetracking-legacy-work-week.js';

bootPage().then(() => {
  migrateLegacyWorkWeek();
  mountTimeTracking(document);
});

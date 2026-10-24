import { bootPage } from './page-boot.js';
import { mountTimeTracking } from './timetracking-ui.js';

bootPage().then(() => mountTimeTracking(document));

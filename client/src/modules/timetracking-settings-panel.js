import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { escapeHtml } from './security.js';
import {
  TT_DATE_FORMATS, loadTimeTrackingSettings, saveTimeTrackingSettings, activeProjectsOf
} from './timetracking-settings.js';
import { timeTrackingPrefs, formatDate, formatTime, formatDuration } from './timetracking-time.js';

const TIME_FORMAT_OPTIONS = [['24h', '24-hour'], ['12h', '12-hour']];
const DURATION_FORMAT_OPTIONS = [['h:mm', 'h:mm (7:30)'], ['decimal', 'Decimal (7.50 h)']];
const SAMPLE_DURATION_MS = 7.5 * 60 * 60 * 1000;

const SETTINGS = [
  { key: 'defaultCustomerId', id: 'tt-setting-customer', label: 'Default customer' },
  { key: 'defaultProjectId', id: 'tt-setting-project', label: 'Default project' },
  { key: 'dateFormat', id: 'tt-setting-date-format', label: 'Date format' },
  { key: 'timeFormat', id: 'tt-setting-time-format', label: 'Time format' },
  { key: 'timezone', id: 'tt-setting-timezone', label: 'Timezone' },
  { key: 'durationFormat', id: 'tt-setting-duration-format', label: 'Duration format' }
];

const PANEL_HTML = `
  <div class="tt-settings-panel">
    <h2 class="tt-section-title">Settings</h2>
    <div class="tt-settings-grid">
      ${SETTINGS.map(({ key, id, label }) => `
      <label class="tt-setting" for="${id}">
        <span class="tt-setting-label">${label}</span>
        <select id="${id}" class="tt-select" data-setting="${key}"></select>
      </label>`).join('')}
    </div>
    <dl class="tt-settings-preview" aria-label="Preview" aria-live="polite">
      <div><dt>Date</dt><dd data-testid="tt-preview-date"></dd></div>
      <div><dt>Time</dt><dd data-testid="tt-preview-time"></dd></div>
      <div><dt>Duration</dt><dd data-testid="tt-preview-duration"></dd></div>
    </dl>
  </div>
`;

const optionsHtml = (pairs) => pairs
  .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
  .join('');

function timezoneOptions(selected) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([selected, ...zones, 'UTC'])].sort().map((zone) => [zone, zone]);
}

function optionPairs(key, settings, tt) {
  switch (key) {
    case 'defaultCustomerId':
      return [['', 'None'], ...tt.customers.filter((c) => !c.archived).map((c) => [c.id, c.name])];
    case 'defaultProjectId':
      return [['', 'None'], ...(settings.defaultCustomerId
        ? activeProjectsOf(tt, settings.defaultCustomerId).map((p) => [p.id, p.name])
        : [])];
    case 'dateFormat': return TT_DATE_FORMATS.map((f) => [f, f]);
    case 'timeFormat': return TIME_FORMAT_OPTIONS;
    case 'timezone': return timezoneOptions(settings.timezone);
    default: return DURATION_FORMAT_OPTIONS;
  }
}

export function mountSettingsPanel(container) {
  container.innerHTML = PANEL_HTML;
  const selects = Object.fromEntries(
    [...container.querySelectorAll('[data-setting]')].map((select) => [select.dataset.setting, select])
  );
  const previewOf = (name) => container.querySelector(`[data-testid="tt-preview-${name}"]`);

  function refresh() {
    const settings = loadTimeTrackingSettings();
    const tt = loadTimeTracking();
    for (const { key } of SETTINGS) {
      const select = selects[key];
      select.innerHTML = optionsHtml(optionPairs(key, settings, tt));
      select.value = settings[key] ?? '';
    }
    selects.defaultProjectId.disabled = !settings.defaultCustomerId;

    const prefs = timeTrackingPrefs(settings);
    previewOf('date').textContent = formatDate(prefs.now, prefs);
    previewOf('time').textContent = formatTime(prefs.now, prefs);
    previewOf('duration').textContent = formatDuration(SAMPLE_DURATION_MS, prefs.durationFormat);
  }

  container.addEventListener('change', (ev) => {
    const key = ev.target.dataset?.setting;
    if (!key) return;
    saveTimeTrackingSettings({ [key]: ev.target.value || null });
    refresh();
  });

  refresh();
  on(DATA_CHANGED, refresh);
  return () => off(DATA_CHANGED, refresh);
}

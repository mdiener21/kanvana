import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { escapeHtml } from './security.js';
import { loadTimeTrackingSettings, saveTimeTrackingSettings, activeProjectsOf } from './timetracking-settings.js';
import {
  DATE_FORMATS, TIME_FORMATS, DURATION_FORMATS, timeTrackingPrefs, formatDate, formatTime, formatDuration
} from './timetracking-time.js';

const SAMPLE_DURATION_MS = 7.5 * 60 * 60 * 1000;

function timezoneOptions(selected) {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([selected, ...zones, 'UTC'])].sort().map((zone) => [zone, zone]);
}

// Archived items are not offered, but a default that has since been archived stays
// selected and visible as such (the entry bar does not prefill it).
function defaultOptions(selectable, all, selectedId) {
  const selectedArchived = selectable.some((x) => x.id === selectedId) ? null : all.find((x) => x.id === selectedId);
  return [
    ['', 'None'],
    ...selectable.map((x) => [x.id, x.name]),
    ...(selectedArchived ? [[selectedArchived.id, `${selectedArchived.name} (archived)`]] : [])
  ];
}

const SETTINGS = [
  {
    key: 'defaultCustomerId', id: 'tt-setting-customer', label: 'Default customer',
    options: (settings, tt) => defaultOptions(
      tt.customers.filter((c) => !c.archived), tt.customers, settings.defaultCustomerId
    )
  },
  {
    key: 'defaultProjectId', id: 'tt-setting-project', label: 'Default project',
    options: (settings, tt) => defaultOptions(
      settings.defaultCustomerId ? activeProjectsOf(tt, settings.defaultCustomerId) : [],
      tt.projects.filter((p) => p.customerId === settings.defaultCustomerId),
      settings.defaultProjectId
    )
  },
  {
    key: 'dateFormat', id: 'tt-setting-date-format', label: 'Date format',
    options: () => Object.keys(DATE_FORMATS).map((format) => [format, format])
  },
  {
    key: 'timeFormat', id: 'tt-setting-time-format', label: 'Time format',
    options: () => Object.entries(TIME_FORMATS)
  },
  {
    key: 'timezone', id: 'tt-setting-timezone', label: 'Timezone',
    options: (settings) => timezoneOptions(settings.timezone)
  },
  {
    key: 'durationFormat', id: 'tt-setting-duration-format', label: 'Duration format',
    options: () => Object.entries(DURATION_FORMATS)
  }
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
      <label class="tt-setting" for="tt-setting-weekly-hours">
        <span class="tt-setting-label">Weekly hours (contract)</span>
        <input id="tt-setting-weekly-hours" class="tt-input tt-setting-number" type="number"
          inputmode="decimal" step="0.5" min="0" placeholder="Off" data-weekly-hours>
      </label>
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

export function mountSettingsPanel(container) {
  container.innerHTML = PANEL_HTML;
  const selects = Object.fromEntries(
    [...container.querySelectorAll('[data-setting]')].map((select) => [select.dataset.setting, select])
  );
  const weeklyHours = container.querySelector('[data-weekly-hours]');
  const previewOf = (name) => container.querySelector(`[data-testid="tt-preview-${name}"]`);

  function refresh() {
    const settings = loadTimeTrackingSettings();
    const tt = loadTimeTracking();
    for (const { key, options } of SETTINGS) {
      const select = selects[key];
      select.innerHTML = optionsHtml(options(settings, tt));
      select.value = settings[key] ?? '';
    }
    selects.defaultProjectId.disabled = !settings.defaultCustomerId;
    if (document.activeElement !== weeklyHours) weeklyHours.value = settings.weeklyHours ?? '';

    const prefs = timeTrackingPrefs(settings);
    previewOf('date').textContent = formatDate(prefs.now, prefs);
    previewOf('time').textContent = formatTime(prefs.now, prefs);
    previewOf('duration').textContent = formatDuration(SAMPLE_DURATION_MS, prefs.durationFormat);
  }

  function saveWeeklyHours() {
    const raw = weeklyHours.value.trim();
    const hours = Number(raw);
    // Unparseable typing also reads as '', which must not switch the feature off.
    if (raw === '' && !weeklyHours.validity.badInput) saveTimeTrackingSettings({ weeklyHours: null });
    else if (Number.isFinite(hours) && hours > 0) saveTimeTrackingSettings({ weeklyHours: hours });
    weeklyHours.value = loadTimeTrackingSettings().weeklyHours ?? '';
    refresh();
  }

  container.addEventListener('change', (ev) => {
    if (ev.target === weeklyHours) return saveWeeklyHours();
    const key = ev.target.dataset?.setting;
    if (!key) return;
    saveTimeTrackingSettings({ [key]: ev.target.value || null });
    refresh();
  });

  refresh();
  on(DATA_CHANGED, refresh);
  return () => off(DATA_CHANGED, refresh);
}

import { loadSettings, saveSettings } from './storage.js';
import { setupModalCloseHandlers } from './modals.js';
import { emit, DATA_CHANGED } from './events.js';

function uniq(values) {
  const out = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function buildLocaleOptions(currentLocale) {
  const browserLocale = (typeof navigator !== 'undefined' && typeof navigator.language === 'string')
    ? navigator.language
    : 'en-US';

  return uniq([
    currentLocale,
    browserLocale,
    'en-US',
    'en-GB',
    'de-DE',
    'fr-FR',
    'es-ES',
    'it-IT',
    'pt-BR',
    'ja-JP',
    'zh-CN'
  ]);
}

function showSettingsModal() {
  document.getElementById('settings-modal')?.classList.remove('hidden');
}

function hideSettingsModal() {
  document.getElementById('settings-modal')?.classList.add('hidden');
}

function applyAndRerender(next) {
  saveSettings(next);
  emit(DATA_CHANGED);
}

export function initializeSettingsUI() {
  const openBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('settings-close-btn');
  const backdrop = document.querySelector('#settings-modal .modal-backdrop');

  const showPriorityEl = document.getElementById('settings-show-priority');
  const showDueDateEl = document.getElementById('settings-show-due-date');
  const notificationDaysEl = document.getElementById('settings-notification-days');
  const countdownUrgentEl = document.getElementById('settings-countdown-urgent-threshold');
  const countdownWarningEl = document.getElementById('settings-countdown-warning-threshold');
  const showAgeEl = document.getElementById('settings-show-age');
  const showChangeDateEl = document.getElementById('settings-show-change-date');
  const localeEl = document.getElementById('settings-locale');
  const defaultPriorityEl = document.getElementById('settings-default-priority');

  if (!openBtn || !closeBtn || !showPriorityEl || !showDueDateEl || !notificationDaysEl || !countdownUrgentEl || !countdownWarningEl || !showAgeEl || !showChangeDateEl || !localeEl || !defaultPriorityEl) return;

  function syncFormFromSettings() {
    const settings = loadSettings();
    showPriorityEl.checked = settings.showPriority !== false;
    showDueDateEl.checked = settings.showDueDate !== false;
    showAgeEl.checked = settings.showAge !== false;
    showChangeDateEl.checked = settings.showChangeDate !== false;

    notificationDaysEl.value = String(Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3);
    countdownUrgentEl.value = String(Number.isFinite(settings.countdownUrgentThreshold) ? settings.countdownUrgentThreshold : 3);
    countdownWarningEl.value = String(Number.isFinite(settings.countdownWarningThreshold) ? settings.countdownWarningThreshold : 10);

    const options = buildLocaleOptions(settings.locale);
    localeEl.innerHTML = '';
    options.forEach((loc) => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      localeEl.appendChild(opt);
    });

    // Ensure selection is set even if user stored something unusual.
    localeEl.value = settings.locale;

    defaultPriorityEl.value = settings.defaultPriority || 'none';
  }

  openBtn.addEventListener('click', () => {
    syncFormFromSettings();
    showSettingsModal();
  });

  closeBtn.addEventListener('click', hideSettingsModal);
  setupModalCloseHandlers('settings-modal', hideSettingsModal);

  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('settings-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') hideSettingsModal();
  });

  showAgeEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, showAge: Boolean(showAgeEl.checked) });
  });

  showChangeDateEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, showChangeDate: Boolean(showChangeDateEl.checked) });
  });

  showPriorityEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, showPriority: Boolean(showPriorityEl.checked) });
  });

  showDueDateEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, showDueDate: Boolean(showDueDateEl.checked) });
  });

  notificationDaysEl.addEventListener('change', () => {
    const current = loadSettings();
    const raw = Number.parseInt(notificationDaysEl.value, 10);
    const notificationDays = Number.isFinite(raw) ? raw : 3;
    applyAndRerender({ ...current, notificationDays });
  });

  countdownUrgentEl.addEventListener('change', () => {
    const current = loadSettings();
    const raw = Number.parseInt(countdownUrgentEl.value, 10);
    const countdownUrgentThreshold = Number.isFinite(raw) && raw >= 1 ? raw : 3;
    applyAndRerender({ ...current, countdownUrgentThreshold });
  });

  countdownWarningEl.addEventListener('change', () => {
    const current = loadSettings();
    const raw = Number.parseInt(countdownWarningEl.value, 10);
    const urgentThreshold = current.countdownUrgentThreshold || 3;
    // Warning threshold must be >= urgent threshold
    const countdownWarningThreshold = Number.isFinite(raw) && raw >= urgentThreshold ? raw : 10;
    applyAndRerender({ ...current, countdownWarningThreshold });
  });

  localeEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, locale: localeEl.value });
  });

  defaultPriorityEl.addEventListener('change', () => {
    const current = loadSettings();
    applyAndRerender({ ...current, defaultPriority: defaultPriorityEl.value });
  });
}

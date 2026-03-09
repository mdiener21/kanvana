import { renderIcons } from './icons.js';

const STORAGE_KEY = 'kanban-theme';

function getPreferredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function updateThemeToggleButton(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  // Button text indicates the action (what will happen if you click it)
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const nextLabel = nextTheme === 'dark' ? 'Dark' : 'Light';
  const nextIcon = nextTheme === 'dark' ? 'moon' : 'sun';

  btn.setAttribute('aria-pressed', String(theme === 'dark'));

  const iconEl = btn.querySelector('[data-lucide]');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', nextIcon);
  }

  // Preserve the icon element, replace only the trailing text
  const existingTextNodes = Array.from(btn.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
  for (const n of existingTextNodes) n.remove();
  btn.appendChild(document.createTextNode(` ${nextLabel}`));

  // Re-render icons for the swapped icon
  renderIcons();
}

export function initializeThemeToggle() {
  const theme = getPreferredTheme();
  setTheme(theme);
  updateThemeToggleButton(theme);

  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    updateThemeToggleButton(next);
  });
}

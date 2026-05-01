import { initStorage, ensureBoardsInitialized, getActiveBoardId, getActiveBoardName, loadBoardEvents } from './storage.js';
import { renderIcons } from './icons.js';
import { initializeThemeToggle } from './theme.js';
import { formatActivityEvent } from './activity-log-ui.js';

async function init() {
  await initStorage();
  ensureBoardsInitialized();
  initializeThemeToggle();

  const boardName = getActiveBoardName() || 'Board';
  const badge = document.getElementById('activity-board-badge');
  if (badge) badge.textContent = boardName;

  const title = document.getElementById('activity-title');
  if (title) title.textContent = `Activity — ${boardName}`;

  renderActivityPage();
  renderIcons();
}

function renderActivityPage() {
  const container = document.getElementById('activity-list');
  if (!container) return;
  container.innerHTML = '';

  const boardId = getActiveBoardId();
  const events = loadBoardEvents(boardId);

  if (!events || events.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'activity-empty-state';
    empty.classList.add('activity-page-empty');
    empty.textContent = 'No board activity recorded yet.';
    container.appendChild(empty);
    return;
  }

  // Newest-first
  const sorted = [...events].sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));

  sorted.forEach(event => {
    const row = document.createElement('div');
    row.classList.add('activity-page-item');

    const ts = document.createElement('span');
    ts.classList.add('activity-timestamp');
    ts.textContent = new Date(event.at).toLocaleString();

    const msg = document.createElement('span');
    msg.classList.add('activity-message');
    msg.textContent = formatActivityEvent(event);

    row.appendChild(ts);
    row.appendChild(msg);
    container.appendChild(row);
  });
}

init();

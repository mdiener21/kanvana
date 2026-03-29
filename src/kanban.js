// Initialize icons early for initial HTML elements
import './modules/icons.js';

import { renderBoard, setBoardFilterQuery } from './modules/render.js';
import { initializeModalHandlers } from './modules/modals.js';
import { showEditModal } from './modules/modals.js';
import { importTasks } from './modules/importexport.js';
import { initializeThemeToggle } from './modules/theme.js';
import { initializeBoardsUI } from './modules/boards.js';
import { initializeSettingsUI } from './modules/settings.js';
import { initializeNotifications } from './modules/notifications.js';
import { ensureBoardsInitialized, setActiveBoardId } from './modules/storage.js';
import { initializeSwimLaneControls } from './modules/swimlanes.js';

// Add task button listeners
document.addEventListener('DOMContentLoaded', () => {
  // Deep-link support (e.g., from calendar.html): open a task modal by ID.
  const urlParams = new URLSearchParams(window.location.search);
  const openTaskId = (urlParams.get('openTaskId') || '').trim();
  const openTaskBoardId = (urlParams.get('openTaskBoardId') || '').trim();

  if (openTaskBoardId) {
    ensureBoardsInitialized();
    setActiveBoardId(openTaskBoardId);
  }

  const versionEl = document.getElementById('app-version');
  if (versionEl && typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) {
    versionEl.textContent = `v${__APP_VERSION__}`;
    versionEl.title = `Version ${__APP_VERSION__}`;
  }

  initializeThemeToggle();

  // Settings (per-board)
  initializeSettingsUI();
  initializeSwimLaneControls(() => renderBoard());

  // Board-level filter (labels, title, description)
  const boardSearchInput = document.getElementById('board-search-input');
  if (boardSearchInput) {
    boardSearchInput.addEventListener('input', () => {
      setBoardFilterQuery(boardSearchInput.value);
      renderBoard();
    });
  }

  // Boards (create/select + restore last active)
  initializeBoardsUI();

  // Initialize modal handlers
  initializeModalHandlers();

  // Initialize notifications
  initializeNotifications();

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importTasks(file);
    }
    e.target.value = '';
  });

  // Mobile Menu Logic
  const menuBtn = document.getElementById('desktop-menu-btn');
  const controlsActions = document.getElementById('board-controls-menu');

  if (menuBtn && controlsActions) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = menuBtn.getAttribute('aria-expanded') === 'true';
      
      // Toggle menu
      controlsActions.classList.toggle('show');
      menuBtn.setAttribute('aria-expanded', String(!isExpanded));
      
      // Close other menus if open (optional, but good practice)
      document.querySelectorAll('.column-menu').forEach(m => m.classList.add('hidden'));
    });

    // Close menu when clicking action buttons inside it.
    // Don't close for form controls like the board <select>, otherwise it's impossible to change selection.
    controlsActions.addEventListener('click', (e) => {
      const isFormControl = e.target.closest('select, option, input, textarea, label');
      if (isFormControl) return;
      const isAction = e.target.closest('button, a, [role="menuitem"]');
      if (!isAction) return;

      controlsActions.classList.remove('show');
      menuBtn.setAttribute('aria-expanded', 'false');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!controlsActions.contains(e.target) && !menuBtn.contains(e.target)) {
        controlsActions.classList.remove('show');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Initial render
  renderBoard();

  if (openTaskId) {
    // Open after first render so the board is visible behind the modal.
    showEditModal(openTaskId);

    // Clean up the URL so refresh doesn't re-open.
    const nextUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }
});

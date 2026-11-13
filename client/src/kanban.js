// Initialize icons early for initial HTML elements
import './modules/icons.js';

import { renderBoard, setBoardFilterQuery } from './modules/render.js';
import { initializeModalHandlers } from './modules/modals.js';
import { showEditModal } from './modules/modals.js';
import { importTasks } from './modules/importexport.js';
import { initializeBoardsUI } from './modules/boards.js';
import { initializeSettingsUI } from './modules/settings.js';
import { initializeNotifications } from './modules/notifications.js';
import { ensureBoardsInitialized, setActiveBoardId } from './modules/storage.js';
import { bootPage } from './modules/page-boot.js';
import { initializeSwimLaneControls } from './modules/swimlanes.js';

// Add task button listeners
document.addEventListener('DOMContentLoaded', async () => {
  // Wired before initStorage(): these controls are static markup in index.html, and
  // anything awaited below leaves a window where the button is on screen but dead to
  // clicks. The search listener stays below — it calls renderBoard().
  const boardSearchInput = document.getElementById('board-search-input');

  // Mobile Menu Logic
  const menuBtn = document.getElementById('desktop-menu-btn');
  const controlsActions = document.getElementById('board-controls-menu');
  const controls = document.querySelector('.controls');
  const mobileMenuCloseBtn = document.getElementById('mobile-menu-close-btn');

  // Phone header: search and sync/session live behind icon buttons and drop in below the
  // header (responsive.css). On wider screens both sit inline and the buttons are hidden.
  const searchQuickBtn = document.getElementById('search-quick-btn');
  const syncQuickBtn = document.getElementById('sync-quick-btn');
  const setHeaderPanel = (name, open) => {
    controls?.classList.toggle(`${name}-open`, open);
    (name === 'search' ? searchQuickBtn : syncQuickBtn)?.setAttribute('aria-expanded', String(open));
  };
  const closeHeaderPanels = () => {
    setHeaderPanel('search', false);
    setHeaderPanel('session', false);
  };

  searchQuickBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !controls?.classList.contains('search-open');
    setHeaderPanel('session', false);
    setHeaderPanel('search', open);
    if (open) boardSearchInput?.focus();
  });

  syncQuickBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setHeaderPanel('search', false);
    // Signed out with a reachable backend: go straight to sign-in. Otherwise show the
    // session panel (signed-in user + sign out, or the disabled button explaining why).
    const loginBtn = document.getElementById('login-btn');
    const signedOut = document.getElementById('user-info')?.classList.contains('hidden');
    if (signedOut && loginBtn && !loginBtn.disabled) {
      setHeaderPanel('session', false);
      loginBtn.click();
      return;
    }
    setHeaderPanel('session', !controls?.classList.contains('session-open'));
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.board-search, .session-status, #search-quick-btn, #sync-quick-btn')) {
      closeHeaderPanels();
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => setHeaderPanel('session', false));

  if (menuBtn && controlsActions) {
    const closeMenu = () => {
      controlsActions.classList.remove('show');
      menuBtn.setAttribute('aria-expanded', 'false');
      controls?.classList.remove('mobile-menu-open');
      document.body.classList.remove('mobile-menu-open');
    };

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = menuBtn.getAttribute('aria-expanded') === 'true';
      
      // Toggle menu
      controlsActions.classList.toggle('show');
      menuBtn.setAttribute('aria-expanded', String(!isExpanded));
      controls?.classList.toggle('mobile-menu-open', !isExpanded);
      document.body.classList.toggle('mobile-menu-open', !isExpanded);
      
      // Close other menus if open (optional, but good practice)
      document.querySelectorAll('.column-menu').forEach(m => m.classList.add('hidden'));
      closeHeaderPanels();
    });

    // Close menu when clicking action buttons inside it.
    // Don't close for form controls like the board <select>, otherwise it's impossible to change selection.
    controlsActions.addEventListener('click', (e) => {
      const isFormControl = e.target.closest('select, option, input, textarea, label');
      if (isFormControl) return;
      const isAction = e.target.closest('button, a, [role="menuitem"]');
      if (!isAction) return;

      closeMenu();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!controlsActions.contains(e.target) && !menuBtn.contains(e.target)) {
        closeMenu();
      }
    });

    mobileMenuCloseBtn?.addEventListener('click', () => {
      closeMenu();
      menuBtn.focus();
    });

    boardSearchInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeMenu();
      if (controls?.classList.contains('search-open')) {
        setHeaderPanel('search', false);
        searchQuickBtn?.focus();
      } else {
        menuBtn.focus();
      }
    });
  }

  // Storage, theme, auth and sync are shared by every page; rendering waits for it.
  await bootPage({ mountAuthUi: true });

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

  // Settings (per-board)
  initializeSettingsUI();
  initializeSwimLaneControls(() => renderBoard());

  // Board-level filter (labels, title, description)
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

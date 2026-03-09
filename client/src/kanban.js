// Initialize icons early for initial HTML elements
import './modules/icons.js';

import { renderBoard, setBoardFilterQuery } from './modules/render.js';
import { initializeModalHandlers } from './modules/modals.js';
import { showEditModal } from './modules/modals.js';
import { exportTasks, importTasks } from './modules/importexport.js';
import { initializeThemeToggle } from './modules/theme.js';
import { initializeBoardsUI } from './modules/boards.js';
import { confirmDialog } from './modules/dialog.js';
import { initializeSettingsUI } from './modules/settings.js';
import { initializeNotifications } from './modules/notifications.js';
import { ensureBoardsInitialized, setActiveBoardId, listBoards, getBoardById, loadColumns, loadTasks, loadLabels, loadSettings, saveColumns, saveTasks, saveLabels, saveSettings, createBoard } from './modules/storage.js';
import { getPb, isAuthenticated, getUser, loginWithProvider, loginUser, registerUser, logoutUser, pushBoard, pullBoards } from './modules/sync.js';
import { setupModalCloseHandlers, hideLoginModal } from './modules/modals.js';

// Add task button listeners
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);

  // Deep-link support (e.g., from calendar.html): open a task modal by ID.
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

  // Auth UI
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');
  const userNameEl = document.getElementById('user-name');
  const syncBtn = document.getElementById('sync-btn');
  const logoutBtn = document.getElementById('logout-btn');

  async function updateAuthUI() {
    if (isAuthenticated()) {
      const user = getUser();
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      userNameEl.textContent = user.name || user.email;
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
    }
  }

  const loginModal = document.getElementById('login-modal');
  const providerBtns = document.querySelectorAll('.login-provider-btn');

  loginBtn.addEventListener('click', () => {
    loginModal.classList.remove('hidden');
  });

  setupModalCloseHandlers('login-modal', hideLoginModal);

  providerBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      try {
        await loginWithProvider(provider);
        hideLoginModal();
        updateAuthUI();
      } catch (err) {
        console.error('OAuth2 login failed', err);
      }
    });
  });

  // Tab switching
  const tabs = document.querySelectorAll('.login-tab');
  const panes = document.querySelectorAll('.login-pane');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-login-pane`).classList.remove('hidden');
    });
  });

  // Email Auth logic
  const emailLoginForm = document.getElementById('email-login-form');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const signupNameField = document.getElementById('signup-name-field');
  const emailAuthSubmit = document.getElementById('email-auth-submit');
  const authMessage = document.getElementById('auth-message');
  let isSignupMode = false;

  toggleAuthModeBtn.addEventListener('click', () => {
    isSignupMode = !isSignupMode;
    if (isSignupMode) {
      signupNameField.classList.remove('hidden');
      emailAuthSubmit.textContent = 'Sign Up';
      toggleAuthModeBtn.textContent = 'Already have an account? Log In';
    } else {
      signupNameField.classList.add('hidden');
      emailAuthSubmit.textContent = 'Log In';
      toggleAuthModeBtn.textContent = "Don't have an account? Sign Up";
    }
    authMessage.classList.add('hidden');
  });

  emailLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const name = document.getElementById('signup-name').value;

    authMessage.classList.remove('hidden');
    authMessage.textContent = isSignupMode ? 'Registering...' : 'Logging in...';
    authMessage.style.color = 'var(--text)';

    try {
      if (isSignupMode) {
        await registerUser(email, password, name);
        authMessage.textContent = 'Registration successful! You can now log in.';
        authMessage.style.color = 'green';
      } else {
        await loginUser(email, password);
        hideLoginModal();
        updateAuthUI();
        alert('Logged in successfully!');
      }
    } catch (err) {
      console.error('Auth error', err);
      authMessage.textContent = err.message || 'An error occurred during authentication.';
      authMessage.style.color = 'red';
    }
  });

  logoutBtn.addEventListener('click', () => {
    logoutUser();
    updateAuthUI();
  });

  syncBtn.addEventListener('click', async () => {
    try {
      syncBtn.disabled = true;
      syncBtn.classList.add('spinning');

      const ok = await confirmDialog({
        title: 'Sync Data',
        message: 'Push local data to cloud or Pull from cloud?',
        confirmText: 'Push to Cloud',
        cancelText: 'Pull from Cloud'
      });

      if (ok) {
        // PUSH all local boards to PocketBase
        const boards = listBoards();
        for (const b of boards) {
          const originalActiveBoard = localStorage.getItem('kanbanActiveBoardId');
          localStorage.setItem('kanbanActiveBoardId', b.id);

          const fullBoardData = {
            ...b,
            columns: loadColumns(),
            tasks: loadTasks(),
            labels: loadLabels(),
            settings: loadSettings()
          };

          localStorage.setItem('kanbanActiveBoardId', originalActiveBoard);
          await pushBoard(fullBoardData);
        }
        alert('Data pushed to cloud successfully!');
      } else {
        // PULL
        const remoteBoards = await pullBoards();
        if (!remoteBoards || remoteBoards.length === 0) {
          alert('No data found in cloud.');
          return;
        }

        const confirmPull = await confirmDialog({
          title: 'Confirm Pull',
          message: 'This will replace your local data with cloud data. Continue?',
          confirmText: 'Replace Local Data',
          cancelText: 'Cancel'
        });

        if (!confirmPull) return;

        // Register each pulled board
        const localBoards = [];
        for (const fullBoard of remoteBoards) {
          localBoards.push({ id: fullBoard.id, name: fullBoard.name, createdAt: fullBoard.createdAt });

          // Save board data
          localStorage.setItem(`kanbanBoard:${fullBoard.id}:columns`, JSON.stringify(fullBoard.columns));
          localStorage.setItem(`kanbanBoard:${fullBoard.id}:tasks`, JSON.stringify(fullBoard.tasks));
          localStorage.setItem(`kanbanBoard:${fullBoard.id}:labels`, JSON.stringify(fullBoard.labels));
          localStorage.setItem(`kanbanBoard:${fullBoard.id}:settings`, JSON.stringify(fullBoard.settings));
        }

        localStorage.setItem('kanbanBoards', JSON.stringify(localBoards));

        if (remoteBoards.length > 0) {
          setActiveBoardId(remoteBoards[0].id);
        }

        renderBoard();
        initializeBoardsUI(); // Refresh board selector
        alert('Data pulled from cloud successfully!');
      }
    } catch (err) {
      console.error('Sync failed', err);
      alert('Sync failed: ' + err.message);
    } finally {
      syncBtn.disabled = false;
      syncBtn.classList.remove('spinning');
    }
  });

  updateAuthUI();

  // Export button listener
  document.getElementById('export-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Export Board (Active Only)',
      message:
        'Export ONLY saves the current active board. It does NOT back up all boards.\n\nTo back up everything, export each board individually.\n\nContinue with export?',
      confirmText: 'Export'
    });
    if (!ok) return;
    exportTasks();
  });

  // Import button listener
  document.getElementById('import-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Import Board (New Board)',
      message:
        'Import will CREATE A NEW BOARD and switch to it. Your current active board will not be overwritten.\n\nContinue with import?',
      confirmText: 'Import'
    });
    if (!ok) return;
    document.getElementById('import-file').click();
  });

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

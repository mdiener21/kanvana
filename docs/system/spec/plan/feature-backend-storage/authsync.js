import { confirmDialog } from './dialog.js';
import { setupModalCloseHandlers, hideLoginModal } from './modals.js';
import { initializeBoardsUI } from './boards.js';
import { renderBoard } from './render.js';
import { listBoards, setActiveBoardId, loadColumns, loadTasks, loadLabels, loadSettings } from './storage.js';
import { enableAutoSync, isAutoSyncEnabled, scheduleAutoSync } from './autosync.js';
import {
  isAuthenticated,
  ensureAuthenticated,
  getUser,
  loginWithProvider,
  loginUser,
  registerUser,
  logoutUser,
  pushBoardFull,
  pullAllBoards,
} from './sync.js';

const ALLOWED_PROVIDERS = new Set(['google', 'apple', 'microsoftonline']);

function getTextError(err, fallback) {
  const msg = err?.message;
  if (typeof msg !== 'string' || !msg.trim()) return fallback;
  return msg.slice(0, 300);
}

export function initializeAuthSyncUI() {
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');
  const userNameEl = document.getElementById('user-name');
  const syncBtn = document.getElementById('sync-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const loginModal = document.getElementById('login-modal');
  const providerBtns = document.querySelectorAll('.login-provider-btn');

  const tabs = document.querySelectorAll('.login-tab');
  const panes = document.querySelectorAll('.login-pane');
  const emailLoginForm = document.getElementById('email-login-form');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const signupNameField = document.getElementById('signup-name-field');
  const emailAuthSubmit = document.getElementById('email-auth-submit');
  const authMessage = document.getElementById('auth-message');

  if (!loginBtn || !userInfo || !userNameEl || !syncBtn || !logoutBtn || !loginModal) {
    return;
  }

  let isSignupMode = false;

  function setAuthMessage(text, color = 'var(--text)') {
    if (!authMessage) return;
    authMessage.classList.remove('hidden');
    authMessage.style.color = color;
    authMessage.textContent = text;
  }

  function hideAuthMessage() {
    if (!authMessage) return;
    authMessage.classList.add('hidden');
    authMessage.textContent = '';
  }

  function activateLoginTab(tabName) {
    tabs.forEach((t) => t.classList.remove('active'));
    panes.forEach((p) => p.classList.add('hidden'));

    const activeTab = document.querySelector(`.login-tab[data-tab="${tabName}"]`);
    const activePane = document.getElementById(`${tabName}-login-pane`);
    if (activeTab) activeTab.classList.add('active');
    if (activePane) activePane.classList.remove('hidden');
  }

  function setEmailMode(signupMode) {
    isSignupMode = signupMode;
    if (signupNameField) signupNameField.classList.toggle('hidden', !signupMode);
    if (emailAuthSubmit) emailAuthSubmit.textContent = signupMode ? 'Sign Up' : 'Log In';
    if (toggleAuthModeBtn) {
      toggleAuthModeBtn.textContent = signupMode
        ? 'Already have an account? Log In'
        : "Don't have an account? Sign Up";
    }
    hideAuthMessage();
  }

  function openLoginModalEmail(message) {
    setEmailMode(false);
    activateLoginTab('email');
    if (message) setAuthMessage(message);
    loginModal.classList.remove('hidden');
  }

  async function updateAuthUI() {
    if (isAuthenticated()) {
      const user = getUser();
      loginBtn.classList.add('hidden');
      userInfo.classList.remove('hidden');
      userNameEl.textContent = user?.name || user?.email || 'User';
      if (isAutoSyncEnabled()) {
        syncBtn.classList.add('hidden');
      } else {
        syncBtn.classList.remove('hidden');
      }
    } else {
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
      syncBtn.classList.remove('hidden');
    }
  }

  loginBtn.addEventListener('click', () => {
    openLoginModalEmail();
  });

  setupModalCloseHandlers('login-modal', hideLoginModal);

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateLoginTab(tab.dataset.tab));
  });

  toggleAuthModeBtn?.addEventListener('click', () => {
    setEmailMode(!isSignupMode);
  });

  providerBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      if (!ALLOWED_PROVIDERS.has(provider)) {
        setAuthMessage('Unsupported OAuth provider.', 'red');
        return;
      }

      try {
        await loginWithProvider(provider);
        hideLoginModal();
        await updateAuthUI();
      } catch (err) {
        console.error('OAuth2 login failed', err);
        setAuthMessage(getTextError(err, 'Social login failed.'), 'red');
      }
    });
  });

  emailLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById('login-email');
    const passwordEl = document.getElementById('login-password');
    const nameEl = document.getElementById('signup-name');

    const email = (emailEl?.value || '').trim().toLowerCase();
    const password = passwordEl?.value || '';
    const name = (nameEl?.value || '').trim();

    setAuthMessage(isSignupMode ? 'Registering...' : 'Logging in...');

    try {
      if (isSignupMode) {
        await registerUser(email, password, name);
        setAuthMessage('Registration successful! You can now log in.', 'green');
      } else {
        await loginUser(email, password);
        if (passwordEl) passwordEl.value = '';
        hideLoginModal();
        await updateAuthUI();
        alert('Logged in successfully!');
      }
    } catch (err) {
      console.error('Auth error', err);
      setAuthMessage(getTextError(err, 'Authentication failed.'), 'red');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    logoutUser();
    await updateAuthUI();
  });

  syncBtn.addEventListener('click', async () => {
    const hasSession = isAuthenticated();
    const refreshed = await ensureAuthenticated();
    if (!hasSession && !refreshed) {
      await updateAuthUI();
      openLoginModalEmail('Session expired. Please log in with email/password to sync.');
      return;
    }

    try {
      syncBtn.disabled = true;
      syncBtn.classList.add('spinning');

      const ok = await confirmDialog({
        title: 'Sync Data',
        message: 'Push local data to cloud or Pull from cloud?',
        confirmText: 'Push to Cloud',
        cancelText: 'Pull from Cloud',
      });

      if (ok) {
        const boards = listBoards();
        const originalActiveBoard = localStorage.getItem('kanbanActiveBoardId');
        for (const b of boards) {
          localStorage.setItem('kanbanActiveBoardId', b.id);
          const columns = loadColumns();
          const tasks = loadTasks();
          const labels = loadLabels();
          const settings = loadSettings();
          localStorage.setItem('kanbanActiveBoardId', originalActiveBoard);
          await pushBoardFull(b, columns, tasks, labels, settings);
        }
        enableAutoSync();
        scheduleAutoSync();
        await updateAuthUI();
        alert('Data pushed to cloud successfully!');
      } else {
        const confirmPull = await confirmDialog({
          title: 'Confirm Pull',
          message: 'This will replace your local data with cloud data. Continue?',
          confirmText: 'Replace Local Data',
          cancelText: 'Cancel',
        });

        if (!confirmPull) return;

        const remoteBoards = await pullAllBoards();
        if (!remoteBoards || remoteBoards.length === 0) {
          alert('No data found in cloud.');
          return;
        }

        setActiveBoardId(remoteBoards[0].id);
        renderBoard();
        initializeBoardsUI();
        alert('Data pulled from cloud successfully!');
      }
    } catch (err) {
      console.error('Sync failed', err);
      alert(`Sync failed: ${getTextError(err, 'Unknown error')}`);
    } finally {
      syncBtn.disabled = false;
      syncBtn.classList.remove('spinning');
    }
  });

  window.addEventListener('auth-changed', () => {
    updateAuthUI();
  });

  updateAuthUI();
}

import { alertDialog, confirmDialog } from './dialog.js';
import { setupModalCloseHandlers, hideLoginModal } from './modals.js';
import { initializeBoardsUI } from './boards.js';
import { renderBoard } from './render.js';
import { listBoards } from './storage.js';
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

const PB_HEALTH_URL = '/api/health';
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

  if (!loginBtn || !userInfo || !userNameEl || !syncBtn || !logoutBtn || !loginModal) return;

  const providerBtns = document.querySelectorAll('.login-provider-btn');
  const tabs = document.querySelectorAll('.login-tab');
  const emailLoginForm = document.getElementById('email-login-form');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const signupNameField = document.getElementById('signup-name-field');
  const emailAuthSubmit = document.getElementById('email-auth-submit');
  const authMessage = document.getElementById('auth-message');

  let isSignupMode = false;

  // ── UI helpers ────────────────────────────────────────────────────────────

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
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-pane').forEach(p => p.classList.add('hidden'));
    document.querySelector(`.login-tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`${tabName}-login-pane`)?.classList.remove('hidden');
  }

  function setEmailMode(signupMode) {
    isSignupMode = signupMode;
    signupNameField?.classList.toggle('hidden', !signupMode);
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

  function updateAuthUI() {
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

  // ── Event handlers ────────────────────────────────────────────────────────

  loginBtn.addEventListener('click', () => openLoginModalEmail());

  setupModalCloseHandlers('login-modal', hideLoginModal);

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateLoginTab(tab.dataset.tab));
  });

  toggleAuthModeBtn?.addEventListener('click', () => setEmailMode(!isSignupMode));

  providerBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.provider;
      if (!ALLOWED_PROVIDERS.has(provider)) {
        setAuthMessage('Unsupported OAuth provider.', 'red');
        return;
      }
      try {
        await loginWithProvider(provider);
        hideLoginModal();
        updateAuthUI();
      } catch (err) {
        console.error('OAuth2 login failed', err);
        setAuthMessage(getTextError(err, 'Social login failed.'), 'red');
      }
    });
  });

  emailLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
    const password = document.getElementById('login-password')?.value || '';
    const name = (document.getElementById('signup-name')?.value || '').trim();

    setAuthMessage(isSignupMode ? 'Registering...' : 'Logging in...');

    try {
      if (isSignupMode) {
        await registerUser(email, password, name);
        setEmailMode(false);
        setAuthMessage('Check your email to confirm your account before logging in.');
      } else {
        await loginUser(email, password);
        document.getElementById('login-password').value = '';
        hideLoginModal();
        updateAuthUI();
      }
    } catch (err) {
      console.error('Auth error', err);
      setAuthMessage(getTextError(err, 'Authentication failed.'), 'red');
    }
  });

  logoutBtn.addEventListener('click', () => {
    logoutUser();
    updateAuthUI();
  });

  syncBtn.addEventListener('click', async () => {
    if (!(await ensureAuthenticated())) {
      updateAuthUI();
      openLoginModalEmail('Session expired. Please log in to sync.');
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
        for (const b of boards) {
          await pushBoardFull(b.id);
        }
        enableAutoSync();
        for (const b of boards) {
          scheduleAutoSync(b.id);
        }
        updateAuthUI();
        await alertDialog({ title: 'Sync complete', message: 'Data pushed to cloud.' });
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
          await alertDialog({ title: 'No data', message: 'No data found in cloud.' });
          return;
        }
        renderBoard();
        initializeBoardsUI();
        await alertDialog({ title: 'Sync complete', message: 'Data pulled from cloud.' });
      }
    } catch (err) {
      console.error('Sync failed', err);
      await alertDialog({ title: 'Sync failed', message: getTextError(err, 'Unknown error') });
    } finally {
      syncBtn.disabled = false;
      syncBtn.classList.remove('spinning');
    }
  });

  window.addEventListener('auth-changed', () => updateAuthUI());

  // ── PocketBase health probe ───────────────────────────────────────────────
  fetch(PB_HEALTH_URL, { signal: AbortSignal.timeout(3000) })
    .then(r => { if (!r.ok) throw new Error('unhealthy'); })
    .catch(() => {
      loginBtn.disabled = true;
      loginBtn.title = 'Backend unavailable';
      console.warn('[authsync] PocketBase unreachable at', PB_HEALTH_URL);
    });

  updateAuthUI();
}

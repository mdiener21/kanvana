import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────
// Manual sync (push/pull on a #sync-btn) was removed in #115 — the header now
// shows a read-only sync-state indicator and event sourcing drains automatically.
// authsync.js only owns auth UI + the PocketBase health probe.

vi.mock('../../src/modules/sync.js', () => ({
  isAuthenticated: vi.fn(() => false),
  getUser: vi.fn(() => null),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  loginWithProvider: vi.fn(),
}));

vi.mock('../../src/modules/dialog.js', () => ({
  alertDialog: vi.fn(async () => true),
}));

vi.mock('../../src/modules/modals.js', () => ({
  setupModalCloseHandlers: vi.fn(),
  hideLoginModal: vi.fn(),
}));

import { initializeAuthSyncUI } from '../../src/modules/authsync.js';
import { isAuthenticated, getUser } from '../../src/modules/sync.js';

// ── HTML fixtures ──────────────────────────────────────────────────────────────

const AUTH_HTML = `
  <button id="login-btn" type="button">Go Online</button>
  <div id="user-info" class="user-info hidden">
    <span id="user-name"></span>
    <button id="logout-btn" type="button">Logout</button>
  </div>
  <span id="sync-indicator" class="sync-indicator sync-indicator--offline">Offline</span>
  <div id="login-modal" class="hidden">
    <div class="modal-backdrop"></div>
    <div class="login-tabs">
      <button class="login-tab active" data-tab="email">Email</button>
      <button class="login-tab" data-tab="social">Social</button>
    </div>
    <div id="email-login-pane" class="login-pane"></div>
    <div id="social-login-pane" class="login-pane hidden"></div>
    <form id="email-login-form">
      <input id="login-email" type="email">
      <input id="login-password" type="password">
      <div id="signup-name-field" class="hidden">
        <input id="signup-name" type="text">
      </div>
      <button id="email-auth-submit" type="submit">Log In</button>
      <button id="toggle-auth-mode" type="button">Sign Up</button>
    </form>
    <div class="social-providers">
      <button class="login-provider-btn" data-provider="google" type="button">Google</button>
    </div>
    <div id="auth-message" class="auth-message hidden"></div>
  </div>
`;

beforeEach(() => {
  document.body.innerHTML = AUTH_HTML;
  localStorage.clear();
  vi.clearAllMocks();
  // Restore sane defaults after clearAllMocks
  isAuthenticated.mockReturnValue(false);
  getUser.mockReturnValue(null);
  // Suppress fetch errors in tests that don't set it up
  global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// ── Slice 1: init guard ────────────────────────────────────────────────────────

describe('initializeAuthSyncUI', () => {
  it('returns without error when required DOM elements are missing', () => {
    document.body.innerHTML = '';
    expect(() => initializeAuthSyncUI()).not.toThrow();
  });

  it('sets up handlers when all required elements present', () => {
    expect(() => initializeAuthSyncUI()).not.toThrow();
  });
});

// ── Slice 2: health probe ─────────────────────────────────────────────────────

describe('health probe', () => {
  it('disables login-btn when PocketBase is unreachable', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    initializeAuthSyncUI();
    await new Promise(r => setTimeout(r, 0)); // flush full fetch promise chain
    const loginBtn = document.getElementById('login-btn');
    expect(loginBtn.disabled).toBe(true);
    expect(loginBtn.title).toBe('Backend unavailable');
  });

  it('leaves login-btn enabled when PocketBase responds ok', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
    initializeAuthSyncUI();
    await Promise.resolve();
    const loginBtn = document.getElementById('login-btn');
    expect(loginBtn.disabled).toBe(false);
  });
});

// ── Slice 3: updateAuthUI ─────────────────────────────────────────────────────

describe('auth UI state', () => {
  it('shows login-btn and hides user-info when not authenticated', () => {
    isAuthenticated.mockReturnValue(false);
    initializeAuthSyncUI();
    expect(document.getElementById('login-btn').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('user-info').classList.contains('hidden')).toBe(true);
  });

  it('hides login-btn and shows user-info when authenticated', () => {
    isAuthenticated.mockReturnValue(true);
    getUser.mockReturnValue({ name: 'Alice', email: 'alice@example.com' });
    initializeAuthSyncUI();
    expect(document.getElementById('login-btn').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('user-info').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('user-name').textContent).toBe('Alice');
  });
});

// ── Slice 4: registration message ────────────────────────────────────────────

describe('register flow', () => {
  it('shows confirm-email message after successful registration', async () => {
    const { registerUser } = await import('../../src/modules/sync.js');
    registerUser.mockResolvedValueOnce({ id: 'u1' });

    initializeAuthSyncUI();

    // Switch to signup mode then submit
    document.getElementById('toggle-auth-mode').click();
    document.getElementById('login-email').value = 'user@example.com';
    document.getElementById('login-password').value = 'pass123';
    document.getElementById('email-login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 10));

    const msg = document.getElementById('auth-message');
    expect(msg.classList.contains('hidden')).toBe(false);
    expect(msg.textContent).toContain('email');
  });

  it('does not call loginUser after registerUser', async () => {
    const { registerUser, loginUser: lu } = await import('../../src/modules/sync.js');
    registerUser.mockResolvedValueOnce({ id: 'u1' });

    initializeAuthSyncUI();
    document.getElementById('toggle-auth-mode').click();
    document.getElementById('login-email').value = 'user@example.com';
    document.getElementById('login-password').value = 'pass123';
    document.getElementById('email-login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 0));
    expect(lu).not.toHaveBeenCalled();
  });
});

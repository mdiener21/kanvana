import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeHeaderPanels } from '../../src/modules/header-panels.js';
import { getPb } from '../../src/modules/sync.js';

const HEADER_HTML = `
  <div class="controls">
    <div class="board-search"><input id="board-search-input" type="search"></div>
    <div class="session-status">
      <button id="login-btn" type="button">Go Online</button>
      <div id="user-info" class="user-info hidden">
        <button id="logout-btn" type="button">Sign out</button>
      </div>
      <span id="sync-indicator" class="sync-indicator sync-indicator--offline">Offline</span>
    </div>
    <button id="search-quick-btn" type="button" aria-expanded="false">Search</button>
    <button id="sync-quick-btn" type="button" aria-expanded="false">Sync</button>
  </div>
  <main id="board"></main>
`;

const USER = { id: 'useraaaaaaaaaaa', email: 'a@e.st', name: 'User A' };

function jwt() {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: USER.id, type: 'auth', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const controls = () => document.querySelector('.controls');
const button = (id) => document.getElementById(id);
// MutationObserver callbacks run as microtasks.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setSyncState(cls, text) {
  const indicator = document.getElementById('sync-indicator');
  indicator.className = `sync-indicator sync-indicator--${cls}`;
  indicator.textContent = text;
}
const click = (id) => document.getElementById(id).click();

describe('initializeHeaderPanels', () => {
  beforeEach(() => {
    document.body.innerHTML = HEADER_HTML;
    initializeHeaderPanels();
  });

  afterEach(() => {
    getPb().authStore.clear();
  });

  it('closes the open session panel when the user signs out', () => {
    getPb().authStore.save(jwt(), USER);
    click('sync-quick-btn');
    expect(controls().classList.contains('session-open')).toBe(true);
    expect(document.getElementById('sync-quick-btn').getAttribute('aria-expanded')).toBe('true');

    getPb().authStore.clear();

    expect(controls().classList.contains('session-open')).toBe(false);
    expect(document.getElementById('sync-quick-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens sign-in instead of the session panel when signed out', () => {
    let signInOpened = false;
    document.getElementById('login-btn').addEventListener('click', () => { signInOpened = true; });

    click('sync-quick-btn');

    expect(signInOpened).toBe(true);
    expect(controls().classList.contains('session-open')).toBe(false);
  });

  it('opens one panel at a time and closes both on a click elsewhere', () => {
    getPb().authStore.save(jwt(), USER);
    click('search-quick-btn');
    expect(controls().classList.contains('search-open')).toBe(true);

    click('sync-quick-btn');
    expect(controls().classList.contains('search-open')).toBe(false);
    expect(document.getElementById('search-quick-btn').getAttribute('aria-expanded')).toBe('false');
    expect(controls().classList.contains('session-open')).toBe(true);

    document.getElementById('board').click();
    expect(controls().classList.contains('session-open')).toBe(false);
  });

  describe('accessible names', () => {
    it('names the cloud button after the sync state, as a sign-in action while signed out', async () => {
      expect(button('sync-quick-btn').getAttribute('aria-label')).toBe('Sign in to sync, Offline');

      getPb().authStore.save(jwt(), USER);
      setSyncState('syncing', 'Syncing… (3)');
      await settle();
      expect(button('sync-quick-btn').getAttribute('aria-label')).toBe('Sync session, Syncing… (3)');

      setSyncState('unsynced', '⚠ 2 unsynced');
      await settle();
      expect(button('sync-quick-btn').getAttribute('aria-label')).toBe('Sync session, 2 unsynced');

      setSyncState('live', 'Live ●');
      await settle();
      expect(button('sync-quick-btn').getAttribute('aria-label')).toBe('Sync session, Live');
    });

    it('marks the cloud button as opening a dialog only while it opens sign-in', async () => {
      const cloud = button('sync-quick-btn');
      expect(cloud.getAttribute('aria-haspopup')).toBe('dialog');

      getPb().authStore.save(jwt(), USER);
      await settle();
      expect(cloud.hasAttribute('aria-haspopup')).toBe(false);

      getPb().authStore.clear();
      button('login-btn').disabled = true; // backend unreachable: the panel explains why
      await settle();
      expect(cloud.hasAttribute('aria-haspopup')).toBe(false);
      expect(cloud.getAttribute('aria-label')).toBe('Sync session, Offline');
    });

    it('says on the search button when a filter is still applied', () => {
      const input = document.getElementById('board-search-input');
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks');

      input.value = 'Soul Stone';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks, filter applied');

      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks');
    });
  });
});

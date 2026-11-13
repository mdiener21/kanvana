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
});

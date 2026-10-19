// #216 AC-004: the legacy `boards` collection is read-only. Creating, renaming
// and deleting a board must still sync to another device (through events), and
// nothing in the app may error on the locked `boards` collection.
//
// Needs a live PocketBase with the #216 migration applied. SKIPS itself when
// PB is unreachable (see playwright.live.config.js).

import { test, expect, type Page, type Browser } from '@playwright/test';

const PB_URL = process.env.PB_PROXY_TARGET || process.env.VITE_PB_URL || 'http://localhost:8090';
const PASSWORD = 'boards-locked-pw-123';

async function isPbHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${PB_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function registerAccount(email: string): Promise<void> {
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, passwordConfirm: PASSWORD, name: 'Boards locked' }),
  });
  if (!res.ok) throw new Error(`PB user registration failed (${res.status}): ${await res.text()}`);
}

// Records every console error and failed request that mentions the boards collection.
function watchBoardsErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /boards/i.test(msg.text())) problems.push(`console: ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/collections/boards') && res.status() >= 400) {
      problems.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
    }
  });
  return problems;
}

async function bootAndLogin(browser: Browser, email: string): Promise<{ page: Page; problems: string[] }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = watchBoardsErrors(page);
  await page.goto('/');
  await expect(page.locator('#board-container')).toBeVisible();

  await page.locator('#login-btn').click();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('#email-auth-submit').click();
  await expect(page.locator('#login-btn')).toBeHidden();
  return { page, problems };
}

function boardRow(page: Page, name: string) {
  return page.locator('#boards-list .label-item').filter({ has: page.locator('.board-name-wrap span', { hasText: name }) });
}

let pbReachable = false;

test.beforeAll(async () => {
  pbReachable = await isPbHealthy();
});

test('boards created, renamed and deleted still sync with the boards collection locked', async ({ browser }) => {
  test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL} — start a PocketBase to run this spec.`);

  const email = `boards-locked-${Date.now()}@example.test`;
  await registerAccount(email);
  const a = await bootAndLogin(browser, email);
  const b = await bootAndLogin(browser, email);
  const selectB = b.page.locator('#board-select');

  // Create
  await a.page.evaluate(() => document.dispatchEvent(new Event('kanban:open-board-create')));
  await a.page.locator('#board-create-name').fill('Locked probe');
  await a.page.locator('#board-create-form button[type=submit]').click();
  await expect(selectB.locator('option', { hasText: 'Locked probe' })).toHaveCount(1, { timeout: 5000 });

  // Rename
  await a.page.locator('#brand-text').click();
  await boardRow(a.page, 'Locked probe').getByTitle('Rename board').click();
  await a.page.locator('#board-rename-name').fill('Locked renamed');
  await a.page.locator('#board-rename-submit-btn').click();
  await expect(selectB.locator('option', { hasText: 'Locked renamed' })).toHaveCount(1, { timeout: 5000 });

  // Delete
  await boardRow(a.page, 'Locked renamed').getByTitle('Delete board').click();
  await a.page.locator('#dialog-confirm-btn').click();
  await expect(selectB.locator('option', { hasText: 'Locked renamed' })).toHaveCount(0, { timeout: 5000 });

  expect(a.problems).toEqual([]);
  expect(b.problems).toEqual([]);

  await a.page.context().close();
  await b.page.context().close();
});

// AC-009 — realtime multi-device convergence against a LIVE PocketBase
// (PRD §9.2 #2: a change on one device reaches another logged into the same
// account within ~3s, no user action). Two browser contexts = two "devices".
//
// Unblocked by gaps A/B: the default ("first-run") board now has a well-known
// stable id + deterministic column/label ids (storage.js), so both contexts
// land on the SAME board with matching columns without any board-sharing dance.
//
// This spec needs the Docker PB stack up (pb :8090 behind nginx). It SKIPS
// itself when PB is unreachable so CI without the stack stays green. Bring the
// stack up + point the app at it via client/.env.local VITE_PB_URL.

import { test, expect, type Page, type Browser } from '@playwright/test';

const PB_URL = process.env.VITE_PB_URL || 'http://localhost:8090';
const PASSWORD = 'convergence-pw-123';

async function isPbHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${PB_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Register a fresh account straight through the PB API — no email verification
// required for password auth, so the UI login works immediately afterward.
async function registerAccount(email: string): Promise<void> {
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, passwordConfirm: PASSWORD, name: 'Convergence' }),
  });
  if (!res.ok) {
    throw new Error(`PB user registration failed (${res.status}): ${await res.text()}`);
  }
}

async function bootAndLogin(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#board-container')).toBeVisible();

  await page.locator('#login-btn').click();
  await expect(page.locator('#login-modal')).toBeVisible();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('#email-auth-submit').click();

  // Login complete: the sign-in button is replaced by the user info block,
  // and realtime SSE + catch-up have been kicked off (auth-changed handler).
  await expect(page.locator('#login-btn')).toBeHidden();
  return page;
}

function columnLocator(page: Page, columnName: string) {
  return page
    .locator('article.task-column')
    .filter({ has: page.locator('h2', { hasText: columnName }) });
}

let pbReachable = false;

test.beforeAll(async () => {
  pbReachable = await isPbHealthy();
});

test.describe('AC-009 two-context realtime convergence (live PocketBase)', () => {
  test.describe.configure({ mode: 'serial' });

  test('a task created and moved on device A appears on device B within ~3s', async ({ browser }) => {
    test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL} — start the Docker stack to run this spec.`);

    const email = `conv-${Date.now()}@example.test`;
    await registerAccount(email);

    // Device B logs in FIRST so its SSE subscription is live before A emits,
    // proving realtime push (not just catch-up on next load).
    const deviceB = await bootAndLogin(browser, email);
    const deviceA = await bootAndLogin(browser, email);

    const probe = `Convergence probe ${Date.now()}`;
    const taskName = new RegExp(`Task: ${probe}`, 'i');

    // ── Device A: create a task in To Do ────────────────────────────────────
    await deviceA.getByRole('button', { name: 'Add task to To Do' }).click();
    const modalA = deviceA.locator('#task-modal');
    await expect(modalA).toBeVisible();
    await modalA.locator('#task-title').fill(probe);
    await deviceA.locator('#task-submit-btn').click();
    await expect(modalA).toBeHidden();
    await expect(deviceA.getByRole('listitem', { name: taskName })).toBeVisible();

    // ── Device B: sees the new task via SSE, no reload ──────────────────────
    await expect(columnLocator(deviceB, 'To Do').getByRole('listitem', { name: taskName }))
      .toBeVisible({ timeout: 5000 });

    // ── Device A: move the task To Do → In Progress (emits task.moved) ───────
    await deviceA.getByRole('listitem', { name: taskName }).click();
    await expect(modalA).toBeVisible();
    await modalA.locator('#task-column').selectOption({ label: 'In Progress' });
    await deviceA.locator('#task-submit-btn').click();
    await expect(modalA).toBeHidden();

    // ── Device B: reflects the move within ~3s ──────────────────────────────
    await expect(columnLocator(deviceB, 'In Progress').getByRole('listitem', { name: taskName }))
      .toBeVisible({ timeout: 5000 });
    await expect(columnLocator(deviceB, 'To Do').getByRole('listitem', { name: taskName }))
      .toHaveCount(0);

    await deviceA.context().close();
    await deviceB.context().close();
  });
});

// #165 — customers/projects created on one device appear on a second signed-in
// device, against a LIVE PocketBase. Skips when PB is unreachable.

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

async function registerAccount(email: string): Promise<void> {
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, passwordConfirm: PASSWORD, name: 'TT Convergence' }),
  });
  if (!res.ok) throw new Error(`PB user registration failed (${res.status}): ${await res.text()}`);
}

async function loginAndOpenTimeTracking(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.locator('#login-btn').click();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('#email-auth-submit').click();
  await expect(page.locator('#login-btn')).toBeHidden();

  await page.goto('/timetracking.html');
  await expect(page.locator('#tt-new-customer-input')).toBeVisible();
  return page;
}

let pbReachable = false;
test.beforeAll(async () => { pbReachable = await isPbHealthy(); });

test.describe('#165 time-tracking convergence (live PocketBase)', () => {
  test.describe.configure({ mode: 'serial' });

  test('a customer and project created on device A appear on device B', async ({ browser }) => {
    test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL}`);

    const email = `tt-${Date.now()}@example.test`;
    await registerAccount(email);

    const deviceB = await loginAndOpenTimeTracking(browser, email);
    const deviceA = await loginAndOpenTimeTracking(browser, email);

    const customer = `Acme ${Date.now()}`;
    const project = `Website ${Date.now()}`;

    await deviceA.locator('#tt-new-customer-input').fill(customer);
    await deviceA.locator('#tt-add-customer-btn').click();
    await expect(deviceA.locator('.tt-customer-name', { hasText: customer })).toBeVisible();

    await deviceA.locator('#tt-customer-select').selectOption({ label: customer });
    await deviceA.locator('#tt-new-project-input').fill(project);
    await deviceA.locator('#tt-add-project-btn').click();
    await expect(deviceA.locator('.tt-project-name', { hasText: project })).toBeVisible();

    await expect(deviceB.locator('.tt-customer-name', { hasText: customer })).toBeVisible({ timeout: 5000 });
    await expect(deviceB.locator('.tt-project-name', { hasText: project })).toBeVisible({ timeout: 5000 });

    const deviceC = await loginAndOpenTimeTracking(browser, email);
    await expect(deviceC.locator('.tt-customer-name', { hasText: customer })).toBeVisible({ timeout: 5000 });
    await expect(deviceC.locator('.tt-project-name', { hasText: project })).toBeVisible({ timeout: 5000 });

    for (const p of [deviceA, deviceB, deviceC]) await p.context().close();
  });
});

// #165 / #166 / #167 — time-tracking events from one device converge on other
// signed-in devices, against a LIVE PocketBase. Skips when PB is unreachable.

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
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
  return page;
}

async function openProjects(page: Page): Promise<void> {
  await page.locator('#tt-nav-projects').click();
  await expect(page.locator('#tt-new-customer-input')).toBeVisible();
}

async function createCustomerAndProject(page: Page, customer: string, project: string): Promise<void> {
  await openProjects(page);
  await page.locator('#tt-new-customer-input').fill(customer);
  await page.locator('#tt-add-customer-btn').click();
  await expect(page.locator('.tt-customer-name', { hasText: customer })).toBeVisible();
  await page.locator('#tt-customer-select').selectOption({ label: customer });
  await page.locator('#tt-new-project-input').fill(project);
  await page.locator('#tt-add-project-btn').click();
  await expect(page.locator('.tt-project-name', { hasText: project })).toBeVisible();
}

async function listUserEvents(email: string, filter: string): Promise<Array<Record<string, unknown>>> {
  const auth = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: PASSWORD }),
  });
  const { token } = await auth.json();
  const res = await fetch(`${PB_URL}/api/collections/events/records?filter=${encodeURIComponent(filter)}`, {
    headers: { Authorization: token },
  });
  return (await res.json()).items;
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
    await openProjects(deviceB);

    const customer = `Acme ${Date.now()}`;
    const project = `Website ${Date.now()}`;

    await createCustomerAndProject(deviceA, customer, project);

    await expect(deviceB.locator('.tt-customer-name', { hasText: customer })).toBeVisible({ timeout: 5000 });
    await expect(deviceB.locator('.tt-project-name', { hasText: project })).toBeVisible({ timeout: 5000 });

    const deviceC = await loginAndOpenTimeTracking(browser, email);
    await openProjects(deviceC);
    await expect(deviceC.locator('.tt-customer-name', { hasText: customer })).toBeVisible({ timeout: 5000 });
    await expect(deviceC.locator('.tt-project-name', { hasText: project })).toBeVisible({ timeout: 5000 });

    for (const p of [deviceA, deviceB, deviceC]) await p.context().close();
  });

  test('#166 a time entry logged on device A appears on device B and syncs as time_entry.created', async ({ browser }) => {
    test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL}`);

    const email = `tt-entry-${Date.now()}@example.test`;
    await registerAccount(email);

    const deviceB = await loginAndOpenTimeTracking(browser, email);
    const deviceA = await loginAndOpenTimeTracking(browser, email);

    const customer = `Acme ${Date.now()}`;
    const project = `Website ${Date.now()}`;
    const description = `Standup ${Date.now()}`;
    await createCustomerAndProject(deviceA, customer, project);

    await deviceA.keyboard.press('Escape');
    await deviceA.keyboard.press('n');
    await expect(deviceA.getByLabel('Description', { exact: true })).toBeFocused();
    await deviceA.keyboard.type(description);
    await deviceA.getByLabel('Project', { exact: true }).fill(`${customer} / ${project}`);
    await deviceA.getByLabel('Duration', { exact: true }).fill('1h30');
    await deviceA.keyboard.press('Enter');
    await expect(deviceA.getByRole('list', { name: 'Today' }).getByText(description)).toBeVisible();

    const rowOnB = deviceB.locator('.tt-entry-row', { hasText: description });
    await expect(rowOnB).toBeVisible({ timeout: 5000 });
    await expect(rowOnB.locator('.tt-entry-project')).toHaveText(project);
    await expect(rowOnB.locator('.tt-entry-duration')).toHaveText('1:30');

    const deviceC = await loginAndOpenTimeTracking(browser, email);
    await expect(deviceC.locator('.tt-entry-row', { hasText: description })).toBeVisible({ timeout: 5000 });

    const events = await listUserEvents(email, "event_type='time_entry.created'");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scope: 'timetracking', board: '' });
    expect((events[0].payload as { timeEntry: { description: string } }).timeEntry.description).toBe(description);

    for (const p of [deviceA, deviceB, deviceC]) await p.context().close();
  });

  test('#167 edits and deletes on device A converge on device B', async ({ browser }) => {
    test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL}`);

    const email = `tt-edit-${Date.now()}@example.test`;
    await registerAccount(email);

    const deviceB = await loginAndOpenTimeTracking(browser, email);
    const deviceA = await loginAndOpenTimeTracking(browser, email);

    const customer = `Acme ${Date.now()}`;
    const project = `Website ${Date.now()}`;
    const keep = `Keep ${Date.now()}`;
    const drop = `Drop ${Date.now()}`;
    await createCustomerAndProject(deviceA, customer, project);
    await deviceA.keyboard.press('Escape');

    for (const [description, start] of [[keep, '9:00'], [drop, '10:00']]) {
      await deviceA.keyboard.press('n');
      await deviceA.keyboard.type(description);
      await deviceA.getByLabel('Project', { exact: true }).fill(`${customer} / ${project}`);
      await deviceA.getByLabel('Start', { exact: true }).fill(start);
      await deviceA.keyboard.press('Tab');
      await deviceA.getByLabel('Duration', { exact: true }).fill('1h');
      await deviceA.keyboard.press('Enter');
      await expect(deviceA.locator('.tt-entry-row', { hasText: description })).toBeVisible();
      await deviceA.keyboard.press('Escape');
    }
    await expect(deviceB.locator('.tt-entry-row', { hasText: drop })).toBeVisible({ timeout: 5000 });

    const edited = `${keep} edited`;
    await deviceA.locator('.tt-entry-row', { hasText: keep }).click();
    await deviceA.keyboard.press('e');
    const dialog = deviceA.getByRole('dialog', { name: 'Edit entry' });
    await dialog.getByLabel('Description').fill(edited);
    await dialog.getByLabel('Duration').fill('2:15');
    await deviceA.keyboard.press('Enter');
    await expect(dialog).toBeHidden();

    await deviceA.locator('.tt-entry-row', { hasText: drop }).click();
    await deviceA.keyboard.press('Delete');
    await deviceA.keyboard.press('y');
    await expect(deviceA.locator('.tt-entry-row', { hasText: drop })).toHaveCount(0);

    const editedOnB = deviceB.locator('.tt-entry-row', { hasText: edited });
    await expect(editedOnB).toBeVisible({ timeout: 5000 });
    await expect(editedOnB.locator('.tt-entry-duration')).toHaveText('2:15');
    await expect(deviceB.locator('.tt-entry-row', { hasText: drop })).toHaveCount(0, { timeout: 5000 });
    await expect(deviceB.locator('.tt-entry-row')).toHaveCount(1);

    const deviceC = await loginAndOpenTimeTracking(browser, email);
    await expect(deviceC.locator('.tt-entry-row', { hasText: edited })).toBeVisible({ timeout: 5000 });
    await expect(deviceC.locator('.tt-entry-row')).toHaveCount(1);

    const updates = await listUserEvents(email, "event_type='time_entry.updated'");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ scope: 'timetracking', board: '' });
    expect(updates[0].payload).toMatchObject({ fields: { description: edited }, before: { description: keep } });
    const deletes = await listUserEvents(email, "event_type='time_entry.deleted'");
    expect(deletes).toHaveLength(1);
    expect((deletes[0].payload as { timeEntry: { description: string } }).timeEntry.description).toBe(drop);

    for (const p of [deviceA, deviceB, deviceC]) await p.context().close();
  });
});

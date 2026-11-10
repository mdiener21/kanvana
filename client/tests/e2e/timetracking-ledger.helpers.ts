import { expect, type Locator, type Page } from '@playwright/test';

// Shared steps for the Ledger row specs (#286). Everything goes through the UI.

// Thursday 15 Oct 2026, 15:00 in Berlin
const NOW = new Date('2026-10-15T15:00:00+02:00');

async function setUpProjects(page: Page): Promise<void> {
  await page.clock.install({ time: NOW });
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme Corporation');
  await page.getByRole('button', { name: 'Add customer' }).click();
  // The third project gets the palette's light lime (#8bc34a).
  for (const name of ['Alpha', 'Beta', 'Lime']) {
    await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme Corporation' });
    await page.getByLabel('New project name').fill(name);
    await page.getByRole('button', { name: 'Add project' }).click();
    await expect(page.locator('.tt-project-name', { hasText: name })).toBeVisible();
  }
  await page.locator('#tt-nav-tracker').click();
}

async function logEntry(page: Page, description: string, project: string, start: string, end: string): Promise<void> {
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Project', { exact: true }).fill(project);
  await page.getByLabel('Start', { exact: true }).fill(start);
  await page.getByLabel('Start', { exact: true }).press('Tab');
  await page.getByLabel('End', { exact: true }).fill(end);
  await page.getByLabel('End', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
}

export async function logDay(page: Page): Promise<void> {
  await setUpProjects(page);
  await logEntry(page, 'Morning review of the quarterly roadmap', 'Lime', '9:00', '10:30');
  await logEntry(page, 'Call', 'Alpha', '11:00', '11:45');
  await logEntry(page, 'Deploy', 'Beta', '13:00', '14:15');
}

export const rows = (page: Page) => page.locator('.tt-entry-row');

async function expectSingleLine(locator: Locator) {
  const { height, lineHeight } = await locator.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
}

export async function expectRowsAtLeast44pxWithRangeOnOneLine(page: Page) {
  const count = await rows(page).count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i += 1) {
    const row = rows(page).nth(i);
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectSingleLine(row.locator('.tt-entry-range > span'));
  }
}

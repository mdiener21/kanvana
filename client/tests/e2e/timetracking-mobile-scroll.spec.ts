import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test('on a phone the tracker scrolls vertically to reach an entry below the fold and edit it', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).tap();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').tap();
  for (let i = 1; i <= 12; i += 1) {
    await page.getByLabel('Description', { exact: true }).fill(`Task ${i}`);
    await page.getByLabel('Project', { exact: true }).fill('Website');
    await page.getByLabel('Duration', { exact: true }).fill('10m');
    await page.getByRole('button', { name: 'Add entry' }).tap();
    await expect(page.locator('.tt-entry-row', { hasText: `Task ${i}` })).toHaveCount(1);
  }

  const { scrollHeight, viewport } = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement!.scrollHeight,
    viewport: window.innerHeight
  }));
  expect(scrollHeight).toBeGreaterThan(viewport);

  await page.mouse.wheel(0, scrollHeight);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const rows = page.locator('.tt-entry-row');
  const last = rows.last();
  await expect(last).toBeInViewport();
  await last.getByRole('button', { name: 'More actions' }).tap();
  await page.getByRole('menu', { name: 'Entry actions' }).getByRole('menuitem', { name: 'Edit' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
});

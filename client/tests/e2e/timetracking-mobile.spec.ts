import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test('on a phone the sidebar collapses into a top bar and an entry can be logged by touch', async ({ page }) => {
  await page.goto('/timetracking.html');
  const sidebar = await page.locator('#tt-sidebar').boundingBox();
  const main = await page.locator('#tt-main').boundingBox();
  expect(sidebar!.height).toBeLessThan(100);
  expect(main!.x).toBe(sidebar!.x);
  expect(main!.width).toBe(sidebar!.width);
  expect(main!.y).toBeGreaterThanOrEqual(sidebar!.y + sidebar!.height);
  await expect(page.locator('#tt-sidebar-toggle')).toBeHidden();
  for (const id of ['tracker', 'reports', 'projects', 'settings']) {
    await expect(page.locator(`#tt-nav-${id}`)).toBeInViewport();
  }

  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).tap();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').tap();
  await page.getByLabel('Description', { exact: true }).fill('Call');
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Duration', { exact: true }).fill('25m');
  const add = page.getByRole('button', { name: 'Add entry' });
  await expect(add).toBeInViewport();
  await add.tap();

  const row = page.locator('.tt-entry-row', { hasText: 'Call' });
  await expect(row).toBeInViewport();
  await expect(row.locator('.tt-entry-project')).toHaveText('Website');
  await expect(row.locator('.tt-entry-duration')).toHaveText('0:25');
  await expect(page.getByLabel('Total for Today')).toHaveText('0:25');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

import { test, expect, devices, type Page } from '@playwright/test';

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

async function logTodayOnPhone(page: Page, duration: string): Promise<void> {
  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).tap();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').tap();
  await page.getByLabel('Description', { exact: true }).fill('Work');
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.getByRole('button', { name: 'Add entry' }).tap();
}

test('on a phone, Weekly hours turns on a touch-sized "This week" badge that fits the screen', async ({ page }) => {
  // Advancing clock: a frozen one would give events across the reload the same HLC wall time.
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+02:00') });
  await page.goto('/timetracking.html');
  const badge = page.getByTestId('tt-week-balance');
  await logTodayOnPhone(page, '6h');
  await expect(badge).toBeHidden();

  await page.locator('#tt-nav-settings').tap();
  const weeklyHours = page.locator('#tt-section-settings').getByLabel('Weekly hours (contract)');
  await weeklyHours.fill('35');
  await weeklyHours.press('Tab');

  // First entry today: 1 counted day = 35 / 7 = 5h Target, 6h logged
  await page.locator('#tt-nav-tracker').tap();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/This week\s*\+1:00/);
  await expect(badge).toBeInViewport({ ratio: 1 });
  const box = await badge.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.reload();
  await expect(badge).toHaveText(/This week\s*\+1:00/);

  await page.locator('#tt-nav-settings').tap();
  await weeklyHours.fill('');
  await weeklyHours.press('Tab');
  await page.locator('#tt-nav-tracker').tap();
  await expect(badge).toBeHidden();
});

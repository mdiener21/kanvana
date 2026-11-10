import { test, expect, devices, type Page } from '@playwright/test';

async function logToday(page: Page, duration: string): Promise<void> {
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').click();
  await page.getByLabel('Description', { exact: true }).fill('Work');
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.getByRole('button', { name: 'Add entry' }).click();
}

// A describe group may not switch browser type; Pixel 5 is Chromium already.
const { defaultBrowserType: _browser, ...pixel5 } = devices['Pixel 5'];

test.describe('on a phone', () => {
  test.use({ ...pixel5, timezoneId: 'Europe/Berlin' });

  test('the week strip fits seven touch-sized day cells with no horizontal overflow', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-12T12:00:00+01:00') });
    await page.goto('/timetracking.html');
    await logToday(page, '7:45');

    await expect(page.getByText('Week 46 · 9 – 15 Nov 2026')).toBeVisible();
    const cells = page.getByRole('list', { name: 'This week' }).getByRole('button');
    await expect(cells).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Thu 12 Nov, 7:45 logged' })).toHaveAttribute('aria-current', 'date');
    for (let i = 0; i < 7; i += 1) {
      const cell = cells.nth(i);
      await expect(cell).toBeInViewport({ ratio: 1 });
      expect((await cell.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId('tt-week-total')).toHaveText('7:45');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('on a desktop', () => {
  test.use({ timezoneId: 'Europe/Berlin' });

  test('clicking a day cell scrolls its day group into view and the week total opens Reports', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-12T12:00:00+01:00') });
    await page.goto('/timetracking.html');
    await logToday(page, '2h');

    await page.getByRole('button', { name: 'Thu 12 Nov, 2:00 logged' }).click();
    await expect(page.locator('.tt-day[data-day="2026-11-12"]')).toBeInViewport();

    await page.getByTestId('tt-week-total').click();
    await expect(page.locator('#tt-section-reports')).toBeVisible();
    await expect(page.getByTestId('tt-report-period')).toHaveText('W46 · 9–15 Nov 2026');
  });
});

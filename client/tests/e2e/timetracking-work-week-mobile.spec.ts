import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

test('on a phone, Work week controls are touch-sized with no horizontal overflow', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').tap();
  await page.getByLabel('New customer name').fill('Acme Consulting International');
  await page.getByRole('button', { name: 'Add customer' }).tap();
  const details = page.getByRole('group', { name: 'Work week for Acme Consulting International' });
  const summary = details.locator('summary');
  await summary.tap();
  await expect(details).toHaveAttribute('open', '');

  const workdays = page.getByRole('group', { name: 'Workdays for Acme Consulting International' });
  const controls = [
    summary,
    page.getByLabel('Weekly hours for Acme Consulting International'),
    ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => workdays.locator('.tt-workday', { hasText: day }))
  ];
  for (const control of controls) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Tapping a day label ticks it and saves.
  await workdays.locator('.tt-workday', { hasText: 'Sat' }).tap();
  await expect(workdays.getByRole('checkbox', { name: 'Sat' })).toBeChecked();
});

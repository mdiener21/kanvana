import { test, expect, devices } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

test('on a touch device the project / customer button and the rename input are at least 44x44px', async ({ page }) => {
  await logDay(page);
  const row = rows(page).filter({ hasText: 'Call' });
  const meta = await row.locator('button.tt-entry-meta').boundingBox();
  expect(meta!.height).toBeGreaterThanOrEqual(44);
  expect(meta!.width).toBeGreaterThanOrEqual(44);

  await row.getByText('Call', { exact: true }).tap();
  const input = page.locator('.tt-entry-list').getByRole('textbox', { name: 'Description' });
  await expect(input).toBeFocused();
  const box = await input.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.tt-rename-hint')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

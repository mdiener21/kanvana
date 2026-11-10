import { test, expect, devices } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

test('on a touch device Fill chips are at least 44x44px and a tap fills the entry bar', async ({ page }) => {
  await logDay(page); // 09:00–10:30, 11:00–11:45, 13:00–14:15
  const chips = page.getByRole('group', { name: 'Fill untracked gaps' }).getByRole('button');
  await expect(chips).toHaveCount(2);
  for (const chip of await chips.all()) {
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }

  await chips.filter({ hasText: '11:45' }).tap();
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('11:45');
  await expect(page.getByLabel('End', { exact: true })).toHaveValue('13:00');
  await expect(page.getByLabel('Duration', { exact: true })).toHaveValue('1:15');
  await expect(rows(page)).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

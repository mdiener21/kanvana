import { test, expect, devices } from '@playwright/test';
import { logDay, rows, expectRowsAtLeast44pxWithRangeOnOneLine } from './timetracking-ledger.helpers.js';

test.use({ ...devices['Pixel 5'], timezoneId: 'Europe/Berlin' });

const middle = (box: { y: number; height: number }) => box.y + box.height / 2;

test('on a phone rows use the two-line layout with no horizontal overflow and no coverage bar', async ({ page }) => {
  await logDay(page);
  await expectRowsAtLeast44pxWithRangeOnOneLine(page);
  for (let i = 0; i < 3; i += 1) {
    const row = rows(page).nth(i);
    const [desc, duration, meta, range] = await Promise.all(
      ['.tt-entry-desc', '.tt-entry-duration', '.tt-entry-meta', '.tt-entry-range'].map((s) => row.locator(s).boundingBox())
    );
    // Line 1: description + duration; line 2: project · customer + start – end
    expect(Math.abs(middle(desc!) - middle(duration!))).toBeLessThanOrEqual(4);
    expect(Math.abs(middle(meta!) - middle(range!))).toBeLessThanOrEqual(4);
    expect(meta!.y).toBeGreaterThanOrEqual(desc!.y + desc!.height - 1);
    expect(range!.x).toBeGreaterThan(meta!.x + meta!.width);
  }
  await expect(rows(page).first().locator('.tt-entry-customer')).toBeVisible();
  await expect(page.locator('.tt-day-coverage').first()).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

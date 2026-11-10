import { test, expect } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

test.use({ timezoneId: 'Europe/Berlin' });

test("Fill chips below the entry bar offer today's gaps and a chip pre-fills the entry bar", async ({ page }) => {
  await logDay(page); // 09:00–10:30, 11:00–11:45, 13:00–14:15
  const chips = page.getByRole('group', { name: 'Fill untracked gaps' }).getByRole('button');
  await expect(chips).toHaveText(['Fill 11:45 – 13:00', 'Fill 10:30 – 11:00']);

  await chips.filter({ hasText: '10:30' }).click();
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('10:30');
  await expect(page.getByLabel('End', { exact: true })).toHaveValue('11:00');
  await expect(page.getByLabel('Description', { exact: true })).toBeFocused();
  await expect(rows(page)).toHaveCount(3);

  await page.getByLabel('Description', { exact: true }).fill('Planning');
  await page.getByLabel('Project', { exact: true }).fill('Alpha');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(chips).toHaveText(['Fill 11:45 – 13:00']);
});

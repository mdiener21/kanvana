import { test, expect } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

test.use({ timezoneId: 'Europe/Berlin' });

test('filling an untracked gap pre-fills the entry bar and Enter closes the gap', async ({ page }) => {
  await logDay(page); // 09:00–10:30, 11:00–11:45, 13:00–14:15
  const gaps = page.locator('.tt-gap-row');
  await expect(gaps).toHaveText([/11:45 – 13:00\s+· 75 min untracked/, /10:30 – 11:00\s+· 30 min untracked/]);

  await page.getByLabel('Description', { exact: true }).fill('Planning');
  await page.getByLabel('Project', { exact: true }).fill('Alpha');
  await gaps.getByRole('button', { name: 'Fill 10:30 – 11:00' }).click();
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('10:30');
  await expect(page.getByLabel('End', { exact: true })).toHaveValue('11:00');
  await expect(page.getByLabel('Duration', { exact: true })).toHaveValue('0:30');
  await expect(page.getByLabel('Description', { exact: true })).toBeFocused();
  await expect(rows(page)).toHaveCount(3);

  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(4);
  await expect(gaps).toHaveText([/11:45 – 13:00/]);
  await expect(page.getByLabel('Entry count')).toHaveText('4 entries');
});

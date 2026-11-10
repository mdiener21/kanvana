import { test, expect } from '@playwright/test';
import { logDay, rows } from './timetracking-ledger.helpers.js';

test.use({ timezoneId: 'Europe/Berlin' });

const renameInput = (page) => page.locator('.tt-entry-list').getByRole('textbox', { name: 'Description' });

test('clicking a description renames it in place; Enter saves and the change survives a reload', async ({ page }) => {
  await logDay(page);
  await rows(page).filter({ hasText: 'Call' }).getByText('Call', { exact: true }).click();
  const input = renameInput(page);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Call');
  await expect(page.locator('.tt-rename-hint')).toBeVisible();
  await expect(rows(page).filter({ has: input }).getByRole('button', { name: 'Edit entry', exact: true })).toBeHidden();
  await input.press('End');
  await input.pressSequentially(' with Acme');
  await input.press('Enter');
  await expect(renameInput(page)).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'Call with Acme' })).toHaveCount(1);

  await page.reload();
  await expect(rows(page).filter({ hasText: 'Call with Acme' })).toHaveCount(1);
});

test('Esc restores the text; F2 renames the selected row; clicking away saves', async ({ page }) => {
  await logDay(page);
  await rows(page).filter({ hasText: 'Deploy' }).getByText('Deploy', { exact: true }).click();
  await renameInput(page).fill('Oops');
  await renameInput(page).press('Escape');
  await expect(renameInput(page)).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'Deploy' })).toHaveCount(1);

  await page.keyboard.press('F2');
  await expect(renameInput(page)).toHaveValue('Deploy');
  await renameInput(page).fill('Deploy v2');
  await page.getByRole('heading', { name: 'Time Tracker' }).click();
  await expect(rows(page).filter({ hasText: 'Deploy v2' })).toHaveCount(1);
});

test('clicking the project / customer opens the edit modal for that entry', async ({ page }) => {
  await logDay(page);
  await rows(page).filter({ hasText: 'Deploy' }).getByText('Acme Corporation').click();
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('Deploy');
});

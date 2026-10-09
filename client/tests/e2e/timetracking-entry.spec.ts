import { test, expect } from '@playwright/test';

test('a time entry can be logged with the keyboard only', async ({ page }) => {
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();

  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.keyboard.press('Enter');
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  const description = page.getByLabel('Description', { exact: true });
  await expect(description).toBeFocused();
  await expect(description).toHaveValue('');

  await page.keyboard.type('Standup');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Website');
  for (const field of ['Date', 'Start', 'End', 'Duration']) {
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(field, { exact: true })).toBeFocused();
  }
  await page.keyboard.type('1h30');
  await page.keyboard.press('Enter');

  const entries = page.getByRole('region', { name: 'Time entries' });
  const today = entries.getByRole('list', { name: 'Today' });
  await expect(today.getByText('Standup')).toBeVisible();
  await expect(today.locator('.tt-entry-duration')).toHaveText('1:30');
  await expect(entries.getByLabel('Total for Today')).toHaveText('1:30');

  await expect(description).toBeFocused();
  await expect(description).toHaveValue('');
  await expect(page.getByLabel('Duration', { exact: true })).toHaveValue('0:00');

  await page.reload();
  await expect(page.getByRole('list', { name: 'Today' }).getByText('Standup')).toBeVisible();
});

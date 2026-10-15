import { test, expect, type Page } from '@playwright/test';

async function setUpProject(page: Page): Promise<void> {
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
}

async function logEntry(page: Page, description: string, start: string, duration: string): Promise<void> {
  await page.keyboard.press('n');
  await page.keyboard.type(description);
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Start', { exact: true }).fill(start);
  await page.keyboard.press('Tab');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('entries can be selected, edited, duplicated and deleted with the keyboard only', async ({ page }) => {
  await setUpProject(page);
  await logEntry(page, 'Standup', '9:00', '0:30');
  await logEntry(page, 'Review', '10:00', '1h');

  const rows = page.locator('.tt-entry-row');
  const selectedRow = page.locator('.tt-entry-row[aria-current="true"]');
  await expect(rows).toHaveCount(2);

  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(selectedRow).toContainText('Standup');
  await page.keyboard.press('k');
  await page.keyboard.press('j');
  await expect(selectedRow).toContainText('Standup');

  await page.keyboard.press('e');
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Description')).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Daily standup');
  await dialog.getByLabel('Duration').fill('45m');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(selectedRow).toContainText('Daily standup');
  await expect(selectedRow.locator('.tt-entry-duration')).toHaveText('0:45');

  await page.keyboard.press('e');
  await expect(dialog).toBeVisible();
  await page.keyboard.type(' ignored');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.tt-entry-row', { hasText: 'ignored' })).toHaveCount(0);

  await page.keyboard.press('d');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('.tt-entry-row', { hasText: 'Daily standup' })).toHaveCount(2);
  await expect(selectedRow).toContainText('Daily standup');
  await expect(selectedRow.locator('.tt-entry-duration')).toHaveText('0:45');

  await page.keyboard.press('Delete');
  const confirm = page.locator('.tt-entry-confirm');
  await expect(confirm).toContainText('Delete “Daily standup” · Website · 0:45?');
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(rows).toHaveCount(3);

  await page.keyboard.press('Delete');
  await page.keyboard.press('y');
  await expect(rows).toHaveCount(2);
  await expect(page.getByLabel('Total for Today')).toHaveText('1:45');

  await page.reload();
  await expect(page.locator('.tt-entry-row')).toHaveCount(2);
  await expect(page.locator('.tt-entry-row', { hasText: 'Daily standup' })).toHaveCount(1);
});

test('row actions appear on hover and selection', async ({ page }) => {
  await setUpProject(page);
  await logEntry(page, 'Standup', '9:00', '0:30');

  const row = page.locator('.tt-entry-row', { hasText: 'Standup' });
  const edit = row.getByRole('button', { name: 'Edit entry' });
  await page.mouse.move(0, 0);
  await expect(edit).toBeHidden();
  await row.hover();
  for (const name of ['Edit entry', 'Duplicate entry', 'Delete entry']) {
    await expect(row.getByRole('button', { name })).toBeVisible();
  }
  await page.mouse.move(0, 0);
  await expect(edit).toBeHidden();
  await page.keyboard.press('j');
  await expect(edit).toBeVisible();

  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Edit entry' })).toBeVisible();
});

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

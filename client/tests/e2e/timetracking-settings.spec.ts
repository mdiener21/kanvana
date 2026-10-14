import { test, expect, type Page } from '@playwright/test';

async function setUpProjects(page: Page): Promise<void> {
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.keyboard.press('Enter');
  const customer = page.getByLabel('Select customer for new project');
  await customer.selectOption({ label: 'Acme' });
  for (const name of ['Website', 'Shop']) {
    await page.getByLabel('New project name').fill(name);
    await page.keyboard.press('Enter');
    await expect(page.locator('.tt-project-name', { hasText: name })).toBeVisible();
  }
}

test('settings apply across the page and persist across a reload', async ({ page }) => {
  await setUpProjects(page);

  await page.locator('#tt-nav-settings').click();
  const settings = page.locator('#tt-section-settings');
  await settings.getByLabel('Default customer').selectOption({ label: 'Acme' });
  await expect(settings.getByLabel('Default project')).toHaveValue(/.+/);
  await settings.getByLabel('Default project').selectOption({ label: 'Shop' });
  await settings.getByLabel('Time format').selectOption({ label: '12-hour' });
  await settings.getByLabel('Duration format').selectOption({ label: 'Decimal (7.50 h)' });
  await settings.getByLabel('Date format').selectOption('YYYY-MM-DD');
  await expect(settings.getByTestId('tt-preview-time')).toHaveText(/^\d{1,2}:\d{2} (AM|PM)$/);
  await expect(settings.getByTestId('tt-preview-duration')).toHaveText('7.50 h');
  await expect(settings.getByTestId('tt-preview-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);

  await page.locator('#tt-nav-tracker').click();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('Acme / Shop');

  await page.getByLabel('Description', { exact: true }).fill('Design review');
  await page.getByLabel('Start', { exact: true }).fill('14:30');
  await page.keyboard.press('Tab');
  await page.getByLabel('Duration', { exact: true }).fill('7:30');
  await page.keyboard.press('Enter');
  const row = page.locator('.tt-entry-row', { hasText: 'Design review' });
  await expect(row.locator('.tt-entry-range')).toHaveText('2:30 PM – 10:00 PM');
  await expect(row.locator('.tt-entry-duration')).toHaveText('7.50 h');
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('Acme / Shop');

  await page.reload();
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('Acme / Shop');
  await expect(row.locator('.tt-entry-range')).toHaveText('2:30 PM – 10:00 PM');
  await page.locator('#tt-nav-settings').click();
  await expect(settings.getByLabel('Time format')).toHaveValue('12h');
  await expect(settings.getByLabel('Date format')).toHaveValue('YYYY-MM-DD');
});

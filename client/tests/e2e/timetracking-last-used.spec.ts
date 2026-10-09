import { test, expect } from '@playwright/test';

test('the entry bar prefills the last-used project across reloads and falls back to the default once it is archived', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.keyboard.press('Enter');
  for (const name of ['Website', 'Shop']) {
    await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
    await page.getByLabel('New project name').fill(name);
    await page.keyboard.press('Enter');
    await expect(page.locator('.tt-project-name', { hasText: name })).toBeVisible();
  }

  await page.locator('#tt-nav-settings').click();
  const settings = page.locator('#tt-section-settings');
  await settings.getByLabel('Default customer').selectOption({ label: 'Acme' });
  await settings.getByLabel('Default project').selectOption({ label: 'Website' });

  await page.locator('#tt-nav-tracker').click();
  const project = page.getByLabel('Project', { exact: true });
  await expect(project).toHaveValue('Acme / Website');

  await page.getByLabel('Description', { exact: true }).fill('Checkout');
  await project.fill('Acme / Shop');
  await page.getByLabel('Duration', { exact: true }).fill('1h');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: 'Checkout' })).toBeVisible();
  await expect(project).toHaveValue('Acme / Shop');

  await page.reload();
  await expect(project).toHaveValue('Acme / Shop');

  await page.locator('#tt-nav-projects').click();
  await page.getByRole('button', { name: 'Archive project Shop' }).click();
  await expect(page.locator('.tt-project-row.tt-archived', { hasText: 'Shop' })).toBeVisible();
  await page.locator('#tt-nav-tracker').click();
  await expect(project).toHaveValue('Acme / Website');

  await page.reload();
  await expect(project).toHaveValue('Acme / Website');
});

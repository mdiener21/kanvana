import { test, expect } from '@playwright/test';

test('customer and project names can be saved and survive a reload', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.keyboard.press('Enter');
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill('Website');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Edit project Website' }).click();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Shop');
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.locator('.tt-project-name').filter({ hasText: 'Shop' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit customer Acme' }).click();
  await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill('Acme Ltd');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.locator('.tt-customer-name').filter({ hasText: 'Acme Ltd' })).toBeVisible();

  await page.reload();
  await page.locator('#tt-nav-projects').click();
  await expect(page.locator('.tt-customer-name').filter({ hasText: 'Acme Ltd' })).toBeVisible();
  await expect(page.locator('.tt-project-name').filter({ hasText: 'Shop' })).toBeVisible();
});

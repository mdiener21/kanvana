import { test, expect, type Page } from '@playwright/test';

async function addProject(page: Page, name: string): Promise<void> {
  await page.getByLabel('Select customer for new project').selectOption({ label: 'Acme' });
  await page.getByLabel('New project name').fill(name);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-project-name', { hasText: name })).toBeVisible();
}

test('archived projects leave the picker but keep their entries; referenced items cannot be deleted', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await page.getByLabel('New customer name').fill('Acme');
  await page.keyboard.press('Enter');
  await addProject(page, 'Website');
  await addProject(page, 'Legacy');
  await page.keyboard.press('Escape');

  await page.locator('#tt-nav-tracker').click();
  await page.getByLabel('Description', { exact: true }).fill('Homepage');
  await page.getByLabel('Project', { exact: true }).fill('Acme / Website');
  await page.getByLabel('Duration', { exact: true }).fill('1h');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: 'Homepage' })).toBeVisible();

  await page.locator('#tt-nav-projects').click();
  const deleteWebsite = page.getByRole('button', { name: 'Delete project Website' });
  await expect(deleteWebsite).toHaveAttribute('aria-disabled', 'true');
  await expect(deleteWebsite).toHaveAttribute('title', 'In use — archive instead');
  await expect(deleteWebsite).toBeDisabled();
  await deleteWebsite.click({ force: true });
  await expect(page.locator('#tt-toast')).toHaveText('In use — archive instead');
  await expect(page.locator('.tt-project-name', { hasText: 'Website' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete project Legacy' }).click();
  await expect(page.locator('.tt-project-name', { hasText: 'Legacy' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Archive project Website' }).click();
  await expect(page.locator('.tt-project-row.tt-archived', { hasText: 'Website' })).toBeVisible();

  await page.locator('#tt-nav-tracker').click();
  await expect(page.locator('.tt-entry-row', { hasText: 'Homepage' })).toBeVisible();
  await expect(page.locator('#tt-entry-project-options option')).toHaveCount(0);
  await page.getByLabel('Project', { exact: true }).fill('Acme / Website');
  await page.getByLabel('Duration', { exact: true }).fill('1h');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tt-toast')).toHaveText('That project is archived.');

  await page.reload();
  await page.locator('#tt-nav-projects').click();
  await expect(page.locator('.tt-project-row.tt-archived', { hasText: 'Website' })).toBeVisible();
  await page.getByRole('button', { name: 'Unarchive project Website' }).click();
  await page.getByRole('button', { name: 'Archive customer Acme' }).click();
  await expect(page.locator('.tt-customer-item.tt-archived', { hasText: 'Acme' })).toBeVisible();
  await page.locator('#tt-nav-tracker').click();
  await expect(page.locator('#tt-entry-project-options option')).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';

async function addProject(page: Page, customer: string, project: string): Promise<void> {
  const customerOption = page.getByLabel('Select customer for new project').locator('option', { hasText: customer });
  if (await customerOption.count() === 0) {
    await page.getByLabel('New customer name').fill(customer);
    await page.keyboard.press('Enter');
  }
  await page.getByLabel('Select customer for new project').selectOption({ label: customer });
  await page.getByLabel('New project name').fill(project);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-project-name', { hasText: project })).toBeVisible();
}

async function logEntry(page: Page, description: string, project: string, start: string, duration: string): Promise<void> {
  await page.keyboard.press('n');
  await page.keyboard.type(description);
  await page.getByLabel('Project', { exact: true }).fill(project);
  await page.getByLabel('Start', { exact: true }).fill(start);
  await page.keyboard.press('Tab');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('the entry list can be filtered by customer and project', async ({ page }) => {
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await addProject(page, 'Acme', 'Backend');
  await addProject(page, 'Globex', 'Support');
  await page.keyboard.press('Escape');

  await logEntry(page, 'Landing page', 'Website', '8:00', '1h');
  await logEntry(page, 'API', 'Backend', '9:00', '0:30');
  await logEntry(page, 'Tickets', 'Support', '10:00', '2h');

  const rows = page.locator('.tt-entry-row');
  const count = page.getByLabel('Entry count');
  const total = page.getByLabel('Total for Today');
  const customerFilter = page.getByLabel('Filter by customer');
  const projectFilter = page.getByLabel('Filter by project');
  await expect(rows).toHaveCount(3);
  await expect(count).toHaveText('3 entries');
  await expect(total).toHaveText('3:30');

  await page.keyboard.press('/');
  await expect(customerFilter).toBeFocused();
  await customerFilter.selectOption({ label: 'Acme' });
  await expect(rows).toHaveCount(2);
  await expect(count).toHaveText('2 entries');
  await expect(total).toHaveText('1:30');
  await expect(projectFilter.locator('option')).toHaveText(['All projects', 'Website', 'Backend']);

  await projectFilter.selectOption({ label: 'Website' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Landing page');

  await customerFilter.selectOption({ label: 'Globex' });
  await expect(projectFilter).toHaveValue('');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Tickets');

  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(page.locator('.tt-entry-row[aria-current="true"]')).toContainText('Tickets');

  await customerFilter.selectOption({ label: 'All customers' });
  await expect(rows).toHaveCount(3);
  await expect(total).toHaveText('3:30');
});

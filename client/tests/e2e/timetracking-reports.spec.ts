import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Berlin' });

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

async function logEntry(page: Page, description: string, project: string, date: string, start: string, duration: string): Promise<void> {
  await page.keyboard.press('n');
  await page.keyboard.type(description);
  await page.getByLabel('Project', { exact: true }).fill(project);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Start', { exact: true }).fill(start);
  await page.keyboard.press('Tab');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
  await page.keyboard.press('Escape');
}

const kpi = (page: Page, name: string) => page.locator('.tt-kpi', { hasText: name }).locator('dd');

test('Reports shows where the month went, by keyboard and buttons', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+01:00'));
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await addProject(page, 'Acme', 'Backend');
  await addProject(page, 'Globex', 'Support');
  await page.keyboard.press('Escape');

  await logEntry(page, 'Landing page', 'Website', '12.11.2026', '9:00', '1h');
  await logEntry(page, 'Tickets', 'Support', '12.11.2026', '10:00', '2h');
  await logEntry(page, 'Migration', 'Backend', '31.10.2026', '22:00', '4h');

  await page.keyboard.press('g');
  await page.keyboard.press('r');
  const reports = page.locator('#tt-section-reports');
  const month = page.getByTestId('tt-report-period');
  await expect(reports).toBeVisible();
  await expect(month).toHaveText('November 2026');
  await expect(kpi(page, 'Total')).toHaveText('3:00');
  await expect(kpi(page, 'Entries')).toHaveText('2');
  await expect(kpi(page, 'Projects')).toHaveText('2');

  const rows = reports.locator('.tt-report-table tbody tr');
  await expect(rows).toHaveText([/Globex\s*2:00/, /Support\s*2:00\s*67%/, /Acme\s*1:00/, /Website\s*1:00\s*33%/]);
  await expect(reports.locator('.tt-report-table tfoot')).toContainText('3:00');

  const chart = page.getByRole('img', { name: 'Daily hours by project, November 2026' });
  await expect(chart.locator('canvas')).toBeVisible();
  const box = (await chart.boundingBox())!;
  const tooltip = chart.getByText('12.11.2026');
  for (let dx = -12; dx <= 12 && !(await tooltip.isVisible()); dx += 6) {
    const yAxisWidth = 40;
    const plotWidth = box.width - yAxisWidth - 16;
    await page.mouse.move(box.x + 8 + yAxisWidth + (11.5 / 30) * plotWidth + dx, box.y + box.height * 0.6);
  }
  await expect(tooltip).toBeVisible();
  await expect(chart).toContainText(/(Support: 2:00|Website: 1:00)/);
  await page.mouse.move(0, 0);

  // The 31 Oct 22:00 → 1 Nov 02:00 entry counts wholly to October
  await page.keyboard.press('[');
  await expect(month).toHaveText('October 2026');
  await expect(kpi(page, 'Total')).toHaveText('4:00');
  await expect(rows).toHaveText([/Acme\s*4:00/, /Backend\s*4:00\s*100%/]);

  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(month).toHaveText('December 2026');
  await expect(page.getByRole('status').filter({ hasText: 'No time tracked this month' })).toBeVisible();
  await expect(reports.locator('.tt-report-table')).toBeHidden();
  await expect(kpi(page, 'Total')).toHaveText('0:00');

  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(month).toHaveText('November 2026');

  await page.keyboard.press('/');
  const customerFilter = page.getByLabel('Filter report by customer');
  await expect(customerFilter).toBeFocused();
  await customerFilter.selectOption({ label: 'Acme' });
  await expect(kpi(page, 'Total')).toHaveText('1:00');
  await expect(kpi(page, 'Entries')).toHaveText('1');
  await expect(kpi(page, 'Projects')).toHaveText('1');
  await expect(rows).toHaveText([/Acme\s*1:00/, /Website\s*1:00\s*100%/]);

  await page.keyboard.press('Escape');
  await page.keyboard.press('[');
  await expect(month).toHaveText('October 2026');
  await expect(kpi(page, 'Total')).toHaveText('4:00');

  await page.keyboard.press('g');
  await page.keyboard.press('t');
  await expect(page.getByLabel('Filter by customer')).toHaveValue('');
  await expect(page.locator('.tt-entry-row')).toHaveCount(3);
});

import { test, expect, type Page } from '@playwright/test';

// Keyboard only: no click / fill / selectOption / hover / mouse — every step is page.keyboard.
test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

async function press(page: Page, ...keys: string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}

const kpi = (page: Page, name: string) => page.locator('.tt-kpi', { hasText: name }).locator('dd');

async function expectReportTotals(page: Page, total: string, entries: string): Promise<void> {
  await press(page, 'g', 'r');
  await expect(page.locator('#tt-section-reports')).toBeVisible();
  await expect(page.getByTestId('tt-report-period')).toHaveText('November 2026');
  await expect(kpi(page, 'Total')).toHaveText(total);
  await expect(kpi(page, 'Entries')).toHaveText(entries);
  await press(page, 'g', 't');
  await expect(page.locator('#tt-section-tracker')).toBeVisible();
}

test('the whole time-tracking flow works with the keyboard only', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+01:00'));
  await page.goto('/timetracking.html');
  const description = page.getByLabel('Description', { exact: true });
  const project = page.getByLabel('Project', { exact: true });
  await expect(description).toBeVisible();

  // Customers and projects: g p focuses the section heading, Tab reaches its first field
  await press(page, 'g', 'p');
  await expect(page.getByRole('heading', { name: 'Customers & Projects' })).toBeFocused();
  const customerInput = page.getByLabel('New customer name');
  await press(page, 'Tab');
  await expect(customerInput).toBeFocused();
  await page.keyboard.type('Acme');
  await press(page, 'Enter');
  await page.keyboard.type('Globex');
  await press(page, 'Enter');
  await expect(page.locator('.tt-customer-name')).toHaveText(['Acme', 'Globex']);

  const customerSelect = page.getByLabel('Select customer for new project');
  const projectInput = page.getByLabel('New project name');
  await press(page, 'Tab', 'Tab'); // past "Add customer" to the customer picker
  for (const [customer, name] of [['Acme', 'Website'], ['Globex', 'Support']]) {
    await expect(customerSelect).toBeFocused();
    await page.keyboard.type(customer);
    await expect(customerSelect.locator('option:checked')).toHaveText(customer);
    await press(page, 'Tab');
    await expect(projectInput).toBeFocused();
    await page.keyboard.type(name);
    await press(page, 'Enter');
    await expect(page.locator('.tt-project-name', { hasText: name })).toBeVisible();
    await press(page, 'Shift+Tab'); // back to the customer picker
  }

  await press(page, 'Escape');
  await expectReportTotals(page, '0:00', '0');

  // n → description, project, times with shorthand → Enter
  const rows = page.locator('.tt-entry-row');
  const selected = page.locator('.tt-entry-row[aria-current="true"]');
  const today = page.getByLabel('Total for Today');
  const dayTotals = page.locator('.tt-day-total');

  await press(page, 'n');
  await expect(description).toBeFocused();
  await expect(project).toHaveValue('');
  await page.keyboard.type('Landing page');
  await press(page, 'Tab');
  await page.keyboard.type('Website');
  await press(page, 'Tab', 'Tab');
  await expect(page.getByLabel('Start', { exact: true })).toBeFocused();
  await page.keyboard.type('9');
  await press(page, 'Tab', 'Tab');
  await expect(page.getByLabel('Duration', { exact: true })).toBeFocused();
  await page.keyboard.type('1h30');
  await press(page, 'Enter');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Landing page');
  await expect(rows.first().locator('.tt-entry-project')).toHaveText('Website');
  await expect(rows.first().locator('.tt-entry-duration')).toHaveText('1:30');
  await expect(today).toHaveText('1:30');
  await expect(description).toBeFocused();

  // The next entry starts with the last-used project prefilled
  await press(page, 'Escape');
  await expectReportTotals(page, '1:30', '1');
  await press(page, 'n');
  await expect(description).toBeFocused();
  await expect(project).toHaveValue('Acme / Website');
  await page.keyboard.type('Review');
  await press(page, 'Tab', 'Tab', 'Tab');
  await page.keyboard.type('11');
  await press(page, 'Tab', 'Tab');
  await page.keyboard.type('45m');
  await press(page, 'Enter');
  await expect(rows).toHaveCount(2);
  const review = rows.filter({ hasText: 'Review' });
  await expect(review.locator('.tt-entry-project')).toHaveText('Website');
  await expect(review.locator('.tt-entry-duration')).toHaveText('0:45');
  await expect(today).toHaveText('2:15');

  // An entry on another day and project, crossing into November
  await press(page, 'Escape', 'n');
  await page.keyboard.type('Migration');
  await press(page, 'Tab');
  await page.keyboard.type('Support');
  await press(page, 'Tab');
  await page.keyboard.type('31.10.2026');
  await press(page, 'Tab');
  await page.keyboard.type('22');
  await press(page, 'Tab', 'Tab');
  await page.keyboard.type('4h');
  await press(page, 'Enter');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Migration' }).locator('.tt-entry-project')).toHaveText('Support');
  await expect(today).toHaveText('2:15');
  await expect(dayTotals).toHaveText(['2:15', '4:00']);
  await expect(project).toHaveValue('Globex / Support');
  await press(page, 'Escape');
  await expectReportTotals(page, '2:15', '2');

  // j / k select
  await press(page, 'j');
  await expect(selected).toContainText('Review');
  await press(page, 'j', 'j');
  await expect(selected).toContainText('Migration');
  await press(page, 'k', 'k');
  await expect(selected).toContainText('Review');

  // e edit and save
  await press(page, 'e');
  const dialog = page.getByRole('dialog', { name: 'Edit entry' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Description')).toBeFocused();
  await press(page, 'Control+A');
  await page.keyboard.type('Code review');
  await press(page, 'Tab', 'Tab', 'Tab', 'Tab', 'Tab');
  await expect(dialog.getByLabel('Duration')).toBeFocused();
  await page.keyboard.type('1h');
  await press(page, 'Enter');
  await expect(dialog).toBeHidden();
  await expect(selected).toContainText('Code review');
  await expect(selected.locator('.tt-entry-duration')).toHaveText('1:00');
  await expect(rows).toHaveCount(3);
  await expect(dayTotals).toHaveText(['2:30', '4:00']);
  await expectReportTotals(page, '2:30', '2');

  // d duplicate (starts now, keeps the duration)
  await press(page, 'd');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'Code review' })).toHaveCount(2);
  await expect(selected.locator('.tt-entry-range')).toContainText('10:00');
  await expect(selected.locator('.tt-entry-duration')).toHaveText('1:00');
  await expect(dayTotals).toHaveText(['3:30', '4:00']);
  await expectReportTotals(page, '3:30', '3');

  // Del → Esc cancels; Del → y deletes
  await press(page, 'Delete');
  const confirm = page.locator('.tt-entry-confirm');
  await expect(confirm).toContainText('Delete “Code review” · Website · 1:00?');
  await press(page, 'Escape');
  await expect(confirm).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  await press(page, 'Delete', 'y');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Code review' })).toHaveCount(1);
  await expect(dayTotals).toHaveText(['2:30', '4:00']);
  await expectReportTotals(page, '2:30', '2');

  // / filter
  await press(page, '/');
  const customerFilter = page.getByLabel('Filter by customer');
  await expect(customerFilter).toBeFocused();
  await page.keyboard.type('Globex');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Migration');
  await expect(dayTotals).toHaveText(['4:00']);
  await expect(page.getByLabel('Entry count')).toHaveText('1 entry');
  await press(page, 'Home');
  await expect(rows).toHaveCount(3);
  await expect(dayTotals).toHaveText(['2:30', '4:00']);
  await press(page, 'Escape');
  await expect(customerFilter).not.toBeFocused();

  // g r → Reports, [ / ] month switch
  await press(page, 'g', 'r');
  const reports = page.locator('#tt-section-reports');
  const month = page.getByTestId('tt-report-period');
  const reportRows = reports.locator('.tt-report-table tbody tr');
  await expect(reports).toBeVisible();
  await expect(month).toHaveText('November 2026');
  await expect(kpi(page, 'Total')).toHaveText('2:30');
  await expect(kpi(page, 'Projects')).toHaveText('1');
  await expect(reportRows).toHaveText([/Acme\s*2:30/, /Website\s*2:30\s*100%/]);

  await press(page, '[');
  await expect(month).toHaveText('October 2026');
  await expect(kpi(page, 'Total')).toHaveText('4:00');
  await expect(kpi(page, 'Entries')).toHaveText('1');
  await expect(reportRows).toHaveText([/Globex\s*4:00/, /Support\s*4:00\s*100%/]);

  await press(page, ']', ']');
  await expect(month).toHaveText('December 2026');
  await expect(kpi(page, 'Total')).toHaveText('0:00');
  await press(page, '[');
  await expect(month).toHaveText('November 2026');
  await expect(kpi(page, 'Total')).toHaveText('2:30');

  // ? cheat-sheet
  const help = page.locator('#tt-help-modal');
  await expect(help).toBeHidden();
  await press(page, 'Shift+Slash');
  await expect(help).toBeVisible();
  const closeHelp = help.getByRole('button', { name: 'Close' });
  await expect(closeHelp).toBeFocused();
  await press(page, 'Tab');
  await expect(closeHelp).toBeFocused();
  await expect(help.getByRole('row', { name: /New entry/ })).toContainText('n');
  await expect(help.getByRole('row', { name: /Previous period \(Reports\)/ })).toContainText('[');
  await press(page, 'Escape');
  await expect(help).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeFocused();

  await page.reload();
  await expect(page.locator('.tt-entry-row')).toHaveCount(3);
  await expect(page.locator('.tt-day-total')).toHaveText(['2:30', '4:00']);
});

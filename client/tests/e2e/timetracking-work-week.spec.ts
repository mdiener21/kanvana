import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Berlin' });

async function addProject(page: Page, customer: string, project: string): Promise<void> {
  await page.getByLabel('New customer name').fill(customer);
  await page.getByLabel('New customer name').press('Enter');
  await page.getByLabel('Select customer for new project').selectOption({ label: customer });
  await page.getByLabel('New project name').fill(project);
  await page.getByLabel('New project name').press('Enter');
  await expect(page.locator('.tt-project-name', { hasText: project })).toBeVisible();
}

async function logToday(page: Page, project: string, duration: string, description = `${project} work`): Promise<void> {
  await page.locator('#tt-nav-tracker').click();
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Project', { exact: true }).fill(project);
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
}

const editor = (page: Page, customer: string) => page.getByRole('group', { name: `Work week for ${customer}` });

async function setWorkWeek(page: Page, customer: string, hours: string, untick: string[] = []): Promise<void> {
  await page.locator('#tt-nav-projects').click();
  const details = editor(page, customer);
  if (!(await details.evaluate((el: HTMLDetailsElement) => el.open))) await details.locator('summary').click();
  const weeklyHours = page.getByLabel(`Weekly hours for ${customer}`);
  await weeklyHours.fill(hours);
  await weeklyHours.press('Tab');
  const workdays = page.getByRole('group', { name: `Workdays for ${customer}` });
  for (const day of untick) await workdays.getByRole('checkbox', { name: day }).uncheck();
}

async function chooseDefaultCustomer(page: Page, name: string): Promise<void> {
  await page.locator('#tt-nav-settings').click();
  await page.locator('#tt-section-settings').getByLabel('Default customer').selectOption({ label: name });
  await page.locator('#tt-nav-tracker').click();
}

test('the "This week" badge follows the Default customer and its own Work week', async ({ page }) => {
  // Thursday 15 Oct 2026. Advancing clock so successive events get distinct timestamps.
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+02:00') });
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await addProject(page, 'Globex', 'Support');
  await logToday(page, 'Website', '6h');
  await logToday(page, 'Support', '3h');

  // Acme 40h Mon–Fri; Globex 16h over Thu–Fri. Both first log today (Thursday).
  await setWorkWeek(page, 'Acme', '40');
  await setWorkWeek(page, 'Globex', '16', ['Mon', 'Tue', 'Wed']);
  await expect(editor(page, 'Acme').locator('summary')).toContainText('40h · Mon–Fri');
  await expect(editor(page, 'Globex').locator('summary')).toContainText('16h · Thu, Fri');

  const badge = page.getByTestId('tt-week-balance');
  await page.locator('#tt-nav-tracker').click();
  await expect(badge).toBeHidden();
  // Day totals and the week total stay all-Customer.
  await expect(page.getByTestId('tt-week-total')).toHaveText('9:00');

  // Acme: 8h Target today, 6h logged.
  await chooseDefaultCustomer(page, 'Acme');
  await expect(badge).toHaveText(/This week\s*−2:00/);
  // Globex: 8h Target today, 3h logged.
  await chooseDefaultCustomer(page, 'Globex');
  await expect(badge).toHaveText(/This week\s*−5:00/);

  // Changing the Default customer's Work week updates the badge: Globex 8h over Thu–Fri is 4h today.
  await setWorkWeek(page, 'Globex', '8');
  await page.locator('#tt-nav-tracker').click();
  await expect(badge).toHaveText(/This week\s*−1:00/);

  // Another Customer's entry changes the totals, not the Balance.
  await logToday(page, 'Website', '1h', 'Website follow-up');
  await expect(page.getByTestId('tt-week-total')).toHaveText('10:00');
  await expect(badge).toHaveText(/This week\s*−1:00/);

  // Survives a reload (Work weeks are Customer events in the log).
  await page.reload();
  await expect(badge).toHaveText(/This week\s*−1:00/);

  // Clearing the Default customer's Weekly hours hides the badge.
  await setWorkWeek(page, 'Globex', '');
  await expect(editor(page, 'Globex').locator('summary')).toContainText('No target');
  await page.locator('#tt-nav-tracker').click();
  await expect(badge).toBeHidden();
});

test('an archived Customer\'s Work week stays editable', async ({ page }) => {
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await page.getByRole('button', { name: 'Archive customer Acme' }).click();
  await expect(page.getByRole('button', { name: 'Unarchive customer Acme' })).toBeVisible();
  await setWorkWeek(page, 'Acme', '20', ['Fri']);
  await expect(editor(page, 'Acme').locator('summary')).toContainText('20h · Mon–Thu');
});

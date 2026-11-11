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

test('two Customers: the badge follows the Default customer and the Reports Customer filter switches Balance', async ({ page }) => {
  // Thursday 15 Oct 2026.
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+02:00') });
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await addProject(page, 'Globex', 'Support');
  await logToday(page, 'Website', '6h');
  await logToday(page, 'Support', '3h');
  // Acme 40h over Mon–Fri (8h today); Globex 20h over Mon–Fri (4h today).
  await setWorkWeek(page, 'Acme', '40');
  await setWorkWeek(page, 'Globex', '20');
  await chooseDefaultCustomer(page, 'Acme');

  const badge = page.getByTestId('tt-week-balance');
  await expect(badge).toHaveText(/This week\s*−2:00/);
  await badge.click();
  await expect(page.getByTestId('tt-report-period')).toHaveText('W42 · 12–18 Oct 2026');
  const card = page.getByTestId('tt-balance-card');
  const customerFilter = page.getByLabel('Filter report by customer');
  // Unfiltered: the Default customer's Balance.
  await expect(card).toContainText(/Logged\s*6:00/);
  await expect(card).toContainText(/Target\s*8:00/);
  await expect(card).toContainText(/Balance\s*−2:00/);

  await customerFilter.selectOption({ label: 'Globex' });
  await expect(card).toContainText(/Logged\s*3:00/);
  await expect(card).toContainText(/Target\s*4:00/);
  await expect(card).toContainText(/Balance\s*−1:00/);

  await customerFilter.selectOption({ label: 'Acme' });
  await expect(card).toContainText(/Balance\s*−2:00/);

  // Switching the Default customer moves the badge to Globex's Work week.
  await chooseDefaultCustomer(page, 'Globex');
  await expect(badge).toHaveText(/This week\s*−1:00/);
});

test('upgrading moves the legacy global Weekly hours onto the Default customer with the same Balance', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T12:00:00+02:00') });
  await page.goto('/timetracking.html');
  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await logToday(page, 'Website', '6h');
  await chooseDefaultCustomer(page, 'Acme');

  // What an older version stored: a global Weekly hours and Workdays in the Time Tracking settings.
  await page.evaluate(async () => {
    const { loadGlobalSettings } = await import('/modules/storage.js');
    const { scheduleDomainEvent, flushDomainEvents } = await import('/modules/event-sourcing/emitter.js');
    const timeTracking = { ...loadGlobalSettings().timeTracking, weeklyHours: 25, workdays: [1, 2, 3, 4, 5] };
    scheduleDomainEvent({
      type: 'settings.updated', scope: 'global', entityId: 'timeTracking', payload: { fields: { timeTracking } }
    });
    await flushDomainEvents();
  });

  await page.reload();
  // First entry today (Thursday): 25h / 5 = 5h Target, 6h logged.
  const badge = page.getByTestId('tt-week-balance');
  await expect(badge).toHaveText(/This week\s*\+1:00/);
  await page.locator('#tt-nav-projects').click();
  await expect(editor(page, 'Acme').locator('summary')).toContainText('25h · Mon–Fri');
  await page.locator('#tt-nav-settings').click();
  await expect(page.locator('#tt-section-settings').getByLabel(/Weekly hours/)).toHaveCount(0);
  await expect(page.locator('#tt-section-settings').getByRole('group', { name: 'Workdays' })).toHaveCount(0);

  await page.reload();
  await expect(badge).toHaveText(/This week\s*\+1:00/);
});

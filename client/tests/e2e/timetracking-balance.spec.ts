import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Berlin' });

async function addProject(page: Page, customer: string, project: string): Promise<void> {
  await page.getByLabel('New customer name').fill(customer);
  await page.keyboard.press('Enter');
  await page.getByLabel('Select customer for new project').selectOption({ label: customer });
  await page.getByLabel('New project name').fill(project);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-project-name', { hasText: project })).toBeVisible();
}

async function logEntry(page: Page, description: string, date: string, start: string, duration: string): Promise<void> {
  await page.keyboard.press('n');
  await page.keyboard.type(description);
  await page.getByLabel('Project', { exact: true }).fill('Website');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Start', { exact: true }).fill(start);
  await page.keyboard.press('Tab');
  await page.getByLabel('Duration', { exact: true }).fill(duration);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tt-entry-row', { hasText: description })).toBeVisible();
  await page.keyboard.press('Escape');
}

const cardValue = (page: Page, name: string) =>
  page.getByTestId('tt-balance-card').locator('.tt-balance-item', { hasText: name }).locator('dd');

test('Weekly hours → logged entries → Reports shows the Balance for the week, the month and the year', async ({ page }) => {
  // Thursday 12 Nov 2026. Advancing clock so successive events get distinct timestamps.
  await page.clock.install({ time: new Date('2026-11-12T10:00:00+01:00') });
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();

  await page.locator('#tt-nav-settings').click();
  const weeklyHours = page.locator('#tt-section-settings').getByLabel('Weekly hours (contract)');
  await weeklyHours.fill('40');
  await weeklyHours.press('Tab');

  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await page.keyboard.press('Escape');

  await logEntry(page, 'Kick-off', '02.11.2026', '9:00', '8h');
  await logEntry(page, 'Build', '10.11.2026', '9:00', '9h');
  await logEntry(page, 'Review', '12.11.2026', '8:00', '1h');

  await page.locator('#tt-nav-reports').click();
  const period = page.getByTestId('tt-report-period');
  const card = page.getByTestId('tt-balance-card');
  await expect(period).toHaveText('November 2026');
  // First entry 2 Nov, today 12 Nov: 9 counted workdays (Mon–Fri) × 8h = 72h
  await expect(cardValue(page, 'Logged')).toHaveText('18:00');
  await expect(cardValue(page, 'Target')).toHaveText('72:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−54:00');
  await expect(cardValue(page, 'Balance')).toHaveClass(/is-deficit/);

  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(period).toHaveText('W46 · 9–15 Nov 2026');
  // Monday to today (4 workdays) × 8h = 32h
  await expect(cardValue(page, 'Logged')).toHaveText('10:00');
  await expect(cardValue(page, 'Target')).toHaveText('32:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−22:00');

  await page.keyboard.press('[');
  await expect(period).toHaveText('W45 · 2–8 Nov 2026');
  await expect(cardValue(page, 'Logged')).toHaveText('8:00');
  await expect(cardValue(page, 'Target')).toHaveText('40:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−32:00');

  await page.keyboard.press('[');
  await expect(period).toHaveText('W44 · 26 Oct – 1 Nov 2026');
  await expect(card).toBeHidden();

  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await expect(period).toHaveText('W47 · 16–22 Nov 2026');
  await expect(card).toBeHidden();

  await page.reload();
  await page.locator('#tt-nav-reports').click();
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(period).toHaveText('W46 · 9–15 Nov 2026');
  await expect(cardValue(page, 'Balance')).toHaveText('−22:00');

  // Year so far, counted from the first entry (2 Nov) to today: same 9 workdays as the month
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(period).toHaveText('2026');
  await expect(page.getByRole('img', { name: 'Monthly hours by project, 2026' })).toBeVisible();
  await expect(cardValue(page, 'Logged')).toHaveText('18:00');
  await expect(cardValue(page, 'Target')).toHaveText('72:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−54:00');
  await page.keyboard.press(']');
  await expect(period).toHaveText('2027');
  await expect(card).toBeHidden();
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(period).toHaveText('2025');
  await expect(card).toBeHidden();

  // 60 days on: Mon 11 Jan 2027. The Balance resets on 1 January; 2026 is finished.
  await page.clock.fastForward(60 * 24 * 3600 * 1000);
  await page.reload();
  await page.locator('#tt-nav-reports').click();
  await expect(page.getByRole('button', { name: 'Year', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(period).toHaveText('2027');
  // 1–11 Jan: 7 workdays × 8h
  await expect(cardValue(page, 'Logged')).toHaveText('0:00');
  await expect(cardValue(page, 'Target')).toHaveText('56:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−56:00');
  await page.keyboard.press('[');
  await expect(period).toHaveText('2026');
  // 2 Nov – 31 Dec: 44 workdays × 8h = 352h
  await expect(cardValue(page, 'Logged')).toHaveText('18:00');
  await expect(cardValue(page, 'Target')).toHaveText('352:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−334:00');
});

test('Workdays: a Monday at 40h is an 8h Target over Mon–Fri, and 10h after unticking Friday', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T18:00:00+01:00') });
  await page.goto('/timetracking.html');
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();

  await page.locator('#tt-nav-settings').click();
  const settings = page.locator('#tt-section-settings');
  const weeklyHours = settings.getByLabel('Weekly hours (contract)');
  await weeklyHours.fill('40');
  await weeklyHours.press('Tab');
  const workdays = settings.getByRole('group', { name: 'Workdays' });
  await expect(workdays.getByRole('checkbox', { name: 'Fri' })).toBeChecked();
  await expect(workdays.getByRole('checkbox', { name: 'Sat' })).not.toBeChecked();

  await page.locator('#tt-nav-projects').click();
  await addProject(page, 'Acme', 'Website');
  await page.keyboard.press('Escape');
  await logEntry(page, 'Monday', '09.11.2026', '9:00', '7h 35m');

  await page.locator('#tt-nav-reports').click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(cardValue(page, 'Logged')).toHaveText('7:35');
  await expect(cardValue(page, 'Target')).toHaveText('8:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−0:25');

  await page.locator('#tt-nav-settings').click();
  await workdays.getByRole('checkbox', { name: 'Fri' }).uncheck();
  await page.reload();
  await page.locator('#tt-nav-reports').click();
  await expect(cardValue(page, 'Target')).toHaveText('10:00');
  await expect(cardValue(page, 'Balance')).toHaveText('−2:25');
});

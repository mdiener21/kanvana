import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  addTask,
  closeSettings,
  dialog,
  moveTaskWithEditor,
  openBlankBoard,
  openSettings,
  reloadBoard,
  taskTitle,
} from './journey.helpers.js';

test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

const banner = (page: Page) => page.getByRole('alert').filter({ has: page.locator('#notification-banner-list') });
const openTask = (scope: Locator, title: string) => scope.getByRole('button', { name: `Open task: ${title}`, exact: true });
// The menu bell and the quick bell share one accessible name; only their ids tell them apart.
const quickBell = (page: Page) => page.locator('#notifications-quick-btn');
const menuBell = (page: Page) => page.locator('#notifications-btn');
const quickBadge = (page: Page) => page.locator('#notification-quick-badge');

async function startBoard(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+01:00'));
  await openBlankBoard(page);
}

async function addDueTasks(page: Page): Promise<void> {
  // Added out of urgency order on purpose
  await addTask(page, 'To Do', 'In three days', { dueDate: '2026-11-15', priority: 'low' });
  await addTask(page, 'To Do', 'Late task', { dueDate: '2026-11-10', priority: 'urgent' });
  await addTask(page, 'In Progress', 'Tomorrow task', { dueDate: '2026-11-13' });
  await addTask(page, 'To Do', 'Today task', { dueDate: '2026-11-12', priority: 'high' });
  await addTask(page, 'To Do', 'Far away', { dueDate: '2026-11-16' });
  await addTask(page, 'To Do', 'No due date');
  await addTask(page, 'Done', 'Finished late', { dueDate: '2026-11-01' });
}

test('nothing due: no banner and no count on either bell', async ({ page }) => {
  await startBoard(page);
  await addTask(page, 'To Do', 'Far away', { dueDate: '2026-11-16' });

  await expect(banner(page)).toBeHidden();
  await expect(quickBadge(page)).toBeHidden();
  await expect(quickBell(page)).toHaveAccessibleName('Notifications');

  await quickBell(page).click();
  await expect(dialog(page, 'Upcoming & Overdue Tasks')).toContainText('No tasks due within the next 3 days.');
});

test('the banner lists overdue and upcoming tasks with their status, leaving out Done and far-off tasks', async ({ page }) => {
  await startBoard(page);
  await addDueTasks(page);

  // The banner fits what the width allows, most urgent first, and the rest sit behind "+N".
  await expect(openTask(banner(page), 'Late task')).toContainText('Overdue by 2 days (11/10/2026)');
  const shown = await banner(page).getByRole('button', { name: /^Open task: / }).count();
  const expectedOrder = ['Open task: Late task', 'Open task: Today task', 'Open task: Tomorrow task', 'Open task: In three days'];
  const inBanner = await banner(page).getByRole('button', { name: /^Open task: / }).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  expect(inBanner).toEqual(expectedOrder.slice(0, shown));
  await expect(banner(page).getByRole('button', { name: `+${4 - shown}` })).toBeVisible();

  // Both bells share the count
  await expect(quickBadge(page)).toHaveText('4');
  await expect(quickBell(page)).toHaveAccessibleName('Notifications (4 notifications)');
  await expect(page.locator('#notification-badge')).toHaveText('4');

  await openTask(banner(page), 'Late task').click();
  const editor = dialog(page, 'Edit Task');
  await expect(editor).toBeVisible();
  await expect(taskTitle(editor)).toHaveValue('Late task');
});

test('the modal lists tasks most overdue first, with status and priority, from both bells', async ({ page }) => {
  await startBoard(page);
  await addDueTasks(page);

  await quickBell(page).click();
  const modal = dialog(page, 'Upcoming & Overdue Tasks');
  const list = modal.getByRole('list', { name: 'Tasks with approaching due dates' });
  await expect(list.locator('.notification-item-title')).toHaveText(['Late task', 'Today task', 'Tomorrow task', 'In three days']);
  const late = openTask(list, 'Late task');
  await expect(late).toContainText('Overdue by 2 days (11/10/2026)');
  await expect(late).toContainText('urgent');
  await expect(openTask(list, 'Today task')).toContainText('Due today (11/12/2026)');
  await expect(openTask(list, 'Tomorrow task')).toContainText('Due tomorrow (11/13/2026)');
  await expect(openTask(list, 'In three days')).toContainText('Due in 3 days (11/15/2026)');
  await expect(openTask(list, 'In three days')).toContainText('low');

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await menuBell(page).click();
  await expect(modal).toBeVisible();
  await openTask(list, 'Today task').click();

  await expect(modal).toBeHidden();
  const editor = dialog(page, 'Edit Task');
  await expect(editor).toBeVisible();
  await expect(taskTitle(editor)).toHaveValue('Today task');
});

test('the upcoming window follows the board setting', async ({ page }) => {
  await startBoard(page);
  await addDueTasks(page);
  await expect(quickBadge(page)).toHaveText('4');

  const settings = await openSettings(page);
  const days = settings.getByLabel('Number of days ahead to include for notifications');
  await days.fill('4');
  await days.blur();
  await closeSettings(page);

  await expect(quickBadge(page)).toHaveText('5');
  await quickBell(page).click();
  await expect(openTask(dialog(page, 'Upcoming & Overdue Tasks'), 'Far away')).toContainText('Due in 4 days (11/16/2026)');
});

test('dismissing the banner persists until the modal toggle brings it back', async ({ page }) => {
  await startBoard(page);
  await addTask(page, 'To Do', 'Late task', { dueDate: '2026-11-10' });
  await expect(banner(page)).toBeVisible();

  await page.getByRole('button', { name: 'Hide notification banner' }).click();
  await expect(banner(page)).toBeHidden();
  await expect(quickBadge(page)).toHaveText('1');

  await reloadBoard(page);
  await expect(quickBadge(page)).toHaveText('1');
  await expect(banner(page)).toBeHidden();

  await quickBell(page).click();
  const modal = dialog(page, 'Upcoming & Overdue Tasks');
  const toggle = modal.getByLabel('Show notification banner');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(banner(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  await reloadBoard(page);
  await expect(openTask(banner(page), 'Late task')).toBeVisible();
});

test('the banner hides by itself once no task qualifies', async ({ page }) => {
  await startBoard(page);
  await addTask(page, 'To Do', 'Late task', { dueDate: '2026-11-10' });
  await expect(banner(page)).toBeVisible();

  await moveTaskWithEditor(page, 'Late task', 'Done');

  await expect(banner(page)).toBeHidden();
  await expect(quickBadge(page)).toBeHidden();
});

test('the banner shows at most 5 tasks and links to the full modal for the rest', async ({ page }) => {
  await startBoard(page);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await addTask(page, 'To Do', `T${n}`, { dueDate: '2026-11-10' });

  await expect(quickBadge(page)).toHaveText('7');
  const shown = await banner(page).getByRole('button', { name: /^Open task: / }).count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThanOrEqual(5);

  await banner(page).getByRole('button', { name: `+${7 - shown}` }).click();
  await expect(dialog(page, 'Upcoming & Overdue Tasks').locator('.notification-item')).toHaveCount(7);
});

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 2560, height: 1080 } });

  test('the banner still shows at most 5 tasks', async ({ page }) => {
    await startBoard(page);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) await addTask(page, 'To Do', `T${n}`, { dueDate: '2026-11-10' });

    await expect(quickBadge(page)).toHaveText('7');
    await expect(banner(page).getByRole('button', { name: /^Open task: / }).first()).toBeVisible();
    const shown = await banner(page).getByRole('button', { name: /^Open task: / }).count();
    expect(shown).toBeLessThanOrEqual(5);
  });
});

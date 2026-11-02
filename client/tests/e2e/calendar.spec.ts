import { test, expect, type Locator, type Page } from '@playwright/test';
import { addTask, dialog, followMenuLink, moveTaskWithEditor, openBlankBoard, taskTitle } from './journey.helpers.js';

test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

const DANGER = 'rgb(220, 38, 38)';

// Day buttons expose only their digits as a name; the title is what carries the date.
const day = (page: Page, title: string) => page.getByTitle(title, { exact: true });
const badge = (cell: Locator) => cell.locator('.rpt-due-count');

// Every journey here first builds a board of dated tasks on the dev server, so give them room under parallel load.
test.beforeEach(() => {
  test.slow();
});

async function buildBoard(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+01:00'));
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Pay invoice', { dueDate: '2026-11-20' });
  await addTask(page, 'To Do', 'Renew licence', { dueDate: '2026-11-03' });
  await addTask(page, 'To Do', 'Archive report', { dueDate: '2026-11-03' });
  await moveTaskWithEditor(page, 'Archive report', 'Done');
  await addTask(page, 'In Progress', 'Book flights', { dueDate: '2026-12-05' });
  await addTask(page, 'In Progress', 'No date at all');
}

test('a task with a due date appears on its day and its link opens the task on the board', async ({ page }) => {
  await buildBoard(page);
  await followMenuLink(page, 'View Calendar');

  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(page.locator('#calendar-month-label')).toHaveText('November 2026');
  await expect(page.locator('#calendar-list-title')).toHaveText('Tasks due 2026-11-12 (0)');

  // Only the two days with tasks in this month carry a count
  await expect(page.getByRole('grid', { name: 'Due date month grid' }).locator('.rpt-due-count')).toHaveCount(2);
  const due = day(page, '2026-11-20: 1 task due');
  await expect(due.locator('.rpt-due-num')).toHaveText('20');
  await expect(badge(due)).toHaveText('1');

  await due.click();
  await expect(due).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#calendar-list-title')).toHaveText('Tasks due 2026-11-20 (1)');
  await page.getByRole('link', { name: 'Pay invoice', exact: true }).click();

  await expect(page).toHaveURL(/\/index\.html/);
  const editor = dialog(page, 'Edit Task');
  await expect(editor).toBeVisible();
  await expect(taskTitle(editor)).toHaveValue('Pay invoice');
  await expect(editor.getByLabel('Due Date', { exact: true })).toHaveValue('2026-11-20');
});

test('overdue tasks are red unless they are done', async ({ page }) => {
  await buildBoard(page);
  await followMenuLink(page, 'View Calendar');

  // One overdue and one done task on the same day: the badge goes red for the overdue one
  const overdueDay = day(page, '2026-11-03: 2 tasks due (1 overdue)');
  await expect(badge(overdueDay)).toHaveText('2');
  await expect(badge(overdueDay)).toHaveCSS('color', DANGER);
  await expect(badge(day(page, '2026-11-20: 1 task due'))).not.toHaveCSS('color', DANGER);

  await overdueDay.click();
  await expect(page.getByRole('link', { name: 'Renew licence', exact: true })).toHaveCSS('color', DANGER);
  await expect(page.getByRole('link', { name: 'Archive report', exact: true })).not.toHaveCSS('color', DANGER);
});

test('the month buttons show the due counts of the other months', async ({ page }) => {
  await buildBoard(page);
  await followMenuLink(page, 'View Calendar');
  await expect(page.locator('#calendar-month-label')).toHaveText('November 2026');

  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.locator('#calendar-month-label')).toHaveText('December 2026');
  await expect(badge(day(page, '2026-12-05: 1 task due'))).toHaveText('1');

  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('#calendar-month-label')).toHaveText('November 2026');
  await expect(badge(day(page, '2026-11-20: 1 task due'))).toHaveText('1');
});

test.fixme('clicking a day in another month lists its tasks', async ({ page }) => {
  // Bug: the grid's click handler is bound once and keeps the first month's task map, so other months always list 0 tasks (#260).
  await buildBoard(page);
  await followMenuLink(page, 'View Calendar');
  await expect(page.locator('#calendar-month-label')).toHaveText('November 2026');

  await page.getByRole('button', { name: 'Next month' }).click();
  await day(page, '2026-12-05: 1 task due').click();
  await expect(page.locator('#calendar-list-title')).toHaveText('Tasks due 2026-12-05 (1)');
  await expect(page.getByRole('link', { name: 'Book flights', exact: true })).toBeVisible();
});

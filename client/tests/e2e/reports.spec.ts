import { test, expect, type Page } from '@playwright/test';
import { dragByMouse } from './dragdrop.helpers.js';
import { addTask, card, columnTasks, followMenuLink, moveTaskWithEditor, openBlankBoard } from './journey.helpers.js';

test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

const kpi = (page: Page, label: string) =>
  page.getByRole('group', { name: 'Completion KPIs' }).locator('.rpt-kpi', { hasText: label }).locator('.rpt-kpi-value');

const LAST_WEEK = new Date('2026-11-05T10:00:00+01:00');
const MONDAY = new Date('2026-11-09T10:00:00+01:00');
const THIS_WEEK = new Date('2026-11-12T10:00:00+01:00');

test('the reports page loads and shows the tasks completed on the board', async ({ page }) => {
  test.slow(); // a long journey on the dev server; it needs room under parallel load
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.clock.setFixedTime(LAST_WEEK);
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Done last week');
  await moveTaskWithEditor(page, 'Done last week', 'Done');

  await page.clock.setFixedTime(MONDAY);
  await addTask(page, 'To Do', 'Took a few days');

  await page.clock.setFixedTime(THIS_WEEK);
  await addTask(page, 'To Do', 'Done today');
  await addTask(page, 'To Do', 'Still open');
  await moveTaskWithEditor(page, 'Took a few days', 'Done');
  // The board's main way to finish a task: drag it to Done
  await dragByMouse(page, card(page, 'Done today'), columnTasks(page, 'Done'));
  await expect(columnTasks(page, 'Done').getByRole('listitem', { name: 'Task: Done today' })).toBeVisible();

  await followMenuLink(page, 'View Reports');
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();

  await expect(kpi(page, 'Completed this week')).toHaveText('2');
  await expect(kpi(page, 'Completed last week')).toHaveText('1');

  // "Took a few days" was created on Monday and finished on Thursday, so it is not same-day.
  await expect(page.locator('#reports-sameday-this-week')).toHaveText('1');
  await expect(page.locator('#reports-sameday-last-week')).toHaveText('1');

  // Charts render. ECharts draws to canvas, so this is as far as a DOM check can go.
  for (const chart of ['reports-chart', 'reports-completed-spark', 'reports-sameday-spark', 'reports-leadtime-chart', 'reports-cfd-chart']) {
    await expect(page.locator(`#${chart} canvas`).first(), chart).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('average lead time runs from creation to done', async ({ page }) => {
  await page.clock.setFixedTime(MONDAY);
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Two days of work');

  await page.clock.setFixedTime(new Date('2026-11-11T10:00:00+01:00'));
  await moveTaskWithEditor(page, 'Two days of work', 'Done');

  await page.clock.setFixedTime(THIS_WEEK);
  await followMenuLink(page, 'View Reports');
  await expect(kpi(page, 'Avg lead time')).toHaveText('2.0d');
});

test('a board with nothing completed reports zero', async ({ page }) => {
  await page.clock.setFixedTime(THIS_WEEK);
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Still open');

  await followMenuLink(page, 'View Reports');
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
  await expect(kpi(page, 'Completed this week')).toHaveText('0');
  await expect(kpi(page, 'Avg lead time')).toHaveText('–');
});

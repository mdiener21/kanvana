import { test, expect } from '@playwright/test';
import {
  card,
  chooseImportFile,
  closeManageBoards,
  closeManageLabels,
  columnHeadings,
  columnTasks,
  confirm,
  jsonFile,
  openApp,
  openManageLabels,
  reloadBoard,
} from './journey.helpers.js';

const legacyTasks = [
  { id: 'legacy-1', title: 'From the old app', description: 'Still here', priority: 'high', dueDate: '2030-01-15', column: 'todo' },
  { id: 'legacy-2', text: 'Old field name', column: 'inprogress' },
  { id: 'legacy-3', title: 'Already finished', column: 'done' },
];

test('a legacy task-only file imports with default columns and shows the warning', async ({ page }) => {
  await openApp(page);

  const review = await chooseImportFile(page, jsonFile(legacyTasks, 'old-tasks.json'), 'Review Import');
  await expect(review).toContainText('Legacy task-only import detected. Default columns, labels, and settings will be used for the new board.');
  await expect(review).toContainText('create a new board named "old-tasks"');
  await confirm(page, 'Review Import', 'Import Board');
  await confirm(page, 'Import Complete', 'OK');
  await closeManageBoards(page);

  const expectImported = async () => {
    await expect(page.locator('#brand-text')).toHaveText('old-tasks');
    await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Done']);
    await expect(columnTasks(page, 'To Do').getByRole('listitem', { name: 'Task: From the old app' })).toBeVisible();
    await expect(columnTasks(page, 'In Progress').getByRole('listitem', { name: 'Task: Old field name' })).toBeVisible();
    await expect(columnTasks(page, 'Done').getByRole('listitem', { name: 'Task: Already finished' })).toBeVisible();
  };
  await expectImported();
  await expect(card(page, 'From the old app').locator('.task-priority')).toHaveAttribute('aria-label', 'Priority: high');

  // Default labels come with the new board.
  const labels = await openManageLabels(page);
  await expect(labels.getByText('Goal', { exact: true })).toBeVisible();
  await closeManageLabels(page);

  await reloadBoard(page);
  await expectImported();
});

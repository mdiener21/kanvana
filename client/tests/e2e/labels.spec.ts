import { test, expect, type Page } from '@playwright/test';
import {
  addTask,
  card,
  closeManageLabels,
  confirm,
  dialog,
  expectChipColors,
  openBlankBoard,
  openManageLabels,
  reloadBoard,
  taskTitle,
} from './journey.helpers.js';

const YELLOW = { hex: '#ffff00', rgb: 'rgb(255, 255, 0)' };
const NAVY = { hex: '#000080', rgb: 'rgb(0, 0, 128)' };
// docs/spec/labels.md luminance rule worked by hand: yellow is 225.9 (black text), navy 14.6 (white text).
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';

const search = (page: Page) => page.getByLabel('Search tasks by label, title, or description');
const row = (page: Page, name: string) => dialog(page, 'Manage Labels').locator('.label-item', { hasText: name });

test('a label can be created, recoloured, assigned, filtered by and deleted', async ({ page }) => {
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Plan offsite');
  await addTask(page, 'To Do', 'Book venue');

  // Create, in a new group
  const labels = await openManageLabels(page);
  await labels.getByRole('button', { name: 'Add Label', exact: true }).click();
  const form = dialog(page, 'Add Label');
  await form.getByLabel('Label Name').fill('Client work');
  await form.getByLabel('Group').fill('Clients');
  await form.getByLabel('Hex color code').fill(YELLOW.hex);
  await expect(form.getByLabel('Color', { exact: true })).toHaveValue(YELLOW.hex);
  await form.getByRole('button', { name: 'Add Label', exact: true }).click();
  await expect(form).toBeHidden();

  await labels.getByRole('button', { name: /^Clients/ }).click();
  await expectChipColors(row(page, 'Client work').locator('.task-label'), YELLOW.rgb, BLACK);

  // The manager's search finds it by group
  await labels.getByLabel('Filter labels').fill('clients');
  await expect(labels.locator('.label-item')).toHaveCount(1);
  await labels.getByLabel('Filter labels').fill('');
  await closeManageLabels(page);

  // Assign in the task editor
  await card(page, 'Plan offsite').locator('.task-title').click();
  const editor = dialog(page, 'Edit Task');
  await editor.getByLabel('Filter available labels').fill('client');
  await editor.getByRole('checkbox', { name: 'Client work', exact: true }).check();
  await editor.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(editor).toBeHidden();
  const chip = card(page, 'Plan offsite').locator('.task-label');
  await expect(chip).toHaveText(['Client work']);
  await expectChipColors(chip, YELLOW.rgb, BLACK);
  await expect(card(page, 'Book venue').locator('.task-label')).toHaveCount(0);

  // Edit the colour: the card follows, and text flips to white on a dark background
  await openManageLabels(page);
  await labels.getByRole('button', { name: /^Clients/ }).click();
  await row(page, 'Client work').getByRole('button', { name: 'Edit label' }).click();
  const edit = dialog(page, 'Edit Label');
  await expect(edit.getByLabel('Label Name')).toHaveValue('Client work');
  await expect(edit.getByLabel('Hex color code')).toHaveValue(YELLOW.hex);
  await edit.getByLabel('Hex color code').fill(NAVY.hex);
  await edit.getByRole('button', { name: 'Update Label', exact: true }).click();
  await expect(edit).toBeHidden();
  await closeManageLabels(page);
  await expectChipColors(chip, NAVY.rgb, WHITE);

  // Filter the board by it
  await search(page).fill('Client work');
  await expect(card(page, 'Plan offsite')).toBeVisible();
  await expect(card(page, 'Book venue')).toHaveCount(0);
  await search(page).fill('');
  await expect(card(page, 'Book venue')).toBeVisible();

  // Delete: cancelling keeps it, confirming removes it from the task too
  await openManageLabels(page);
  await labels.getByRole('button', { name: /^Clients/ }).click();
  await row(page, 'Client work').getByRole('button', { name: 'Delete label' }).click();
  await expect(dialog(page, 'Delete Label')).toContainText('Delete label "Client work"? This will remove it from all tasks.');
  await confirm(page, 'Delete Label', 'Cancel');
  await expect(row(page, 'Client work')).toHaveCount(1);

  await row(page, 'Client work').getByRole('button', { name: 'Delete label' }).click();
  await confirm(page, 'Delete Label', 'Delete');
  await expect(row(page, 'Client work')).toHaveCount(0);
  await closeManageLabels(page);

  const expectLabelGone = async () => {
    await expect(card(page, 'Plan offsite')).toBeVisible();
    await expect(card(page, 'Plan offsite').locator('.task-label')).toHaveCount(0);
  };
  await expectLabelGone();
  await reloadBoard(page);
  await expectLabelGone();
});

test('an invalid hex colour blocks saving a label', async ({ page }) => {
  await openBlankBoard(page);
  const labels = await openManageLabels(page);
  await labels.getByRole('button', { name: 'Add Label', exact: true }).click();
  const form = dialog(page, 'Add Label');
  await form.getByLabel('Label Name').fill('Broken');
  await form.getByLabel('Hex color code').fill('#12');
  await expect(form.getByLabel('Hex color code')).toHaveClass(/invalid/);
  await form.getByRole('button', { name: 'Add Label', exact: true }).click();

  await confirm(page, 'Invalid Hex Color', 'OK');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(labels.getByText('Broken', { exact: true })).toHaveCount(0);
});

test('a label created from the task editor is selected without leaving the task', async ({ page }) => {
  await openBlankBoard(page);
  await page.getByRole('button', { name: 'Add task to To Do', exact: true }).click();
  const task = dialog(page, 'Add New Task');
  await taskTitle(task).fill('Inline label task');
  await task.getByRole('button', { name: 'Add a new label' }).click();

  const form = dialog(page, 'Add Label');
  await form.getByLabel('Label Name').fill('Made inline');
  await form.getByRole('button', { name: 'Add Label', exact: true }).click();
  await expect(form).toBeHidden();

  await expect(task).toBeVisible();
  await expect(taskTitle(task)).toHaveValue('Inline label task');
  await expect(task.getByRole('list', { name: 'Selected labels' })).toContainText('Made inline');
  await expect(task.getByLabel('Filter available labels')).toHaveValue('');

  await task.getByRole('button', { name: 'Add Task', exact: true }).click();
  await expect(card(page, 'Inline label task').locator('.task-label')).toHaveText(['Made inline']);
});

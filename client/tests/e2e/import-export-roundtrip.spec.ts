import { test, expect, type Page } from '@playwright/test';
import {
  addTask,
  card,
  chooseImportFile,
  clickMenuButton,
  closeManageBoards,
  closeManageLabels,
  closeSettings,
  column,
  columnAccent,
  columnHeadings,
  columnTasks,
  confirm,
  dialog,
  expectChipColors,
  exportBoardFile,
  followMenuLink,
  importBoard,
  jsonFile,
  moveTaskWithEditor,
  openBlankBoard,
  openManageBoards,
  openManageLabels,
  openSettings,
} from './journey.helpers.js';

test.use({ timezoneId: 'Europe/Berlin', locale: 'en-US' });

const BOARD = 'Launch Plan';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+01:00'));
});

async function addColumn(page: Page, name: string, hex: string): Promise<void> {
  await clickMenuButton(page, 'Add Column');
  const form = dialog(page, 'Add New Column');
  await form.getByLabel('Column Name').fill(name);
  await form.getByLabel('Hex color code').fill(hex);
  await form.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(form).toBeHidden();
}

async function addLabel(page: Page, name: string, group: string, hex: string): Promise<void> {
  const labels = await openManageLabels(page);
  await labels.getByRole('button', { name: 'Add Label', exact: true }).click();
  const form = dialog(page, 'Add Label');
  await form.getByLabel('Label Name').fill(name);
  await form.getByLabel('Group').fill(group);
  await form.getByLabel('Hex color code').fill(hex);
  await form.getByRole('button', { name: 'Add Label', exact: true }).click();
  await expect(form).toBeHidden();
  await closeManageLabels(page);
}

async function deleteBoard(page: Page, name: string): Promise<void> {
  const boards = await openManageBoards(page);
  const row = boards.locator('.label-item', { hasText: name });
  await row.getByRole('button', { name: 'Delete board' }).click();
  await confirm(page, 'Delete Board', 'Delete');
  await expect(row).toHaveCount(0);
  await closeManageBoards(page);
}

test('an exported board imports as a new board with the same columns, tasks, labels, settings and done state', async ({ page }) => {
  test.slow(); // a long journey on the dev server; it needs room under parallel load
  await openBlankBoard(page, BOARD);
  await addColumn(page, 'Review', '#8b5cf6');
  await addLabel(page, 'Risky', 'Flags', '#ffff00');
  await addTask(page, 'To Do', 'Write brief', {
    description: 'One page, no jargon',
    priority: 'high',
    dueDate: '2026-12-01',
    labels: ['Risky'],
  });
  await addTask(page, 'Review', 'Check copy');
  await addTask(page, 'To Do', 'Kick-off');
  await moveTaskWithEditor(page, 'Kick-off', 'Done');

  await page.getByRole('button', { name: 'Collapse In Progress column', exact: true }).click();
  const settings = await openSettings(page);
  await settings.getByLabel('Show task priority').uncheck();
  await settings.getByLabel('Number of days ahead to include for notifications').fill('7');
  await settings.getByLabel('Number of days ahead to include for notifications').blur();
  await settings.getByLabel('Select default task priority').selectOption('medium');
  await closeSettings(page);

  const columnsBefore = await columnHeadings(page).allTextContents();
  expect(columnsBefore).toContain('In Progress (0)');
  const exported = await exportBoardFile(page, BOARD);
  await deleteBoard(page, BOARD);
  await expect(card(page, 'Write brief')).toHaveCount(0);

  const review = await chooseImportFile(page, jsonFile(exported.data, exported.filename), 'Review Import');
  await expect(review).toContainText(`create a new board named "${BOARD}" and switch to it`);
  await expect(review).toContainText('3 tasks, 4 columns, 6 labels, settings included');
  await confirm(page, 'Review Import', 'Import Board');
  await confirm(page, 'Import Complete', 'OK');
  await closeManageBoards(page);

  // The UI switched to the new board
  await expect(page.locator('#brand-text')).toHaveText(BOARD);

  // Columns: names, order, colour and collapsed state
  await expect(columnHeadings(page)).toHaveText(columnsBefore);
  expect(await columnAccent(column(page, 'Review'))).toBe('rgb(139, 92, 246)');

  // Tasks: each in its column, with its fields and label. Priority is hidden by the restored setting.
  await expect(columnTasks(page, 'To Do').getByRole('listitem', { name: 'Task: Write brief' })).toBeVisible();
  await expect(columnTasks(page, 'Review').getByRole('listitem', { name: 'Task: Check copy' })).toBeVisible();
  await expect(card(page, 'Write brief').locator('.task-priority')).toHaveCount(0);
  await expectChipColors(card(page, 'Write brief').getByText('Risky', { exact: true }), 'rgb(255, 255, 0)', 'rgb(0, 0, 0)');

  await card(page, 'Write brief').locator('.task-title').click();
  const editor = dialog(page, 'Edit Task');
  await expect(editor.getByLabel('Description', { exact: true })).toHaveValue('One page, no jargon');
  await expect(editor.getByLabel('Priority', { exact: true })).toHaveValue('high');
  await expect(editor.getByLabel('Due Date', { exact: true })).toHaveValue('2026-12-01');
  await editor.getByRole('button', { name: 'Close task editor' }).click();
  await expect(editor).toBeHidden();

  // Settings
  const restored = await openSettings(page);
  await expect(restored.getByLabel('Show task priority')).not.toBeChecked();
  await expect(restored.getByLabel('Number of days ahead to include for notifications')).toHaveValue('7');
  await expect(restored.getByLabel('Select default task priority')).toHaveValue('medium');
  await closeSettings(page);

  // The label's group came along too
  const labels = await openManageLabels(page);
  await labels.getByRole('button', { name: /^Flags/ }).click();
  await expect(labels.getByText('Risky', { exact: true })).toBeVisible();
  await closeManageLabels(page);

  // Done state: the task sits in Done and still counts as completed in the reports
  await expect(columnTasks(page, 'Done').getByRole('listitem', { name: 'Task: Kick-off' })).toBeVisible();
  await followMenuLink(page, 'View Reports');
  await expect(page.getByRole('group', { name: 'Completion KPIs' }).locator('#reports-completed-this-week')).toHaveText('1');
});

test('the exported file records its metadata, UUID ids and the Done role', async ({ page }) => {
  await openBlankBoard(page, BOARD);
  await addTask(page, 'To Do', 'Write brief');

  const { data } = await exportBoardFile(page, BOARD);

  expect(data.boardName).toBe(BOARD);
  expect(data.exportMeta).toEqual({
    appVersion: expect.any(String),
    schemaVersion: expect.any(Number),
    exportedAt: '2026-11-12T09:00:00.000Z',
  });
  expect(data.columns.map((c: { name: string }) => c.name)).toEqual(['To Do', 'In Progress', 'Done']);
  expect(data.columns.find((c: { name: string }) => c.name === 'Done').role).toBe('done');
  for (const item of [...data.columns, ...data.tasks, ...data.labels]) expect(item.id).toMatch(UUID);
});

test.fixme('the export file is named {boardName}-YYYY-MM-DD.json', async ({ page }) => {
  // Bug: the spec names it "Launch Plan-2026-11-12.json"; the app writes Launch_Plan_board_<ISO timestamp>.json.
  await openBlankBoard(page, BOARD);
  const { filename } = await exportBoardFile(page, BOARD);
  expect(filename).toBe(`${BOARD}-2026-11-12.json`);
});

test.fixme('a column WIP limit survives export and import', async ({ page }) => {
  // Bug: normalizeImportedColumns drops wipLimit, so the limit is lost though columns must round-trip.
  await openBlankBoard(page, BOARD);
  await column(page, 'To Do').getByRole('button', { name: 'To Do column menu' }).click();
  await column(page, 'To Do').getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const form = dialog(page, 'Edit Column');
  await form.getByLabel('WIP Limit').fill('5');
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(column(page, 'To Do').locator('.task-counter')).toHaveText('0/5');

  const { data, filename } = await exportBoardFile(page, BOARD);
  await deleteBoard(page, BOARD);
  await importBoard(page, jsonFile(data, filename));

  await expect(page.locator('#brand-text')).toHaveText(BOARD);
  await expect(column(page, 'To Do').locator('.task-counter')).toHaveText('0/5');
});

test.fixme('the countdown thresholds survive export and import', async ({ page }) => {
  // Bug: the export and import settings normalizers drop both thresholds, though settings must round-trip.
  await openBlankBoard(page, BOARD);
  const settings = await openSettings(page);
  const urgent = settings.getByLabel('Days until due date to show countdown in red (urgent)');
  const warning = settings.getByLabel('Days until due date to show countdown in amber (warning)');
  await warning.fill('20');
  await warning.blur();
  await urgent.fill('9');
  await urgent.blur();
  await closeSettings(page);

  const { data, filename } = await exportBoardFile(page, BOARD);
  await deleteBoard(page, BOARD);
  await importBoard(page, jsonFile(data, filename));

  await expect(page.locator('#brand-text')).toHaveText(BOARD);
  const restored = await openSettings(page);
  await expect(restored.getByLabel('Days until due date to show countdown in red (urgent)')).toHaveValue('9');
  await expect(restored.getByLabel('Days until due date to show countdown in amber (warning)')).toHaveValue('20');
});

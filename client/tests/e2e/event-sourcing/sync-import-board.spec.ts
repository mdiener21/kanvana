// #231 journey 1, regression for #226: the import wrote columns, tasks, labels and settings
// straight into the read model, so a second device only ever got an empty default board.
import { test, expect, type Page } from '@playwright/test';
import {
  card,
  closeManageLabels,
  closeSettings,
  column,
  columnAccent,
  columnHeadings,
  columnTasks,
  dialog,
  expectChipColors,
  importBoard,
  jsonFile,
  openManageLabels,
  openSettings,
} from '../journey.helpers.js';
import { registerAccount, requirePocketBase, selectBoard, signedInDevice, SYNC_TIMEOUT, twoDevices } from './live.helpers.js';

requirePocketBase();

const BOARD = 'Imported Launch Plan';
const COLUMNS = {
  backlog: '11111111-1111-4111-8111-111111111111',
  review: '22222222-2222-4222-8222-222222222222',
  shipped: '33333333-3333-4333-8333-333333333333',
  later: '99999999-9999-4999-8999-999999999999',
};
const RISKY = '44444444-4444-4444-8444-444444444444';
const QUICK = '55555555-5555-4555-8555-555555555555';

const boardFile = jsonFile({
  boardName: BOARD,
  columns: [
    { id: COLUMNS.backlog, name: 'Backlog', color: '#0ea5e9', order: 1 },
    { id: COLUMNS.review, name: 'Peer Review', color: '#8b5cf6', order: 2 },
    { id: COLUMNS.later, name: 'Later', color: '#f97316', order: 3, collapsed: true },
    { id: COLUMNS.shipped, name: 'Shipped', color: '#6d6d6d', order: 4, role: 'done' },
  ],
  labels: [
    { id: RISKY, name: 'Risky', color: '#ffff00', group: 'Flags' },
    { id: QUICK, name: 'Quick win', color: '#000080', group: '' },
  ],
  tasks: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      title: 'Write brief',
      description: 'One page, no jargon',
      priority: 'high',
      dueDate: '2031-03-15',
      column: COLUMNS.backlog,
      order: 1,
      labels: [RISKY],
      subTasks: [
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Outline', completed: true, order: 1 },
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Get sign-off', completed: false, order: 2 },
      ],
      relationships: [{ type: 'related', targetTaskId: '77777777-7777-4777-8777-777777777777' }],
      creationDate: '2030-01-01T10:00:00.000Z',
      changeDate: '2030-01-01T10:00:00.000Z',
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Check copy',
      priority: 'low',
      column: COLUMNS.review,
      order: 1,
      labels: [QUICK],
      relationships: [{ type: 'related', targetTaskId: '66666666-6666-4666-8666-666666666666' }],
      creationDate: '2030-01-01T10:00:00.000Z',
      changeDate: '2030-01-01T10:00:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      title: 'Kick-off',
      priority: 'none',
      column: COLUMNS.shipped,
      order: 1,
      labels: [],
      creationDate: '2030-01-01T10:00:00.000Z',
      changeDate: '2030-01-01T10:00:00.000Z',
    },
  ],
  settings: {
    showPriority: false,
    showDueDate: true,
    showAge: false,
    showChangeDate: false,
    locale: 'de-DE',
    defaultPriority: 'medium',
    notificationDays: 7,
  },
}, 'launch-plan.json');

async function expectImportedBoard(page: Page): Promise<void> {
  await expect(columnHeadings(page)).toHaveText(['Backlog', 'Peer Review', 'Later (0)', 'Shipped'], { timeout: SYNC_TIMEOUT });
  expect(await columnAccent(column(page, 'Peer Review'))).toBe('rgb(139, 92, 246)');

  await expect(columnTasks(page, 'Backlog').getByRole('listitem', { name: 'Task: Write brief', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(columnTasks(page, 'Peer Review').getByRole('listitem', { name: 'Task: Check copy', exact: true })).toBeVisible();
  await expect(columnTasks(page, 'Shipped').getByRole('listitem', { name: 'Task: Kick-off', exact: true })).toBeVisible();

  await expectChipColors(card(page, 'Write brief').getByText('Risky', { exact: true }), 'rgb(255, 255, 0)', 'rgb(0, 0, 0)');
  await expectChipColors(card(page, 'Check copy').getByText('Quick win', { exact: true }), 'rgb(0, 0, 128)', 'rgb(255, 255, 255)');
  // The imported settings hide the priority badge and show the due date.
  await expect(card(page, 'Write brief').locator('.task-priority')).toHaveCount(0);
  await expect(card(page, 'Write brief')).toContainText('15.3.2031');
  await expect(card(page, 'Write brief')).toContainText('1/2 Done');
  await expect(card(page, 'Write brief')).toContainText('relationships (1)');

  await card(page, 'Write brief').locator('.task-title').click();
  const editor = dialog(page, 'Edit Task');
  await expect(editor.getByLabel('Description', { exact: true })).toHaveValue('One page, no jargon');
  await expect(editor.getByLabel('Priority', { exact: true })).toHaveValue('high');
  await expect(editor.getByLabel('Due Date', { exact: true })).toHaveValue('2031-03-15');
  await expect(editor.getByText('Get sign-off', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Close task editor' }).click();
  await expect(editor).toBeHidden();

  const settings = await openSettings(page);
  await expect(settings.getByLabel('Show task priority')).not.toBeChecked();
  await expect(settings.getByLabel('Show task due date')).toBeChecked();
  await expect(settings.getByLabel('Show task age')).not.toBeChecked();
  await expect(settings.getByLabel('Show updated date/time')).not.toBeChecked();
  await expect(settings.getByLabel('Number of days ahead to include for notifications')).toHaveValue('7');
  await expect(settings.getByLabel('Select locale')).toHaveValue('de-DE');
  await expect(settings.getByLabel('Select default task priority')).toHaveValue('medium');
  await closeSettings(page);

  const labels = await openManageLabels(page);
  await labels.getByRole('button', { name: /^Flags/ }).click();
  await expect(labels.getByText('Risky', { exact: true })).toBeVisible();
  await expect(labels.getByText('Quick win', { exact: true })).toBeVisible();
  await closeManageLabels(page);
}

test('a board imported on A shows on B with all its columns, tasks, labels and settings', async ({ browser }) => {
  test.slow();
  const devices = await twoDevices(browser, await registerAccount('import'));

  await importBoard(devices.a, boardFile);
  await expect(devices.a.locator('#brand-text')).toHaveText(BOARD);
  await expectImportedBoard(devices.a);

  await selectBoard(devices.b, BOARD);
  await expectImportedBoard(devices.b);
  expect(devices.reloadsOnB()).toBe(0);

  await devices.close();
});

test('a device that signs in after the import catches up to the whole board', async ({ browser }) => {
  test.slow();
  const email = await registerAccount('import-late');
  const a = await signedInDevice(browser, email);
  await importBoard(a, boardFile);
  await expect(a.locator('#brand-text')).toHaveText(BOARD);

  const late = await signedInDevice(browser, email);
  await selectBoard(late, BOARD);
  await expectImportedBoard(late);

  await a.context().close();
  await late.context().close();
});

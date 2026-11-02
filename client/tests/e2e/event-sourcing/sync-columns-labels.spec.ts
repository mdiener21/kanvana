// #231 journey 3: a column or label change on one device reaches the other without a reload.
import { test, expect, type Page } from '@playwright/test';
import {
  addTask,
  allCards,
  card,
  clickMenuButton,
  closeManageLabels,
  column,
  columnAccent,
  columnHeadings,
  confirm,
  dialog,
  expectChipColors,
  openManageLabels,
} from '../journey.helpers.js';
import { expectSameBoardAfterReload, registerAccount, requirePocketBase, SYNC_TIMEOUT, twoDevicesOnNewBoard } from './live.helpers.js';

requirePocketBase();

const labelRow = (page: Page, name: string) => dialog(page, 'Manage Labels').locator('.label-item', { hasText: name });

async function expectSameColumns(a: Page, b: Page): Promise<void> {
  await expect.poll(async () => columnHeadings(b).allTextContents(), { timeout: SYNC_TIMEOUT })
    .toEqual(await columnHeadings(a).allTextContents());
}

async function openColumnEditor(page: Page, name: string) {
  await column(page, name).getByRole('button', { name: `${name} column menu`, exact: true }).click();
  await column(page, name).getByRole('menuitem', { name: 'Edit', exact: true }).click();
  return dialog(page, 'Edit Column');
}

test('a column added, renamed and deleted on A shows on B without a reload', async ({ browser }) => {
  test.slow();
  const { a, b, reloadsOnB, close } = await twoDevicesOnNewBoard(browser, await registerAccount('columns'));

  // Add
  await clickMenuButton(a, 'Add Column');
  const add = dialog(a, 'Add New Column');
  await add.getByLabel('Column Name').fill('Review');
  await add.getByLabel('Hex color code').fill('#8b5cf6');
  await add.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(add).toBeHidden();
  await expect(column(b, 'Review')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectSameColumns(a, b);
  expect(await columnAccent(column(b, 'Review'))).toBe('rgb(139, 92, 246)');

  await addTask(a, 'Review', 'Check copy');
  await expect(column(b, 'Review').getByRole('listitem', { name: 'Task: Check copy', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });

  // Rename: the task stays in it
  const edit = await openColumnEditor(a, 'Review');
  await edit.getByLabel('Column Name').fill('Peer Review');
  await edit.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(column(b, 'Peer Review')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(column(b, 'Review')).toHaveCount(0);
  await expect(column(b, 'Peer Review').getByRole('listitem', { name: 'Task: Check copy', exact: true })).toBeVisible();
  await expectSameColumns(a, b);

  // Delete: its tasks go with it
  const othersBefore = await allCards(b).count() - 1;
  await column(a, 'Peer Review').getByRole('button', { name: 'Peer Review column menu', exact: true }).click();
  await column(a, 'Peer Review').getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await confirm(a, 'Delete Column', 'Delete');
  await expect(column(b, 'Peer Review')).toHaveCount(0, { timeout: SYNC_TIMEOUT });
  await expectSameColumns(a, b);
  await expect(card(b, 'Check copy')).toHaveCount(0);
  await expect(allCards(b)).toHaveCount(othersBefore);

  expect(reloadsOnB()).toBe(0);
  await expectSameBoardAfterReload(a, b);
  await close();
});

test('a label added, renamed and deleted on A shows on B without a reload', async ({ browser }) => {
  test.slow();
  const { a, b, reloadsOnB, close } = await twoDevicesOnNewBoard(browser, await registerAccount('labels'));

  // Add
  const labelsA = await openManageLabels(a);
  await labelsA.getByRole('button', { name: 'Add Label', exact: true }).click();
  const add = dialog(a, 'Add Label');
  await add.getByLabel('Label Name').fill('Client work');
  await add.getByLabel('Group').fill('Clients');
  await add.getByLabel('Hex color code').fill('#ffff00');
  await add.getByRole('button', { name: 'Add Label', exact: true }).click();
  await expect(add).toBeHidden();
  await closeManageLabels(a);

  // The manager lists what was there when it opened, so B looks again until the label has come.
  const labelsB = dialog(b, 'Manage Labels');
  await expect(async () => {
    await openManageLabels(b);
    try {
      await expect(labelsB.getByRole('button', { name: /^Clients/ })).toBeVisible({ timeout: 500 });
    } catch (err) {
      await closeManageLabels(b);
      throw err;
    }
  }).toPass({ timeout: SYNC_TIMEOUT });
  await labelsB.getByRole('button', { name: /^Clients/ }).click();
  await expectChipColors(labelRow(b, 'Client work').locator('.task-label'), 'rgb(255, 255, 0)', 'rgb(0, 0, 0)');
  await closeManageLabels(b);

  // Assigned, it shows on B's card
  await addTask(a, 'To Do', 'Plan offsite', { labels: ['Client work'] });
  const cardOnB = card(b, 'Plan offsite');
  await expect(cardOnB.getByText('Client work', { exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });

  // Rename and recolour: B's card follows
  await openManageLabels(a);
  await labelsA.getByRole('button', { name: /^Clients/ }).click();
  await labelRow(a, 'Client work').getByRole('button', { name: 'Edit label' }).click();
  const edit = dialog(a, 'Edit Label');
  await edit.getByLabel('Label Name').fill('Customer work');
  await edit.getByLabel('Hex color code').fill('#000080');
  await edit.getByRole('button', { name: 'Update Label', exact: true }).click();
  await expect(edit).toBeHidden();
  await closeManageLabels(a);

  const renamed = cardOnB.getByText('Customer work', { exact: true });
  await expect(renamed).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectChipColors(renamed, 'rgb(0, 0, 128)', 'rgb(255, 255, 255)');
  await expect(cardOnB.getByText('Client work', { exact: true })).toHaveCount(0);

  // Delete: it leaves B's card and B's manager
  await openManageLabels(a);
  await labelsA.getByRole('button', { name: /^Clients/ }).click();
  await labelRow(a, 'Customer work').getByRole('button', { name: 'Delete label' }).click();
  await confirm(a, 'Delete Label', 'Delete');
  await closeManageLabels(a);

  await expect(cardOnB.getByText('Customer work', { exact: true })).toHaveCount(0, { timeout: SYNC_TIMEOUT });
  await expect(cardOnB).toBeVisible();
  await openManageLabels(b);
  await expect(labelsB.getByRole('button', { name: /^Clients/ })).toHaveCount(0);
  await expect(labelsB.getByText('Customer work')).toHaveCount(0);
  await closeManageLabels(b);

  expect(reloadsOnB()).toBe(0);
  await expectSameBoardAfterReload(a, b);
  await close();
});

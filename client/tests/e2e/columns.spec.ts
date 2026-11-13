import { test, expect, type Page } from '@playwright/test';
import { dragByMouse } from './dragdrop.helpers.js';
import {
  addTask,
  allCards,
  card,
  clickMenuButton,
  column,
  columnAccent,
  columnHeadings,
  confirm,
  dialog,
  openBlankBoard,
  reloadBoard,
} from './journey.helpers.js';

// What reaches other devices does not show in this page's UI, so this check reads the event store.
async function storedEventTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('kanvana-db');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const all = open.result.transaction('events').objectStore('events').getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        open.result.close();
        resolve(all.result.map((event: { type: string }) => event.type));
      };
    };
  }));
}

async function addColumn(page: Page, name: string): Promise<void> {
  await clickMenuButton(page, 'Add Column');
  const form = dialog(page, 'Add New Column');
  await form.getByLabel('Column Name').fill(name);
  await form.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(form).toBeHidden();
}

async function openColumnMenu(page: Page, name: string): Promise<void> {
  await column(page, name).getByRole('button', { name: `${name} column menu`, exact: true }).click();
}

async function editColumn(page: Page, name: string, change: { name?: string; hex?: string }): Promise<void> {
  await openColumnMenu(page, name);
  await column(page, name).getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const form = dialog(page, 'Edit Column');
  await expect(form.getByLabel('Column Name')).toHaveValue(name);
  if (change.name) await form.getByLabel('Column Name').fill(change.name);
  if (change.hex) await form.getByLabel('Hex color code').fill(change.hex);
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).toBeHidden();
}

async function deleteColumn(page: Page, name: string): Promise<void> {
  await openColumnMenu(page, name);
  await column(page, name).getByRole('menuitem', { name: 'Delete', exact: true }).click();
}

test('new columns go before the permanent Done column', async ({ page }) => {
  await openBlankBoard(page);
  await addColumn(page, 'Review');
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Review', 'Done']);
  await addColumn(page, 'QA');
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Review', 'QA', 'Done']);
});

test('adding a column requires a name', async ({ page }) => {
  await openBlankBoard(page);
  await clickMenuButton(page, 'Add Column');
  const form = dialog(page, 'Add New Column');
  await form.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(form.locator('.error-message')).toBeVisible();
  await expect(form).toBeVisible();
  await form.getByLabel('Column Name').fill('Review');
  await form.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(column(page, 'Review')).toBeVisible();
});

test('a column can be renamed, recoloured, reordered and collapsed, and all of it survives a reload', async ({ page }) => {
  await openBlankBoard(page);

  // Rename and recolour through the header menu
  await editColumn(page, 'In Progress', { name: 'Review', hex: '#8b5cf6' });
  await expect(columnHeadings(page)).toHaveText(['To Do', 'Review', 'Done']);
  expect(await columnAccent(column(page, 'Review'))).toBe('rgb(139, 92, 246)');
  await addTask(page, 'Review', 'Check copy');

  // Reorder by the drag handle
  await dragByMouse(
    page,
    column(page, 'Review').getByRole('button', { name: 'Drag to reorder column' }),
    column(page, 'To Do').locator('header'),
  );
  await expect(columnHeadings(page)).toHaveText(['Review', 'To Do', 'Done']);

  // Collapse: the rail shows the name and task count, not the tasks
  await page.getByRole('button', { name: 'Collapse Review column', exact: true }).click();
  await expect(columnHeadings(page)).toHaveText(['Review (1)', 'To Do', 'Done']);
  await expect(card(page, 'Check copy')).toBeHidden();

  await reloadBoard(page);
  await expect(columnHeadings(page)).toHaveText(['Review (1)', 'To Do', 'Done']);
  await expect(card(page, 'Check copy')).toBeHidden();

  // Expand: a click anywhere on the collapsed rail, not just its button
  await column(page, 'Review (1)').locator('h2').click();
  await expect(columnHeadings(page)).toHaveText(['Review', 'To Do', 'Done']);
  await expect(card(page, 'Check copy')).toBeVisible();
  expect(await columnAccent(column(page, 'Review'))).toBe('rgb(139, 92, 246)');
});

test('deleting a column asks first and takes its tasks with it', async ({ page }) => {
  await openBlankBoard(page);
  await addColumn(page, 'Review');
  await addTask(page, 'Review', 'Goes away');
  await addTask(page, 'Review', 'Goes away too');
  await addTask(page, 'To Do', 'Stays');

  await deleteColumn(page, 'Review');
  await expect(dialog(page, 'Delete Column')).toContainText('Delete "Review"? This will also delete 2 task(s).');
  await confirm(page, 'Delete Column', 'Cancel');
  await expect(column(page, 'Review')).toBeVisible();
  await expect(allCards(page)).toHaveCount(3);

  await deleteColumn(page, 'Review');
  await confirm(page, 'Delete Column', 'Delete');
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Done']);
  await expect(allCards(page)).toHaveCount(1);
  await expect(card(page, 'Stays')).toBeVisible();
});

test('a deleted column stays deleted after an immediate reload', async ({ page }) => {
  await openBlankBoard(page);
  await addColumn(page, 'Review');
  await addTask(page, 'Review', 'Goes away');
  await addTask(page, 'To Do', 'Stays');

  await deleteColumn(page, 'Review');
  await confirm(page, 'Delete Column', 'Delete');
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Done']);

  await reloadBoard(page);
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Done']);
  await expect(allCards(page)).toHaveCount(1);
  // Without its stored event the delete would look saved here but never reach other devices.
  expect(await storedEventTypes(page)).toContain('column.deleted');
});

test('the Done column cannot be deleted', async ({ page }) => {
  await openBlankBoard(page);
  await deleteColumn(page, 'Done');
  await expect(dialog(page, 'Cannot Delete Column')).toContainText('The Done column is permanent and cannot be deleted.');
  await confirm(page, 'Cannot Delete Column', 'OK');
  await expect(columnHeadings(page)).toHaveText(['To Do', 'In Progress', 'Done']);
});

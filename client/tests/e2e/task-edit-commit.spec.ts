import { test, expect, type Page } from '@playwright/test';
import { addTask, card, columnTasks, dialog, openBlankBoard, reloadBoard, taskTitle } from './journey.helpers.js';

// #142: one save that changes the title, a label, a relationship, a sub-task and the column
// is many events, but the board draws it once and each changed slice is stored once.

const renderCount = (page: Page) => page.evaluate(() => (
  performance.getEntriesByName('kanvana:board-render:full').length
  + performance.getEntriesByName('kanvana:board-render:reconcile').length
));

const tasksSliceWrites = (page: Page) => page.evaluate(() => (globalThis as any).__taskWrites.length);

function storedEvents(page: Page): Promise<{ id: string; type: string }[]> {
  return page.evaluate(() => new Promise<{ id: string; type: string }[]>((resolve, reject) => {
    const request = indexedDB.open('kanvana-db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('events').objectStore('events').getAll();
      read.onerror = () => { reject(read.error); db.close(); };
      read.onsuccess = () => { db.close(); resolve(read.result.map(({ id, type }: { id: string; type: string }) => ({ id, type }))); };
    };
  }));
}

test('a save with labels, a relationship, a sub-task and a column move draws the board once and survives a reload', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as any).__kanvanaPerfMarks = true;
    const writes: string[] = [];
    (globalThis as any).__taskWrites = writes;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function countTaskWrites(...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'read_model' && String(args[1]).endsWith(':tasks')) writes.push(String(args[1]));
      return original.apply(this, args);
    };
  });
  await openBlankBoard(page);
  await addTask(page, 'To Do', 'Linked task');
  await addTask(page, 'To Do', 'Edited task');

  await card(page, 'Edited task').locator('.task-title').click();
  const form = dialog(page, 'Edit Task');
  await expect(form).toBeVisible();
  await taskTitle(form).fill('Edited and moved');
  await form.getByLabel('Filter available labels').fill('Idea');
  await form.getByRole('checkbox', { name: 'Idea', exact: true }).check();
  await form.locator('#task-relationship-search').fill('Linked task');
  await form.locator('.relationship-result-item').click();
  await form.locator('#task-subtask-input').fill('First step');
  await form.locator('#task-subtask-input').press('Enter');
  await form.getByLabel('Column', { exact: true }).selectOption({ label: 'In Progress' });

  const rendersBefore = await renderCount(page);
  const writesBefore = await tasksSliceWrites(page);
  const eventsBefore = new Set((await storedEvents(page)).map((event) => event.id));
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).toBeHidden();

  const moved = columnTasks(page, 'In Progress').getByRole('listitem', { name: 'Task: Edited and moved', exact: true });
  await expect(moved).toBeVisible();
  await expect(moved.getByText('Idea', { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedEvents(page)).length).toBe(eventsBefore.size + 6);
  const saved = (await storedEvents(page)).filter((event) => !eventsBefore.has(event.id)).map((event) => event.type);
  expect(saved.sort()).toEqual([
    'label.added_to_task', 'relationship.added', 'relationship.added', 'subtask.added', 'task.moved', 'task.updated',
  ]);
  expect(await renderCount(page) - rendersBefore).toBe(1);
  expect(await tasksSliceWrites(page) - writesBefore).toBe(1);

  await reloadBoard(page);
  const reloaded = columnTasks(page, 'In Progress').getByRole('listitem', { name: 'Task: Edited and moved', exact: true });
  await expect(reloaded.getByText('Idea', { exact: true })).toBeVisible();
  await reloaded.locator('.task-title').click();
  await expect(form.locator('#task-subtasks-list .subtask-title')).toHaveText('First step');
  await expect(form.locator('#task-active-relationships')).not.toBeEmpty();
  await form.getByRole('button', { name: 'Close task editor' }).click();

  // The other side of the link came from its own event, in the same save.
  await card(page, 'Linked task').locator('.task-title').click();
  await expect(form.locator('#task-active-relationships')).not.toBeEmpty();
});

import { test, expect, type Page } from '@playwright/test';

function columnByName(page: Page, name: string) {
  return page.locator('article.task-column').filter({ has: page.locator('h2', { hasText: name }) });
}

async function setWipLimit(page: Page, columnName: string, limit: number) {
  const column = columnByName(page, columnName);
  await column.getByRole('button', { name: `${columnName} column menu` }).click();
  await column.getByRole('menuitem', { name: 'Edit', exact: true }).click();

  const modal = page.locator('#column-modal');
  await expect(modal).toBeVisible();
  await modal.locator('#column-wip-limit').fill(String(limit));
  await modal.getByRole('button', { name: 'Save Changes' }).click();
  await expect(modal).toBeHidden();
}

async function addTask(page: Page, columnName: string, title: string) {
  await page.getByRole('button', { name: `Add task to ${columnName}` }).click();
  const modal = page.locator('#task-modal');
  await expect(modal).toBeVisible();
  await modal.locator('#task-title').fill(title);
  await modal.getByRole('button', { name: 'Add Task', exact: true }).click();
  await expect(modal).toBeHidden();
}

test.describe('WIP limits', () => {
  test.describe.configure({ mode: 'serial' });

  test('a regular column exposes a WIP limit field defaulting to unlimited', async ({ page }) => {
    await page.goto('/');
    const column = columnByName(page, 'To Do');
    await column.getByRole('button', { name: 'To Do column menu' }).click();
    await column.getByRole('menuitem', { name: 'Edit', exact: true }).click();

    const modal = page.locator('#column-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#column-wip-limit-group')).toBeVisible();
    await expect(modal.locator('#column-wip-limit')).toHaveValue('0');
  });

  test('the Done column hides the WIP limit field', async ({ page }) => {
    await page.goto('/');
    const done = columnByName(page, 'Done');
    await done.getByRole('button', { name: 'Done column menu' }).click();
    await done.getByRole('menuitem', { name: 'Edit', exact: true }).click();

    await expect(page.locator('#column-modal')).toBeVisible();
    await expect(page.locator('#column-wip-limit-group')).toBeHidden();
  });

  test('counter shows count/limit and escalates under → at → over', async ({ page }) => {
    await page.goto('/');
    await setWipLimit(page, 'To Do', 2);

    const column = columnByName(page, 'To Do');
    const counter = column.locator('.task-counter');

    await expect(column).toHaveAttribute('data-wip', 'under');
    await expect(counter).toContainText('/2');

    const start = Number((await counter.textContent())?.split('/')[0] ?? 0);
    for (let i = start; i < 2; i += 1) {
      await addTask(page, 'To Do', `WIP task ${i + 1}`);
    }

    await expect(column).toHaveAttribute('data-wip', 'at');
    await expect(counter).toHaveText('2/2');

    await addTask(page, 'To Do', 'WIP task overflow');

    // Advisory only: the task is created even though the column is full.
    await expect(column).toHaveAttribute('data-wip', 'over');
    await expect(counter).toHaveText('3/2');
    await expect(page.getByRole('listitem', { name: /Task: WIP task overflow/i })).toBeVisible();
  });

  test('the limit survives a reload', async ({ page }) => {
    await page.goto('/');
    await setWipLimit(page, 'To Do', 7);

    await page.reload();
    await expect(columnByName(page, 'To Do').locator('.task-counter')).toContainText('/7');
  });
});

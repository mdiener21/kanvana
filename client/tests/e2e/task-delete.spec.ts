import { test, expect, type Page } from '@playwright/test';

const PERMANENT_DELETE_MSG = 'Delete this task? This cannot be undone.';
const SOFT_DELETE_MSG =
  'You have soft-delete active, this will set the task as deleted and will not count or show in any location, to permanently delete you must click purge in the settings.';

async function getTaskCount(page: Page, columnName: string): Promise<number> {
  const column = page
    .locator('article.task-column')
    .filter({ has: page.locator('h2', { hasText: columnName }) });
  const counter = column.locator('.task-counter');
  await expect(counter).toHaveText(/\d+/);
  const text = (await counter.textContent()) ?? '';
  const count = Number.parseInt(text, 10);
  if (!Number.isFinite(count)) {
    throw new Error(`Expected numeric counter for column '${columnName}', got '${text}'`);
  }
  return count;
}

async function createTask(page: Page, title: string, column = 'To Do') {
  await page.getByRole('button', { name: `Add task to ${column}` }).click();
  const modal = page.locator('#task-modal');
  await expect(modal).toBeVisible();
  await modal.locator('#task-title').fill(title);
  await modal.getByRole('button', { name: 'Add Task', exact: true }).click();
  await expect(page.getByRole('listitem', { name: new RegExp(`Task: ${title}`, 'i') })).toBeVisible();
}

async function openSettings(page: Page) {
  const settingsBtn = page.locator('#settings-btn');
  const menuBtn = page.locator('#desktop-menu-btn');
  if (!(await settingsBtn.isVisible()) && (await menuBtn.isVisible())) {
    await menuBtn.click();
  }
  await expect(settingsBtn).toBeVisible();
  await settingsBtn.click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}

async function closeSettings(page: Page) {
  await page.locator('#settings-close-btn').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
}

async function setSoftDelete(page: Page, enabled: boolean) {
  await openSettings(page);
  const toggle = page.locator('#settings-soft-delete-enabled');
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
  }
  await closeSettings(page);
}

test.describe('Task Deletion', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
    // Guarantee soft-delete is off before every test, including after a mid-test failure.
    await setSoftDelete(page, false);
  });

  test('permanent delete — confirm removes task and decrements counter', async ({ page }) => {
    const countBefore = await getTaskCount(page, 'To Do');
    await createTask(page, 'E2E Permanent Delete Task');

    const card = page.getByRole('listitem', { name: /Task: E2E Permanent Delete Task/i });
    await card.locator('.delete-task-btn').click();

    const dialog = page.locator('#dialog-modal');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-modal-message')).toHaveText(PERMANENT_DELETE_MSG);

    await page.locator('#dialog-confirm-btn').click();

    await expect(dialog).toBeHidden();
    await expect(card).not.toBeVisible();
    expect(await getTaskCount(page, 'To Do')).toBe(countBefore);
  });

  test('cancel delete — task survives and counter is unchanged', async ({ page }) => {
    await createTask(page, 'E2E Cancel Delete Task');
    const countAfterCreate = await getTaskCount(page, 'To Do');

    const card = page.getByRole('listitem', { name: /Task: E2E Cancel Delete Task/i });
    await card.locator('.delete-task-btn').click();

    const dialog = page.locator('#dialog-modal');
    await expect(dialog).toBeVisible();

    await page.locator('#dialog-cancel-btn').click();

    await expect(dialog).toBeHidden();
    await expect(card).toBeVisible();
    expect(await getTaskCount(page, 'To Do')).toBe(countAfterCreate);
  });

  test('soft-delete — dialog shows soft-delete message, task removed from board, purge count increments', async ({ page }) => {
    await setSoftDelete(page, true);

    const countBefore = await getTaskCount(page, 'To Do');
    await createTask(page, 'E2E Soft Delete Task');

    const card = page.getByRole('listitem', { name: /Task: E2E Soft Delete Task/i });
    await card.locator('.delete-task-btn').click();

    const dialog = page.locator('#dialog-modal');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-modal-message')).toHaveText(SOFT_DELETE_MSG);

    await page.locator('#dialog-confirm-btn').click();

    await expect(dialog).toBeHidden();
    await expect(card).not.toBeVisible();
    expect(await getTaskCount(page, 'To Do')).toBe(countBefore);

    // Soft-deleted task should register in the purge counter.
    await openSettings(page);
    await expect(page.locator('#settings-purge-btn')).not.toBeDisabled();
    const rawCount = await page.locator('#settings-purge-count').textContent();
    expect(Number.parseInt(rawCount ?? '0', 10)).toBeGreaterThanOrEqual(1);
    await closeSettings(page);
  });
});

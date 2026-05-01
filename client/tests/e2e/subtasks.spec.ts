import { test, expect, type Page } from '@playwright/test';

function taskModal(page: Page) {
  return page.locator('#task-modal');
}

function subtasksList(page: Page) {
  return page.locator('#task-subtasks-list');
}

function subtaskInput(page: Page) {
  return page.locator('#task-subtask-input');
}

async function openAddTaskModal(page: Page) {
  await page.getByRole('button', { name: 'Add task to To Do' }).click();
  await expect(taskModal(page)).toBeVisible();
}

async function openEditTaskModal(page: Page, taskTitle: string) {
  const card = page.getByRole('listitem', { name: new RegExp(`Task: ${taskTitle}`, 'i') });
  await card.locator('.task-title').click();
  await expect(taskModal(page)).toBeVisible();
}

async function addSubTask(page: Page, title: string) {
  await subtaskInput(page).fill(title);
  await subtaskInput(page).press('Enter');
}

test.describe('Sub-tasks', () => {
  test.describe.configure({ mode: 'serial' });

  test('Sub-tasks fieldset is visible in the task modal', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await expect(taskModal(page).locator('#task-subtasks-fieldset')).toBeVisible();
    await expect(subtaskInput(page)).toBeVisible();
  });

  test('Add sub-tasks via quick-add input and press Enter', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Task with sub-tasks');

    await addSubTask(page, 'First sub-task');
    await addSubTask(page, 'Second sub-task');
    await addSubTask(page, 'Third sub-task');

    const items = subtasksList(page).locator('.subtask-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0).locator('.subtask-title')).toHaveText('First sub-task');
    await expect(items.nth(1).locator('.subtask-title')).toHaveText('Second sub-task');
    await expect(items.nth(2).locator('.subtask-title')).toHaveText('Third sub-task');
  });

  test('Empty sub-task input is ignored on Enter', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Task no empty sub-tasks');

    await subtaskInput(page).press('Enter');
    await subtaskInput(page).fill('   ');
    await subtaskInput(page).press('Enter');

    await expect(subtasksList(page).locator('.subtask-item')).toHaveCount(0);
  });

  test('Progress legend shows X / Y in fieldset legend', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Progress legend task');

    // No sub-tasks — legend should be hidden
    await expect(taskModal(page).locator('#task-subtasks-progress-legend')).toBeHidden();

    await addSubTask(page, 'Step one');
    await addSubTask(page, 'Step two');

    const legend = taskModal(page).locator('#task-subtasks-progress-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toHaveText('0 / 2');
  });

  test('Checking a sub-task updates the progress legend', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Check progress task');

    await addSubTask(page, 'Step A');
    await addSubTask(page, 'Step B');

    const firstCheckbox = subtasksList(page).locator('.subtask-item').first().locator('input[type="checkbox"]');
    await firstCheckbox.check();

    const legend = taskModal(page).locator('#task-subtasks-progress-legend');
    await expect(legend).toHaveText('1 / 2');
  });

  test('Completed sub-tasks have strikethrough style', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Strikethrough task');

    await addSubTask(page, 'Complete me');

    const item = subtasksList(page).locator('.subtask-item').first();
    await expect(item).not.toHaveClass(/subtask-completed/);

    await item.locator('input[type="checkbox"]').check();
    await expect(item).toHaveClass(/subtask-completed/);
  });

  test('Delete button removes a sub-task from the list', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Delete sub-task task');

    await addSubTask(page, 'Keep me');
    await addSubTask(page, 'Delete me');

    await expect(subtasksList(page).locator('.subtask-item')).toHaveCount(2);

    await subtasksList(page).locator('.subtask-item').nth(1).locator('.subtask-delete-btn').click();

    await expect(subtasksList(page).locator('.subtask-item')).toHaveCount(1);
    await expect(subtasksList(page).locator('.subtask-title').first()).toHaveText('Keep me');
  });

  test('Sub-tasks are saved and persisted when task is created', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Persisted sub-task task');

    await addSubTask(page, 'Persist step 1');
    await addSubTask(page, 'Persist step 2');

    await taskModal(page).getByRole('button', { name: 'Add Task', exact: true }).click();

    const storedSubTasks = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('kanvana-db', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const read = <T>(key: string): Promise<T> => new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
      const activeBoardId = await read<string>('kanbanActiveBoardId');
      const tasks = await read<Array<{ title?: string; subTasks?: Array<{ title: string; completed: boolean }> }>>(`kanbanBoard:${activeBoardId}:tasks`);
      db.close();
      return (tasks || []).find((t) => t.title === 'Persisted sub-task task')?.subTasks ?? [];
    });

    expect(storedSubTasks.length).toBe(2);
    expect(storedSubTasks[0].title).toBe('Persist step 1');
    expect(storedSubTasks[1].title).toBe('Persist step 2');
    expect(storedSubTasks[0].completed).toBe(false);
  });

  test('Sub-task progress indicator appears on task card when sub-tasks exist', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Card progress task');

    await addSubTask(page, 'Card step 1');
    await addSubTask(page, 'Card step 2');
    await addSubTask(page, 'Card step 3');

    await taskModal(page).getByRole('button', { name: 'Add Task', exact: true }).click();

    const taskCard = page.getByRole('listitem', { name: /Task: Card progress task/i });
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator('.task-subtasks-row')).toBeVisible();
    await expect(taskCard.locator('.task-subtasks-row')).toContainText('0/3 Done');
    await expect(taskCard.locator('.subtasks-donut')).toBeVisible();
  });

  test('No progress indicator on card when task has no sub-tasks', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('No sub-task card');
    await taskModal(page).getByRole('button', { name: 'Add Task', exact: true }).click();

    const taskCard = page.getByRole('listitem', { name: /Task: No sub-task card/i });
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator('.task-subtasks-row')).toHaveCount(0);
  });

  test('Sub-tasks survive edit modal round-trip with completion state', async ({ page }) => {
    await page.goto('/');

    // Create task with sub-tasks
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Round-trip task');
    await addSubTask(page, 'Step alpha');
    await addSubTask(page, 'Step beta');
    await taskModal(page).getByRole('button', { name: 'Add Task', exact: true }).click();

    // Open edit modal and check a sub-task
    await openEditTaskModal(page, 'Round-trip task');
    const firstItem = subtasksList(page).locator('.subtask-item').first();
    await expect(firstItem.locator('.subtask-title')).toHaveText('Step alpha');

    await firstItem.locator('input[type="checkbox"]').check();
    await expect(taskModal(page).locator('#task-subtasks-progress-legend')).toHaveText('1 / 2');

    await taskModal(page).getByRole('button', { name: 'Save Changes', exact: true }).click();

    // Re-open to verify completion persisted
    await openEditTaskModal(page, 'Round-trip task');
    const reloadedFirst = subtasksList(page).locator('.subtask-item').first();
    await expect(reloadedFirst.locator('input[type="checkbox"]')).toBeChecked();
    await expect(taskModal(page).locator('#task-subtasks-progress-legend')).toHaveText('1 / 2');
  });

  test('Card donut turns green when all sub-tasks are completed', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('All done task');

    await addSubTask(page, 'Only step');
    await taskModal(page).getByRole('button', { name: 'Add Task', exact: true }).click();

    // Open edit, complete the only sub-task
    await openEditTaskModal(page, 'All done task');
    await subtasksList(page).locator('.subtask-item').first().locator('input[type="checkbox"]').check();
    await taskModal(page).getByRole('button', { name: 'Save Changes', exact: true }).click();

    // Card should show 1/1 Done and green donut
    const taskCard = page.getByRole('listitem', { name: /Task: All done task/i });
    await expect(taskCard.locator('.task-subtasks-row')).toContainText('1/1 Done');
    await expect(taskCard.locator('.subtasks-donut-fill')).toHaveClass(/subtasks-donut-complete/);
  });

  test('Inline edit: click sub-task title to edit and commit with Enter', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Inline edit task');

    await addSubTask(page, 'Original title');

    const titleSpan = subtasksList(page).locator('.subtask-item').first().locator('.subtask-title');
    await titleSpan.click();

    const inlineInput = subtasksList(page).locator('.subtask-item').first().locator('.subtask-inline-input');
    await expect(inlineInput).toBeVisible();
    await inlineInput.fill('Edited title');
    await inlineInput.press('Enter');

    await expect(subtasksList(page).locator('.subtask-item').first().locator('.subtask-title')).toHaveText('Edited title');
  });

  test('Inline edit: Escape cancels edit and restores original title', async ({ page }) => {
    await page.goto('/');
    await openAddTaskModal(page);
    await taskModal(page).locator('#task-title').fill('Escape edit task');

    await addSubTask(page, 'Keep original');

    await subtasksList(page).locator('.subtask-item').first().locator('.subtask-title').click();
    const inlineInput = subtasksList(page).locator('.subtask-item').first().locator('.subtask-inline-input');
    await expect(inlineInput).toBeVisible();
    await inlineInput.fill('Should not save');
    await inlineInput.press('Escape');

    await expect(subtasksList(page).locator('.subtask-item').first().locator('.subtask-title')).toHaveText('Keep original');
  });
});

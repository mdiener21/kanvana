// spec: task-creation-with-labels.plan.md
// seed: tests/e2e/seed.spec.ts

import { test, expect, type Page } from '@playwright/test';

async function getTaskCount(page: Page, columnId: string): Promise<number> {
  const counter = page.locator(`article.task-column[data-column="${columnId}"] .task-counter`);
  await expect(counter).toHaveText(/\d+/);
  const text = (await counter.textContent()) ?? '';
  const count = Number.parseInt(text, 10);
  if (!Number.isFinite(count)) {
    throw new Error(`Expected numeric task counter for column '${columnId}', got '${text}'`);
  }
  return count;
}

function taskModal(page: Page) {
  return page.locator('#task-modal');
}

test.describe('Task Creation', () => {
  test.describe.configure({ mode: 'serial' });

  test('Create task with 2 existing labels and medium priority in To Do column', async ({ page }) => {
    await page.goto('/');

    const beforeTodoCount = await getTaskCount(page, 'todo');
    const modal = taskModal(page);

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await expect(modal).toBeVisible();
    await modal.locator('#task-title').fill('Complete project milestone review');
    await modal.locator('#task-description').fill('Review and approve all project deliverables before deadline');

    await modal.locator('#task-priority').selectOption(['medium']);
    await modal.getByRole('checkbox', { name: 'Goal' }).check();
    await modal.getByRole('checkbox', { name: 'Task' }).check();

    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Complete project milestone review/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Goal' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Task' })).toBeVisible();

    const todoCounter = page.locator('article.task-column[data-column="todo"] .task-counter');
    await expect(todoCounter).toHaveText(String(beforeTodoCount + 1));
  });

  test('Create task with 2 existing labels and medium priority in In Progress column', async ({ page }) => {
    await page.goto('/');

    const beforeInProgressCount = await getTaskCount(page, 'inprogress');
    const modal = taskModal(page);

    await page.getByRole('button', { name: 'Add task to In Progress' }).click();
    await expect(modal).toBeVisible();
    await modal.locator('#task-title').fill('Implement user authentication system');
    await modal.locator('#task-priority').selectOption(['medium']);

    await modal.getByRole('checkbox', { name: 'Idea' }).check();
    await modal.getByRole('checkbox', { name: 'Meeting' }).check();

    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Implement user authentication system/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Idea' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Meeting' })).toBeVisible();

    const inProgressCounter = page.locator('article.task-column[data-column="inprogress"] .task-counter');
    await expect(inProgressCounter).toHaveText(String(beforeInProgressCount + 1));
  });

  test('Create task with due date, 2 labels, and medium priority', async ({ page }) => {
    await page.goto('/');
    const modal = taskModal(page);

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await expect(modal).toBeVisible();
    await modal.locator('#task-title').fill('Finalize quarterly report');
    await modal.locator('#task-priority').selectOption(['medium']);

    await modal.locator('#task-due-date').fill('2026-02-15');
    await modal.getByRole('checkbox', { name: 'Task' }).check();
    await modal.getByRole('checkbox', { name: 'Email' }).check();

    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Finalize quarterly report/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Task' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Email' })).toBeVisible();

    const storedDueDate = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry: { title?: string }) => entry.title === 'Finalize quarterly report')?.dueDate ?? '';
    });

    expect(storedDueDate).toBe('2026-02-15');
    await expect(task.locator('.task-date')).toContainText('Due');
  });

  test('Create task with 2 new custom labels and medium priority', async ({ page }) => {
    await page.goto('/');

    const beforeTodoCount = await getTaskCount(page, 'todo');
    const modal = taskModal(page);

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await expect(modal).toBeVisible();
    await modal.locator('#task-title').fill('Design new user interface mockups');
    await modal.locator('#task-priority').selectOption(['medium']);

    // Add first label
    await modal.getByRole('button', { name: 'Add a new label' }).click();
    await page.locator('#label-modal').getByRole('textbox', { name: 'Label Name' }).fill('Design');
    await page.locator('#label-modal').getByRole('textbox', { name: 'Hex color code' }).fill('#ef4444');
    await page.locator('#label-modal').getByRole('button', { name: 'Add Label' }).click();
    await expect(modal.locator('#task-active-labels .task-label', { hasText: 'Design' })).toBeVisible();

    // Add second label
    await modal.getByRole('button', { name: 'Add a new label' }).click();
    await page.locator('#label-modal').getByRole('textbox', { name: 'Label Name' }).fill('UI/UX');
    await page.locator('#label-modal').getByRole('textbox', { name: 'Hex color code' }).fill('#10b981');
    await page.locator('#label-modal').getByRole('button', { name: 'Add Label' }).click();
    await expect(modal.locator('#task-active-labels .task-label', { hasText: 'UI/UX' })).toBeVisible();

    await modal.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Design new user interface mockups/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Design' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'UI/UX' })).toBeVisible();

    const todoCounter = page.locator('article.task-column[data-column="todo"] .task-counter');
    await expect(todoCounter).toHaveText(String(beforeTodoCount + 1));
  });
});

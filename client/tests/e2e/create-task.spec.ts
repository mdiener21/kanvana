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

test.describe('Task Creation', () => {
  test('Create task with 2 existing labels and medium priority in To Do column', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const beforeTodoCount = await getTaskCount(page, 'todo');

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Complete project milestone review');
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Review and approve all project deliverables before deadline');

    await page.getByLabel('Priority', { exact: true }).selectOption(['medium']);
    await page.getByRole('checkbox', { name: 'Urgent' }).click();
    await page.getByRole('checkbox', { name: 'Feature' }).click();

    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Complete project milestone review/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Urgent' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Feature' })).toBeVisible();

    const todoCounter = page.locator('article.task-column[data-column="todo"] .task-counter');
    await expect(todoCounter).toHaveText(String(beforeTodoCount + 1));
  });

  test('Create task with 2 existing labels and medium priority in In Progress column', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const beforeInProgressCount = await getTaskCount(page, 'inprogress');

    await page.getByRole('button', { name: 'Add task to In Progress' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Implement user authentication system');
    await page.getByLabel('Priority', { exact: true }).selectOption(['medium']);

    await page.getByRole('checkbox', { name: 'Feature' }).click();
    await page.getByRole('checkbox', { name: 'Task' }).click();

    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Implement user authentication system/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Feature' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Task' })).toBeVisible();

    const inProgressCounter = page.locator('article.task-column[data-column="inprogress"] .task-counter');
    await expect(inProgressCounter).toHaveText(String(beforeInProgressCount + 1));
  });

  test('Create task with due date, 2 labels, and medium priority', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Finalize quarterly report');
    await page.getByLabel('Priority', { exact: true }).selectOption(['medium']);

    await page.getByRole('textbox', { name: 'Due Date' }).fill('2026-02-15');
    await page.getByRole('checkbox', { name: 'Urgent' }).click();
    await page.getByRole('checkbox', { name: 'Task' }).click();

    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Finalize quarterly report/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Urgent' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Task' })).toBeVisible();
    await expect(task.locator('.task-date')).toContainText(/Due\s+.+2026/);
  });

  test('Create task with 2 new custom labels and medium priority', async ({ page }) => {
    await page.goto('http://localhost:3000');

    const beforeTodoCount = await getTaskCount(page, 'todo');

    await page.getByRole('button', { name: 'Add task to To Do' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Design new user interface mockups');
    await page.getByLabel('Priority', { exact: true }).selectOption(['medium']);

    // Add first label
    await page.getByRole('button', { name: 'Add a new label' }).click();
    await page.getByRole('textbox', { name: 'Label Name' }).fill('Design');
    await page.getByRole('textbox', { name: 'Hex color code' }).fill('#ef4444');
    await page.getByRole('button', { name: 'Add Label' }).click();

    // Add second label
    await page.getByRole('button', { name: 'Add a new label' }).click();
    await page.getByRole('textbox', { name: 'Label Name' }).fill('UI/UX');
    await page.getByRole('textbox', { name: 'Hex color code' }).fill('#10b981');
    await page.getByRole('button', { name: 'Add Label' }).click();

    await page.getByRole('button', { name: 'Add Task', exact: true }).click();

    const task = page.getByRole('listitem', { name: /Task: Design new user interface mockups/i });
    await expect(task).toBeVisible();
    await expect(task.getByLabel('Priority: medium')).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'Design' })).toBeVisible();
    await expect(task.locator('.task-label', { hasText: 'UI/UX' })).toBeVisible();

    const todoCounter = page.locator('article.task-column[data-column="todo"] .task-counter');
    await expect(todoCounter).toHaveText(String(beforeTodoCount + 1));
  });
});

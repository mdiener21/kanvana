import { test, expect } from '@playwright/test';
import { seedSwimlaneBoard } from './swimlanes.helpers.js';

test.describe('Swim lane toggle', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page);
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('enables and disables swim lanes without losing task data', async ({ page }) => {
    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator('article.task-column[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    await page.getByLabel('Swim Lanes').check();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project A' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project B' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();
    await expect(page.locator('.swimlane-column-header[data-column="todo"] .task-counter')).toHaveText('1');

    await page.getByLabel('Swim Lanes').uncheck();

    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator('article.task-column[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const taskSnapshot = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.map((task) => ({ id: task.id, title: task.title, column: task.column, labels: task.labels }));
    });

    expect(taskSnapshot).toEqual([
      { id: 'task-a', title: 'Task A', column: 'todo', labels: ['label-a'] },
      { id: 'task-b', title: 'Task B', column: 'inprogress', labels: ['label-b'] },
      { id: 'task-c', title: 'Task C', column: 'done', labels: [] }
    ]);
  });
});
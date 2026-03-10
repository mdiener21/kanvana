import { test, expect } from '@playwright/test';
import { seedSwimlaneBoard } from './swimlanes.helpers.js';

test.describe('Swim lane drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page, { swimLanesEnabled: true, swimLaneGroupBy: 'label' });
    await page.goto('/');
    await expect(page.locator('.swimlane-row')).toHaveCount(3);
  });

  test('moves a task between swim lanes and columns', async ({ page }) => {
    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="inprogress"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="inprogress"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry) => entry.id === 'task-a');
    });

    expect(storedTask.column).toBe('inprogress');
    expect(storedTask.swimlaneLabelId).toBe('label-b');
    expect(storedTask.labels).toEqual(['label-b', 'label-a']);
  });

  test('moves a task into the No Group lane', async ({ page }) => {
    const task = page.locator('.task[data-task-id="task-b"]');
    const target = page.locator('.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="inprogress"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="inprogress"] .task[data-task-id="task-b"]')).toBeVisible();

    const storedTask = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry) => entry.id === 'task-b');
    });

    expect(storedTask.column).toBe('inprogress');
    expect(storedTask.swimlaneLabelId).toBe('');
  });
});
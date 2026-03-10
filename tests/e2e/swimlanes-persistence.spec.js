import { test, expect } from '@playwright/test';
import { seedSwimlaneBoard } from './swimlanes.helpers.js';

test.describe('Swim lane persistence', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page);
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('persists enabled state and grouping mode across reloads', async ({ page }) => {
    await page.getByLabel('Swim Lanes').check();
    await page.getByRole('combobox', { name: 'Group swim lanes by' }).selectOption('label-group');

    await expect(page.locator('.swimlane-row')).toHaveCount(2);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Projects' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();

    const storedSettings = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      return JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:settings`) || '{}');
    });

    expect(storedSettings.swimLanesEnabled).toBe(true);
    expect(storedSettings.swimLaneGroupBy).toBe('label-group');

    await page.reload();

    await expect(page.getByLabel('Swim Lanes')).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Group swim lanes by' })).toHaveValue('label-group');
    await expect(page.locator('.swimlane-row[data-lane-label="Projects"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();
    await expect(page.locator('.swimlane-row[data-lane-label="Projects"] .swimlane-cell[data-column="inprogress"] .task[data-task-id="task-b"]')).toBeVisible();
    await expect(page.locator('.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="done"] .task[data-task-id="task-c"]')).toBeVisible();
  });
});
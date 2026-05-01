import { test, expect } from '@playwright/test';
import { openSwimlaneSettings, seedSwimlaneBoard, readIDBSettings, TEST_BOARD_ID, COL_TODO_ID, COL_INPROGRESS_ID, COL_DONE_ID, TASK_A_ID, TASK_B_ID, LABEL_A_ID } from './swimlanes.helpers.js';

test.describe('Swim lane persistence', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page);
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('persists enabled state and grouping mode across reloads', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.getByRole('combobox', { name: 'Group swim lanes by' }).selectOption('label-group');
    await page.getByRole('combobox', { name: 'Select label group for swim lanes' }).selectOption('Projects');
    await page.locator('#settings-close-btn').click();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project A' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project B' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();

    const storedSettings = await readIDBSettings(page, TEST_BOARD_ID);

    expect(storedSettings.swimLanesEnabled).toBe(true);
    expect(storedSettings.swimLaneGroupBy).toBe('label-group');
    expect(storedSettings.swimLaneLabelGroup).toBe('Projects');

    await page.reload();

    await openSwimlaneSettings(page);
    await expect(page.locator('#settings-swimlane-enabled')).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Group swim lanes by' })).toHaveValue('label-group');
    await expect(page.getByRole('combobox', { name: 'Select label group for swim lanes' })).toHaveValue('Projects');
    await page.locator('#settings-close-btn').click();
    await expect(page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_INPROGRESS_ID}"] .task[data-task-id="${TASK_B_ID}"]`)).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="${COL_DONE_ID}"] .task[data-task-id]`)).toHaveCount(0);
    await expect(page.locator(`.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="${COL_DONE_ID}"] .swimlane-cell-summary`)).toContainText('1 completed item hidden');
  });

  test('persists priority grouping mode across reloads', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.getByRole('combobox', { name: 'Group swim lanes by' }).selectOption('priority');
    await page.locator('#settings-close-btn').click();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'High' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Medium' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Low' })).toBeVisible();

    const storedSettings = await readIDBSettings(page, TEST_BOARD_ID);

    expect(storedSettings.swimLaneGroupBy).toBe('priority');

    await page.reload();

    await openSwimlaneSettings(page);
    await expect(page.getByRole('combobox', { name: 'Group swim lanes by' })).toHaveValue('priority');
    await page.locator('#settings-close-btn').click();

    await expect(page.locator(`.swimlane-row[data-lane-label="Medium"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="${COL_INPROGRESS_ID}"] .task[data-task-id="${TASK_B_ID}"]`)).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="Low"] .swimlane-cell[data-column="${COL_DONE_ID}"] .task`)).toHaveCount(0);
  });

  test('persists collapsed swim lane state across reloads', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const projectARow = page.locator('.swimlane-row[data-lane-label="Project A"]');
    await projectARow.getByRole('button', { name: /Collapse Project A swim lane/i }).click();

    const storedSettings = await readIDBSettings(page, TEST_BOARD_ID);

    expect(storedSettings.swimLaneCollapsedKeys).toContain(LABEL_A_ID);

    await page.reload();
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"]')).toHaveClass(/is-collapsed/);
  });
});

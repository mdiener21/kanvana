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

  test('moves a task into Done while done cards remain hidden', async ({ page }) => {
    const task = page.locator('.task[data-task-id="task-a"]');
    const doneTarget = page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .tasks');

    await task.dragTo(doneTarget);

    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .task[data-task-id="task-a"]')).toHaveCount(0);
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .swimlane-cell-summary')).toContainText('1 completed item hidden');

    const storedTask = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry) => entry.id === 'task-a');
    });

    expect(storedTask.column).toBe('done');
    expect(storedTask.order).toBe(1);
    expect(storedTask.swimlaneLabelId).toBe('label-a');
  });

  test('moves a task between priority swim lanes and updates task priority', async ({ page }) => {
    await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const settingsKey = `kanbanBoard:${boardId}:settings`;
      const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
      localStorage.setItem(settingsKey, JSON.stringify({
        ...settings,
        swimLanesEnabled: true,
        swimLaneGroupBy: 'priority'
      }));
    });

    await page.reload();
    await expect(page.locator('.swimlane-row[data-lane-label="Medium"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="todo"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry) => entry.id === 'task-a');
    });

    expect(storedTask.column).toBe('todo');
    expect(storedTask.priority).toBe('high');
  });

  test('moves a task between rows from the selected label group', async ({ page }) => {
    await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const settingsKey = `kanbanBoard:${boardId}:settings`;
      const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
      localStorage.setItem(settingsKey, JSON.stringify({
        ...settings,
        swimLanesEnabled: true,
        swimLaneGroupBy: 'label-group',
        swimLaneLabelGroup: 'Projects'
      }));
    });

    await page.reload();
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="todo"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const tasks = JSON.parse(localStorage.getItem(`kanbanBoard:${boardId}:tasks`) || '[]');
      return tasks.find((entry) => entry.id === 'task-a');
    });

    expect(storedTask.column).toBe('todo');
    expect(storedTask.swimlaneLabelGroup).toBe('Projects');
    expect(storedTask.swimlaneLabelId).toBe('label-b');
    expect(storedTask.labels).toEqual(['label-b']);
  });
});
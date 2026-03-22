import { test, expect } from '@playwright/test';
import { openSwimlaneSettings, seedSwimlaneBoard } from './swimlanes.helpers.js';

test.describe('Swim lane toggle', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page);
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('enables and disables swim lanes without losing task data', async ({ page }) => {
    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator('article.task-column[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project A' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project B' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();
    await expect(page.locator('.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="done"] .task')).toHaveCount(0);
    await expect(page.locator('.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="done"] .swimlane-cell-summary')).toContainText('1 completed item hidden');
    await expect(page.locator('.swimlane-column-header[data-column="todo"] .task-counter')).toHaveText('1');

    await page.locator('#settings-close-btn').click();
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').uncheck();

    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator('article.task-column[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    await page.locator('#settings-close-btn').click();

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

  test('collapses and expands a swim lane from its header', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const projectARow = page.locator('.swimlane-row[data-lane-label="Project A"]');
    const projectATodoCell = projectARow.locator('.swimlane-cell[data-column="todo"]');
    await projectARow.getByRole('button', { name: /Collapse Project A swim lane/i }).click();
    await expect(projectARow).toHaveClass(/is-collapsed/);
    await expect(projectATodoCell).toBeHidden();

    await projectARow.getByRole('button', { name: /Expand Project A swim lane/i }).click();
    await expect(projectATodoCell).toBeVisible();
    await expect(projectARow.locator('.swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();
  });

  test('collapses and expands a workflow column while swim lanes are enabled', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const inProgressHeader = page.locator('.swimlane-column-header[data-column="inprogress"]');
    const projectBCell = page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="inprogress"]');

    await page.getByRole('button', { name: /Collapse In Progress column/i }).click();

    await expect(inProgressHeader).toHaveClass(/is-collapsed/);
    await expect(projectBCell).toHaveClass(/is-column-collapsed/);
    await expect(projectBCell.locator('.task[data-task-id="task-b"]')).toBeHidden();
    await expect(projectBCell.locator('.swimlane-cell-summary')).toContainText('1 task');

    await page.getByRole('button', { name: /Expand In Progress column/i }).click();

    await expect(inProgressHeader).not.toHaveClass(/is-collapsed/);
    await expect(projectBCell.locator('.task[data-task-id="task-b"]')).toBeVisible();
  });

  test('keeps swim lane column headers visible while vertically scrolling', async ({ page }) => {
    await page.evaluate(() => {
      const boardId = localStorage.getItem('kanbanActiveBoardId');
      const labelsKey = `kanbanBoard:${boardId}:labels`;
      const tasksKey = `kanbanBoard:${boardId}:tasks`;
      const labels = JSON.parse(localStorage.getItem(labelsKey) || '[]');
      const tasks = JSON.parse(localStorage.getItem(tasksKey) || '[]');
      for (let index = 0; index < 18; index += 1) {
        const labelId = `label-extra-${index}`;
        labels.push({
          id: labelId,
          name: `Lane ${index}`,
          color: '#2563eb',
          group: 'Extra'
        });
        tasks.push({
          id: `task-extra-${index}`,
          title: `Task ${index}`,
          description: 'Extra swimlane content',
          priority: 'low',
          dueDate: '',
          column: 'todo',
          order: 1,
          labels: [labelId],
          creationDate: '2026-03-01T09:30:00.000Z',
          changeDate: '2026-03-01T09:30:00.000Z',
          columnHistory: [{ column: 'todo', at: '2026-03-01T09:30:00.000Z' }]
        });
      }
      localStorage.setItem(labelsKey, JSON.stringify(labels));
      localStorage.setItem(tasksKey, JSON.stringify(tasks));
    });

    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const boardContainer = page.locator('#board-container');
    const todoHeader = page.locator('.swimlane-column-header[data-column="todo"]');
    await expect(page.locator('.swimlane-row')).toHaveCount(21);

    await boardContainer.evaluate((element) => {
      element.scrollTop = 900;
    });
    await expect
      .poll(async () => boardContainer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    const [containerBox, box] = await Promise.all([
      boardContainer.boundingBox(),
      todoHeader.boundingBox()
    ]);

    expect(containerBox).not.toBeNull();
    expect(box).not.toBeNull();
    expect(Math.abs((box?.y ?? 999) - (containerBox?.y ?? 0))).toBeLessThan(12);
  });

  test('shows one row per label inside the selected label group', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.getByRole('combobox', { name: 'Group swim lanes by' }).selectOption('label-group');
    await page.getByRole('combobox', { name: 'Select label group for swim lanes' }).selectOption('Projects');
    await page.locator('#settings-close-btn').click();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project A' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project B' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();
  });
});
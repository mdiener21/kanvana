import { test, expect } from '@playwright/test';
import {
  openSwimlaneSettings,
  seedSwimlaneBoard,
  TEST_BOARD_ID,
  COL_TODO_ID,
  COL_INPROGRESS_ID,
  COL_DONE_ID,
  TASK_A_ID,
  TASK_B_ID,
  TASK_C_ID,
  LABEL_A_ID
} from './swimlanes.helpers.js';

const BOARD_ID = TEST_BOARD_ID;

test.describe('Swim lane toggle', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page);
    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
  });

  test('enables and disables swim lanes without losing task data', async ({ page }) => {
    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator(`article.task-column[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();

    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();

    await expect(page.locator('.swimlane-row')).toHaveCount(3);
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project A' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'Project B' })).toBeVisible();
    await expect(page.locator('.swimlane-row-header', { hasText: 'No Group' })).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();
    await expect(page.locator(`.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="${COL_DONE_ID}"] .task`)).toHaveCount(0);
    await expect(page.locator(`.swimlane-row[data-lane-label="No Group"] .swimlane-cell[data-column="${COL_DONE_ID}"] .swimlane-cell-summary`)).toContainText('1 completed item hidden');
    await expect(page.locator(`.swimlane-column-header[data-column="${COL_TODO_ID}"] .task-counter`)).toHaveText('1');

    await page.locator('#settings-close-btn').click();
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').uncheck();

    await expect(page.locator('.swimlane-row')).toHaveCount(0);
    await expect(page.locator(`article.task-column[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();

    await page.locator('#settings-close-btn').click();

    // Verify all tasks remain in their correct columns after toggling swim lanes off
    await expect(page.locator(`article.task-column[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();
    await expect(page.locator(`article.task-column[data-column="${COL_INPROGRESS_ID}"] .task[data-task-id="${TASK_B_ID}"]`)).toBeVisible();
    await expect(page.locator(`article.task-column[data-column="${COL_DONE_ID}"] .task[data-task-id="${TASK_C_ID}"]`)).toBeVisible();
  });

  test('collapses and expands a swim lane from its header', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const projectARow = page.locator('.swimlane-row[data-lane-label="Project A"]');
    const projectATodoCell = projectARow.locator(`.swimlane-cell[data-column="${COL_TODO_ID}"]`);
    await projectARow.getByRole('button', { name: /Collapse Project A swim lane/i }).click();
    await expect(projectARow).toHaveClass(/is-collapsed/);
    await expect(projectATodoCell).toBeHidden();

    await projectARow.getByRole('button', { name: /Expand Project A swim lane/i }).click();
    await expect(projectATodoCell).toBeVisible();
    await expect(projectARow.locator(`.swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();
  });

  test('collapses and expands a workflow column while swim lanes are enabled', async ({ page }) => {
    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const inProgressHeader = page.locator(`.swimlane-column-header[data-column="${COL_INPROGRESS_ID}"]`);
    const projectBCell = page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_INPROGRESS_ID}"]`);

    await page.getByRole('button', { name: /Collapse In Progress column/i }).click();

    await expect(inProgressHeader).toHaveClass(/is-collapsed/);
    await expect(projectBCell).toHaveClass(/is-column-collapsed/);
    await expect(projectBCell.locator(`.task[data-task-id="${TASK_B_ID}"]`)).toBeHidden();
    await expect(projectBCell.locator('.swimlane-cell-summary')).toContainText('1 task');

    await page.getByRole('button', { name: /Expand In Progress column/i }).click();

    await expect(inProgressHeader).not.toHaveClass(/is-collapsed/);
    await expect(projectBCell.locator(`.task[data-task-id="${TASK_B_ID}"]`)).toBeVisible();
  });

  test('keeps swim lane column headers visible while vertically scrolling', async ({ page }) => {
    await page.evaluate(async ({ boardId, colTodoId }) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('kanvana-db', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const read = (key) => new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const labels = (await read(`kanbanBoard:${boardId}:labels`)) || [];
      const tasks = (await read(`kanbanBoard:${boardId}:tasks`)) || [];
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
          column: colTodoId,
          order: 1,
          labels: [labelId],
          creationDate: '2026-03-01T09:30:00.000Z',
          changeDate: '2026-03-01T09:30:00.000Z',
          columnHistory: [{ column: colTodoId, at: '2026-03-01T09:30:00.000Z' }]
        });
      }
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.put(labels, `kanbanBoard:${boardId}:labels`);
      store.put(tasks, `kanbanBoard:${boardId}:tasks`);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, { boardId: BOARD_ID, colTodoId: COL_TODO_ID });

    // Reload so initStorage() picks up the IDB changes
    await page.reload();
    await expect(page.locator('#board-container')).toBeVisible();

    await openSwimlaneSettings(page);
    await page.locator('#settings-swimlane-enabled').check();
    await page.locator('#settings-close-btn').click();

    const boardContainer = page.locator('#board-container');
    const todoHeader = page.locator(`.swimlane-column-header[data-column="${COL_TODO_ID}"]`);
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

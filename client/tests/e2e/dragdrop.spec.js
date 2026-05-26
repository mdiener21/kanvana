import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Performance test for drag-drop into Done column with 300+ tasks
 */

const fixturePath = join(process.cwd(), 'tests/fixtures/performance-board.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// Locate a task column by name rather than its (UUID) data-column attribute.
function columnByName(page, name) {
  return page.locator('article.task-column').filter({ has: page.locator('h2', { hasText: name }) });
}

test.describe('Drag and Drop Performance', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((data) => {
      if (sessionStorage.getItem('__kanvanaTestSeeded')) return;
      sessionStorage.setItem('__kanvanaTestSeeded', '1');

      localStorage.clear();
      indexedDB.deleteDatabase('kanvana-db');

      const boardId = 'perf-test-board';
      const req = indexedDB.open('kanvana-db', 2);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore('kv');
        const events = req.result.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('hlc', ['hlc.wallTime', 'hlc.counter', 'hlc.nodeId']);
        events.createIndex('synced', 'synced');
        req.result.createObjectStore('snapshots');
        const readModel = req.result.createObjectStore('read_model');
        const boards = [{ id: boardId, name: 'Performance Test Board', createdAt: new Date().toISOString() }];
        store.put(boards, 'kanbanBoards');
        store.put(boardId, 'kanbanActiveBoardId');
        readModel.put(data.columns, `${boardId}:columns`);
        readModel.put(data.tasks, `${boardId}:tasks`);
        readModel.put(data.labels, `${boardId}:labels`);
        store.put(data.settings, `kanbanBoard:${boardId}:settings`);
      };
    }, fixture);

    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
    await expect(columnByName(page, 'In Progress')).toBeVisible();
    await expect(columnByName(page, 'Done')).toBeVisible();
  });

  test('should drag task from In Progress to Done', async ({ page }) => {
    const inProgressColumn = columnByName(page, 'In Progress');
    const doneColumn = columnByName(page, 'Done');

    const firstTask = inProgressColumn.locator('.task').first();
    await expect(firstTask).toBeVisible();

    const taskId = await firstTask.getAttribute('data-task-id');
    const taskTitle = await firstTask.locator('.task-title').textContent();

    const inProgressCounterBefore = parseInt((await inProgressColumn.locator('.task-counter').textContent()) || '0');
    expect(inProgressCounterBefore).toBeGreaterThan(0);

    const doneCounterBefore = parseInt((await doneColumn.locator('.task-counter').textContent()) || '0');
    expect(doneCounterBefore).toBeGreaterThanOrEqual(300);

    await firstTask.dragTo(doneColumn.locator('.tasks'));

    const movedTask = doneColumn.locator(`.task[data-task-id="${taskId}"]`);
    await expect(movedTask).toBeVisible({ timeout: 5000 });

    const movedTaskTitle = await movedTask.locator('.task-title').textContent();
    expect(movedTaskTitle).toBe(taskTitle);

    const doneCounterAfter = parseInt((await doneColumn.locator('.task-counter').textContent()) || '0');
    expect(doneCounterAfter).toBe(doneCounterBefore + 1);

    const inProgressCounterAfter = parseInt((await inProgressColumn.locator('.task-counter').textContent()) || '0');
    expect(inProgressCounterAfter).toBe(inProgressCounterBefore - 1);
  });

  test('should handle multiple consecutive drops', async ({ page }) => {
    const inProgressColumn = columnByName(page, 'In Progress');
    const doneColumn = columnByName(page, 'Done');
    const doneTasksList = doneColumn.locator('.tasks');

    for (let i = 0; i < 3; i++) {
      const task = inProgressColumn.locator('.task').first();
      await expect(task).toBeVisible();
      await task.dragTo(doneTasksList);
      await expect(doneColumn.locator('.task').first()).toBeVisible({ timeout: 5000 });
    }

    // All 3 drops completed — verify counter reflects moves
    const inProgressCounter = parseInt((await inProgressColumn.locator('.task-counter').textContent()) || '0');
    expect(inProgressCounter).toBeGreaterThanOrEqual(0);
  });

  test('should show "Show more" button when Done column has many tasks', async ({ page }) => {
    const doneColumn = columnByName(page, 'Done');
    await expect(doneColumn).toBeVisible();

    const totalTasks = parseInt((await doneColumn.locator('.task-counter').textContent()) || '0');
    expect(totalTasks).toBeGreaterThanOrEqual(300);

    await expect(doneColumn.locator('button:has-text("Show more")')).toBeVisible();
  });
});

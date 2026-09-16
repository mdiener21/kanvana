import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { dragByMouse } from './dragdrop.helpers.js';

const BOARD_ID = randomUUID();

const COLUMNS = [
  { id: randomUUID(),         name: 'To Do',       order: 1 },
  { id: randomUUID(),  name: 'In Progress', order: 2 },
  { id: randomUUID(),         name: 'Done',        order: 3, role: 'done' },
];

const NOW = new Date().toISOString();
function columnByName(page, name) {
  return page.locator('article.task-column').filter({ has: page.locator('h2', { hasText: name }) });
}

async function dragTaskToDone(page, task, doneColumn) {
  await dragByMouse(page, task, doneColumn.locator('.tasks'));
}

for (const taskCount of [10, 500]) {
test.describe(`Drag crash regression (${taskCount} tasks)`, () => {
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    id: randomUUID(), title: `Task ${i}`, column: COLUMNS[1].id, order: i + 1,
    description: '', labels: [], priority: 'none', creationDate: NOW
  }));
  test.describe.configure({ mode: 'serial', timeout: 30_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((data) => {
      if (sessionStorage.getItem('__kanvanaTestSeeded')) return;
      sessionStorage.setItem('__kanvanaTestSeeded', '1');
      localStorage.clear();
      indexedDB.deleteDatabase('kanvana-db');

      const boardId = data.boardId;
      const req = indexedDB.open('kanvana-db', 2);
      req.onupgradeneeded = () => {
        const kv       = req.result.createObjectStore('kv');
        const events   = req.result.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('hlc',    ['hlc.wallTime', 'hlc.counter', 'hlc.nodeId']);
        events.createIndex('synced', 'synced');
        req.result.createObjectStore('snapshots');
        const readModel = req.result.createObjectStore('read_model');

        kv.put([{ id: boardId, name: 'Crash Regression Board', createdAt: new Date().toISOString() }], 'kanbanBoards');
        kv.put(boardId, 'kanbanActiveBoardId');
        kv.put({}, `kanbanBoard:${boardId}:settings`);
        readModel.put(data.columns, `${boardId}:columns`);
        readModel.put(data.tasks,   `${boardId}:tasks`);
        readModel.put([],           `${boardId}:labels`);
      };
    }, { boardId: BOARD_ID, columns: COLUMNS, tasks });

    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
    await expect(columnByName(page, 'In Progress')).toBeVisible();
    await expect(columnByName(page, 'Done')).toBeVisible();
  });

  test('task moves never enter native drag or export card text through DataTransfer', async ({ page }) => {
    await page.evaluate(() => {
      window.nativeDragStarts = 0;
      window.dragDataWrites = 0;
      document.addEventListener('dragstart', () => window.nativeDragStarts++, true);
      const setData = DataTransfer.prototype.setData;
      DataTransfer.prototype.setData = function (...args) {
        window.dragDataWrites++;
        return setData.apply(this, args);
      };
    });
    const source = columnByName(page, 'In Progress');
    const done = columnByName(page, 'Done');
    const taskId = await source.locator('.task').first().getAttribute('data-task-id');
    await dragTaskToDone(page, source.locator('.task').first(), done);
    await expect(done.locator(`.task[data-task-id="${taskId}"]`)).toBeVisible();
    expect(await page.evaluate(() => ({
      starts: window.nativeDragStarts, writes: window.dragDataWrites
    }))).toEqual({ starts: 0, writes: 0 });
    await page.reload();
    await expect(columnByName(page, 'Done').locator(`.task[data-task-id="${taskId}"]`)).toBeVisible();
  });

  test('drops into a collapsed column and back without leaving drag state behind', async ({ page }) => {
    const source = columnByName(page, 'In Progress');
    const target = columnByName(page, 'To Do');
    const taskId = await source.locator('.task').first().getAttribute('data-task-id');
    await target.getByRole('button', { name: 'Collapse To Do column', exact: true }).click();
    await dragByMouse(page, source.locator('.task').first(), target.locator('.tasks'));
    await expect(target.locator('.task-counter')).toHaveText('1');
    await target.getByRole('button', { name: 'Expand To Do column', exact: true }).click();
    const moved = target.locator(`.task[data-task-id="${taskId}"]`);
    await expect(moved).toBeVisible();
    await dragByMouse(page, moved, source.locator('.tasks'));
    await expect(source.locator('.task-counter')).toHaveText(String(taskCount));
    await expect(page.locator('.task-fallback, .task-chosen, .is-drop-hover')).toHaveCount(0);
  });

  test('column reordering avoids native drag and survives reload', async ({ page }) => {
    await page.evaluate(() => {
      window.nativeDragStarts = 0;
      document.addEventListener('dragstart', () => window.nativeDragStarts++, true);
    });
    await dragByMouse(page,
      columnByName(page, 'In Progress').locator('h2'),
      columnByName(page, 'To Do').locator('h2'));
    await expect(page.locator('article.task-column').first().locator('h2')).toHaveText('In Progress');
    expect(await page.evaluate(() => window.nativeDragStarts)).toBe(0);
    await page.reload();
    await expect(page.locator('article.task-column').first().locator('h2')).toHaveText('In Progress');
    await expect(page.locator('article.task-column').last().locator('h2')).toHaveText('Done');
  });

  test('second consecutive drag to Done must not crash or freeze the page', async ({ page }) => {
    // Register before any interaction so we catch crashes that happen during dragend.
    let crashError = null;
    page.on('crash', () => {
      crashError = new Error('Browser crashed during task dragging');
    });

    const inProgress = columnByName(page, 'In Progress');
    const done       = columnByName(page, 'Done');

    // ── First drag ──────────────────────────────────────────────────────────
    const firstTask = inProgress.locator('.task').first();
    await expect(firstTask).toBeVisible();
    const firstId = await firstTask.getAttribute('data-task-id');

    await dragTaskToDone(page, firstTask, done);

    if (crashError) throw crashError;
    // Page must still be alive and the card must appear in Done.
    await expect(page.locator('#board-container')).toBeVisible({ timeout: 5000 });
    await expect(done.locator(`.task[data-task-id="${firstId}"]`)).toBeVisible({ timeout: 5000 });

    // ── Second drag (was the crash point before the fix) ────────────────────
    const secondTask = inProgress.locator('.task').first();
    await expect(secondTask).toBeVisible();
    const secondId = await secondTask.getAttribute('data-task-id');
    expect(secondId).not.toBe(firstId); // sanity: genuinely a different task

    await dragTaskToDone(page, secondTask, done);

    if (crashError) throw crashError;
    await expect(page.locator('#board-container')).toBeVisible({ timeout: 5000 });
    await expect(done.locator(`.task[data-task-id="${secondId}"]`)).toBeVisible({ timeout: 5000 });

    // ── Counter accuracy ────────────────────────────────────────────────────
    const inProgressCount = parseInt(await inProgress.locator('.task-counter').textContent() ?? '0');
    expect(inProgressCount).toBe(taskCount - 2);

    const doneCount = parseInt(await done.locator('.task-counter').textContent() ?? '0');
    expect(doneCount).toBe(2);
  });

  test('both dragged tasks land at the top of Done', async ({ page }) => {
    const inProgress = columnByName(page, 'In Progress');
    const done       = columnByName(page, 'Done');

    const firstTask = inProgress.locator('.task').first();
    const firstId   = await firstTask.getAttribute('data-task-id');
    await dragTaskToDone(page, firstTask, done);
    await expect(done.locator(`.task[data-task-id="${firstId}"]`)).toBeVisible({ timeout: 5000 });

    const secondTask = inProgress.locator('.task').first();
    const secondId   = await secondTask.getAttribute('data-task-id');
    await dragTaskToDone(page, secondTask, done);
    await expect(done.locator(`.task[data-task-id="${secondId}"]`)).toBeVisible({ timeout: 5000 });

    // The most-recently dropped task should be pinned to order=1 (top of Done).
    const topTask = done.locator('.task').first();
    const topId   = await topTask.getAttribute('data-task-id');
    expect(topId).toBe(secondId);
  });
});
}

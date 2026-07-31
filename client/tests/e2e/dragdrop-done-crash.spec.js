import { test, expect } from '@playwright/test';

/**
 * Regression test for: Chrome renderer crash on consecutive drag-to-Done.
 *
 * Root cause: scheduleDomainEvent() inside updateTaskPositionsFromDrop() triggered
 * a synchronous chain → emit(DATA_CHANGED) → renderBoard() → container.innerHTML=''
 * which detached evt.item/evt.to while Chrome's DnD engine still held internal
 * renderer state for those nodes, crashing Chrome on the next drop.
 *
 * Fix: a drop opens a drag-reconcile window (render.js beginDragReconcile/
 * endDragReconcile), so the DATA_CHANGED the move emits is routed through
 * reconcileBoard() — an in-place DOM patch — instead of renderBoard()'s innerHTML
 * teardown. The just-dragged node is never detached, so there is nothing for
 * Chrome's DnD engine to lose.
 */

const BOARD_ID = 'crash-regression-board';

// Minimal fixture: 3 tasks in In Progress, Done column empty.
// id:'done' satisfies isDoneColumnId() via the LEGACY_DONE_COLUMN_ID path in storage.js.
const COLUMNS = [
  { id: 'todo',         name: 'To Do',       order: 1 },
  { id: 'in-progress',  name: 'In Progress', order: 2 },
  { id: 'done',         name: 'Done',        order: 3, role: 'done' },
];

const NOW = new Date().toISOString();
const TASKS = [
  { id: 'task-alpha', title: 'Alpha', column: 'in-progress', order: 1, description: '', labels: [], priority: 'none', createdAt: NOW },
  { id: 'task-beta',  title: 'Beta',  column: 'in-progress', order: 2, description: '', labels: [], priority: 'none', createdAt: NOW },
  { id: 'task-gamma', title: 'Gamma', column: 'in-progress', order: 3, description: '', labels: [], priority: 'none', createdAt: NOW },
];

function columnByName(page, name) {
  return page.locator('article.task-column').filter({ has: page.locator('h2', { hasText: name }) });
}

// Drag a task into Done with real browser mouse events rather than locator.dragTo().
// dragTo() dispatches dragstart + dragover via CDP faster than SortableJS promotes
// Sortable.active (a setTimeout(0) in _dragStarted), so _onDragOver sees a null
// Sortable.active and reverts the drop — flaky on headless CI. A small initial move
// plus a 50 ms yield lets that timer fire before we move into Done. See dragdrop.spec.js.
async function dragTaskToDone(page, task, doneColumn) {
  const taskBB = await task.boundingBox();
  const doneBB = await doneColumn.locator('.tasks').boundingBox();
  const startX = taskBB.x + taskBB.width / 2;
  const startY = taskBB.y + taskBB.height / 2;
  const endX = doneBB.x + doneBB.width / 2;
  const endY = doneBB.y + Math.min(10, Math.max(2, doneBB.height / 2)); // near top; within emptyInsertThreshold

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 5, startY + 2); // cross the native dragstart threshold
  await page.waitForTimeout(50); // let SortableJS _dragStarted's setTimeout(0) set Sortable.active
  // Move to Done in stepped increments so a stream of dragover events reaches
  // _onDragOver and SortableJS settles the placeholder into Done before release.
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.waitForTimeout(30); // let the placeholder settle in Done
  await page.mouse.up();
}

test.describe('Done-column drag crash regression', () => {
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
    }, { boardId: BOARD_ID, columns: COLUMNS, tasks: TASKS });

    await page.goto('/');
    await expect(page.locator('#board-container')).toBeVisible();
    await expect(columnByName(page, 'In Progress')).toBeVisible();
    await expect(columnByName(page, 'Done')).toBeVisible();
  });

  test('second consecutive drag to Done must not crash or freeze the page', async ({ page }) => {
    // Register before any interaction so we catch crashes that happen during dragend.
    let crashError = null;
    page.on('crash', () => {
      crashError = new Error('Chrome renderer crashed — detached-node-during-dragend bug regressed');
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
    // Started with 3 in In Progress, moved 2 → 1 remaining; Done went from 0 → 2.
    const inProgressCount = parseInt(await inProgress.locator('.task-counter').textContent() ?? '0');
    expect(inProgressCount).toBe(1);

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

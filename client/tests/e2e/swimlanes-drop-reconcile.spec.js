import { test, expect } from '@playwright/test';
import { dragByMouse } from './dragdrop.helpers.js';
import { waitForBoardReady } from './board.helpers.js';

// Real Chromium, real SortableJS, real page.mouse drops on a swimlane board. Everything here
// listens for renderer crashes: a drop must never tear down what Sortable still references.

const BOARD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const TODO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const DOING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003';
const DONE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004';
const LANE_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000005';
const LANE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000006';
const SEEDED_AT = '2026-03-01T09:00:00.000Z';
const FULL_RENDER_MARK = 'kanvana:board-render:full';
const RECONCILE_RENDER_MARK = 'kanvana:board-render:reconcile';

function taskId(index) {
  return `bbbbbbbb-bbbb-4bbb-8ccc-${index.toString(16).padStart(12, '0')}`;
}

function makeTask(index, column, laneId, extra = {}) {
  return {
    id: taskId(index),
    title: `Task ${index}`,
    description: '',
    priority: 'none',
    dueDate: '',
    column,
    order: index + 1,
    labels: [laneId],
    swimlaneLabelId: laneId,
    creationDate: SEEDED_AT,
    changeDate: SEEDED_AT,
    columnHistory: [{ column, at: SEEDED_AT }],
    ...(column === DONE_ID ? { doneDate: SEEDED_AT } : {}),
    ...extra,
  };
}

async function seedBoard(page, tasks) {
  const fixture = {
    columns: [
      { id: TODO_ID, name: 'To Do', color: '#3583ff', order: 1, collapsed: false },
      { id: DOING_ID, name: 'In Progress', color: '#f59e0b', order: 2, collapsed: false },
      { id: DONE_ID, name: 'Done', color: '#505050', order: 3, collapsed: false, role: 'done' },
    ],
    labels: [
      { id: LANE_A_ID, name: 'Project A', color: '#2563eb', group: 'Projects' },
      { id: LANE_B_ID, name: 'Project B', color: '#16a34a', group: 'Projects' },
    ],
    tasks,
    settings: {
      showPriority: true,
      showDueDate: true,
      showAge: false,
      showChangeDate: false,
      locale: 'en-US',
      notificationDays: 3,
      swimLanesEnabled: true,
      swimLaneGroupBy: 'label',
      swimLaneLabelGroup: '',
      swimLaneCollapsedKeys: [],
      swimLaneCellCollapsedKeys: [],
      swimLaneOrder: [LANE_A_ID, LANE_B_ID],
    },
    boardId: BOARD_ID,
  };

  await page.addInitScript((data) => {
    globalThis.__kanvanaPerfMarks = true;
    if (sessionStorage.getItem('__kanvanaTestSeeded')) return;
    sessionStorage.setItem('__kanvanaTestSeeded', '1');
    localStorage.clear();
    indexedDB.deleteDatabase('kanvana-db');
    const req = indexedDB.open('kanvana-db', 2);
    req.onupgradeneeded = () => {
      const kv = req.result.createObjectStore('kv');
      const events = req.result.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('hlc', ['hlc.wallTime', 'hlc.counter', 'hlc.nodeId']);
      events.createIndex('synced', 'synced');
      req.result.createObjectStore('snapshots');
      const readModel = req.result.createObjectStore('read_model');
      kv.put([{ id: data.boardId, name: 'Swimlane Drop Board', createdAt: new Date().toISOString() }], 'kanbanBoards');
      kv.put(data.boardId, 'kanbanActiveBoardId');
      kv.put(data.settings, `kanbanBoard:${data.boardId}:settings`);
      readModel.put(data.columns, `${data.boardId}:columns`);
      readModel.put(data.tasks, `${data.boardId}:tasks`);
      readModel.put(data.labels, `${data.boardId}:labels`);
    };
  }, fixture);
}

async function readTasks(page) {
  return page.evaluate(async (key) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kanvana-db');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tasks = await new Promise((resolve, reject) => {
      const req = db.transaction('read_model').objectStore('read_model').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return tasks;
  }, `${BOARD_ID}:tasks`);
}

function cellList(page, laneId, columnId) {
  return page.locator(`.swimlane-row[data-lane-key="${laneId}"] .swimlane-cell[data-column="${columnId}"] .tasks`);
}

function cellSummary(page, laneId, columnId) {
  return page.locator(`.swimlane-row[data-lane-key="${laneId}"] .swimlane-cell[data-column="${columnId}"] .swimlane-cell-summary`);
}

function headerCounter(page, columnId) {
  return page.locator(`.swimlane-column-header[data-column="${columnId}"] .task-counter`);
}

// Crash and error listeners go on before the first interaction, so a crash during drop cleanup
// is caught rather than surfacing as a confusing locator timeout.
function watchFailures(page) {
  const failures = [];
  page.on('crash', () => failures.push('renderer crashed'));
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  return failures;
}

// Keeps a reference to the board's nodes and counts only what happens from here on, so the
// assertions see teardown no matter how many renders booting took.
async function startWatchingBoard(page) {
  await page.evaluate((fullMark) => {
    window.__board = document.querySelector('.swimlane-board');
    window.__fullRendersBefore = performance.getEntriesByName(fullMark).length;
  }, FULL_RENDER_MARK);
}

async function expectBoardNeverRebuilt(page) {
  const state = await page.evaluate(({ fullMark, reconcileMark }) => ({
    sameBoard: window.__board === document.querySelector('.swimlane-board'),
    fullRenders: performance.getEntriesByName(fullMark).length - window.__fullRendersBefore,
    reconciles: performance.getEntriesByName(reconcileMark).length,
  }), { fullMark: FULL_RENDER_MARK, reconcileMark: RECONCILE_RENDER_MARK });
  expect(state.sameBoard).toBe(true);
  expect(state.fullRenders).toBe(0);
  expect(state.reconciles).toBeGreaterThan(0);
}

test.describe('Swimlane drop reconciliation on a 400-task board', () => {
  // Lane A carries a short active list so its row stays on screen; the bulk sits in Done and in
  // a long lane B, as on a real large board.
  const ACTIVE_IN_LANE_A = 8;
  const tasks = Array.from({ length: 400 }, (_, index) => {
    if (index < ACTIVE_IN_LANE_A) return makeTask(index, DOING_ID, LANE_A_ID);
    if (index < 200) return makeTask(index, DONE_ID, LANE_A_ID);
    if (index < 240) return makeTask(index, TODO_ID, LANE_B_ID);
    return makeTask(index, DONE_ID, LANE_B_ID);
  });

  test.setTimeout(120_000);

  test('consecutive native mouse drags into Done do not crash, freeze or lose tasks', async ({ page }) => {
    const failures = watchFailures(page);
    await seedBoard(page, tasks);
    await page.goto('/');
    await waitForBoardReady(page);
    await expect(cellSummary(page, LANE_A_ID, DONE_ID)).toHaveText('192 completed items hidden');
    await startWatchingBoard(page);

    const moves = 5;
    const movedIds = [];
    for (let move = 0; move < moves; move += 1) {
      const source = cellList(page, LANE_A_ID, DOING_ID).locator('.task').first();
      const id = await source.getAttribute('data-task-id');
      movedIds.push(id);
      await dragByMouse(page, source, cellList(page, LANE_A_ID, DONE_ID));

      expect(failures).toEqual([]);
      await expect(page.locator(`.task[data-task-id="${id}"]`)).toHaveCount(0);
      await expect(cellSummary(page, LANE_A_ID, DONE_ID)).toHaveText(`${193 + move} completed items hidden`);
      await expect(cellList(page, LANE_A_ID, DONE_ID).locator('.task')).toHaveCount(0);
      await expect(headerCounter(page, DOING_ID)).toHaveText(String(ACTIVE_IN_LANE_A - move - 1));
      await expect(headerCounter(page, DONE_ID)).toHaveText(String(352 + move + 1));
    }

    await expectBoardNeverRebuilt(page);
    await expect(page.locator('.task-fallback, .task-chosen, .task-ghost')).toHaveCount(0);

    // Done stays a live target, and the page still answers.
    await expect(cellList(page, LANE_A_ID, DONE_ID)).toBeAttached();
    await expect(page.locator('#board-container')).toBeVisible();

    await expect.poll(async () => (await readTasks(page)).filter((t) => t.column === DONE_ID).length)
      .toBe(352 + moves);
    const stored = await readTasks(page);
    expect(stored).toHaveLength(400);
    movedIds.forEach((id) => {
      const task = stored.find((t) => t.id === id);
      expect(task.column).toBe(DONE_ID);
      expect(task.doneDate).toBeTruthy();
      expect(task.columnHistory.map((entry) => entry.column)).toEqual([DOING_ID, DONE_ID]);
    });

    await page.reload();
    await waitForBoardReady(page);
    await expect(cellSummary(page, LANE_A_ID, DONE_ID)).toHaveText(`${192 + moves} completed items hidden`);
    await expect(headerCounter(page, DOING_ID)).toHaveText(String(ACTIVE_IN_LANE_A - moves));
    expect(await readTasks(page)).toHaveLength(400);
    expect(failures).toEqual([]);
  });
});

test.describe('Swimlane drop reconciliation', () => {
  test('a cross-lane, cross-column drop reuses the dragged node and updates the moved task', async ({ page }) => {
    const failures = watchFailures(page);
    await seedBoard(page, [
      makeTask(0, TODO_ID, LANE_A_ID),
      makeTask(1, TODO_ID, LANE_A_ID),
      makeTask(2, DOING_ID, LANE_B_ID),
    ]);
    await page.goto('/');
    await waitForBoardReady(page);
    const id = taskId(0);
    await expect(page.locator(`.task[data-task-id="${id}"]`)).toBeVisible();
    await startWatchingBoard(page);
    await page.evaluate((taskIdToTag) => {
      window.__dragged = document.querySelector(`.task[data-task-id="${taskIdToTag}"]`);
    }, id);

    await dragByMouse(page, page.locator(`.task[data-task-id="${id}"]`), cellList(page, LANE_B_ID, DOING_ID));

    const moved = cellList(page, LANE_B_ID, DOING_ID).locator(`.task[data-task-id="${id}"]`);
    await expect(moved).toBeVisible();
    await expect(moved.locator('.task-label', { hasText: 'Project B' })).toBeVisible();
    expect(await page.evaluate((taskIdToTag) => (
      window.__dragged === document.querySelector(`.task[data-task-id="${taskIdToTag}"]`)
    ), id)).toBe(true);
    await expect(page.locator('.swimlane-row[data-lane-key="' + LANE_A_ID + '"] .swimlane-row-badge').first()).toHaveText('1 active');
    await expect(page.locator('.swimlane-row[data-lane-key="' + LANE_B_ID + '"] .swimlane-row-badge').first()).toHaveText('2 active');
    await expect(headerCounter(page, TODO_ID)).toHaveText('1');
    await expect(headerCounter(page, DOING_ID)).toHaveText('2');
    await expectBoardNeverRebuilt(page);

    await expect.poll(async () => (await readTasks(page)).find((t) => t.id === id).column).toBe(DOING_ID);
    await expect.poll(async () => (await readTasks(page)).find((t) => t.id === id).swimlaneLabelId).toBe(LANE_B_ID);
    const stored = (await readTasks(page)).find((t) => t.id === id);
    expect(stored.columnHistory.map((entry) => entry.column)).toEqual([TODO_ID, DOING_ID]);

    await page.reload();
    await waitForBoardReady(page);
    await expect(cellList(page, LANE_B_ID, DOING_ID).locator(`.task[data-task-id="${id}"]`)).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('a drag still works after a lane has lost its last task', async ({ page }) => {
    const failures = watchFailures(page);
    await seedBoard(page, [
      makeTask(0, TODO_ID, LANE_A_ID),
      makeTask(1, TODO_ID, LANE_B_ID),
    ]);
    await page.goto('/');
    await waitForBoardReady(page);
    await expect(page.locator('.swimlane-row')).toHaveCount(2);
    await startWatchingBoard(page);

    await dragByMouse(page, page.locator(`.task[data-task-id="${taskId(1)}"]`), cellList(page, LANE_A_ID, DOING_ID));
    await expect(page.locator(`.swimlane-row[data-lane-key="${LANE_B_ID}"]`)).toHaveCount(0);

    await dragByMouse(page, page.locator(`.task[data-task-id="${taskId(1)}"]`), cellList(page, LANE_A_ID, DONE_ID));
    await expect(cellSummary(page, LANE_A_ID, DONE_ID)).toHaveText('1 completed item hidden');
    await expect(headerCounter(page, DOING_ID)).toHaveText('0');
    await expectBoardNeverRebuilt(page);
    expect(failures).toEqual([]);
  });

  test('a drop into Done clears the task from the due-soon notifications', async ({ page }) => {
    const failures = watchFailures(page);
    const dueYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await seedBoard(page, [makeTask(0, TODO_ID, LANE_A_ID, { dueDate: dueYesterday })]);
    await page.goto('/');
    await waitForBoardReady(page);
    await expect(page.locator('#notification-quick-badge')).toHaveText('1');
    await expect(page.locator('#notification-quick-badge')).toBeVisible();
    await startWatchingBoard(page);

    await dragByMouse(page, page.locator(`.task[data-task-id="${taskId(0)}"]`), cellList(page, LANE_A_ID, DONE_ID));

    await expect(page.locator('#notification-quick-badge')).toBeHidden();
    await expectBoardNeverRebuilt(page);
    expect(failures).toEqual([]);
  });
});

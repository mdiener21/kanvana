import { test, expect } from '@playwright/test';
import {
  seedSwimlaneBoard,
  readIDBValue,
  TEST_BOARD_ID,
  COL_TODO_ID,
  COL_INPROGRESS_ID,
  COL_DONE_ID,
  TASK_A_ID,
  LABEL_A_ID,
  LABEL_B_ID
} from './swimlanes.helpers.js';

const BOARD_ID = TEST_BOARD_ID;

async function writeIDBValue(page, key, value) {
  await page.evaluate(async ({ k, v }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kanvana-db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { k: key, v: value });
}

async function dragByMouse(page, source, target) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Expected draggable source and target drop zone to have bounding boxes.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.75, {
    steps: 20
  });
  await page.mouse.up();
}

test.describe('Swim lane drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await seedSwimlaneBoard(page, { swimLanesEnabled: true, swimLaneGroupBy: 'label' });
    await page.goto('/');
    await expect(page.locator('.swimlane-row')).toHaveCount(3);
  });

  test('moves a task between swim lanes and columns', async ({ page }) => {
    const task = page.locator(`.task[data-task-id="${TASK_A_ID}"]`);
    const target = page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_INPROGRESS_ID}"] .tasks`);

    await dragByMouse(page, task, target);

    const movedTask = page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_INPROGRESS_ID}"] .task[data-task-id="${TASK_A_ID}"]`);
    await expect(movedTask).toBeVisible();
    await expect(movedTask.locator('.task-label', { hasText: 'Project B' })).toBeVisible();
    await expect(movedTask.locator('.task-label', { hasText: 'Project A' })).toBeVisible();
  });

  test('moves a task into Done while done cards remain hidden', async ({ page }) => {
    const task = page.locator(`.task[data-task-id="${TASK_A_ID}"]`);
    const doneTarget = page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_DONE_ID}"] .tasks`);

    await task.dragTo(doneTarget);

    await expect(page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_DONE_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toHaveCount(0);
    await expect(page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_DONE_ID}"] .swimlane-cell-summary`)).toContainText('1 completed item hidden');
  });

  test('moves a task between priority swim lanes and updates task priority', async ({ page }) => {
    const settings = await readIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`) || {};
    await writeIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`, {
      ...settings,
      swimLanesEnabled: true,
      swimLaneGroupBy: 'priority'
    });

    await page.reload();
    await expect(page.locator(`.swimlane-row[data-lane-label="Medium"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();

    const task = page.locator(`.task[data-task-id="${TASK_A_ID}"]`);
    const target = page.locator(`.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="${COL_TODO_ID}"] .tasks`);

    await task.dragTo(target);

    const movedTask = page.locator(`.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`);
    await expect(movedTask).toBeVisible();
    await expect(movedTask.getByLabel('Priority: high')).toBeVisible();
  });

  test('moves a task between rows from the selected label group', async ({ page }) => {
    const settings = await readIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`) || {};
    await writeIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`, {
      ...settings,
      swimLanesEnabled: true,
      swimLaneGroupBy: 'label-group',
      swimLaneLabelGroup: 'Projects'
    });

    await page.reload();
    await expect(page.locator(`.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`)).toBeVisible();

    const task = page.locator(`.task[data-task-id="${TASK_A_ID}"]`);
    const target = page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_TODO_ID}"] .tasks`);

    await task.dragTo(target);

    const movedTask = page.locator(`.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="${COL_TODO_ID}"] .task[data-task-id="${TASK_A_ID}"]`);
    await expect(movedTask).toBeVisible();
    await expect(movedTask.locator('.task-label', { hasText: 'Project B' })).toBeVisible();
    await expect(movedTask.locator('.task-label', { hasText: 'Project A' })).toHaveCount(0);
  });
});

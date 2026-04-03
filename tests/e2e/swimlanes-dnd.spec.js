import { test, expect } from '@playwright/test';
import { seedSwimlaneBoard, readIDBValue } from './swimlanes.helpers.js';

const BOARD_ID = 'swimlane-test-board';

async function readTask(page, taskId) {
  const tasks = await readIDBValue(page, `kanbanBoard:${BOARD_ID}:tasks`) || [];
  return tasks.find((t) => t.id === taskId);
}

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
    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="inprogress"] .tasks');

    await dragByMouse(page, task, target);

    await expect(page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="inprogress"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await readTask(page, 'task-a');

    expect(storedTask.column).toBe('inprogress');
    expect(storedTask.swimlaneLabelId).toBe('label-b');
    expect(storedTask.labels).toEqual(['label-b', 'label-a']);
  });


  test('moves a task into Done while done cards remain hidden', async ({ page }) => {
    const task = page.locator('.task[data-task-id="task-a"]');
    const doneTarget = page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .tasks');

    await task.dragTo(doneTarget);

    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .task[data-task-id="task-a"]')).toHaveCount(0);
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="done"] .swimlane-cell-summary')).toContainText('1 completed item hidden');

    const storedTask = await readTask(page, 'task-a');

    expect(storedTask.column).toBe('done');
    expect(storedTask.order).toBe(1);
    expect(storedTask.swimlaneLabelId).toBe('label-a');
  });

  test('moves a task between priority swim lanes and updates task priority', async ({ page }) => {
    const settings = await readIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`) || {};
    await writeIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`, {
      ...settings,
      swimLanesEnabled: true,
      swimLaneGroupBy: 'priority'
    });

    await page.reload();
    await expect(page.locator('.swimlane-row[data-lane-label="Medium"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="todo"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="High"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await readTask(page, 'task-a');

    expect(storedTask.column).toBe('todo');
    expect(storedTask.priority).toBe('high');
  });

  test('moves a task between rows from the selected label group', async ({ page }) => {
    const settings2 = await readIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`) || {};
    await writeIDBValue(page, `kanbanBoard:${BOARD_ID}:settings`, {
      ...settings2,
      swimLanesEnabled: true,
      swimLaneGroupBy: 'label-group',
      swimLaneLabelGroup: 'Projects'
    });

    await page.reload();
    await expect(page.locator('.swimlane-row[data-lane-label="Project A"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const task = page.locator('.task[data-task-id="task-a"]');
    const target = page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="todo"] .tasks');

    await task.dragTo(target);

    await expect(page.locator('.swimlane-row[data-lane-label="Project B"] .swimlane-cell[data-column="todo"] .task[data-task-id="task-a"]')).toBeVisible();

    const storedTask = await readTask(page, 'task-a');

    expect(storedTask.column).toBe('todo');
    expect(storedTask.swimlaneLabelGroup).toBe('Projects');
    expect(storedTask.swimlaneLabelId).toBe('label-b');
    expect(storedTask.labels).toEqual(['label-b']);
  });
});
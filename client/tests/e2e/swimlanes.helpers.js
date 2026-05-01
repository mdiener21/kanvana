import { expect } from '@playwright/test';

// UUID-format IDs so normalizeIdbState leaves them unchanged on app startup.
export const TEST_BOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
export const COL_TODO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
export const COL_INPROGRESS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
export const COL_DONE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';
export const LABEL_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005';
export const LABEL_B_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006';
export const LABEL_C_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
export const TASK_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008';
export const TASK_B_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009';
export const TASK_C_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a';

export async function seedSwimlaneBoard(page, settingsOverrides = {}) {
  const fixture = {
    boardId: TEST_BOARD_ID,
    columns: [
      { id: COL_TODO_ID, name: 'To Do', color: '#3583ff', order: 1, collapsed: false },
      { id: COL_INPROGRESS_ID, name: 'In Progress', color: '#f59e0b', order: 2, collapsed: false },
      { id: COL_DONE_ID, name: 'Done', color: '#505050', order: 3, collapsed: false, role: 'done' }
    ],
    labels: [
      { id: LABEL_A_ID, name: 'Project A', color: '#2563eb', group: 'Projects' },
      { id: LABEL_B_ID, name: 'Project B', color: '#16a34a', group: 'Projects' },
      { id: LABEL_C_ID, name: 'Ops', color: '#f59e0b', group: 'Workstreams' }
    ],
    tasks: [
      {
        id: TASK_A_ID,
        title: 'Task A',
        description: 'Alpha work',
        priority: 'medium',
        dueDate: '',
        column: COL_TODO_ID,
        order: 1,
        labels: [LABEL_A_ID],
        creationDate: '2026-03-01T09:00:00.000Z',
        changeDate: '2026-03-01T09:00:00.000Z',
        columnHistory: [{ column: COL_TODO_ID, at: '2026-03-01T09:00:00.000Z' }]
      },
      {
        id: TASK_B_ID,
        title: 'Task B',
        description: 'Beta work',
        priority: 'high',
        dueDate: '',
        column: COL_INPROGRESS_ID,
        order: 1,
        labels: [LABEL_B_ID],
        creationDate: '2026-03-01T09:10:00.000Z',
        changeDate: '2026-03-01T09:10:00.000Z',
        columnHistory: [{ column: COL_INPROGRESS_ID, at: '2026-03-01T09:10:00.000Z' }]
      },
      {
        id: TASK_C_ID,
        title: 'Task C',
        description: 'Ungrouped work',
        priority: 'low',
        dueDate: '',
        column: COL_DONE_ID,
        order: 1,
        labels: [],
        creationDate: '2026-03-01T09:20:00.000Z',
        changeDate: '2026-03-01T09:20:00.000Z',
        doneDate: '2026-03-01T09:20:00.000Z',
        columnHistory: [{ column: COL_DONE_ID, at: '2026-03-01T09:20:00.000Z' }]
      }
    ],
    settings: {
      showPriority: true,
      showDueDate: true,
      showAge: true,
      showChangeDate: false,
      locale: 'en-US',
      defaultPriority: 'none',
      notificationDays: 3,
      countdownUrgentThreshold: 3,
      countdownWarningThreshold: 10,
      swimLanesEnabled: false,
      swimLaneGroupBy: 'label',
      swimLaneLabelGroup: '',
      swimLaneCollapsedKeys: [],
      ...settingsOverrides
    }
  };

  await page.addInitScript((data) => {
    // Skip re-seeding on reload so persistence tests can verify data survives navigation.
    if (sessionStorage.getItem('__kanvanaTestSeeded')) return;
    sessionStorage.setItem('__kanvanaTestSeeded', '1');

    localStorage.clear();
    indexedDB.deleteDatabase('kanvana-db');

    // Open IDB and seed data inside the onupgradeneeded transaction.
    // IDB serialises operations per database, so the app's subsequent openDB()
    // call will wait for our delete + open + seed to finish before proceeding.
    const req = indexedDB.open('kanvana-db', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('kv');
      const boards = [{ id: data.boardId, name: 'Swimlane Test Board', createdAt: new Date().toISOString() }];
      store.put(boards, 'kanbanBoards');
      store.put(data.boardId, 'kanbanActiveBoardId');
      store.put(data.columns, `kanbanBoard:${data.boardId}:columns`);
      store.put(data.tasks, `kanbanBoard:${data.boardId}:tasks`);
      store.put(data.labels, `kanbanBoard:${data.boardId}:labels`);
      store.put(data.settings, `kanbanBoard:${data.boardId}:settings`);
    };
  }, fixture);
}

/**
 * Read a value from the kanvana IDB key-value store.
 */
export async function readIDBValue(page, key) {
  return page.evaluate(async (k) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kanvana-db', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(k);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  }, key);
}

/**
 * Read the settings for the active board from IDB.
 */
export async function readIDBSettings(page, boardId = TEST_BOARD_ID) {
  return (await readIDBValue(page, `kanbanBoard:${boardId}:settings`)) || {};
}

export async function openSwimlaneSettings(page) {
  const settingsButton = page.locator('#settings-btn');
  if (!(await settingsButton.isVisible())) {
    await page.locator('#desktop-menu-btn').click();
  }
  await settingsButton.click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}

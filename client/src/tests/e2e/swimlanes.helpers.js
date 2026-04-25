import { expect } from '@playwright/test';

export async function seedSwimlaneBoard(page, settingsOverrides = {}) {
  const fixture = {
    boardId: 'swimlane-test-board',
    columns: [
      { id: 'todo', name: 'To Do', color: '#3583ff', order: 1, collapsed: false },
      { id: 'inprogress', name: 'In Progress', color: '#f59e0b', order: 2, collapsed: false },
      { id: 'done', name: 'Done', color: '#505050', order: 3, collapsed: false }
    ],
    labels: [
      { id: 'label-a', name: 'Project A', color: '#2563eb', group: 'Projects' },
      { id: 'label-b', name: 'Project B', color: '#16a34a', group: 'Projects' },
      { id: 'label-c', name: 'Ops', color: '#f59e0b', group: 'Workstreams' }
    ],
    tasks: [
      {
        id: 'task-a',
        title: 'Task A',
        description: 'Alpha work',
        priority: 'medium',
        dueDate: '',
        column: 'todo',
        order: 1,
        labels: ['label-a'],
        creationDate: '2026-03-01T09:00:00.000Z',
        changeDate: '2026-03-01T09:00:00.000Z',
        columnHistory: [{ column: 'todo', at: '2026-03-01T09:00:00.000Z' }]
      },
      {
        id: 'task-b',
        title: 'Task B',
        description: 'Beta work',
        priority: 'high',
        dueDate: '',
        column: 'inprogress',
        order: 1,
        labels: ['label-b'],
        creationDate: '2026-03-01T09:10:00.000Z',
        changeDate: '2026-03-01T09:10:00.000Z',
        columnHistory: [{ column: 'inprogress', at: '2026-03-01T09:10:00.000Z' }]
      },
      {
        id: 'task-c',
        title: 'Task C',
        description: 'Ungrouped work',
        priority: 'low',
        dueDate: '',
        column: 'done',
        order: 1,
        labels: [],
        creationDate: '2026-03-01T09:20:00.000Z',
        changeDate: '2026-03-01T09:20:00.000Z',
        doneDate: '2026-03-01T09:20:00.000Z',
        columnHistory: [{ column: 'done', at: '2026-03-01T09:20:00.000Z' }]
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
export async function readIDBSettings(page, boardId = 'swimlane-test-board') {
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
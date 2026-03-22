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
    const tasksKey = `kanbanBoard:${data.boardId}:tasks`;
    if (localStorage.getItem('kanbanActiveBoardId') === data.boardId && localStorage.getItem(tasksKey)) {
      return;
    }

    localStorage.clear();
    const boards = [{ id: data.boardId, name: 'Swimlane Test Board', createdAt: new Date().toISOString() }];
    localStorage.setItem('kanbanBoards', JSON.stringify(boards));
    localStorage.setItem('kanbanActiveBoardId', data.boardId);
    localStorage.setItem(`kanbanBoard:${data.boardId}:columns`, JSON.stringify(data.columns));
    localStorage.setItem(`kanbanBoard:${data.boardId}:tasks`, JSON.stringify(data.tasks));
    localStorage.setItem(`kanbanBoard:${data.boardId}:labels`, JSON.stringify(data.labels));
    localStorage.setItem(`kanbanBoard:${data.boardId}:settings`, JSON.stringify(data.settings));
  }, fixture);
}

export async function openSwimlaneSettings(page) {
  const settingsButton = page.locator('#settings-btn');
  if (!(await settingsButton.isVisible())) {
    await page.locator('#desktop-menu-btn').click();
  }
  await settingsButton.click();
  await expect(page.locator('#settings-modal')).toBeVisible();
}
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { mountToBody } from './setup.js';
import { createBoard, getActiveBoardId, loadDeletedTasksForBoard, loadGlobalSettings, loadTasks, saveGlobalSettings, saveTasks, saveTasksForBoard } from '../../src/modules/storage.js';
import { initializeSettingsUI } from '../../src/modules/settings.js';

const { confirmDialog, alertDialog } = vi.hoisted(() => ({
  confirmDialog: vi.fn(),
  alertDialog: vi.fn()
}));

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog,
  alertDialog
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');

const SOFT_DELETE_MESSAGE = 'You have soft-delete active, this will set the task as deleted and will not count or show in any location, to permanently delete you must click purge in the settings.';
const PERMANENT_DELETE_MESSAGE = 'Delete this task? This cannot be undone.';

function mountSettings() {
  mountToBody(`
    <button id="settings-btn" type="button">Settings</button>
    <div id="settings-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <div class="modal-backdrop" data-close-modal></div>
      <article class="modal-content">
        <h3 id="settings-modal-title">Settings</h3>
        <button id="settings-close-modal-btn" type="button">Close</button>
        <form id="settings-form" novalidate>
          <section class="settings-section" aria-labelledby="settings-app-title">
            <h4 id="settings-app-title">App settings</h4>
            <label>
              <input id="settings-soft-delete-enabled" type="checkbox">
              Soft-delete tasks
            </label>
            <button type="button" id="settings-purge-btn" disabled>
              Purge deleted tasks (<span id="settings-purge-count">0</span>)
            </button>
          </section>
          <section class="settings-section" aria-labelledby="settings-board-title">
            <h4 id="settings-board-title">Board settings</h4>
            <label><input id="settings-show-priority" type="checkbox">Show task priority</label>
            <label><input id="settings-show-due-date" type="checkbox">Show task due date</label>
            <input id="settings-notification-days" type="number">
            <input id="settings-countdown-urgent-threshold" type="number">
            <input id="settings-countdown-warning-threshold" type="number">
            <label><input id="settings-show-age" type="checkbox">Show task age</label>
            <label><input id="settings-show-change-date" type="checkbox">Show updated date/time</label>
            <select id="settings-locale"></select>
            <select id="settings-default-priority"><option value="none">None</option></select>
          </section>
          <button type="button" id="settings-close-btn">Close</button>
        </form>
      </article>
    </div>
  `);
  initializeSettingsUI();
}

beforeEach(() => {
  confirmDialog.mockReset();
  createBoard('Settings UI');
  saveTasks([]);
});

test('soft-delete toggle reflects persisted global settings when Settings opens', () => {
  saveGlobalSettings({ softDeleteEnabled: true });
  mountSettings();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  expect(screen.getByRole('heading', { name: 'App settings' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Board settings' })).toBeTruthy();
  expect(screen.getByLabelText('Soft-delete tasks').checked).toBe(true);
  expect(loadGlobalSettings()).toEqual({ softDeleteEnabled: true });
});

test('toggling soft-delete on switches task deletion to soft-delete mode immediately', async () => {
  const task = {
    id: 'task-1',
    title: 'Keep recoverable',
    description: '',
    priority: 'none',
    dueDate: '',
    column: 'todo',
    labels: [],
    creationDate: '2026-05-17T00:00:00.000Z',
    changeDate: '2026-05-17T00:00:00.000Z',
    columnHistory: [{ column: 'todo', at: '2026-05-17T00:00:00.000Z' }]
  };
  saveTasks([task]);
  confirmDialog.mockResolvedValue(true);
  mountSettings();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByLabelText('Soft-delete tasks'));
  document.body.appendChild(createTaskElement(task, {}, new Map(), new Date('2026-05-17T00:00:00Z')));
  fireEvent.click(screen.getByLabelText('Delete task'));
  await Promise.resolve();

  expect(loadGlobalSettings()).toEqual({ softDeleteEnabled: true });
  expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: SOFT_DELETE_MESSAGE }));
  expect(loadTasks().find(t => t.id === task.id)).toBeUndefined();
  expect(loadDeletedTasksForBoard(getActiveBoardId()).find(t => t.id === task.id)).toMatchObject({
    id: task.id,
    deleted: true
  });
});

test('toggling soft-delete off switches confirmation back and leaves soft-deleted tasks untouched', async () => {
  const deletedTask = {
    id: 'task-deleted',
    title: 'Already deleted',
    description: '',
    priority: 'none',
    dueDate: '',
    column: 'todo',
    labels: [],
    deleted: true
  };
  const liveTask = {
    id: 'task-live',
    title: 'Delete permanently',
    description: '',
    priority: 'none',
    dueDate: '',
    column: 'todo',
    labels: []
  };
  saveGlobalSettings({ softDeleteEnabled: true });
  saveTasks([deletedTask, liveTask]);
  confirmDialog.mockResolvedValue(false);
  mountSettings();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByLabelText('Soft-delete tasks'));
  document.body.appendChild(createTaskElement(liveTask, {}, new Map(), new Date('2026-05-17T00:00:00Z')));
  fireEvent.click(screen.getByLabelText('Delete task'));
  await Promise.resolve();

  expect(loadGlobalSettings()).toEqual({ softDeleteEnabled: false });
  expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: PERMANENT_DELETE_MESSAGE }));
  expect(loadDeletedTasksForBoard(getActiveBoardId()).find(t => t.id === deletedTask.id)).toMatchObject({
    id: deletedTask.id,
    deleted: true
  });
});

// ── Issue 006: Purge button ───────────────────────────────────────────────────

test('purge button shows count of zero and is disabled when no soft-deleted tasks', () => {
  saveTasks([]);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const btn = document.getElementById('settings-purge-btn');
  const count = document.getElementById('settings-purge-count');
  expect(count.textContent).toBe('0');
  expect(btn.disabled).toBe(true);
});

test('purge button shows correct count and is enabled when soft-deleted tasks exist', () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
    { id: 't2', deleted: true, title: 'B', column: 'todo', labels: [] },
    { id: 't3', deleted: false, title: 'C', column: 'todo', labels: [] },
  ]);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const btn = document.getElementById('settings-purge-btn');
  const count = document.getElementById('settings-purge-count');
  expect(count.textContent).toBe('2');
  expect(btn.disabled).toBe(false);
});

test('purge button enabled when soft-deleted tasks exist even if soft-delete toggle is off', () => {
  saveGlobalSettings({ softDeleteEnabled: false });
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
  ]);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  expect(document.getElementById('settings-purge-btn').disabled).toBe(false);
});

test('clicking purge shows confirmation with count and across all boards', async () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
    { id: 't2', deleted: true, title: 'B', column: 'todo', labels: [] },
  ]);
  confirmDialog.mockResolvedValue(false);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(document.getElementById('settings-purge-btn'));

  await waitFor(() => {
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('2'),
    }));
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('across all boards'),
    }));
  });
});

test('cancelling purge confirmation leaves all soft-deleted tasks untouched', async () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
  ]);
  confirmDialog.mockResolvedValue(false);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(document.getElementById('settings-purge-btn'));

  await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
  expect(loadDeletedTasksForBoard(boardId)).toHaveLength(1);
});

test('confirming purge removes all soft-deleted tasks from all boards', async () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
    { id: 't2', deleted: false, title: 'B', column: 'todo', labels: [] },
  ]);
  confirmDialog.mockResolvedValue(true);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(document.getElementById('settings-purge-btn'));

  await waitFor(() => {
    expect(loadDeletedTasksForBoard(boardId)).toHaveLength(0);
  });
  expect(loadTasks()).toHaveLength(1);
});

test('purge button disables and shows zero count after successful purge', async () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
  ]);
  confirmDialog.mockResolvedValue(true);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(document.getElementById('settings-purge-btn'));

  await waitFor(() => {
    expect(document.getElementById('settings-purge-count').textContent).toBe('0');
    expect(document.getElementById('settings-purge-btn').disabled).toBe(true);
  });
});

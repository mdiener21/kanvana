import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';

const confirmDialog = vi.fn();
const deleteTask = vi.fn();
const emit = vi.fn();

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog
}));

vi.mock('../../src/modules/tasks.js', () => ({
  deleteTask
}));

vi.mock('../../src/modules/events.js', () => ({
  DATA_CHANGED: 'data:changed',
  emit
}));

vi.mock('../../src/modules/modals.js', () => ({
  showEditModal: vi.fn()
}));

vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: vi.fn(() => false),
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');

beforeEach(() => {
  confirmDialog.mockReset();
  deleteTask.mockReset();
  emit.mockReset();
});

function renderTask() {
  const task = {
    id: 'task-1',
    title: 'Delete me',
    description: '',
    priority: 'none',
    dueDate: '',
    column: 'todo',
    labels: []
  };
  const element = createTaskElement(task, {}, new Map(), new Date('2026-05-17T00:00:00Z'));
  document.body.appendChild(element);
  return element;
}

test('delete button shows permanent-delete confirmation message by default', async () => {
  confirmDialog.mockResolvedValue(false);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
    message: 'This will permanently delete the task. There is no undo.'
  }));
});

test('cancelling delete leaves the task untouched', async () => {
  confirmDialog.mockResolvedValue(false);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(deleteTask).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

test('confirming permanent delete emits DATA_CHANGED after deletion succeeds', async () => {
  confirmDialog.mockResolvedValue(true);
  deleteTask.mockReturnValue(true);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(deleteTask).toHaveBeenCalledWith('task-1');
  expect(emit).toHaveBeenCalledWith('data:changed');
});

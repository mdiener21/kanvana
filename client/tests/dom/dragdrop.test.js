import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';

const mocks = vi.hoisted(() => ({
  sortableInstances: [],
  updateTaskPositionsFromDrop: vi.fn(),
  moveTaskToTopInColumn: vi.fn(),
  isDoneColumnId: vi.fn((columnId) => columnId === 'done'),
  loadTasks: vi.fn(() => []),
  beginDragReconcile: vi.fn(),
  endDragReconcile: vi.fn(),
}));

vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable(element, options) {
    this.destroy = vi.fn();
    mocks.sortableInstances.push({ element, options });
  }),
}));

vi.mock('../../src/modules/tasks.js', () => ({
  updateTaskPositionsFromDrop: mocks.updateTaskPositionsFromDrop,
  moveTaskToTopInColumn: mocks.moveTaskToTopInColumn,
}));

vi.mock('../../src/modules/columns.js', () => ({
  updateColumnPositions: vi.fn(),
}));

vi.mock('../../src/modules/events.js', () => ({
  DATA_CHANGED: 'data:changed',
  emit: vi.fn(),
}));

vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: mocks.isDoneColumnId,
  loadTasks: mocks.loadTasks,
}));

vi.mock('../../src/modules/render.js', () => ({
  beginDragReconcile: mocks.beginDragReconcile,
  endDragReconcile: mocks.endDragReconcile,
}));

function mountBoard({ targetColumn = 'done', collapsed = false } = {}) {
  mountToBody(`
    <section id="board-container">
      <article class="task-column" data-column="todo">
        <div class="tasks">
          <div class="task" data-task-id="task-1"></div>
        </div>
      </article>
      <article class="task-column${collapsed ? ' is-collapsed' : ''}" data-column="${targetColumn}">
        <div class="tasks"></div>
      </article>
    </section>
  `);

  return {
    from: document.querySelector('[data-column="todo"] .tasks'),
    to: document.querySelector(`[data-column="${targetColumn}"] .tasks`),
    item: document.querySelector('.task'),
  };
}

function getTaskEndHandler() {
  const taskSortable = mocks.sortableInstances.find((instance) => instance.options.draggable === '.task');
  return taskSortable.options.onEnd;
}

function getTaskStartHandler() {
  const taskSortable = mocks.sortableInstances.find((instance) => instance.options.draggable === '.task');
  return taskSortable.options.onStart;
}

function getColumnStartHandler() {
  const columnSortable = mocks.sortableInstances.find((instance) => instance.options.draggable === '.task-column');
  return columnSortable.options.onStart;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.sortableInstances.length = 0;
  mocks.updateTaskPositionsFromDrop.mockReset();
  mocks.moveTaskToTopInColumn.mockReset();
  mocks.isDoneColumnId.mockClear();
  mocks.loadTasks.mockClear();
  mocks.beginDragReconcile.mockClear();
  mocks.endDragReconcile.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.requestAnimationFrame;
});

test('task drop waits for a frame and timer before mutating state', async () => {
  const evt = mountBoard();
  let rafCallback;
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    rafCallback = callback;
    return 1;
  });

  mocks.updateTaskPositionsFromDrop.mockReturnValue({
    movedTaskId: 'task-1',
    fromColumn: 'todo',
    toColumn: 'done',
    didChangeColumn: true,
  });

  const { initDragDrop } = await import('../../src/modules/dragdrop.js');
  initDragDrop();

  const endPromise = getTaskEndHandler()(evt);

  expect(mocks.updateTaskPositionsFromDrop).not.toHaveBeenCalled();
  rafCallback();
  expect(mocks.updateTaskPositionsFromDrop).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(0);
  await endPromise;

  expect(mocks.updateTaskPositionsFromDrop).toHaveBeenCalledWith(evt);
  expect(mocks.moveTaskToTopInColumn).not.toHaveBeenCalled();
});

test('task drop wraps its state mutation in a reconcile window', async () => {
  const evt = mountBoard();
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });

  mocks.updateTaskPositionsFromDrop.mockReturnValue({
    movedTaskId: 'task-1',
    fromColumn: 'todo',
    toColumn: 'done',
    didChangeColumn: true,
  });

  const { initDragDrop } = await import('../../src/modules/dragdrop.js');
  initDragDrop();

  const endPromise = getTaskEndHandler()(evt);
  await vi.advanceTimersByTimeAsync(0);
  await endPromise;

  // The window opens before the mutation and closes after it, so the
  // synchronous DATA_CHANGED the mutation emits reconciles in place.
  expect(mocks.beginDragReconcile).toHaveBeenCalledTimes(1);
  expect(mocks.endDragReconcile).toHaveBeenCalledTimes(1);
  const begin = mocks.beginDragReconcile.mock.invocationCallOrder[0];
  const mutate = mocks.updateTaskPositionsFromDrop.mock.invocationCallOrder[0];
  const end = mocks.endDragReconcile.mock.invocationCallOrder[0];
  expect(begin).toBeLessThan(mutate);
  expect(mutate).toBeLessThan(end);
});

test('collapsed non-done drops still pin the moved task through state', async () => {
  const evt = mountBoard({ targetColumn: 'review', collapsed: true });
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });

  mocks.updateTaskPositionsFromDrop.mockReturnValue({
    movedTaskId: 'task-1',
    fromColumn: 'todo',
    toColumn: 'review',
    didChangeColumn: true,
  });

  const { initDragDrop } = await import('../../src/modules/dragdrop.js');
  initDragDrop();

  const endPromise = getTaskEndHandler()(evt);
  await vi.advanceTimersByTimeAsync(0);
  await endPromise;

  expect(mocks.moveTaskToTopInColumn).toHaveBeenCalledWith('task-1', 'review');
});

test('reinitializing during an active task drag clears transient drag state', async () => {
  const evt = mountBoard({ targetColumn: 'review', collapsed: true });
  const targetList = evt.to;
  targetList.classList.add('hidden');

  const { initDragDrop } = await import('../../src/modules/dragdrop.js');
  initDragDrop();
  getTaskStartHandler()({ from: evt.from });

  expect(document.body.classList.contains('dragging')).toBe(true);
  expect(targetList.classList.contains('hidden')).toBe(false);
  expect(targetList.dataset.wasHidden).toBe('true');

  initDragDrop();

  expect(document.body.classList.contains('dragging')).toBe(false);
  expect(targetList.classList.contains('hidden')).toBe(true);
  expect(targetList.dataset.wasHidden).toBeUndefined();
});

test('reinitializing during an active column drag clears the column drag class', async () => {
  mountBoard();

  const { initDragDrop } = await import('../../src/modules/dragdrop.js');
  initDragDrop();
  getColumnStartHandler()();

  expect(document.body.classList.contains('dragging-column')).toBe(true);

  initDragDrop();

  expect(document.body.classList.contains('dragging-column')).toBe(false);
});

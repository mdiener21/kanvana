import { beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';

// The reconcile adapter is exercised against a real render.js and a real DOM.
// Only the read model (storage) and the leaf side-effect modules are mocked, so
// the tests describe the seam's behaviour, not its implementation.
const mocks = vi.hoisted(() => ({
  columns: [],
  tasks: [],
  labels: [],
  settings: {},
  isDoneColumnId: vi.fn((id) => id === 'done'),
}));

vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable() {
    this.destroy = vi.fn();
  }),
}));
vi.mock('../../src/modules/icons.js', () => ({ renderIcons: vi.fn() }));

const refreshNotifications = vi.fn();
vi.mock('../../src/modules/notifications.js', () => ({ refreshNotifications }));
vi.mock('../../src/modules/storage.js', () => ({
  loadColumns: () => mocks.columns,
  loadTasks: () => mocks.tasks,
  loadLabels: () => mocks.labels,
  loadSettings: () => mocks.settings,
  isDoneColumnId: mocks.isDoneColumnId,
}));

beforeEach(() => {
  mocks.columns = [
    { id: 'todo', name: 'To Do', order: 1 },
    { id: 'done', name: 'Done', order: 2, role: 'done' },
  ];
  mocks.tasks = [];
  mocks.labels = [];
  mocks.settings = { swimLanesEnabled: false, showDueDate: true };
  mocks.isDoneColumnId.mockClear();
  refreshNotifications.mockClear();
});

function mountStandardBoard() {
  mountToBody(`
    <div id="board-container" data-view-mode="columns">
      <article class="task-column" data-column="todo">
        <header class="column-header">
          <h2 id="column-title-todo">To Do</h2>
          <span class="task-counter" data-column-id="todo">1</span>
        </header>
        <ul class="tasks">
          <li class="task" data-task-id="t1"><span class="task-date"></span></li>
        </ul>
      </article>
      <article class="task-column" data-column="done">
        <header class="column-header">
          <h2 id="column-title-done">Done</h2>
          <span class="task-counter" data-column-id="done">0</span>
        </header>
        <ul class="tasks"></ul>
      </article>
    </div>
  `);
}

test('reconcileBoard moves a dragged task card into its new column, preserving the node', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();

  const card = document.querySelector('[data-task-id="t1"]');
  const doneList = document.querySelector('[data-column="done"] .tasks');
  const todoArticleBefore = document.querySelector('[data-column="todo"]');

  const { reconcileBoard } = await import('../../src/modules/render.js');
  const handled = reconcileBoard();

  expect(handled).toBe(true);
  // The card is now under Done...
  expect(card.parentElement).toBe(doneList);
  // ...and it is the very same node (not detached and recreated).
  expect(document.querySelector('[data-task-id="t1"]')).toBe(card);
  // The board container was patched in place, not rebuilt.
  expect(document.querySelector('[data-column="todo"]')).toBe(todoArticleBefore);
});

test('reconcileBoard updates each column task counter to match state', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  expect(document.querySelector('.task-counter[data-column-id="todo"]').textContent).toBe('0');
  expect(document.querySelector('.task-counter[data-column-id="done"]').textContent).toBe('1');
});

test('reconcileBoard updates a collapsed column title count', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountToBody(`
    <div id="board-container" data-view-mode="columns">
      <article class="task-column" data-column="todo">
        <header class="column-header"><h2 id="column-title-todo">To Do</h2>
          <span class="task-counter" data-column-id="todo">1</span></header>
        <ul class="tasks"><li class="task" data-task-id="t1"><span class="task-date"></span></li></ul>
      </article>
      <article class="task-column is-collapsed" data-column="done">
        <header class="column-header"><h2 id="column-title-done">Done (0)</h2>
          <span class="task-counter hidden" data-column-id="done">0</span></header>
        <ul class="tasks hidden"></ul>
      </article>
    </div>
  `);

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  expect(document.querySelector('#column-title-done').textContent).toBe('Done (1)');
});

test('a data change inside a drag-reconcile window patches in place instead of rebuilding', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();
  const card = document.querySelector('[data-task-id="t1"]');

  const { beginDragReconcile, endDragReconcile } = await import('../../src/modules/render.js');
  const { emit, DATA_CHANGED } = await import('../../src/modules/events.js');

  beginDragReconcile();
  emit(DATA_CHANGED);
  endDragReconcile();

  // The moved card is the same node — the board was reconciled, not torn down.
  expect(document.querySelector('[data-task-id="t1"]')).toBe(card);
  expect(card.parentElement).toBe(document.querySelector('[data-column="done"] .tasks'));
});

test('reconcileBoard refreshes notifications, matching a full render', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  expect(refreshNotifications).toHaveBeenCalled();
});

test('reconcileBoard respects the active board filter, like a full render', async () => {
  mocks.tasks = [
    { id: 't1', column: 'done', order: 1, title: 'Ship the release' },
    { id: 't2', column: 'done', order: 2, title: 'Water the plants' },
  ];
  mountStandardBoard();

  const { reconcileBoard, setBoardFilterQuery } = await import('../../src/modules/render.js');
  setBoardFilterQuery('ship');
  try {
    reconcileBoard();

    const doneList = document.querySelector('[data-column="done"] .tasks');
    // Only the matching task is rendered; the filtered-out one is not created.
    expect(doneList.querySelector('[data-task-id="t1"]')).not.toBeNull();
    expect(doneList.querySelector('[data-task-id="t2"]')).toBeNull();
    expect(document.querySelector('.task-counter[data-column-id="done"]').textContent).toBe('1');
  } finally {
    setBoardFilterQuery('');
  }
});

test('reconcileBoard defers to a full rebuild when swimlane mode is on', async () => {
  mocks.settings = { swimLanesEnabled: true };
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();

  const card = document.querySelector('[data-task-id="t1"]');
  const { reconcileBoard } = await import('../../src/modules/render.js');

  expect(reconcileBoard()).toBe(false);
  // Left untouched for the caller to rebuild.
  expect(card.parentElement).toBe(document.querySelector('[data-column="todo"] .tasks'));
});

test('reconcileBoard defers to a full rebuild when the column set changed', async () => {
  mocks.columns = [
    { id: 'todo', name: 'To Do', order: 1 },
    { id: 'review', name: 'Review', order: 2 },
    { id: 'done', name: 'Done', order: 3, role: 'done' },
  ];
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it' }];
  mountStandardBoard();

  const { reconcileBoard } = await import('../../src/modules/render.js');
  expect(reconcileBoard()).toBe(false);
});

test('reconcileBoard virtualizes an overfull Done column instead of rendering every card', async () => {
  const DONE_BATCH = 50;
  mocks.tasks = Array.from({ length: 60 }, (_, i) => ({
    id: `d${i}`, column: 'done', order: i + 1, title: `Done ${i}`,
  }));
  mountStandardBoard();

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  const doneList = document.querySelector('[data-column="done"] .tasks');
  expect(doneList.querySelectorAll('.task').length).toBe(DONE_BATCH);
  expect(doneList.querySelector('.show-more-btn')).not.toBeNull();
  // Counter always reflects the true total, not the rendered slice.
  expect(document.querySelector('.task-counter[data-column-id="done"]').textContent).toBe('60');
});

test('reconcileBoard patches a card due-date in place when it lands in Done', async () => {
  mocks.tasks = [{ id: 't1', column: 'done', order: 1, title: 'Ship it', dueDate: '2026-08-15' }];
  mountStandardBoard();

  const card = document.querySelector('[data-task-id="t1"]');
  const dateEl = card.querySelector('.task-date');

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  // Same nodes — patched, not recreated.
  expect(document.querySelector('[data-task-id="t1"]')).toBe(card);
  expect(card.querySelector('.task-date')).toBe(dateEl);
  // Done tasks show the raw due date with no countdown urgency.
  expect(dateEl.textContent).toMatch(/^Due /);
  expect(dateEl.classList.contains('countdown-none')).toBe(true);
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';

// A swimlane drop runs against the real dragdrop.js, render.js and swimlane-renderer.js on a
// real DOM. Only the read model, the drop's state mutation and Sortable itself are replaced:
// the test moves the card as Sortable would, then calls Sortable's onEnd.
const mocks = vi.hoisted(() => ({
  columns: [],
  tasks: [],
  labels: [],
  settings: {},
  sortables: [],
  applyDrop: null,
}));

vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable(el, options) {
    this.el = el;
    this.options = options;
    this.destroy = vi.fn();
    mocks.sortables.push(this);
  }),
}));
vi.mock('../../src/modules/icons.js', () => ({ renderIcons: vi.fn() }));
const refreshNotifications = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/notifications.js', () => ({ refreshNotifications }));
vi.mock('../../src/modules/storage.js', () => ({
  loadColumns: () => mocks.columns,
  loadTasks: () => mocks.tasks,
  loadLabels: () => mocks.labels,
  loadSettings: () => mocks.settings,
  isDoneColumnId: (id) => id === 'done',
}));
vi.mock('../../src/modules/tasks.js', () => ({
  updateTaskPositionsFromDrop: (evt) => mocks.applyDrop(evt),
  moveTaskToTopInColumn: vi.fn(),
  deleteTask: vi.fn(),
}));

const LABEL_A = { id: 'lane-a', name: 'Project A', color: '#2563eb', group: 'Projects' };
const LABEL_B = { id: 'lane-b', name: 'Project B', color: '#16a34a', group: 'Projects' };

function task(id, column, order, laneId, extra = {}) {
  return {
    id,
    title: id,
    column,
    order,
    priority: 'none',
    labels: laneId ? [laneId] : [],
    swimlaneLabelId: laneId,
    ...extra,
  };
}

function cell(laneKey, columnId) {
  return document.querySelector(`.swimlane-row[data-lane-key="${laneKey}"] .swimlane-cell[data-column="${columnId}"]`);
}

function list(laneKey, columnId) {
  return cell(laneKey, columnId).querySelector('.tasks');
}

function card(taskId) {
  return document.querySelector(`.task[data-task-id="${taskId}"]`);
}

function counter(columnId) {
  return document.querySelector(`.swimlane-column-header[data-column="${columnId}"] .task-counter`).textContent;
}

function badges(laneKey) {
  return [...document.querySelectorAll(`.swimlane-row[data-lane-key="${laneKey}"] .swimlane-row-badge`)]
    .map((el) => el.textContent);
}

async function renderBoard() {
  mountToBody(`<select id="task-column"></select><div id="board-container"></div>`);
  const render = await import('../../src/modules/render.js');
  render.renderBoard();
  return render;
}

// What Sortable and the app do on a real drop: the node is already in the target list, then
// onEnd runs. `applyState` stands in for updateTaskPositionsFromDrop: it updates the read model
// and emits one DATA_CHANGED per domain event.
async function drop(taskId, toList, applyState, { before = null } = {}) {
  const { emit, DATA_CHANGED } = await import('../../src/modules/events.js');
  const item = card(taskId);
  const from = item.parentElement;
  const sortable = mocks.sortables.find((s) => s.el === from);
  toList.insertBefore(item, before);
  mocks.applyDrop = () => {
    const steps = Array.isArray(applyState) ? applyState : [applyState];
    steps.forEach((step) => {
      mocks.tasks = step(mocks.tasks);
      emit(DATA_CHANGED);
    });
    return { movedTaskId: taskId, didChangeColumn: true, didChangeLane: true };
  };
  sortable.options.onEnd({ item, from, to: toList });
  return { item, sortable };
}

function moveTask(id, fields) {
  return (tasks) => tasks.map((t) => (t.id === id ? { ...t, ...fields } : t));
}

let removedNodes;
let observer;

function watchRemovals() {
  removedNodes = [];
  observer = new MutationObserver((records) => {
    records.forEach((r) => removedNodes.push(...r.removedNodes));
  });
  observer.observe(document.getElementById('board-container'), { childList: true, subtree: true });
}

function takeRemovals() {
  observer.takeRecords().forEach((r) => removedNodes.push(...r.removedNodes));
  return removedNodes;
}

// Independent oracle: whatever the patch produced must equal what a full rebuild of the same
// read model produces.
async function expectSameAsFullRender(render) {
  const patched = document.getElementById('board-container').innerHTML;
  render.renderBoard();
  expect(patched).toBe(document.getElementById('board-container').innerHTML);
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.columns = [
    { id: 'todo', name: 'To Do', order: 1 },
    { id: 'doing', name: 'Doing', order: 2 },
    { id: 'done', name: 'Done', order: 3, role: 'done' },
  ];
  mocks.labels = [LABEL_A, LABEL_B];
  mocks.settings = {
    swimLanesEnabled: true,
    swimLaneGroupBy: 'label',
    swimLaneLabelGroup: '',
    swimLaneCollapsedKeys: [],
    swimLaneCellCollapsedKeys: [],
    showChangeDate: true,
    showAge: false,
    locale: 'en-US',
  };
  mocks.tasks = [
    task('t1', 'todo', 1, 'lane-a'),
    task('t2', 'todo', 2, 'lane-a'),
    task('t3', 'doing', 1, 'lane-a'),
    task('t4', 'todo', 3, 'lane-b'),
  ];
  mocks.sortables.length = 0;
  refreshNotifications.mockClear();
});

afterEach(() => {
  observer?.disconnect();
  observer = null;
  vi.useRealTimers();
});

test('a cross-column drop keeps the dragged node attached and rebuilds nothing', async () => {
  const render = await renderBoard();
  const board = document.querySelector('.swimlane-board');
  const row = document.querySelector('.swimlane-row[data-lane-key="lane-a"]');
  const targetList = list('lane-a', 'doing');
  const sortableCount = mocks.sortables.length;
  watchRemovals();

  // Sortable has placed the node ahead of t3, which is where state now orders it.
  const { item } = await drop('t1', targetList, moveTask('t1', { column: 'doing', order: 0 }), {
    before: card('t3'),
  });
  observer.takeRecords();
  removedNodes = [];

  // Still inside Sortable's onEnd: the node it holds is the card on the board.
  expect(card('t1')).toBe(item);
  expect(item.parentElement).toBe(targetList);
  expect(document.querySelector('.swimlane-board')).toBe(board);
  expect(document.querySelector('.swimlane-row[data-lane-key="lane-a"]')).toBe(row);
  expect(list('lane-a', 'doing')).toBe(targetList);
  expect(mocks.sortables.length).toBe(sortableCount);
  expect(mocks.sortables.every((s) => s.destroy.mock.calls.length === 0)).toBe(true);
  expect(refreshNotifications).toHaveBeenCalled();

  expect(counter('todo')).toBe('2');
  expect(counter('doing')).toBe('2');

  vi.runAllTimers();
  expect(mocks.sortables.every((s) => s.destroy.mock.calls.length === 0)).toBe(true);
  await expectSameAsFullRender(render);
});

test('a reconcile never removes a card that is already in its right place', async () => {
  await renderBoard();
  const targetList = list('lane-a', 'doing');
  const item = card('t1');
  const sibling = card('t3');
  targetList.insertBefore(item, sibling);
  mocks.tasks = moveTask('t1', { column: 'doing', order: 0 })(mocks.tasks);
  watchRemovals();

  const { reconcileBoard } = await import('../../src/modules/render.js');
  expect(reconcileBoard()).toBe(true);

  expect(takeRemovals()).not.toContain(item);
  expect(takeRemovals()).not.toContain(sibling);
});

test('reorders the cards of a cell to match state, keeping every node', async () => {
  await renderBoard();
  const [first, second] = [card('t1'), card('t2')];
  mocks.tasks = mocks.tasks.map((t) => (t.id === 't1' ? { ...t, order: 2 } : t.id === 't2' ? { ...t, order: 1 } : t));

  const { reconcileBoard } = await import('../../src/modules/render.js');
  reconcileBoard();

  expect([...list('lane-a', 'todo').querySelectorAll('.task')]).toEqual([second, first]);
});

test('a drop into Done keeps the node attached until Sortable lets go, then hides it from the row', async () => {
  const render = await renderBoard();
  const doneList = list('lane-a', 'done');
  const sortableCount = mocks.sortables.length;
  const doneSortable = mocks.sortables.find((s) => s.el === doneList);
  watchRemovals();

  const { item } = await drop('t1', doneList, moveTask('t1', { column: 'done', order: 1, doneDate: '2026-11-04T10:00:00.000Z' }));

  // Inside onEnd: attached in the drop target, not visible, and the summaries already count it.
  expect(item.parentElement).toBe(doneList);
  expect(item.style.display).toBe('none');
  // Sortable's own insertion is a move out of the source list; the card must not leave the target.
  expect(doneList.contains(item)).toBe(true);
  expect(cell('lane-a', 'done').querySelector('.swimlane-cell-summary').textContent).toBe('1 completed item hidden');
  expect(badges('lane-a')).toEqual(['2 active', '1 done hidden']);
  expect(counter('todo')).toBe('2');
  expect(counter('done')).toBe('1');

  vi.runAllTimers();

  expect(item.isConnected).toBe(false);
  expect(doneList.querySelector('.task')).toBeNull();
  // The Done cell is still a live drop target.
  expect(doneList.isConnected).toBe(true);
  expect(doneSortable.destroy).not.toHaveBeenCalled();
  expect(mocks.sortables.length).toBe(sortableCount);
  await expectSameAsFullRender(render);
});

test('consecutive drops into Done each land, with every Done cell still a drop target', async () => {
  const render = await renderBoard();
  const doneList = list('lane-a', 'done');

  await drop('t1', doneList, moveTask('t1', { column: 'done', order: 1 }));
  vi.runAllTimers();
  await drop('t2', doneList, moveTask('t2', { column: 'done', order: 1 }));
  vi.runAllTimers();

  expect(doneList.isConnected).toBe(true);
  expect(doneList.querySelector('.task')).toBeNull();
  expect(cell('lane-a', 'done').querySelector('.swimlane-cell-summary').textContent).toBe('2 completed items hidden');
  expect(mocks.sortables.find((s) => s.el === doneList).destroy).not.toHaveBeenCalled();
  await expectSameAsFullRender(render);
});

test('a cross-lane drop refreshes the fields the lane defines on the same node', async () => {
  mocks.tasks = mocks.tasks.map((t) => (t.id === 't1' ? { ...t, changeDate: '2026-01-01T09:00:00.000Z' } : t));
  const render = await renderBoard();
  const targetList = list('lane-b', 'doing');
  const before = card('t1').querySelector('.task-change-date').textContent;

  // Two domain events, two reconciles: task.moved, then task.updated with the lane's fields.
  const { item } = await drop('t1', targetList, [
    moveTask('t1', { column: 'doing', order: 1, changeDate: '2026-11-04T10:00:00.000Z' }),
    moveTask('t1', { labels: ['lane-b'], swimlaneLabelId: 'lane-b', priority: 'high' }),
  ]);

  expect(card('t1')).toBe(item);
  expect(item.parentElement).toBe(targetList);
  expect([...item.querySelectorAll('.task-label')].map((el) => el.textContent)).toEqual(['Project B']);
  expect(item.querySelector('.task-priority').textContent).toBe('high');
  expect(item.querySelector('.task-change-date').textContent).not.toBe(before);
  expect(badges('lane-a')).toEqual(['2 active']);
  expect(badges('lane-b')).toEqual(['2 active']);

  vi.runAllTimers();
  await expectSameAsFullRender(render);
});

test('a lane that loses its last task leaves in place, and only its Sortables are destroyed, after the drop', async () => {
  const render = await renderBoard();
  const sourceRow = document.querySelector('.swimlane-row[data-lane-key="lane-b"]');
  const sourceSortables = mocks.sortables.filter((s) => sourceRow.contains(s.el));
  const otherSortables = mocks.sortables.filter((s) => !sourceRow.contains(s.el));
  const sortableCount = mocks.sortables.length;
  expect(sourceSortables.length).toBe(3);

  const { item } = await drop('t4', list('lane-a', 'doing'), [
    moveTask('t4', { column: 'doing', order: 2 }),
    moveTask('t4', { labels: ['lane-a'], swimlaneLabelId: 'lane-a' }),
  ]);

  expect(sourceRow.isConnected).toBe(false);
  expect(item.isConnected).toBe(true);
  // Sortable is still inside the source list's onEnd: destroying it now would pull the instance
  // out from under the drop that is finishing.
  expect(sourceSortables.every((s) => s.destroy.mock.calls.length === 0)).toBe(true);

  vi.runAllTimers();

  expect(sourceSortables.every((s) => s.destroy.mock.calls.length === 1)).toBe(true);
  expect(otherSortables.every((s) => s.destroy.mock.calls.length === 0)).toBe(true);
  expect(mocks.sortables.length).toBe(sortableCount);
  await expectSameAsFullRender(render);
});

test('updates a collapsed cell summary and a collapsed column summary', async () => {
  mocks.settings.swimLaneCellCollapsedKeys = ['lane-a::doing'];
  mocks.columns = mocks.columns.map((c) => (c.id === 'todo' ? { ...c, collapsed: true } : c));
  const render = await renderBoard();
  const collapsedCellList = list('lane-a', 'doing');
  expect(cell('lane-a', 'doing').querySelector('.swimlane-cell-summary').textContent).toBe('1 task');
  expect(cell('lane-a', 'todo').querySelector('.swimlane-cell-summary').textContent).toBe('2 tasks');

  const { item } = await drop('t1', collapsedCellList, moveTask('t1', { column: 'doing', order: 2 }));

  expect(cell('lane-a', 'doing').querySelector('.swimlane-cell-summary').textContent).toBe('2 tasks');
  expect(cell('lane-a', 'todo').querySelector('.swimlane-cell-summary').textContent).toBe('1 task');
  // A collapsed cell renders no cards, so the dropped one leaves once Sortable has let go.
  expect(item.isConnected).toBe(true);
  vi.runAllTimers();
  expect(item.isConnected).toBe(false);
  await expectSameAsFullRender(render);
});

test('a drop into a collapsed Done column shows the due date with no countdown', async () => {
  mocks.columns = mocks.columns.map((c) => (c.id === 'done' ? { ...c, collapsed: true } : c));
  mocks.tasks = mocks.tasks.map((t) => (t.id === 't1' ? { ...t, dueDate: '2030-01-15' } : t));
  const render = await renderBoard();
  expect(card('t1').querySelector('.task-date').textContent).toMatch(/\(/);

  const { item } = await drop('t1', list('lane-a', 'done'), moveTask('t1', { column: 'done', order: 1 }));

  expect(card('t1')).toBe(item);
  expect(item.querySelector('.task-date').textContent).not.toMatch(/\(/);
  expect(item.querySelector('.task-date').classList.contains('countdown-none')).toBe(true);
  vi.runAllTimers();
  await expectSameAsFullRender(render);
});

test('updates the WIP state and counter of a column header', async () => {
  mocks.columns = mocks.columns.map((c) => (c.id === 'doing' ? { ...c, wipLimit: 1 } : c));
  const render = await renderBoard();
  const header = document.querySelector('.swimlane-column-header[data-column="doing"]');
  expect(header.dataset.wip).toBe('at');

  await drop('t1', list('lane-a', 'doing'), moveTask('t1', { column: 'doing', order: 2 }));

  expect(document.querySelector('.swimlane-column-header[data-column="doing"]')).toBe(header);
  expect(header.dataset.wip).toBe('over');
  expect(header.querySelector('.task-counter').textContent).toBe('2/1');
  // The over-limit pulse is transient and a rebuild does not play it.
  header.querySelector('.task-counter').classList.remove('wip-pulse');
  vi.runAllTimers();
  await expectSameAsFullRender(render);
});

test('counts and shows the same tasks as a full render under a board filter', async () => {
  const render = await renderBoard();
  render.setBoardFilterQuery('t1');
  try {
    render.renderBoard();
    expect(card('t2')).toBeNull();
    expect(counter('todo')).toBe('1');

    const { item } = await drop('t1', list('lane-a', 'doing'), moveTask('t1', { column: 'doing', order: 1 }));

    expect(card('t1')).toBe(item);
    expect(counter('todo')).toBe('0');
    expect(counter('doing')).toBe('1');
    expect(card('t2')).toBeNull();
    vi.runAllTimers();
    await expectSameAsFullRender(render);
  } finally {
    render.setBoardFilterQuery('');
  }
});

test('a lane the board does not have yet defers to a full rebuild, changing nothing', async () => {
  const render = await renderBoard();
  const before = document.getElementById('board-container').innerHTML;
  mocks.labels = [...mocks.labels, { id: 'lane-c', name: 'Project C', color: '#000000', group: 'Projects' }];
  mocks.tasks = [...mocks.tasks, task('t5', 'todo', 9, 'lane-c')];

  expect(render.reconcileBoard()).toBe(false);
  expect(document.getElementById('board-container').innerHTML).toBe(before);
});

test('a changed column set defers to a full rebuild', async () => {
  const render = await renderBoard();
  mocks.columns = [...mocks.columns, { id: 'review', name: 'Review', order: 4 }];

  expect(render.reconcileBoard()).toBe(false);
});

test('a changed lane grouping defers to a full rebuild', async () => {
  const render = await renderBoard();
  mocks.settings = { ...mocks.settings, swimLaneGroupBy: 'priority' };

  expect(render.reconcileBoard()).toBe(false);
});

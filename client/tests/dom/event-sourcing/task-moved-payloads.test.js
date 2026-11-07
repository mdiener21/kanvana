import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import { DONE_COLUMN_ID, DONE_COLUMN_ROLE } from '../../../src/modules/constants.js';
import {
  createBoard,
  initStorage,
  loadTasks,
  saveColumns,
  saveSettings,
  saveTasks,
  _flushPersistsForTesting,
  _resetStorageForTesting
} from '../../../src/modules/storage.js';
import {
  addTask,
  moveTaskToTopInColumn,
  sortColumnTasks,
  updateTask,
  updateTaskPositionsFromDrop
} from '../../../src/modules/tasks.js';

const DB_NAME = 'kanvana-db';

const COLUMNS = [
  { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
  { id: 'doing', name: 'Doing', color: '#f59e0b', order: 2 },
  { id: 'parked', name: 'Parked', color: '#505050', order: 3 }
];

function task(id, column, order, extra = {}) {
  return { id, title: id, description: '', priority: 'none', dueDate: '', column, order, labels: [], relationships: [], subTasks: [], columnHistory: [], ...extra };
}

beforeEach(async () => {
  _resetStorageForTesting();
  await deleteDB(DB_NAME);
  await initStorage();
  createBoard('Moves');
  saveColumns(COLUMNS.map((column) => ({ ...column })));
  saveTasks([task('a', 'todo', 1), task('b', 'todo', 2), task('c', 'doing', 1)]);
  await _flushPersistsForTesting();
  document.body.innerHTML = '';
});

async function seedColumns(idsByColumn) {
  saveTasks(Object.entries(idsByColumn).flatMap(([column, ids]) => ids.map((id, index) => task(id, column, index + 1))));
  await _flushPersistsForTesting();
}

function listOf(ids) {
  return `<ul class="tasks">${ids.map((id) => `<li class="task" data-task-id="${id}"></li>`).join('')}</ul>`;
}

function renderBoard(idsByColumn) {
  document.body.innerHTML = `<main id="board-container" data-view-mode="columns">${
    Object.entries(idsByColumn).map(([column, ids]) => `<article class="task-column" data-column="${column}">${listOf(ids)}</article>`).join('')
  }</main>`;
}

function renderSwimlanes(cellsByLane) {
  document.body.innerHTML = `<main id="board-container" data-view-mode="swimlanes">${
    Object.entries(cellsByLane).map(([lane, cells]) => `<div class="swimlane-row">${
      Object.entries(cells).map(([column, ids]) => `<section class="swimlane-cell" data-column="${column}" data-lane-key="${lane}">${listOf(ids)}</section>`).join('')
    }</div>`).join('')
  }</main>`;
}

// What Sortable hands onEnd: the card is already in its new list.
function dropCard(id, fromColumn) {
  const item = document.querySelector(`.task[data-task-id="${id}"]`);
  const to = item.closest('.tasks');
  const from = to.closest('[data-column]').dataset.column === fromColumn
    ? to
    : document.querySelector(`[data-column="${fromColumn}"] .tasks`);
  updateTaskPositionsFromDrop({ item, from, to });
}

const entryIds = (event) => event.payload.order.map((entry) => entry.id).sort();
const idsByOrder = (event) => [...event.payload.order].sort((left, right) => left.order - right.order).map((entry) => entry.id);
const orders = (event) => event.payload.order.map((entry) => entry.order).sort((left, right) => left - right);

async function movedEvents(action) {
  const events = [];
  const handler = (customEvent) => events.push(customEvent.detail);
  on(EVENT_EMITTED, handler);
  action();
  await _flushPersistsForTesting();
  off(EVENT_EMITTED, handler);
  return events
    .filter((event) => event.type === 'task.moved')
    .map(({ entity_id, payload }) => ({ entity_id, payload }));
}

test('addTask emits the renumbered column with the new task first', async () => {
  const events = await movedEvents(() => addTask('new', '', 'none', '', 'todo'));
  const newId = loadTasks().find((t) => t.title === 'new').id;

  expect(events).toEqual([{
    entity_id: newId,
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'a', column: 'todo', order: 2 },
        { id: 'b', column: 'todo', order: 3 },
        { id: newId, column: 'todo', order: 1 }
      ]
    }
  }]);
});

test('updateTask to another column emits both columns and leaves an unrelated one out', async () => {
  await seedColumns({ todo: ['a', 'b'], doing: ['c'], parked: ['p1', 'p2'] });

  const [event] = await movedEvents(() => updateTask('a', 'a', '', 'none', '', 'doing', []));

  expect(event.payload).toMatchObject({ from_column: 'todo', to_column: 'doing' });
  expect(entryIds(event)).toEqual(['a', 'b', 'c']);
});

test('updateTask to another column puts the task on top there, with no colliding order', async () => {
  await seedColumns({ todo: ['a', 'b'], doing: ['c', 'd'] });

  const [event] = await movedEvents(() => updateTask('b', 'b', '', 'none', '', 'doing', []));

  const entry = (id) => event.payload.order.find((item) => item.id === id);
  expect(entry('b')).toEqual({ id: 'b', column: 'doing', order: 1 });
  expect(entry('c')).toEqual({ id: 'c', column: 'doing', order: 2 });
  expect(entry('d')).toEqual({ id: 'd', column: 'doing', order: 3 });
  expect(entry('a')).toEqual({ id: 'a', column: 'todo', order: 1 });
  expect(loadTasks().filter((t) => t.column === 'doing').sort((x, y) => x.order - y.order).map((t) => t.id)).toEqual(['b', 'c', 'd']);
});

test('moveTaskToTopInColumn emits only that column, complete', async () => {
  const events = await movedEvents(() => moveTaskToTopInColumn('b', 'todo'));

  expect(events).toEqual([{
    entity_id: 'b',
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'a', column: 'todo', order: 2 },
        { id: 'b', column: 'todo', order: 1 }
      ]
    }
  }]);
});

describe('a drop', () => {
  test('to another column emits both columns, complete, and no unrelated column', async () => {
    await seedColumns({ todo: ['a', 'b'], doing: ['c'], parked: ['p1', 'p2'] });
    renderBoard({ todo: ['a'], doing: ['b', 'c'], parked: ['p1', 'p2'] });

    const events = await movedEvents(() => dropCard('b', 'todo'));

    expect(events).toEqual([{
      entity_id: 'b',
      payload: {
        from_column: 'todo',
        to_column: 'doing',
        order: [
          { id: 'a', column: 'todo', order: 1 },
          { id: 'b', column: 'doing', order: 1 },
          { id: 'c', column: 'doing', order: 2 }
        ]
      }
    }]);
  });

  test('within a column emits that one column, complete', async () => {
    await seedColumns({ todo: ['a', 'b', 'd'], doing: ['c'] });
    renderBoard({ todo: ['d', 'a', 'b'], doing: ['c'] });

    const events = await movedEvents(() => dropCard('d', 'todo'));

    expect(events).toEqual([{
      entity_id: 'd',
      payload: {
        from_column: 'todo',
        to_column: 'todo',
        order: [
          { id: 'a', column: 'todo', order: 2 },
          { id: 'b', column: 'todo', order: 3 },
          { id: 'd', column: 'todo', order: 1 }
        ]
      }
    }]);
  });

  test('reads only the affected task lists from the DOM', async () => {
    await seedColumns({ todo: ['a', 'b'], doing: ['c'], parked: ['p1', 'p2'] });
    renderBoard({ todo: ['a'], doing: ['b', 'c'], parked: ['p1', 'p2'] });
    const parked = document.querySelector('.task-column[data-column="parked"]');
    const read = vi.spyOn(Element.prototype, 'querySelectorAll');

    await movedEvents(() => dropCard('b', 'todo'));

    const scanned = read.mock.contexts.filter((element) => parked.contains(element));
    read.mockRestore();
    expect(scanned).toEqual([]);
  });

  test('in swimlanes reads only the affected columns, lane by lane', async () => {
    await seedColumns({ todo: ['a', 'b', 'd'], doing: ['c'], parked: ['p1'] });
    renderSwimlanes({
      laneOne: { todo: ['b'], doing: ['c'], parked: ['p1'] },
      laneTwo: { todo: ['a'], doing: ['d'], parked: [] }
    });
    const parkedCells = [...document.querySelectorAll('.swimlane-cell[data-column="parked"]')];
    const read = vi.spyOn(Element.prototype, 'querySelectorAll');

    const [event] = await movedEvents(() => dropCard('d', 'todo'));

    const scanned = read.mock.contexts.filter((element) => parkedCells.some((cell) => cell.contains(element)));
    read.mockRestore();
    expect(scanned).toEqual([]);
    expect(event.payload.order).toEqual([
      { id: 'a', column: 'todo', order: 2 },
      { id: 'b', column: 'todo', order: 1 },
      { id: 'd', column: 'doing', order: 2 },
      { id: 'c', column: 'doing', order: 1 }
    ]);
  });

  // The DOM holds no card for these: Done past its "Show more" cut-off, Done in swimlanes,
  // and anything a filter or a collapsed lane leaves out.
  test('keeps cards not on screen after the card they followed, with no colliding order', async () => {
    await seedColumns({ todo: ['a', 'hiddenA', 'b', 'hiddenB', 'c'], doing: ['d'] });
    renderBoard({ todo: ['c', 'a', 'b'], doing: ['d'] });

    const [event] = await movedEvents(() => dropCard('c', 'todo'));

    expect(idsByOrder(event)).toEqual(['c', 'a', 'hiddenA', 'b', 'hiddenB']);
    expect(orders(event)).toEqual([1, 2, 3, 4, 5]);
  });

  test('keeps a card not on screen first in its column when it was first', async () => {
    await seedColumns({ todo: ['hidden', 'a', 'b'], doing: ['d'] });
    renderBoard({ todo: ['b', 'a'], doing: ['d'] });

    const [event] = await movedEvents(() => dropCard('a', 'todo'));

    expect(idsByOrder(event)).toEqual(['hidden', 'b', 'a']);
  });

  test('keeps cards that followed the dragged card in the column it left', async () => {
    await seedColumns({ todo: ['a', 'b', 'hidden'], doing: ['d'] });
    renderBoard({ todo: ['a'], doing: ['b', 'd'] });

    const [event] = await movedEvents(() => dropCard('b', 'todo'));

    expect(event.payload.order).toEqual([
      { id: 'a', column: 'todo', order: 1 },
      { id: 'b', column: 'doing', order: 1 },
      { id: 'hidden', column: 'todo', order: 2 },
      { id: 'd', column: 'doing', order: 2 }
    ]);
  });

  test('into a column showing none of its cards goes first', async () => {
    await seedColumns({ todo: ['a', 'b'], doing: ['hidden1', 'hidden2'] });
    renderBoard({ todo: ['a'], doing: ['b'] });

    const [event] = await movedEvents(() => dropCard('b', 'todo'));

    expect(event.payload.order).toEqual([
      { id: 'a', column: 'todo', order: 1 },
      { id: 'b', column: 'doing', order: 1 },
      { id: 'hidden1', column: 'doing', order: 2 },
      { id: 'hidden2', column: 'doing', order: 3 }
    ]);
  });

  test('into Done pins the card above the Done cards past the cut-off', async () => {
    saveColumns([...COLUMNS, { id: DONE_COLUMN_ID, name: 'Done', color: '#16a34a', order: 4, role: DONE_COLUMN_ROLE }]);
    await seedColumns({ todo: ['a'], [DONE_COLUMN_ID]: ['shown', 'past1', 'past2'] });
    renderBoard({ todo: [], [DONE_COLUMN_ID]: ['shown', 'a'] });

    const [event] = await movedEvents(() => dropCard('a', 'todo'));

    expect(idsByOrder(event)).toEqual(['a', 'shown', 'past1', 'past2']);
    expect(orders(event)).toEqual([1, 2, 3, 4]);
    const moved = loadTasks().find((candidate) => candidate.id === 'a');
    expect(moved.doneDate).toBeTruthy();
    expect(moved.columnHistory.at(-1).column).toBe(DONE_COLUMN_ID);
  });

  test('in swimlanes still applies the destination lane to the moved card', async () => {
    saveSettings({ swimLanesEnabled: true, swimLaneGroupBy: 'priority' });
    await seedColumns({ todo: ['a'], doing: ['c'], parked: ['p1'] });
    renderSwimlanes({ high: { todo: [], doing: ['a', 'c'], parked: ['p1'] } });

    const [event] = await movedEvents(() => dropCard('a', 'todo'));

    expect(entryIds(event)).toEqual(['a', 'c']);
    const moved = loadTasks().find((candidate) => candidate.id === 'a');
    expect(moved).toMatchObject({ column: 'doing', priority: 'high', order: 1 });
    expect(moved.columnHistory.at(-1).column).toBe('doing');
  });
});

test('sortColumnTasks emits the sorted column with the column id as entity id', async () => {
  saveTasks([task('a', 'todo', 1), task('b', 'todo', 2, { priority: 'urgent' }), task('c', 'doing', 1)]);
  await _flushPersistsForTesting();

  const events = await movedEvents(() => sortColumnTasks('todo', 'priority'));

  expect(events).toEqual([{
    entity_id: 'todo',
    payload: {
      from_column: 'todo',
      to_column: 'todo',
      order: [
        { id: 'b', column: 'todo', order: 1 },
        { id: 'a', column: 'todo', order: 2 }
      ]
    }
  }]);
});

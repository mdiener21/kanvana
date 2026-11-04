// #142 against real storage, projector, render.js and the app's own markup: one synchronous user
// mutation projects each event at once, redraws once and stores each changed slice once.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import appMarkup from '../../../src/index.html?raw';
import { DATA_CHANGED, DRAG_RECONCILE_END, EVENT_EMITTED, EVENTS_STORED, on, off } from '../../../src/modules/events.js';
import {
  createBoard,
  getActiveBoardId,
  initStorage,
  loadSettings,
  loadTasks,
  saveColumns,
  saveSettings,
  saveTasks,
  _flushPersistsForTesting,
  _resetStorageForTesting
} from '../../../src/modules/storage.js';
import { commitTogether, flushDomainEvents, scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';
import { applyRemoteEvent } from '../../../src/modules/event-sourcing/realtime.js';
import { EVENTS_STORE, READ_MODEL_STORE, openStore } from '../../../src/modules/idb-store.js';
import { addTask, updateTask } from '../../../src/modules/tasks.js';
import { initializeTaskModalHandlers, showEditModal } from '../../../src/modules/task-modal.js';
import { renderBoard } from '../../../src/modules/render.js';

const sortables = vi.hoisted(() => []);
vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable(el, options) {
    this.el = el;
    this.options = options;
    this.destroy = vi.fn();
    sortables.push(this);
  }),
}));
vi.mock('../../../src/modules/icons.js', () => ({ renderIcons: vi.fn() }));

const FULL_RENDER_MARK = 'kanvana:board-render:full';
const RECONCILE_RENDER_MARK = 'kanvana:board-render:reconcile';

const COLUMNS = [
  { id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 },
  { id: 'doing', name: 'Doing', color: '#f59e0b', order: 2 }
];
const SUB_TASK = { id: 'sub-1', title: 'First step', completed: false, order: 1 };
const LINK = { type: 'prerequisite', targetTaskId: 'other' };

const SEEDED_AT = '2026-01-15T12:00:00.000Z';

function task(id, column, order) {
  return {
    id,
    title: id,
    description: '',
    priority: 'none',
    dueDate: '',
    column,
    order,
    labels: [],
    relationships: [],
    subTasks: [],
    creationDate: SEEDED_AT,
    changeDate: SEEDED_AT,
    columnHistory: [{ column, at: SEEDED_AT }]
  };
}

const stored = (id) => loadTasks().find((item) => item.id === id);
const editEverything = () => updateTask('a', 'Renamed', '', 'none', '', 'doing', ['label-1'], [LINK], [SUB_TASK]);

let dataChanged;
let emitted;
let puts;
let spy;
let realPut;
const countChange = () => { dataChanged += 1; };
const noteEvent = ({ detail }) => { emitted.push(detail); };

function seedTask(item) {
  return scheduleDomainEvent({ type: 'task.created', boardId: getActiveBoardId(), entityId: item.id, payload: { task: item } });
}

beforeEach(async () => {
  document.documentElement.innerHTML = appMarkup.replace(/<script[\s\S]*?<\/script>/g, '');
  _resetStorageForTesting();
  await deleteDB('kanvana-db');
  await initStorage();
  createBoard('Scope');
  saveColumns(COLUMNS.map((column) => ({ ...column })));
  saveTasks([]);
  [task('a', 'todo', 1), task('other', 'todo', 2), task('b', 'doing', 1)].forEach(seedTask);
  await flushDomainEvents();
  await _flushPersistsForTesting();

  dataChanged = 0;
  emitted = [];
  puts = [];
  on(DATA_CHANGED, countChange);
  on(EVENT_EMITTED, noteEvent);
  realPut = IDBObjectStore.prototype.put;
  spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
    if (this.name === READ_MODEL_STORE || (this.name === 'kv' && key !== 'kanvana:hlc:state')) puts.push(String(key));
    return realPut.call(this, value, key);
  });
});

afterEach(() => {
  off(DATA_CHANGED, countChange);
  off(EVENT_EMITTED, noteEvent);
  spy.mockRestore();
});

describe('a task edit that emits several events', () => {
  test('every event is projected in order before the caller gets control back', () => {
    editEverything();

    expect(emitted.map((event) => event.type)).toEqual(['task.updated', 'task.moved', 'label.added_to_task', 'relationship.added', 'relationship.added', 'subtask.added']);
    const hlcs = emitted.map((event) => [event.hlc.wallTime, event.hlc.counter]);
    expect(hlcs).toEqual([...hlcs].sort((x, y) => x[0] - y[0] || x[1] - y[1]));
    expect(stored('a')).toMatchObject({ title: 'Renamed', column: 'doing', labels: ['label-1'], relationships: [LINK] });
    expect(stored('a').subTasks.map((subtask) => subtask.id)).toEqual(['sub-1']);
    expect(stored('other').relationships).toEqual([{ type: 'dependent', targetTaskId: 'a' }]);
  });

  test('is one board commit, signalled before the caller gets control back', () => {
    editEverything();
    expect(dataChanged).toBe(1);
  });

  test('writes each changed slice once, holding the final projection', async () => {
    editEverything();
    await flushDomainEvents();
    await _flushPersistsForTesting();

    const boardId = getActiveBoardId();
    expect(puts.sort()).toEqual([`${boardId}:appliedEventIds`, `${boardId}:tasks`, 'kanvana:ingest:newestAppliedHlc'].sort());
    const db = await openStore();
    const tasks = await db.get(READ_MODEL_STORE, `${boardId}:tasks`);
    expect(tasks.find((item) => item.id === 'a')).toMatchObject({ title: 'Renamed', column: 'doing', labels: ['label-1'], relationships: [LINK] });
    for (const { id } of emitted) expect(await db.get(EVENTS_STORE, id)).toBeTruthy();
  });

  test('is one notice to other tabs, naming every event once it is stored', async () => {
    const notices = [];
    const noteStored = ({ detail }) => notices.push(detail);
    on(EVENTS_STORED, noteStored);
    editEverything();
    expect(notices).toEqual([]);
    await flushDomainEvents();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    off(EVENTS_STORED, noteStored);

    expect(notices[0]).toEqual({ ids: emitted.map((event) => event.id), local: true });
    const db = await openStore();
    for (const { id } of emitted) expect(await db.get(EVENTS_STORE, id)).toBeTruthy();
  });

  test('a new task placed above others is one commit too', () => {
    addTask('New', '', 'none', '', 'todo');
    expect(emitted.map((event) => event.type)).toEqual(['task.created', 'task.moved']);
    expect(dataChanged).toBe(1);
  });
});

describe('the task form', () => {
  test('saving labels, a relationship, a sub-task and a column move renders the board once', async () => {
    globalThis.__kanvanaPerfMarks = true;
    performance.clearMarks(FULL_RENDER_MARK);
    try {
      initializeTaskModalHandlers(() => {});
      renderBoard();
      showEditModal('a');

      document.getElementById('task-title').value = 'Renamed';
      document.getElementById('task-column').value = 'doing';
      document.getElementById('task-subtask-input').value = 'First step';
      document.getElementById('task-subtask-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const search = document.getElementById('task-relationship-search');
      search.value = 'other';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.relationship-result-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      performance.clearMarks(FULL_RENDER_MARK);
      document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      expect(emitted.map((event) => event.type)).toEqual(expect.arrayContaining(['task.updated', 'task.moved', 'relationship.added', 'subtask.added']));
      expect(dataChanged).toBe(1);
      expect(performance.getEntriesByName(FULL_RENDER_MARK)).toHaveLength(1);
      const card = document.querySelector('.task-column[data-column="doing"] .task[data-task-id="a"]');
      expect(card?.textContent).toContain('Renamed');
    } finally {
      delete globalThis.__kanvanaPerfMarks;
    }
  });
});

describe('failure inside a commit', () => {
  test('changes to different slices stay separate writes, each with its final value', async () => {
    commitTogether(() => {
      updateTask('a', 'Renamed', '', 'none', '', 'todo');
      scheduleDomainEvent({ type: 'label.created', boardId: getActiveBoardId(), entityId: 'label-9', payload: { label: { name: 'Nine', color: '#123456' } } });
      updateTask('a', 'Renamed twice', '', 'none', '', 'todo');
    });
    await flushDomainEvents();
    await _flushPersistsForTesting();

    const boardId = getActiveBoardId();
    expect(puts.filter((key) => key === `${boardId}:tasks`)).toHaveLength(1);
    expect(puts.filter((key) => key === `${boardId}:labels`)).toHaveLength(1);
    expect(dataChanged).toBe(1);
    const db = await openStore();
    expect((await db.get(READ_MODEL_STORE, `${boardId}:tasks`)).find((item) => item.id === 'a').title).toBe('Renamed twice');
    expect((await db.get(READ_MODEL_STORE, `${boardId}:labels`)).map((label) => label.id)).toContain('label-9');
  });

  test('a mutation that throws part-way still shows and stores what it projected', async () => {
    const boom = new Error('boom');
    expect(() => commitTogether(() => {
      updateTask('a', 'Renamed', '', 'none', '', 'todo');
      throw boom;
    })).toThrow(boom);
    expect(dataChanged).toBe(1);
    await flushDomainEvents();
    await _flushPersistsForTesting();

    const db = await openStore();
    expect((await db.get(READ_MODEL_STORE, `${getActiveBoardId()}:tasks`)).find((item) => item.id === 'a').title).toBe('Renamed');
    expect(emitted).toHaveLength(1);
    expect(await db.get(EVENTS_STORE, emitted[0].id)).toBeTruthy();
    // The scope closed: the next edit stands alone.
    updateTask('a', 'Again', '', 'none', '', 'todo');
    expect(dataChanged).toBe(2);
  });

  test('a write that fails stores nothing of the commit, the screen keeps the edit, and later edits still store', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boardId = getActiveBoardId();
    const db = await openStore();
    const before = await db.get(READ_MODEL_STORE, `${boardId}:tasks`);
    let failing = true;
    spy.mockImplementation(function (value, key) {
      if (failing && key === `${boardId}:tasks`) throw new DOMException('Too large', 'DataCloneError');
      return realPut.call(this, value, key);
    });

    editEverything();
    expect(stored('a').title).toBe('Renamed');
    await flushDomainEvents();
    await _flushPersistsForTesting();
    failing = false;

    // Land together or not at all (#256): neither the events nor another slice of that batch.
    expect(await db.get(READ_MODEL_STORE, `${boardId}:tasks`)).toEqual(before);
    for (const { id } of emitted) expect(await db.get(EVENTS_STORE, id)).toBeUndefined();
    expect(stored('a').title).toBe('Renamed');
    expect(logged).toHaveBeenCalled();

    updateTask('a', 'Renamed again', '', 'none', '', 'doing', ['label-1'], [LINK], [SUB_TASK]);
    await flushDomainEvents();
    await _flushPersistsForTesting();
    expect((await db.get(READ_MODEL_STORE, `${boardId}:tasks`)).find((item) => item.id === 'a').title).toBe('Renamed again');
    expect(await db.get(EVENTS_STORE, emitted.at(-1).id)).toBeTruthy();

    logged.mockRestore();
  });
});

describe('a drop', () => {
  const drop = (id, to) => {
    const item = document.querySelector(`.task[data-task-id="${id}"]`);
    const from = item.parentElement;
    const sortable = sortables.findLast((candidate) => candidate.el === from);
    to.appendChild(item);
    sortable.options.onEnd({ item, from, to });
    return item;
  };

  async function expectOneReconcileInsideTheWindow(trigger) {
    const order = [];
    const noteChange = () => order.push('changed');
    const noteEnd = () => order.push('window closed');
    on(DATA_CHANGED, noteChange);
    on(DRAG_RECONCILE_END, noteEnd);
    performance.clearMarks(FULL_RENDER_MARK);
    performance.clearMarks(RECONCILE_RENDER_MARK);
    const item = trigger();
    expect(order).toEqual(['changed', 'window closed']);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    off(DATA_CHANGED, noteChange);
    off(DRAG_RECONCILE_END, noteEnd);
    expect(performance.getEntriesByName(RECONCILE_RENDER_MARK)).toHaveLength(1);
    expect(performance.getEntriesByName(FULL_RENDER_MARK)).toHaveLength(0);
    expect(item.isConnected).toBe(true);
  }

  beforeEach(() => {
    globalThis.__kanvanaPerfMarks = true;
    sortables.length = 0;
  });
  afterEach(() => { delete globalThis.__kanvanaPerfMarks; });

  test('on a standard board reconciles once, inside its window', async () => {
    renderBoard();
    const to = document.querySelector('.task-column[data-column="doing"] .tasks');
    await expectOneReconcileInsideTheWindow(() => drop('a', to));
    expect(stored('a').column).toBe('doing');
  });

  test('into a collapsed column is one reconcile for its two moves', async () => {
    saveColumns(COLUMNS.map((column) => ({ ...column, collapsed: column.id === 'doing' })));
    renderBoard();
    const to = document.querySelector('.task-column[data-column="doing"] .tasks');
    await expectOneReconcileInsideTheWindow(() => drop('a', to));
    expect(emitted.map((event) => event.type)).toEqual(['task.moved', 'task.moved']);
    expect(stored('a')).toMatchObject({ column: 'doing', order: 1 });
  });

  test('across swimlanes reconciles once for its move and its field change', async () => {
    saveSettings({ ...loadSettings(), swimLanesEnabled: true, swimLaneGroupBy: 'priority' });
    for (const [id, priority] of [['a', 'high'], ['other', 'high'], ['b', 'low']]) {
      scheduleDomainEvent({ type: 'task.updated', boardId: getActiveBoardId(), entityId: id, payload: { fields: { priority } } });
    }
    await flushDomainEvents();
    await _flushPersistsForTesting();
    emitted.length = 0;
    renderBoard();
    const to = document.querySelector('.swimlane-cell[data-column="doing"][data-lane-key="low"] .tasks');
    await expectOneReconcileInsideTheWindow(() => drop('a', to));
    expect(emitted.map((event) => event.type)).toEqual(['task.moved', 'task.updated']);
    expect(stored('a')).toMatchObject({ column: 'doing', priority: 'low' });
  });
});

describe('a burst of remote events', () => {
  let clock;
  const edit = (index, title, wallTime = (clock += 1)) => ({
    local_id: `remote-${index}`,
    event_type: 'task.updated',
    hlc: { wallTime, counter: 0, nodeId: 'other-device' },
    at: new Date(wallTime).toISOString(),
    actor_type: 'human',
    scope: 'board',
    board: getActiveBoardId(),
    entity_id: 'a',
    payload: { fields: { title } },
  });

  beforeEach(() => { clock = Date.now() + 1_000; });

  test('does not redraw for each event and ends on the newest edit', async () => {
    const edits = ['one', 'two', 'three', 'four', 'five'].map((title, index) => edit(index, title));
    await Promise.all(edits.map((record) => applyRemoteEvent(record)));

    expect(dataChanged).toBeLessThanOrEqual(2);
    expect(stored('a').title).toBe('five');
    const db = await openStore();
    for (const { local_id: id } of edits) expect(await db.get(EVENTS_STORE, id)).toMatchObject({ synced: true });
  });

  test('applies by HLC whatever order it arrives in', async () => {
    const newest = edit(0, 'newest', clock + 50);
    const older = edit(1, 'older', clock + 10);
    const oldest = edit(2, 'oldest', clock + 5);
    await Promise.all([newest, older, oldest].map((record) => applyRemoteEvent(record)));
    await flushDomainEvents();
    await vi.waitFor(() => expect(stored('a').title).toBe('newest'));
  });

  test('an event that repeats in the burst applies once', async () => {
    const record = edit(0, 'repeated');
    await Promise.all([edit(1, 'newest', clock + 50), record, record].map((item) => applyRemoteEvent(item)));
    await vi.waitFor(() => expect(stored('a').title).toBe('newest'));
    const db = await openStore();
    expect((await db.getAll(EVENTS_STORE)).filter((event) => event.id === 'remote-0')).toHaveLength(1);
  });
});

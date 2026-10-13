// #179: the live projection converges to the HLC-ordered result whatever order
// events arrive in. The oracle is the pure reducer over the sorted events.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  loadTasksForBoard,
  loadColumnsForBoard,
  loadGlobalSettings,
  loadTimeTracking,
  saveTasks,
  setActiveBoardId
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';
import { _setJitterForTesting } from '../../../src/modules/event-sourcing/snapshot.js';
import { DATA_CHANGED, off, on } from '../../../src/modules/events.js';

// Ids must be UUIDs: initStorage() remaps non-UUID ids on load.
const TASK_ID = '7a5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
let boardId;
let doneColumn;
let todoColumn;

const ingestRemote = (event) => ingestEvent(event, { origin: EVENT_ORIGIN.REMOTE });

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

function boardEvent(type, { id, wallTime, nodeId = 'node-r', entityId = TASK_ID, payload = {} }) {
  return {
    id,
    type,
    hlc: { wallTime, counter: 0, nodeId },
    at: '2026-10-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: boardId,
    entity_id: entityId,
    payload
  };
}

beforeEach(async () => {
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
  boardId = createBoard('Ordering').id;
  [todoColumn, doneColumn] = [loadColumnsForBoard(boardId)[0].id, loadColumnsForBoard(boardId).at(-1).id];
  await _flushPersistsForTesting();
});

describe('board scope', () => {
  function boardEvents() {
    const base = Date.now() + 1_000;
    return [
      boardEvent('task.created', { id: 'e-create', wallTime: base, payload: { task: { title: 'T0', column: todoColumn, priority: 'low' } } }),
      boardEvent('task.updated', { id: 'e-title-a', wallTime: base + 1, nodeId: 'node-a', payload: { fields: { title: 'A' } } }),
      boardEvent('task.updated', { id: 'e-title-b', wallTime: base + 2, nodeId: 'node-b', payload: { fields: { title: 'B', priority: 'high' } } }),
      boardEvent('task.moved', { id: 'e-move', wallTime: base + 3, payload: { order: [{ id: TASK_ID, column: doneColumn, order: 0 }] } })
    ];
  }

  test.each(permutations([0, 1, 2, 3]).map((order) => [order.join('')]))('arrival order %s converges to the HLC-ordered view', async (order) => {
    const events = boardEvents();
    for (const i of order) await ingestRemote(events[Number(i)]);

    const expected = applyEvents(createProjectionState(), events).tasks[0];
    const task = loadTasksForBoard(boardId).find((t) => t.id === TASK_ID);
    expect(task).toMatchObject({ title: expected.title, priority: expected.priority, column: expected.column });
  });
});

describe('rebuild', () => {
  // Import and column sort write the read model without an event yet (the rest
  // of ADR-0005, a follow-up); a rebuild must not erase what they wrote.
  test('keeps a task that no event knows of, such as an imported one', async () => {
    const imported = { id: '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', title: 'Imported', column: todoColumn };
    setActiveBoardId(boardId);
    saveTasks([...loadTasksForBoard(boardId), imported]);
    const base = Date.now() + 1_000;
    await ingestRemote(boardEvent('task.created', { id: 'e-create', wallTime: base, payload: { task: { title: 'T0', column: todoColumn } } }));
    await ingestRemote(boardEvent('task.updated', { id: 'e-2', wallTime: base + 2, payload: { fields: { title: 'T2' } } }));
    await ingestRemote(boardEvent('task.updated', { id: 'e-1', wallTime: base + 1, payload: { fields: { title: 'T1' } } }));

    const titles = loadTasksForBoard(boardId).map((t) => t.title);
    expect(titles).toContain('Imported');
    expect(titles).toContain('T2');
  });
});

describe('in-order ingest stays incremental', () => {
  // Counts every bulk read of the events store, through the store or an index.
  function spyOnEventStoreReads() {
    const storeName = (target) => (target.objectStore ? target.objectStore.name : target.name);
    const spies = [IDBObjectStore.prototype, IDBIndex.prototype].flatMap((proto) => (
      ['getAll', 'getAllKeys', 'openCursor', 'openKeyCursor'].map((method) => vi.spyOn(proto, method))
    ));
    return () => spies.flatMap((spy) => spy.mock.contexts).filter((target) => storeName(target) === 'events').length;
  }

  function rebuilds() {
    const seen = [];
    const handler = (e) => { if (e.detail?.rebuilt) seen.push(e.detail.rebuilt); };
    on(DATA_CHANGED, handler);
    return { seen, stop: () => off(DATA_CHANGED, handler) };
  }

  beforeEach(() => {
    _setJitterForTesting(() => 60_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a stream of newer events never reads the event store in bulk and never rebuilds', async () => {
    const base = Date.now() + 1_000;
    await ingestRemote(boardEvent('task.created', { id: 'e-0', wallTime: base, payload: { task: { title: 'T0', column: todoColumn } } }));
    const scans = spyOnEventStoreReads();
    const watch = rebuilds();

    for (let i = 1; i <= 50; i++) {
      await ingestRemote(boardEvent('task.updated', { id: `e-${i}`, wallTime: base + i, payload: { fields: { title: `T${i}` } } }));
    }
    watch.stop();

    expect(loadTasksForBoard(boardId).find((t) => t.id === TASK_ID).title).toBe('T50');
    expect(scans()).toBe(0);
    expect(watch.seen).toEqual([]);
  });

  test('a late event is the one that reads the store and rebuilds', async () => {
    const base = Date.now() + 1_000;
    await ingestRemote(boardEvent('task.created', { id: 'e-0', wallTime: base, payload: { task: { title: 'T0', column: todoColumn } } }));
    await ingestRemote(boardEvent('task.updated', { id: 'e-2', wallTime: base + 2, payload: { fields: { title: 'T2' } } }));
    const scans = spyOnEventStoreReads();
    const watch = rebuilds();

    await ingestRemote(boardEvent('task.updated', { id: 'e-1', wallTime: base + 1, payload: { fields: { title: 'T1' } } }));
    watch.stop();

    expect(loadTasksForBoard(boardId).find((t) => t.id === TASK_ID).title).toBe('T2');
    expect(scans()).toBe(1);
    expect(watch.seen).toEqual([boardId]);
  });
});

// ADR-0005: a local edit and a remote event on the same field converge to the
// HLC-ordered result through the projector. Each context is a fresh storage
// lifecycle (one device); device A makes edit L and receives R, device B makes
// R and receives L, so each sees the two in the opposite order.
describe('two-context race on one field (ADR-0005)', () => {
  const SHARED_BOARD = '0b6f3a1e-2c4d-4e5f-8a9b-1c2d3e4f5a6b';

  async function freshDevice() {
    await _flushPersistsForTesting();
    _resetStorageForTesting();
    await deleteDB('kanvana-db');
    await initStorage();
    boardId = SHARED_BOARD;
    const base = Date.now();
    await ingestRemote(boardEvent('board.created', { id: 'e-board', wallTime: base, entityId: SHARED_BOARD, payload: { board: { name: 'Shared' } } }));
    await ingestRemote(boardEvent('column.created', { id: 'e-col', wallTime: base + 1, entityId: 'todo-col', payload: { column: { name: 'To Do' } } }));
    await ingestRemote(boardEvent('task.created', { id: 'e-task', wallTime: base + 2, payload: { task: { title: 'Start', column: 'todo-col' } } }));
  }

  async function deviceSees(first, second) {
    await freshDevice();
    await ingestEvent(first.event, { origin: first.origin });
    await ingestEvent(second.event, { origin: second.origin });
    await _flushPersistsForTesting();
    return loadTasksForBoard(SHARED_BOARD).find((t) => t.id === TASK_ID).title;
  }

  test.each([
    ['the remote edit is newer', 20, 10],
    ['the local edit is newer', 10, 20]
  ])('%s: both devices end with the HLC winner', async (_label, remoteOffset, localOffset) => {
    const base = Date.now() + 1_000;
    boardId = SHARED_BOARD;
    const local = boardEvent('task.updated', { id: 'e-local', wallTime: base + localOffset, nodeId: 'node-a', payload: { fields: { title: 'Local' } } });
    const remote = boardEvent('task.updated', { id: 'e-remote', wallTime: base + remoteOffset, nodeId: 'node-b', payload: { fields: { title: 'Remote' } } });
    const winner = remoteOffset > localOffset ? 'Remote' : 'Local';

    const deviceA = await deviceSees({ event: local, origin: EVENT_ORIGIN.LOCAL }, { event: remote, origin: EVENT_ORIGIN.REMOTE });
    const deviceB = await deviceSees({ event: remote, origin: EVENT_ORIGIN.LOCAL }, { event: local, origin: EVENT_ORIGIN.REMOTE });

    expect(deviceA).toBe(winner);
    expect(deviceB).toBe(winner);
  });
});

function boardlessEvent(scope, type, { id, wallTime, entityId, payload = {} }) {
  return {
    id,
    type,
    hlc: { wallTime, counter: 0, nodeId: 'node-r' },
    at: '2026-10-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope,
    board_id: null,
    entity_id: entityId,
    payload
  };
}

describe('global scope', () => {
  function globalEvents() {
    const base = Date.now() + 1_000;
    const set = (id, offset, timeTracking) => boardlessEvent('global', 'settings.updated', {
      id, wallTime: base + offset, entityId: 'global', payload: { fields: { timeTracking } }
    });
    return [set('g1', 0, { rounding: 5 }), set('g2', 1, { rounding: 15 }), set('g3', 2, { rounding: 30, week: 'mon' })];
  }

  test.each(permutations([0, 1, 2]).map((order) => [order.join('')]))('arrival order %s converges to the HLC-ordered view', async (order) => {
    const events = globalEvents();
    for (const i of order) await ingestRemote(events[Number(i)]);

    const expected = applyEvents(createProjectionState(), events).globalSettings;
    expect(loadGlobalSettings().timeTracking).toEqual(expected.timeTracking);
  });
});

describe('time-tracking scope', () => {
  const CUSTOMER_ID = '3f2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d';

  function timeTrackingEvents() {
    const base = Date.now() + 1_000;
    const customer = (type, id, offset, payload) => boardlessEvent('timetracking', type, {
      id, wallTime: base + offset, entityId: CUSTOMER_ID, payload
    });
    return [
      customer('customer.created', 'c-create', 0, { customer: { name: 'Acme', color: '#3b82f6' } }),
      customer('customer.archived', 'c-archive', 1),
      customer('customer.unarchived', 'c-unarchive', 2),
      customer('customer.archived', 'c-archive-again', 3)
    ];
  }

  test.each(permutations([0, 1, 2, 3]).map((order) => [order.join('')]))('arrival order %s converges to the HLC-ordered view', async (order) => {
    const events = timeTrackingEvents();
    for (const i of order) await ingestRemote(events[Number(i)]);

    const expected = applyEvents(createProjectionState(), events).timeTracking;
    expect(loadTimeTracking()).toEqual(expected);
  });
});

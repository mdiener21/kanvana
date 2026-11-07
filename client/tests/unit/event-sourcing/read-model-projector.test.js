import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { DATA_CHANGED, emit, EVENT_EMITTED, off, on } from '../../../src/modules/events.js';
import { createReadModel, ingestEvent, ingestRemoteBatch } from '../../../src/modules/event-sourcing/ingest.js';
import { GLOBAL_SNAPSHOT_KEY, TIMETRACKING_SNAPSHOT_KEY } from '../../../src/modules/event-sourcing/snapshot.js';
import {
  KV_STORE, READ_MODEL_STORE, keyFor, openStore, readModelKeyFor, schedulePersist, scheduleReadModelPersist, _flushPersistsForTesting
} from '../../../src/modules/idb-store.js';

const BOARD_ID = 'board-a';
const BOARDS_KEY = 'kanbanBoards';
const GLOBAL_SETTINGS_KEY = 'kanvana:settings:global';
const TIME_TRACKING_KEY = 'kanvana:timetracking';
const NEWEST_APPLIED_KEY = 'kanvana:ingest:newestAppliedHlc';
const SETTINGS_KEY = `kanbanBoard:${BOARD_ID}:settings`;

function boardEvent(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    type: overrides.type || 'task.updated',
    hlc: overrides.hlc || { wallTime: 1000, counter: 0, nodeId: 'node-a' },
    at: '2026-05-26T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: BOARD_ID,
    entity_id: overrides.entity_id || 'task-a',
    payload: overrides.payload || { fields: { title: 'After' } }
  };
}

const STORED_BOARD = {
  tasks: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }],
  columns: [{ id: 'todo', name: 'To Do' }],
  labels: [],
  settings: {}
};

// A board as IndexedDB holds it; a slice set to undefined was never stored.
async function storeBoard(slices = {}) {
  const board = { ...STORED_BOARD, ...slices };
  const db = await openStore();
  await db.put(KV_STORE, [{ id: BOARD_ID, name: 'A', createdAt: '2026-01-01T00:00:00.000Z' }], BOARDS_KEY);
  for (const slice of ['tasks', 'columns', 'labels']) {
    const key = readModelKeyFor(BOARD_ID, slice);
    await (board[slice] === undefined ? db.delete(READ_MODEL_STORE, key) : db.put(READ_MODEL_STORE, board[slice], key));
  }
  const settingsKey = keyFor(BOARD_ID, 'settings');
  await (board.settings === undefined ? db.delete(KV_STORE, settingsKey) : db.put(KV_STORE, board.settings, settingsKey));
}

// The real Read Model on fake-indexeddb; only its schedulers are watched, and they still write.
async function loadReadModel(slices) {
  await storeBoard(slices);
  const ctx = {
    schedulePersist: vi.fn(schedulePersist),
    scheduleReadModelPersist: vi.fn(scheduleReadModelPersist),
    checkAndScheduleSnapshot: vi.fn(),
    boardsKey: BOARDS_KEY,
    globalSettingsKey: GLOBAL_SETTINGS_KEY,
    timeTrackingKey: TIME_TRACKING_KEY,
    newestAppliedKey: NEWEST_APPLIED_KEY
  };
  const readModel = createReadModel(ctx);
  await readModel.load();
  readModel.startProjecting();
  return { ctx, readModel };
}

async function storedAppliedIds(key) {
  await _flushPersistsForTesting();
  return (await openStore()).get(READ_MODEL_STORE, readModelKeyFor(key, 'appliedEventIds'));
}

function ingest(event) {
  return ingestEvent(event, { origin: 'local' });
}

// Every write the projector asked for, by the slice it stores: one entry per call.
function persistCalls(h) {
  const kvSlice = { [BOARDS_KEY]: 'boards', [SETTINGS_KEY]: 'settings', [NEWEST_APPLIED_KEY]: 'newestApplied' };
  return [
    ...h.ctx.scheduleReadModelPersist.mock.calls.map(([, kind]) => kind),
    ...h.ctx.schedulePersist.mock.calls.map(([key]) => kvSlice[key] ?? key)
  ].sort();
}

function clearPersistCalls(h) {
  h.ctx.scheduleReadModelPersist.mockClear();
  h.ctx.schedulePersist.mockClear();
}

async function countDataChanged(run) {
  let count = 0;
  const handler = () => { count += 1; };
  on(DATA_CHANGED, handler);
  try {
    await run();
  } finally {
    off(DATA_CHANGED, handler);
  }
  return count;
}

const MEMORY = ['appliedEventIds', 'newestApplied'];

describe('createReadModel', () => {
  let h;
  // A test needing another stored board starts the Read Model again on it.
  async function reloadWith(slices) {
    h.readModel.reset();
    await _flushPersistsForTesting();
    h = await loadReadModel(slices);
  }

  beforeEach(async () => {
    resetLocalStorage();
    await deleteDB('kanvana-db');
    h = await loadReadModel();
  });
  afterEach(async () => {
    h.readModel.reset();
    await _flushPersistsForTesting();
  });

  test('loads its own state from IndexedDB', () => {
    expect(h.readModel.boards()).toEqual([{ id: BOARD_ID, name: 'A', createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(h.readModel.board(BOARD_ID)).toEqual(STORED_BOARD);
  });

  test('a board slice never stored reads as null', async () => {
    await reloadWith({ labels: undefined, settings: undefined });

    expect(h.readModel.board(BOARD_ID)).toMatchObject({ labels: null, settings: null });
  });

  test('an ingested board event projects into state and schedules read-model persist', () => {
    ingest(boardEvent());

    const { tasks } = h.readModel.board(BOARD_ID);
    expect(tasks[0].title).toBe('After');
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'tasks', tasks, expect.any(Function));
    expect(h.readModel.cachedTasks(BOARD_ID)).toBe(tasks);
  });

  test('an event emitted on the bus without ingest is not projected', () => {
    emit(EVENT_EMITTED, boardEvent());
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();
  });

  test('ingest is idempotent by event id (dedup) and announces DATA_CHANGED once', () => {
    const seen = [];
    const handler = (e) => seen.push(e.detail.event.id);
    on(DATA_CHANGED, handler);
    const ev = boardEvent({ id: 'event-dup' });
    ingest(ev);
    ingest(ev);
    off(DATA_CHANGED, handler);

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2); // tasks/appliedEventIds, once
    expect(seen).toEqual(['event-dup']);
  });

  test('global-scope event projects globalSettings and persists the global key only', () => {
    ingest({
      id: 'g1',
      type: 'settings.updated',
      hlc: { wallTime: 1, counter: 0, nodeId: 'n' },
      at: '2026-05-26T00:00:00.000Z',
      actor: { type: 'human', id: null },
      scope: 'global',
      board_id: null,
      entity_id: 'global',
      payload: { fields: { theme: 'dark' } }
    });

    expect(h.ctx.schedulePersist).toHaveBeenCalledWith(GLOBAL_SETTINGS_KEY, expect.objectContaining({ theme: 'dark' }));
    // Only the global view's applied ids, written with it, so a gap stays detectable.
    expect(h.ctx.scheduleReadModelPersist.mock.calls).toEqual([[GLOBAL_SNAPSHOT_KEY, 'appliedEventIds', ['g1']]]);
  });

  test('timetracking-scope event is never routed into a board projection and lands in the time-tracking slot', () => {
    const boardsBefore = h.readModel.boards();
    const tasksBefore = h.readModel.board(BOARD_ID).tasks;
    // Even a stray board_id must not pull a timetracking event into that board.
    ingest({
      id: 't1',
      type: 'customer.created',
      hlc: { wallTime: 5, counter: 0, nodeId: 'n' },
      at: '2026-05-26T00:00:00.000Z',
      actor: { type: 'human', id: null },
      scope: 'timetracking',
      board_id: BOARD_ID,
      entity_id: 'x',
      payload: { customer: { name: 'Acme' } }
    });

    expect(h.readModel.boards()).toBe(boardsBefore);
    expect(h.readModel.board(BOARD_ID).tasks).toBe(tasksBefore);
    expect(h.readModel.board(BOARD_ID).settings).toEqual({});
    expect(h.readModel.globalSettings()).toEqual({});
    expect(h.readModel.timeTracking().customers).toEqual([{ id: 'x', name: 'Acme' }]);
    expect(h.ctx.scheduleReadModelPersist.mock.calls).toEqual([[TIMETRACKING_SNAPSHOT_KEY, 'appliedEventIds', ['t1']]]);
    expect(h.ctx.schedulePersist).toHaveBeenCalledWith(TIME_TRACKING_KEY, h.readModel.timeTracking());
    expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledWith(TIMETRACKING_SNAPSHOT_KEY, { fold: expect.any(Function), onSaved: expect.any(Function) });
  });

  test('startProjecting() is idempotent — a single ingest projects once', () => {
    h.readModel.startProjecting();
    ingest(boardEvent({ id: 'once' }));

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);
  });

  test('reset() stops projecting ingested events; applied ids are stored, so a reloaded Read Model skips them', async () => {
    const ev = boardEvent({ id: 'seen' });
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);

    h.readModel.reset();
    ingest(boardEvent({ id: 'after-reset' }));
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);

    // The board's applied ids are durable state, so a Read Model loaded again still skips the seen id.
    expect(await storedAppliedIds(BOARD_ID)).toEqual(['seen']);
    await reloadWith();
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();
  });

  describe('persists only the slices an event changed', () => {
    test.each([
      ['task.created', 'task-new', { task: { title: 'New', column: 'todo' } }, ['tasks']],
      ['task.updated', 'task-a', { fields: { title: 'After' } }, ['tasks']],
      ['task.moved', 'task-a', { order: [{ id: 'task-a', column: 'todo', order: 3 }] }, ['tasks']],
      ['task.deleted', 'task-a', {}, ['taskTombstones', 'tasks']],
      ['subtask.added', 'task-a', { subtask: { id: 's', title: 'S' } }, ['tasks']],
      ['label.added_to_task', 'task-a', { label_id: 'l' }, ['tasks']],
      ['column.created', 'col-new', { column: { name: 'New' } }, ['columns']],
      ['column.updated', 'todo', { fields: { name: 'Next' } }, ['columns']],
      ['column.deleted', 'todo', {}, ['columns']],
      ['column.reordered', 'todo', { order: [{ id: 'todo', order: 4 }] }, ['columns']],
      ['label.created', 'label-new', { label: { name: 'New' } }, ['labels']],
      ['settings.updated', BOARD_ID, { fields: { showAge: true } }, ['settings']],
      ['board.updated', BOARD_ID, { fields: { name: 'B' } }, ['boards']],
      ['board.created', 'board-new', { board: { name: 'New' } }, ['boards']]
    ])('%s on %s writes its own slice and the event memory', (type, entityId, payload, slices) => {
      ingest(boardEvent({ type, entity_id: entityId, payload }));

      expect(persistCalls(h)).toEqual([...slices, ...MEMORY].sort());
    });

    test('a label event writes the labels only', async () => {
      await reloadWith({ labels: [{ id: 'label-a', name: 'A' }] });
      ingest(boardEvent({ type: 'label.updated', entity_id: 'label-a', payload: { fields: { name: 'B' } } }));
      expect(persistCalls(h)).toEqual(['labels', ...MEMORY].sort());

      clearPersistCalls(h);
      ingest(boardEvent({ type: 'label.deleted', entity_id: 'label-a', payload: {}, hlc: { wallTime: 2000, counter: 0, nodeId: 'node-a' } }));
      expect(persistCalls(h)).toEqual(['labels', ...MEMORY].sort());
    });

    test('the slices an event leaves alone keep their references', () => {
      const { columns, labels, settings } = h.readModel.board(BOARD_ID);
      const before = { boards: h.readModel.boards(), columns, labels, settings };

      ingest(boardEvent());

      const after = h.readModel.board(BOARD_ID);
      expect(h.readModel.boards()).toBe(before.boards);
      expect(after.columns).toBe(before.columns);
      expect(after.labels).toBe(before.labels);
      expect(after.settings).toBe(before.settings);
    });

    test('a slice the board has never stored is written, so a reload does not bring defaults back', async () => {
      await reloadWith({ labels: undefined });

      ingest(boardEvent());

      expect(persistCalls(h)).toEqual(['labels', 'tasks', ...MEMORY].sort());
    });

    test('a local event is fully projected in memory before ingest returns', () => {
      ingest(boardEvent({ type: 'task.moved', payload: { order: [{ id: 'task-a', column: 'done', order: 9 }] } }));

      const { tasks } = h.readModel.board(BOARD_ID);
      expect(tasks[0]).toMatchObject({ column: 'done', order: 9 });
      expect(h.readModel.cachedTasks(BOARD_ID)).toBe(tasks);
    });

    test('a remote event takes the same selective path as a local one', async () => {
      await ingestEvent(boardEvent(), { origin: 'remote' });

      expect(h.readModel.board(BOARD_ID).tasks[0].title).toBe('After');
      expect(persistCalls(h)).toEqual(['tasks', ...MEMORY].sort());
    });

    test('a catch-up batch writes each changed slice once, however many events it holds', async () => {
      const changed = await countDataChanged(() => ingestRemoteBatch([1, 2, 3].map((n) => ({
        event: boardEvent({ id: `e-${n}`, hlc: { wallTime: 1000 + n, counter: 0, nodeId: 'node-a' }, payload: { fields: { title: `T${n}` } } })
      }))));

      expect(h.readModel.board(BOARD_ID).tasks[0].title).toBe('T3');
      expect(persistCalls(h)).toEqual(['tasks', ...MEMORY].sort());
      expect(changed).toBe(1);
    });

    test('a catch-up batch covering two kinds of slice writes both', async () => {
      await ingestRemoteBatch([
        { event: boardEvent({ id: 'mixed-1', hlc: { wallTime: 1001, counter: 0, nodeId: 'node-a' } }) },
        { event: boardEvent({ id: 'mixed-2', hlc: { wallTime: 1002, counter: 0, nodeId: 'node-a' }, type: 'column.updated', entity_id: 'todo', payload: { fields: { name: 'Next' } } }) }
      ]);

      expect(persistCalls(h)).toEqual(['columns', 'tasks', ...MEMORY].sort());
    });

    test('a catch-up batch touching several boards saves each once and schedules one snapshot check per board, at its end', async () => {
      const at = (n) => ({ wallTime: 1000 + n, counter: 0, nodeId: 'node-a' });
      const otherBoard = (n, overrides) => ({ ...boardEvent({ hlc: at(n), ...overrides }), board_id: 'board-b' });
      await ingestRemoteBatch([
        { event: boardEvent({ id: 'a-1', hlc: at(1), payload: { fields: { title: 'A1' } } }) },
        { event: otherBoard(2, { id: 'b-1', type: 'board.created', entity_id: 'board-b', payload: { board: { name: 'B' } } }) },
        { event: otherBoard(3, { id: 'b-2', type: 'task.created', entity_id: 'task-b', payload: { task: { title: 'B1', column: 'todo' } } }) },
        { event: boardEvent({ id: 'a-2', hlc: at(4), payload: { fields: { title: 'A2' } } }) },
        { event: otherBoard(5, { id: 'b-3', type: 'task.updated', entity_id: 'task-b', payload: { fields: { title: 'B2' } } }) }
      ]);

      const writesFor = (boardId) => h.ctx.scheduleReadModelPersist.mock.calls.filter(([key]) => key === boardId).map(([, slice]) => slice).sort();
      expect(writesFor(BOARD_ID)).toEqual(['appliedEventIds', 'tasks']);
      expect(writesFor('board-b')).toEqual(['appliedEventIds', 'columns', 'labels', 'tasks']);
      expect(h.ctx.checkAndScheduleSnapshot.mock.calls.map(([key]) => key).sort()).toEqual([BOARD_ID, 'board-b']);
      expect(h.readModel.board('board-b').tasks.map((task) => task.title)).toEqual(['B2']);
    });
  });

  describe('a reducer no-op', () => {
    const duplicateCreate = (overrides = {}) => boardEvent({
      type: 'task.created',
      entity_id: 'task-a',
      payload: { task: { title: 'Other', column: 'todo' } },
      ...overrides
    });

    test('writes only the applied-event memory and emits no DATA_CHANGED', async () => {
      const tasksBefore = h.readModel.board(BOARD_ID).tasks;

      const changed = await countDataChanged(() => ingest(duplicateCreate({ id: 'dup' })));

      expect(changed).toBe(0);
      expect(persistCalls(h)).toEqual(MEMORY);
      expect(h.readModel.board(BOARD_ID).tasks).toBe(tasksBefore);
      expect(await storedAppliedIds(BOARD_ID)).toEqual(['dup']);
    });

    test('is remembered, so its next delivery writes nothing', () => {
      ingest(duplicateCreate({ id: 'dup' }));
      clearPersistCalls(h);

      ingest(duplicateCreate({ id: 'dup' }));

      expect(persistCalls(h)).toEqual([]);
    });

    test.each([
      ['task.updated', 'task-absent', { fields: { title: 'X' } }],
      ['task.moved', 'task-absent', { order: [{ id: 'task-absent', column: 'todo', order: 1 }] }],
      ['column.updated', 'col-absent', { fields: { name: 'X' } }],
      ['label.deleted', 'label-absent', {}],
      ['board.updated', 'board-absent', { fields: { name: 'X' } }]
    ])('%s for an entity this board lacks changes nothing', async (type, entityId, payload) => {
      const changed = await countDataChanged(() => ingest(boardEvent({ type, entity_id: entityId, payload })));

      expect(changed).toBe(0);
      expect(persistCalls(h)).toEqual(MEMORY);
    });

    test('adding a label or relationship a task already has changes nothing', async () => {
      await reloadWith({ tasks: [{ id: 'task-a', labels: ['l'], relationships: [{ targetTaskId: 't', type: 'blocks' }] }] });

      const changed = await countDataChanged(() => {
        ingest(boardEvent({ type: 'label.added_to_task', payload: { label_id: 'l' } }));
        ingest(boardEvent({ type: 'relationship.added', payload: { relationship: { targetTaskId: 't', type: 'blocks' } } }));
      });

      expect(changed).toBe(0);
    });

    test('a catch-up batch of nothing but no-ops writes the memory and emits no DATA_CHANGED', async () => {
      const changed = await countDataChanged(() => ingestRemoteBatch([
        { event: duplicateCreate({ id: 'dup-1', hlc: { wallTime: 1001, counter: 0, nodeId: 'node-a' } }) },
        { event: duplicateCreate({ id: 'dup-2', hlc: { wallTime: 1002, counter: 0, nodeId: 'node-a' } }) }
      ]));

      expect(changed).toBe(0);
      expect(persistCalls(h)).toEqual(MEMORY);
      expect(await storedAppliedIds(BOARD_ID)).toEqual(['dup-1', 'dup-2']);
    });

    test('a board-less no-op writes nothing but its applied id and newest HLC and still counts towards the next snapshot', async () => {
      const customer = (id, wallTime) => ({
        id,
        type: 'customer.created',
        hlc: { wallTime, counter: 0, nodeId: 'n' },
        at: '2026-05-26T00:00:00.000Z',
        actor: { type: 'human', id: null },
        scope: 'timetracking',
        board_id: null,
        entity_id: 'c1',
        payload: { customer: { name: 'Acme' } }
      });
      ingest(customer('c-a', 5));
      clearPersistCalls(h);
      h.ctx.checkAndScheduleSnapshot.mockClear();

      const changed = await countDataChanged(() => ingest(customer('c-b', 6)));

      expect(changed).toBe(0);
      expect(persistCalls(h)).toEqual(['appliedEventIds', 'newestApplied']);
      expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledTimes(1);
    });

    test('still asks for a snapshot, since the stored event counts towards the next one', () => {
      ingest(duplicateCreate());

      expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  describe('board settings written without an event (#279)', () => {
    test('writeBoardSettings sets the board settings and stores them', async () => {
      h.readModel.writeBoardSettings(BOARD_ID, { swimLanesEnabled: true });

      expect(h.readModel.board(BOARD_ID).settings).toEqual({ swimLanesEnabled: true });
      expect(persistCalls(h)).toEqual(['settings']);
      await _flushPersistsForTesting();
      expect(await (await openStore()).get(KV_STORE, SETTINGS_KEY)).toEqual({ swimLanesEnabled: true });
    });

    test('refreshBoardSettings takes settings another tab stored and stores nothing itself', async () => {
      await (await openStore()).put(KV_STORE, { showPriority: false }, SETTINGS_KEY);

      expect(await h.readModel.refreshBoardSettings(BOARD_ID)).toBe(true);

      expect(h.readModel.board(BOARD_ID).settings).toEqual({ showPriority: false });
      expect(persistCalls(h)).toEqual([]);
    });

    test('refreshBoardSettings keeps the current settings when none are stored', async () => {
      await (await openStore()).delete(KV_STORE, SETTINGS_KEY);

      expect(await h.readModel.refreshBoardSettings(BOARD_ID)).toBe(false);

      expect(h.readModel.board(BOARD_ID).settings).toEqual({});
    });
  });
});

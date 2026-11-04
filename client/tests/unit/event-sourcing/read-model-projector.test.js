import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createReadModelProjector } from '../../../src/modules/event-sourcing/read-model-projector.js';
import { DATA_CHANGED, emit, EVENT_EMITTED, off, on } from '../../../src/modules/events.js';
import { ingestEvent, ingestRemoteBatch } from '../../../src/modules/event-sourcing/ingest.js';
import { TIMETRACKING_SNAPSHOT_KEY } from '../../../src/modules/event-sourcing/snapshot.js';

const BOARD_ID = 'board-a';
const BOARDS_KEY = 'kanbanBoards';
const GLOBAL_SETTINGS_KEY = 'kanvana:settings:global';
const TIME_TRACKING_KEY = 'kanvana:timetracking';
const NEWEST_APPLIED_KEY = 'kanvana:ingest:newestAppliedHlc';
const SETTINGS_KEY = `kanbanBoard:${BOARD_ID}:settings`;

function safeParseArray(value) {
  return Array.isArray(value) ? value : null;
}
function safeParseObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

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

function makeHarness() {
  const state = {
    boards: [{ id: BOARD_ID, name: 'A', createdAt: '2026-01-01T00:00:00.000Z' }],
    activeBoardId: BOARD_ID,
    tasks: { [BOARD_ID]: [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }] },
    columns: { [BOARD_ID]: [{ id: 'todo', name: 'To Do' }] },
    labels: { [BOARD_ID]: [] },
    settings: { [BOARD_ID]: {} },
    taskTombstones: {},
    appliedEventIds: {},
    snapshotAppliedIds: {},
    newestAppliedHlc: {},
    globalSettings: null,
    timeTracking: null
  };
  const ctx = {
    state,
    taskCacheByBoard: new Map(),
    loadGlobalSettings: vi.fn(() => ({ theme: 'light' })),
    safeParseArray,
    safeParseObject,
    schedulePersist: vi.fn(),
    scheduleReadModelPersist: vi.fn(),
    checkAndScheduleSnapshot: vi.fn(),
    boardsKey: BOARDS_KEY,
    globalSettingsKey: GLOBAL_SETTINGS_KEY,
    timeTrackingKey: TIME_TRACKING_KEY,
    newestAppliedKey: NEWEST_APPLIED_KEY
  };
  return { state, ctx, projector: createReadModelProjector(ctx) };
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

describe('createReadModelProjector', () => {
  let h;
  beforeEach(() => {
    h = makeHarness();
    h.projector.register();
  });
  afterEach(() => {
    h.projector.reset();
  });

  test('an ingested board event projects into state and schedules read-model persist', () => {
    ingest(boardEvent());

    expect(h.state.tasks[BOARD_ID][0].title).toBe('After');
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'tasks', h.state.tasks[BOARD_ID], expect.any(Function));
    expect(h.ctx.taskCacheByBoard.get(BOARD_ID)).toBe(h.state.tasks[BOARD_ID]);
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

    expect(h.ctx.schedulePersist).toHaveBeenCalledWith(GLOBAL_SETTINGS_KEY, h.state.globalSettings);
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();
  });

  test('timetracking-scope event is never routed into a board projection and lands in the time-tracking slot', () => {
    const boardsBefore = h.state.boards;
    const tasksBefore = h.state.tasks[BOARD_ID];
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

    expect(h.state.boards).toBe(boardsBefore);
    expect(h.state.tasks[BOARD_ID]).toBe(tasksBefore);
    expect(h.state.settings[BOARD_ID]).toEqual({});
    expect(h.state.globalSettings).toBeNull();
    expect(h.state.timeTracking.customers).toEqual([{ id: 'x', name: 'Acme' }]);
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();
    expect(h.ctx.schedulePersist).toHaveBeenCalledWith(TIME_TRACKING_KEY, h.state.timeTracking);
    expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledWith(TIMETRACKING_SNAPSHOT_KEY, { fold: expect.any(Function) });
  });

  test('register() is idempotent — a single ingest projects once', () => {
    h.projector.register();
    ingest(boardEvent({ id: 'once' }));

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);
  });

  test('reset() disconnects the projector from ingest; applied ids live in state, not the projector', () => {
    const ev = boardEvent({ id: 'seen' });
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);

    h.projector.reset();
    ingest(boardEvent({ id: 'after-reset' }));
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);

    // The board's applied ids are durable state, so a reconnected projector still skips the seen id.
    h.projector.register();
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(2);
    expect(h.state.appliedEventIds[BOARD_ID]).toEqual(['seen']);
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

    test('a label event writes the labels only', () => {
      h.state.labels[BOARD_ID] = [{ id: 'label-a', name: 'A' }];
      ingest(boardEvent({ type: 'label.updated', entity_id: 'label-a', payload: { fields: { name: 'B' } } }));
      expect(persistCalls(h)).toEqual(['labels', ...MEMORY].sort());

      clearPersistCalls(h);
      ingest(boardEvent({ type: 'label.deleted', entity_id: 'label-a', payload: {}, hlc: { wallTime: 2000, counter: 0, nodeId: 'node-a' } }));
      expect(persistCalls(h)).toEqual(['labels', ...MEMORY].sort());
    });

    test('the slices an event leaves alone keep their references', () => {
      const before = { boards: h.state.boards, columns: h.state.columns[BOARD_ID], labels: h.state.labels[BOARD_ID], settings: h.state.settings[BOARD_ID] };

      ingest(boardEvent());

      expect(h.state.boards).toBe(before.boards);
      expect(h.state.columns[BOARD_ID]).toBe(before.columns);
      expect(h.state.labels[BOARD_ID]).toBe(before.labels);
      expect(h.state.settings[BOARD_ID]).toBe(before.settings);
    });

    test('a slice the board has never stored is written, so a reload does not bring defaults back', () => {
      delete h.state.labels[BOARD_ID];

      ingest(boardEvent());

      expect(persistCalls(h)).toEqual(['labels', 'tasks', ...MEMORY].sort());
    });

    test('a local event is fully projected in memory before ingest returns', () => {
      ingest(boardEvent({ type: 'task.moved', payload: { order: [{ id: 'task-a', column: 'done', order: 9 }] } }));

      expect(h.state.tasks[BOARD_ID][0]).toMatchObject({ column: 'done', order: 9 });
      expect(h.ctx.taskCacheByBoard.get(BOARD_ID)).toBe(h.state.tasks[BOARD_ID]);
    });

    test('a remote event takes the same selective path as a local one', async () => {
      await ingestEvent(boardEvent(), { origin: 'remote' });

      expect(h.state.tasks[BOARD_ID][0].title).toBe('After');
      expect(persistCalls(h)).toEqual(['tasks', ...MEMORY].sort());
    });

    test('a catch-up batch writes each changed slice once, however many events it holds', async () => {
      const changed = await countDataChanged(() => ingestRemoteBatch([1, 2, 3].map((n) => ({
        event: boardEvent({ id: `e-${n}`, hlc: { wallTime: 1000 + n, counter: 0, nodeId: 'node-a' }, payload: { fields: { title: `T${n}` } } })
      }))));

      expect(h.state.tasks[BOARD_ID][0].title).toBe('T3');
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
  });

  describe('a reducer no-op', () => {
    const duplicateCreate = (overrides = {}) => boardEvent({
      type: 'task.created',
      entity_id: 'task-a',
      payload: { task: { title: 'Other', column: 'todo' } },
      ...overrides
    });

    test('writes only the applied-event memory and emits no DATA_CHANGED', async () => {
      const tasksBefore = h.state.tasks[BOARD_ID];

      const changed = await countDataChanged(() => ingest(duplicateCreate({ id: 'dup' })));

      expect(changed).toBe(0);
      expect(persistCalls(h)).toEqual(MEMORY);
      expect(h.state.tasks[BOARD_ID]).toBe(tasksBefore);
      expect(h.state.appliedEventIds[BOARD_ID]).toEqual(['dup']);
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
      h.state.tasks[BOARD_ID] = [{ id: 'task-a', labels: ['l'], relationships: [{ targetTaskId: 't', type: 'blocks' }] }];

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
      expect(h.state.appliedEventIds[BOARD_ID]).toEqual(['dup-1', 'dup-2']);
    });

    test('a board-less no-op writes nothing but its newest HLC and still counts towards the next snapshot', async () => {
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
      expect(persistCalls(h)).toEqual(['newestApplied']);
      expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledTimes(1);
    });

    test('still asks for a snapshot, since the stored event counts towards the next one', () => {
      ingest(duplicateCreate());

      expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});

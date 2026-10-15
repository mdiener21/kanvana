import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createReadModelProjector } from '../../../src/modules/event-sourcing/read-model-projector.js';
import { DATA_CHANGED, emit, EVENT_EMITTED, off, on } from '../../../src/modules/events.js';
import { ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';
import { TIMETRACKING_SNAPSHOT_KEY } from '../../../src/modules/event-sourcing/snapshot.js';

const BOARD_ID = 'board-a';
const BOARDS_KEY = 'kanbanBoards';
const GLOBAL_SETTINGS_KEY = 'kanvana:settings:global';
const TIME_TRACKING_KEY = 'kanvana:timetracking';

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
    timeTrackingKey: TIME_TRACKING_KEY
  };
  return { state, ctx, projector: createReadModelProjector(ctx) };
}

function ingest(event) {
  return ingestEvent(event, { origin: 'local' });
}

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
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'tasks', h.state.tasks[BOARD_ID]);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'columns', h.state.columns[BOARD_ID]);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'labels', h.state.labels[BOARD_ID]);
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

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(5); // tasks/columns/labels/taskTombstones/appliedEventIds, once
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
      type: 'settings.updated',
      hlc: { wallTime: 5, counter: 0, nodeId: 'n' },
      at: '2026-05-26T00:00:00.000Z',
      actor: { type: 'human', id: null },
      scope: 'timetracking',
      board_id: BOARD_ID,
      entity_id: 'x',
      payload: { fields: { showDoneTasks: true } }
    });

    expect(h.state.boards).toBe(boardsBefore);
    expect(h.state.tasks[BOARD_ID]).toBe(tasksBefore);
    expect(h.state.settings[BOARD_ID]).toEqual({});
    expect(h.state.globalSettings).toBeNull();
    expect(h.state.timeTracking).toEqual({ customers: [], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } });
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();
    expect(h.ctx.schedulePersist).toHaveBeenCalledWith(TIME_TRACKING_KEY, h.state.timeTracking);
    expect(h.ctx.checkAndScheduleSnapshot).toHaveBeenCalledWith(TIMETRACKING_SNAPSHOT_KEY, { fold: expect.any(Function) });
  });

  test('register() is idempotent — a single ingest projects once', () => {
    h.projector.register();
    ingest(boardEvent({ id: 'once' }));

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(5);
  });

  test('reset() disconnects the projector from ingest; applied ids live in state, not the projector', () => {
    const ev = boardEvent({ id: 'seen' });
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(5);

    h.projector.reset();
    ingest(boardEvent({ id: 'after-reset' }));
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(5);

    // The board's applied ids are durable state, so a reconnected projector still skips the seen id.
    h.projector.register();
    ingest(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(5);
    expect(h.state.appliedEventIds[BOARD_ID]).toEqual(['seen']);
  });
});

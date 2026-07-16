import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createReadModelProjector } from '../../../src/modules/event-sourcing/read-model-projector.js';
import { emit, EVENT_EMITTED } from '../../../src/modules/events.js';

const BOARD_ID = 'board-a';
const BOARDS_KEY = 'kanbanBoards';
const GLOBAL_SETTINGS_KEY = 'kanvana:settings:global';

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
    globalSettings: null
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
    globalSettingsKey: GLOBAL_SETTINGS_KEY
  };
  return { state, ctx, projector: createReadModelProjector(ctx) };
}

describe('createReadModelProjector', () => {
  let h;
  beforeEach(() => {
    h = makeHarness();
  });

  test('register() subscribes so an emitted board event projects into state and schedules read-model persist', () => {
    h.projector.register();
    emit(EVENT_EMITTED, boardEvent());

    expect(h.state.tasks[BOARD_ID][0].title).toBe('After');
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'tasks', h.state.tasks[BOARD_ID]);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'columns', h.state.columns[BOARD_ID]);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledWith(BOARD_ID, 'labels', h.state.labels[BOARD_ID]);
    expect(h.ctx.taskCacheByBoard.get(BOARD_ID)).toBe(h.state.tasks[BOARD_ID]);

    h.projector.reset();
  });

  test('project() is idempotent by event id (dedup)', () => {
    const ev = boardEvent({ id: 'event-dup' });
    h.projector.project(ev);
    h.projector.project(ev);

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(3); // tasks/columns/labels, once
  });

  test('global-scope event projects globalSettings and persists the global key only', () => {
    h.projector.project({
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

  test('register() is idempotent — a single emit projects once', () => {
    h.projector.register();
    h.projector.register();
    emit(EVENT_EMITTED, boardEvent({ id: 'once' }));

    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(3);
    h.projector.reset();
  });

  test('reset() unsubscribes the handler and clears dedup state', () => {
    h.projector.register();
    h.projector.reset();
    emit(EVENT_EMITTED, boardEvent({ id: 'after-reset' }));
    expect(h.ctx.scheduleReadModelPersist).not.toHaveBeenCalled();

    // dedup set cleared: an id seen before reset projects again afterwards
    const ev = boardEvent({ id: 'seen' });
    h.projector.project(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(3);
    h.projector.reset();
    h.projector.project(ev);
    expect(h.ctx.scheduleReadModelPersist).toHaveBeenCalledTimes(6);
  });
});

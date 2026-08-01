import { beforeEach, describe, expect, test } from 'vitest';
import { backfillEventLog, BACKFILL_FLAG_KEY } from '../../../src/modules/event-sourcing/backfill.js';
import { openStore, EVENTS_STORE, KV_STORE, _resetIdbForTesting } from '../../../src/modules/idb-store.js';
import { _flushDomainEventsForTesting } from '../../../src/modules/event-sourcing/emitter.js';
import { initHlc } from '../../../src/modules/event-sourcing/hlc.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

const BOARD_A = 'board-a';
const BOARD_B = 'board-b';

const fixture = {
  boards: [
    { id: BOARD_A, name: 'GOMOGI', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: BOARD_B, name: 'prod dev', createdAt: '2026-01-02T00:00:00.000Z' }
  ],
  columns: {
    [BOARD_A]: [{ id: 'todo', name: 'To Do', order: 0 }, { id: 'done', name: 'Done', order: 1 }],
    [BOARD_B]: [{ id: 'done', name: 'Done', order: 0 }]
  },
  labels: { [BOARD_A]: [{ id: 'label-1', name: 'urgent' }], [BOARD_B]: [] },
  tasks: {
    [BOARD_A]: [{ id: 'task-1', title: 'TU Invoice number for bill', column: 'todo', order: 0 }],
    [BOARD_B]: [{ id: 'task-2', title: 'WU open invoice', column: 'done', order: 0 }]
  },
  settings: { [BOARD_A]: { swimlaneGroupBy: 'label' }, [BOARD_B]: {} }
};

function ctx() {
  return {
    boards: fixture.boards,
    columnsFor: (id) => fixture.columns[id] || [],
    labelsFor: (id) => fixture.labels[id] || [],
    tasksFor: (id) => fixture.tasks[id] || [],
    settingsFor: (id) => fixture.settings[id] || null
  };
}

async function storedEvents() {
  const db = await openStore();
  return db.getAll(EVENTS_STORE);
}

beforeEach(async () => {
  _resetIdbForTesting();
  await indexedDB.deleteDatabase('kanvana-db');
  await openStore();
  await initHlc();
});

describe('event log backfill', () => {
  test('emits a created event for every pre-existing entity', async () => {
    const result = await backfillEventLog(ctx());
    await _flushDomainEventsForTesting();

    expect(result.skipped).toBe(false);
    const events = await storedEvents();
    const byType = events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {});
    expect(byType['board.created']).toBe(2);
    expect(byType['column.created']).toBe(3);
    expect(byType['label.created']).toBe(1);
    expect(byType['task.created']).toBe(2);
    expect(events.every((e) => e.synced !== true)).toBe(true);
  });

  test('a replaying device reconstructs each board and its tasks', async () => {
    await backfillEventLog(ctx());
    await _flushDomainEventsForTesting();
    const events = await storedEvents();

    // Mirrors read-model-projector: projection state is seeded per board, so
    // replay board-by-board rather than into one flat state.
    const replay = (boardId) => applyEvents(
      createProjectionState(), events.filter((e) => e.board_id === boardId)
    );

    const a = replay(BOARD_A);
    expect(a.boards.map((b) => b.name)).toEqual(['GOMOGI']);
    expect(a.tasks.map((t) => t.title)).toEqual(['TU Invoice number for bill']);
    expect(a.columns.map((c) => c.id)).toEqual(['todo', 'done']);
    expect(a.labels.map((l) => l.name)).toEqual(['urgent']);
    expect(a.settings).toMatchObject({ swimlaneGroupBy: 'label' });

    const b = replay(BOARD_B);
    expect(b.boards.map((x) => x.name)).toEqual(['prod dev']);
    expect(b.tasks.map((t) => t.title)).toEqual(['WU open invoice']);
    // 'done' exists on both boards — a board-blind dedup key would drop this one.
    expect(b.columns.map((c) => c.id)).toEqual(['done']);
  });

  test('runs once and is a no-op on the next startup', async () => {
    await backfillEventLog(ctx());
    await _flushDomainEventsForTesting();
    const afterFirst = (await storedEvents()).length;

    const second = await backfillEventLog(ctx());
    await _flushDomainEventsForTesting();

    expect(second.skipped).toBe(true);
    expect((await storedEvents()).length).toBe(afterFirst);
  });

  test('skips entities that already have a created event', async () => {
    const db = await openStore();
    await db.put(EVENTS_STORE, {
      id: 'existing-1', type: 'task.created', board_id: BOARD_A, entity_id: 'task-1',
      hlc: { wallTime: 1, counter: 0, nodeId: 'n' }, synced: true, payload: {}
    });

    await backfillEventLog(ctx());
    await _flushDomainEventsForTesting();

    const created = (await storedEvents()).filter((e) => e.type === 'task.created' && e.entity_id === 'task-1');
    expect(created).toHaveLength(1);
  });

  test('records the flag so a later run is skipped', async () => {
    await backfillEventLog(ctx());
    const db = await openStore();
    expect(await db.get(KV_STORE, BACKFILL_FLAG_KEY)).toMatchObject({ emitted: expect.any(Number) });
  });
});

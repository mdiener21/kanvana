import { beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { createProjectionState, applyEvents } from '../../../src/modules/reducer.js';
import {
  SNAPSHOT_EVENT_THRESHOLD,
  SNAPSHOT_AGE_MS,
  MAX_JITTER_MS,
  GRACE_WINDOW_MS,
  GLOBAL_SNAPSHOT_KEY,
  TIMETRACKING_SNAPSHOT_KEY,
  snapshotKeyForEvent,
  saveSnapshot,
  loadSnapshot,
  gcEvents,
  hydrateFromSnapshot,
  checkAndScheduleSnapshot,
  _resetSnapshotSchedulerForTesting,
  _setJitterForTesting
} from '../../../src/modules/event-sourcing/snapshot.js';
import { openStore } from '../../../src/modules/idb-store.js';

const DB_NAME = 'kanvana-db';

function makeHlc(wallTime, counter = 0, nodeId = 'node-a') {
  return { wallTime, counter, nodeId };
}

function makeEvent(id, type, hlc, boardId = 'board-a', entityId = 'entity-a', payload = {}) {
  return { id, type, hlc, at: new Date(hlc.wallTime).toISOString(), actor: { type: 'human', id: null }, scope: 'board', board_id: boardId, entity_id: entityId, payload };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  resetLocalStorage();
  _resetSnapshotSchedulerForTesting();
  await deleteDB(DB_NAME);
});

// ── Round-trip ─────────────────────────────────────────────────────────────────

test('loadSnapshot returns null when no snapshot exists', async () => {
  expect(await loadSnapshot('board-a')).toBeNull();
});

test('saveSnapshot and loadSnapshot round-trip preserves projection state', async () => {
  const state = createProjectionState({
    tasks: [{ id: 'task-1', title: 'Hello', column: 'todo', columnHistory: [] }],
    columns: [{ id: 'todo', name: 'To Do', order: 1 }],
    labels: [{ id: 'label-1', name: 'Bug', color: '#f00' }]
  });
  state.appliedEventIds.add('evt-1');
  state.taskTombstones.add('deleted-task');
  const hlc = makeHlc(1_000);

  await saveSnapshot('board-a', state, hlc);
  const result = await loadSnapshot('board-a');

  expect(result).not.toBeNull();
  expect(result.hlc).toEqual(hlc);
  expect(result.state.tasks).toEqual(state.tasks);
  expect(result.state.columns).toEqual(state.columns);
  expect(result.state.labels).toEqual(state.labels);
  expect(result.state.appliedEventIds).toEqual(state.appliedEventIds);
  expect(result.state.taskTombstones).toEqual(state.taskTombstones);
});

// ── GC ─────────────────────────────────────────────────────────────────────────

test('gcEvents removes events at or before snapshotHlc and leaves later ones', async () => {
  const db = await openStore();
  const eventsToWrite = [
    makeEvent('e1', 'task.created', makeHlc(100)),
    makeEvent('e2', 'task.updated', makeHlc(200)),
    makeEvent('e3', 'task.updated', makeHlc(300))
  ];
  for (const ev of eventsToWrite) await db.put('events', { ...ev, synced: true });

  await gcEvents('board-a', makeHlc(200));

  const remaining = await db.getAll('events');
  expect(remaining.map(e => e.id)).toEqual(['e3']);
});

test('gcEvents never deletes an event that has not been pushed, whatever its HLC', async () => {
  const db = await openStore();
  await db.put('events', { ...makeEvent('pushed', 'task.updated', makeHlc(100)), synced: true });
  await db.put('events', { ...makeEvent('queued-old', 'task.updated', makeHlc(50)), synced: false });
  await db.put('events', { ...makeEvent('queued-at', 'task.updated', makeHlc(200)), synced: false });
  await db.put('events', { ...makeEvent('queued-legacy', 'task.updated', makeHlc(150)) });

  await gcEvents('board-a', makeHlc(200));

  const remaining = await db.getAll('events');
  expect(remaining.map(e => e.id).sort()).toEqual(['queued-at', 'queued-legacy', 'queued-old']);
});

test('gcEvents keeps covered, pushed events that are younger than the grace window', async () => {
  const db = await openStore();
  const now = Date.now();
  const old = makeHlc(now - GRACE_WINDOW_MS - 1_000);
  const young = makeHlc(now - GRACE_WINDOW_MS + 60_000);
  await db.put('events', { ...makeEvent('old', 'task.updated', old), synced: true });
  await db.put('events', { ...makeEvent('young', 'task.updated', young), synced: true });

  await gcEvents('board-a', makeHlc(now));

  expect((await db.getAll('events')).map(e => e.id)).toEqual(['young']);
});

test('gcEvents for a board snapshot does not delete unrelated boards\' events', async () => {
  const db = await openStore();
  const eventsToWrite = [
    makeEvent('a1', 'board.created', makeHlc(100), 'board-a', 'board-a'),
    makeEvent('a2', 'task.updated', makeHlc(200), 'board-a', 'task-a'),
    makeEvent('b1', 'board.created', makeHlc(150), 'board-b', 'board-b'),
    makeEvent('b2', 'task.updated', makeHlc(180), 'board-b', 'task-b')
  ];
  for (const ev of eventsToWrite) await db.put('events', { ...ev, synced: true });

  await gcEvents('board-a', makeHlc(200));

  const remaining = await db.getAll('events');
  expect(remaining.map(e => e.id)).toEqual(['b1', 'b2']);
});

test('gcEvents scopes timetracking, global and board snapshots independently', async () => {
  const db = await openStore();
  const tt = (id, wall) => ({ ...makeEvent(id, 'customer.created', makeHlc(wall), null, id), scope: 'timetracking' });
  const gl = (id, wall) => ({ ...makeEvent(id, 'settings.updated', makeHlc(wall), null, 'global'), scope: 'global' });
  const eventsToWrite = [
    tt('t1', 100), tt('t2', 300),
    gl('g1', 100),
    makeEvent('b1', 'task.updated', makeHlc(100))
  ];
  for (const ev of eventsToWrite) await db.put('events', { ...ev, synced: true });

  await gcEvents(TIMETRACKING_SNAPSHOT_KEY, makeHlc(200));
  expect((await db.getAll('events')).map(e => e.id).sort()).toEqual(['b1', 'g1', 't2']);

  await gcEvents(GLOBAL_SNAPSHOT_KEY, makeHlc(200));
  await gcEvents('board-a', makeHlc(200));
  expect((await db.getAll('events')).map(e => e.id)).toEqual(['t2']);
});

test('timetracking snapshot round-trips the time-tracking slot', async () => {
  const slot = { customers: [{ id: 'c1', name: 'Acme' }], projects: [{ id: 'p1', customerId: 'c1' }], timeEntries: [], tombstones: { customers: {}, projects: {} } };
  await saveSnapshot(TIMETRACKING_SNAPSHOT_KEY, createProjectionState({ timeTracking: slot }), makeHlc(10));

  expect((await loadSnapshot(TIMETRACKING_SNAPSHOT_KEY)).state.timeTracking).toEqual(slot);
});

test('snapshotKeyForEvent maps each scope to its own key', () => {
  expect(snapshotKeyForEvent({ scope: 'timetracking', board_id: 'board-a' })).toBe(TIMETRACKING_SNAPSHOT_KEY);
  expect(snapshotKeyForEvent({ scope: 'global', board_id: null })).toBe(GLOBAL_SNAPSHOT_KEY);
  expect(snapshotKeyForEvent({ scope: 'board', board_id: 'board-a' })).toBe('board-a');
  expect(snapshotKeyForEvent({ board_id: 'board-a' })).toBe('board-a');
});

// ── Hydration ──────────────────────────────────────────────────────────────────

test('hydrateFromSnapshot with no snapshot replays all events from zero', async () => {
  const events = [
    makeEvent('e1', 'task.created', makeHlc(100), 'board-a', 'task-1', { task: { title: 'A', column: 'todo', columnHistory: [] } }),
    makeEvent('e2', 'task.updated', makeHlc(200), 'board-a', 'task-1', { fields: { title: 'B' } })
  ];
  const result = await hydrateFromSnapshot('board-a', events);

  expect(result.tasks).toEqual([{ id: 'task-1', title: 'B', column: 'todo', columnHistory: [] }]);
});

test('hydrateFromSnapshot equals replay-from-zero when snapshot covers earlier events', async () => {
  const earlyEvents = [
    makeEvent('e1', 'task.created', makeHlc(100), 'board-a', 'task-1', { task: { title: 'A', column: 'todo', columnHistory: [] } }),
    makeEvent('e2', 'task.updated', makeHlc(200), 'board-a', 'task-1', { fields: { title: 'B' } })
  ];
  const laterEvents = [
    makeEvent('e3', 'task.updated', makeHlc(300), 'board-a', 'task-1', { fields: { title: 'C' } })
  ];
  const allEvents = [...earlyEvents, ...laterEvents];

  const fullReplay = applyEvents(createProjectionState(), allEvents);

  const snapshotState = applyEvents(createProjectionState(), earlyEvents);
  await saveSnapshot('board-a', snapshotState, makeHlc(200));

  const hydrated = await hydrateFromSnapshot('board-a', allEvents);

  expect(hydrated.tasks).toEqual(fullReplay.tasks);
});

// ── Snapshot trigger ───────────────────────────────────────────────────────────

function settle() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

// A snapshot covers only events older than the grace window (#179), so an
// event that arrives late but inside the window is newer than the snapshot.
test('checkAndScheduleSnapshot snapshots after 500 events, covering the ones older than the grace window', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  const youngWall = Date.now() - GRACE_WINDOW_MS + 60_000;
  const created = makeEvent('e-create', 'task.created', makeHlc(1), 'board-a', 'task-1', { task: { title: 'T0', column: 'todo', columnHistory: [] } });
  await db.put('events', { ...created, synced: true });
  for (let i = 1; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    const wall = i < 300 ? i + 1 : youngWall + i;
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(wall), 'board-a', 'task-1', { fields: { title: `T${i}` } }), synced: true });
  }

  checkAndScheduleSnapshot('board-a');
  await vi.waitFor(async () => expect(await db.count('events')).toBe(SNAPSHOT_EVENT_THRESHOLD - 300));

  const snapshot = await loadSnapshot('board-a');
  expect(snapshot.hlc).toEqual(makeHlc(300));
  expect(snapshot.state.tasks[0].title).toBe('T299');
  const remaining = (await db.getAll('events')).map(e => e.id);
  expect(remaining).not.toContain('e299');
  expect(remaining).toHaveLength(SNAPSHOT_EVENT_THRESHOLD - 300);
});

test('checkAndScheduleSnapshot takes no snapshot while every event is inside the grace window', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  const youngWall = Date.now() - GRACE_WINDOW_MS + 60_000;
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(youngWall + i)), synced: true });
  }

  checkAndScheduleSnapshot('board-a');
  await settle();

  expect(await loadSnapshot('board-a')).toBeNull();
});

test('checkAndScheduleSnapshot folds with the supplied fold and reports the saved state', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(i + 1)), synced: false });
  }
  const folded = createProjectionState({ tasks: [{ id: 'task-1', title: 'Folded', column: 'todo', columnHistory: [] }] });
  const fold = vi.fn(() => folded);
  const onSaved = vi.fn();

  checkAndScheduleSnapshot('board-a', { fold, onSaved });
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());

  expect(fold).toHaveBeenCalledWith(null, expect.any(Array));
  expect(fold.mock.calls[0][1]).toHaveLength(SNAPSHOT_EVENT_THRESHOLD);
  expect((await loadSnapshot('board-a')).state.tasks[0].title).toBe('Folded');
  expect(onSaved).toHaveBeenCalledWith('board-a', folded);
});

test('checkAndScheduleSnapshot does not schedule when event count is below threshold', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD - 1; i++) {
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(i + 1)), synced: false });
  }

  checkAndScheduleSnapshot('board-a');
  await settle();

  expect(await loadSnapshot('board-a')).toBeNull();
});

test('checkAndScheduleSnapshot ignores other boards when counting events', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    await db.put('events', { ...makeEvent(`b${i}`, 'task.updated', makeHlc(i + 1), 'board-b', `task-${i}`), synced: false });
  }

  checkAndScheduleSnapshot('board-a');
  await settle();

  expect(await loadSnapshot('board-a')).toBeNull();
});

test('checkAndScheduleSnapshot schedules when snapshot age exceeds 14 days', async () => {
  _setJitterForTesting(() => 0);
  const oldAt = new Date(Date.now() - SNAPSHOT_AGE_MS - 1).toISOString();
  const db = await openStore();
  await db.put('snapshots', { payload: { tasks: [], columns: [], labels: [], settings: {}, globalSettings: {}, appliedEventIds: [], taskTombstones: [] }, hlc: makeHlc(1), at: oldAt }, 'board-a');
  await db.put('events', { ...makeEvent('e2', 'task.updated', makeHlc(2)), synced: true });

  checkAndScheduleSnapshot('board-a');
  await vi.waitFor(async () => expect((await loadSnapshot('board-a')).hlc).toEqual(makeHlc(2)));

  const snapshot = await loadSnapshot('board-a');
  expect(snapshot.at).not.toBe(oldAt);
});

// ── Global scope ───────────────────────────────────────────────────────────────

test('global snapshot stored under __global__ key does not interfere with board snapshot', async () => {
  const boardState = createProjectionState({ tasks: [{ id: 'task-1', title: 'T', column: 'todo', columnHistory: [] }] });
  const globalState = createProjectionState({ globalSettings: { locale: 'de-DE' } });

  await saveSnapshot('board-a', boardState, makeHlc(100));
  await saveSnapshot(GLOBAL_SNAPSHOT_KEY, globalState, makeHlc(200));

  const boardSnap = await loadSnapshot('board-a');
  const globalSnap = await loadSnapshot(GLOBAL_SNAPSHOT_KEY);

  expect(boardSnap.state.tasks).toEqual(boardState.tasks);
  expect(globalSnap.state.globalSettings).toEqual(globalState.globalSettings);
  expect(globalSnap.hlc).toEqual(makeHlc(200));
  expect(boardSnap.hlc).toEqual(makeHlc(100));
});

// ── GC safety ─────────────────────────────────────────────────────────────────

test('rehydration after GC produces the same projection as before GC', async () => {
  const db = await openStore();
  const events = [
    makeEvent('e1', 'task.created', makeHlc(100), 'board-a', 'task-1', { task: { title: 'A', column: 'todo', columnHistory: [] } }),
    makeEvent('e2', 'task.updated', makeHlc(200), 'board-a', 'task-1', { fields: { title: 'B' } }),
    makeEvent('e3', 'task.updated', makeHlc(300), 'board-a', 'task-1', { fields: { title: 'C' } })
  ];
  for (const ev of events) await db.put('events', { ...ev, synced: true });

  const preGcProjection = applyEvents(createProjectionState(), events);
  await saveSnapshot('board-a', preGcProjection, makeHlc(300));

  await gcEvents('board-a', makeHlc(300));

  const remaining = await db.getAll('events');
  expect(remaining).toHaveLength(0);

  const postGcHydration = await hydrateFromSnapshot('board-a', []);
  expect(postGcHydration.tasks).toEqual(preGcProjection.tasks);
});

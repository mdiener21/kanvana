import { beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { createProjectionState, applyEvents } from '../../../src/modules/reducer.js';
import {
  SNAPSHOT_EVENT_THRESHOLD,
  SNAPSHOT_AGE_MS,
  MAX_JITTER_MS,
  GLOBAL_SNAPSHOT_KEY,
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
  for (const ev of eventsToWrite) await db.put('events', { ...ev, synced: false });

  await gcEvents(makeHlc(200));

  const remaining = await db.getAll('events');
  expect(remaining.map(e => e.id)).toEqual(['e3']);
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

test('checkAndScheduleSnapshot schedules snapshot after 500 events with jitter delay', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD; i++) {
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(i + 1)), synced: false });
  }

  const state = createProjectionState({ tasks: [{ id: 'task-1', title: 'T', column: 'todo', columnHistory: [] }] });
  const hlc = makeHlc(SNAPSHOT_EVENT_THRESHOLD);
  checkAndScheduleSnapshot('board-a', state, hlc);
  await settle();

  const snapshot = await loadSnapshot('board-a');
  expect(snapshot).not.toBeNull();
  expect(snapshot.hlc).toEqual(hlc);
});

test('checkAndScheduleSnapshot does not schedule when event count is below threshold', async () => {
  _setJitterForTesting(() => 0);
  const db = await openStore();
  for (let i = 0; i < SNAPSHOT_EVENT_THRESHOLD - 1; i++) {
    await db.put('events', { ...makeEvent(`e${i}`, 'task.updated', makeHlc(i + 1)), synced: false });
  }

  const state = createProjectionState();
  checkAndScheduleSnapshot('board-a', state, makeHlc(SNAPSHOT_EVENT_THRESHOLD - 1));
  await settle();

  expect(await loadSnapshot('board-a')).toBeNull();
});

test('checkAndScheduleSnapshot schedules when snapshot age exceeds 14 days', async () => {
  _setJitterForTesting(() => 0);
  const oldAt = new Date(Date.now() - SNAPSHOT_AGE_MS - 1).toISOString();
  const db = await openStore();
  await db.put('snapshots', { payload: { tasks: [], columns: [], labels: [], settings: {}, globalSettings: {}, appliedEventIds: [], taskTombstones: [] }, hlc: makeHlc(1), at: oldAt }, 'board-a');

  const state = createProjectionState({ tasks: [{ id: 'task-1', title: 'T', column: 'todo', columnHistory: [] }] });
  const hlc = makeHlc(2);
  checkAndScheduleSnapshot('board-a', state, hlc);
  await settle();

  const snapshot = await loadSnapshot('board-a');
  expect(snapshot).not.toBeNull();
  expect(snapshot.hlc).toEqual(hlc);
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
  for (const ev of events) await db.put('events', { ...ev, synced: false });

  const preGcProjection = applyEvents(createProjectionState(), events);
  await saveSnapshot('board-a', preGcProjection, makeHlc(300));

  await gcEvents(makeHlc(300));

  const remaining = await db.getAll('events');
  expect(remaining).toHaveLength(0);

  const postGcHydration = await hydrateFromSnapshot('board-a', []);
  expect(postGcHydration.tasks).toEqual(preGcProjection.tasks);
});

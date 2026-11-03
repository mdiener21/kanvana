// #263: demo tasks are never emitted, yet events on one device name the same tasks on the others,
// and a rebuild from the event log, which holds no task.created for them, keeps them.
import { beforeEach, describe, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  ensureBoardsInitialized,
  loadTasksForBoard
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, adoptSnapshot, ingestEvent, ingestRemoteBatch } from '../../../src/modules/event-sourcing/ingest.js';
import { loadSnapshot, SNAPSHOT_EVENT_THRESHOLD, _resetSnapshotSchedulerForTesting, _setJitterForTesting } from '../../../src/modules/event-sourcing/snapshot.js';
import { getDbRef, replaceLocalData } from '../../../src/modules/idb-store.js';
import { EVENT_EMITTED, off, on } from '../../../src/modules/events.js';

const BOARD = '00000000-0000-4000-8000-000000000001';
const DONE_COLUMN = '00000000-0000-4000-8000-000000000012';
const SOUL_STONE = '00000000-0000-4000-8000-000000000030';
const TIME_STONE = '00000000-0000-4000-8000-000000000031';
const NEW_TASK = '7a5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
const LONG_AGO = Date.now() - 40 * 24 * 60 * 60 * 1000;

function olderRemoteEvent(type, entityId, counter, payload) {
  return {
    id: `e-${type}-${counter}`,
    type,
    hlc: { wallTime: LONG_AGO + counter, counter: 0, nodeId: 'device-a' },
    at: '2026-10-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: BOARD,
    entity_id: entityId,
    payload
  };
}

const ingestRemote = (...args) => ingestEvent(olderRemoteEvent(...args), { origin: EVENT_ORIGIN.REMOTE });
const demoTask = (id) => loadTasksForBoard(BOARD).find((task) => task.id === id);

async function firstRunDevice() {
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
}

beforeEach(firstRunDevice);

test('every device seeds the same demo task ids, in the same order', async () => {
  const onFirstDevice = loadTasksForBoard(BOARD).map((task) => [task.id, task.title]);
  await firstRunDevice();
  expect(loadTasksForBoard(BOARD).map((task) => [task.id, task.title])).toEqual(onFirstDevice);
  expect(onFirstDevice).toContainEqual([SOUL_STONE, 'Find out where the Soul Stone is']);
});

test('seeding the first-run board emits no task events', async () => {
  const types = [];
  const record = (e) => types.push(e.detail.type);
  on(EVENT_EMITTED, record);
  await firstRunDevice();
  off(EVENT_EMITTED, record);
  expect(types).toContain('board.created');
  expect(types.filter((type) => type.startsWith('task.'))).toEqual([]);
});

test('a second board does not get the demo tasks', () => {
  const board = createBoard('Second');
  expect(loadTasksForBoard(board.id)).toEqual([]);
});

test('edits and moves that arrive late apply to the demo task instead of removing it', async () => {
  await ingestRemote('task.updated', TIME_STONE, 1, { fields: { title: 'Edited on A' } });
  await ingestRemote('task.moved', TIME_STONE, 2, { order: [{ id: TIME_STONE, column: DONE_COLUMN, order: 1 }] });

  expect(demoTask(TIME_STONE)).toMatchObject({ title: 'Edited on A', column: DONE_COLUMN, order: 1 });
  expect(loadTasksForBoard(BOARD)).toHaveLength(7);
});

test('a task.moved that only renumbers a demo task reaches it when it arrives late', async () => {
  await ingestRemote('task.moved', NEW_TASK, 1, { order: [{ id: SOUL_STONE, column: demoTask(SOUL_STONE).column, order: 2 }] });

  expect(demoTask(SOUL_STONE).order).toBe(2);
});

test('replaying does not repeat what events already added to a demo task', async () => {
  const subtask = { id: 'sub-1', title: 'Pack', completed: false };
  await ingestRemote('subtask.added', TIME_STONE, 1, { subtask });
  await ingestRemote('task.updated', TIME_STONE, 2, { fields: { title: 'Edited on A' } });

  expect(demoTask(TIME_STONE).subTasks).toEqual([subtask]);
});

test('a demo task keeps its creation date through a replay', async () => {
  const created = demoTask(TIME_STONE).creationDate;
  await ingestRemote('task.updated', TIME_STONE, 1, { fields: { title: 'Edited on A' } });

  expect(demoTask(TIME_STONE).creationDate).toBe(created);
});

test('a demo task deleted late is gone and later replays do not bring it back', async () => {
  await ingestRemote('task.deleted', SOUL_STONE, 1, {});
  await ingestRemote('task.updated', TIME_STONE, 2, { fields: { title: 'Edited on A' } });

  expect(demoTask(SOUL_STONE)).toBeUndefined();
  expect(demoTask(TIME_STONE).title).toBe('Edited on A');
  expect(loadTasksForBoard(BOARD)).toHaveLength(6);
});

test('a device without demo tasks after an account switch does not gain them in a replay', async () => {
  await _flushPersistsForTesting();
  await replaceLocalData({ ownerId: 'user-b', maxUnsynced: Infinity, keepKvKeys: [] });
  _resetStorageForTesting();
  await initStorage();
  ensureBoardsInitialized();
  await ingestRemote('board.created', BOARD, 0, { board: { id: BOARD, name: 'Default Board' } });
  await ingestRemote('task.updated', TIME_STONE, 1, { fields: { title: 'Edited on A' } });

  expect(loadTasksForBoard(BOARD)).toEqual([]);
});

// CONTEXT.md §9, Durability: a catch-up batch defers remote read-model writes, not a local edit's.
test('a local edit during catch-up stores its read model with its event, before the batch ends', async () => {
  let readBack = null;
  let batchEnded = false;
  const local = { ...olderRemoteEvent('task.updated', TIME_STONE, 0, { fields: { title: 'Local edit' } }), id: 'local-1', hlc: { wallTime: Date.now() + 5_000, counter: 0, nodeId: 'me' } };
  const whileBatching = (e) => {
    if (readBack || e.detail.id === local.id) return;
    ingestEvent(local);
    const tx = getDbRef().transaction(['read_model', 'events']);
    readBack = Promise.all([tx.objectStore('read_model').get(`${BOARD}:tasks`), tx.objectStore('events').get(local.id), Promise.resolve(batchEnded)]);
  };
  on(EVENT_EMITTED, whileBatching);
  const edits = Array.from({ length: 5 }, (_, i) => ({ event: { ...olderRemoteEvent('task.updated', SOUL_STONE, i + 1, { fields: { title: `Remote ${i}` } }), hlc: { wallTime: Date.now() + i, counter: 0, nodeId: 'device-a' } } }));
  const batch = ingestRemoteBatch(edits).then(() => { batchEnded = true; });
  await expect.poll(() => readBack).toBeTruthy();
  const [tasks, storedEvent, endedWhenAsked] = await readBack;
  off(EVENT_EMITTED, whileBatching);
  await batch;

  expect(endedWhenAsked).toBe(false);
  expect(storedEvent?.id).toBe(local.id);
  expect(tasks.find((task) => task.id === TIME_STONE).title).toBe('Local edit');
});

// CONTEXT.md §9, Demo tasks: what adopting a snapshot does to them.
describe('adopting a snapshot', () => {
  const stateWithTasks = (tasks) => ({ boards: [{ id: BOARD, name: 'Default Board' }], tasks, columns: [], labels: [], settings: {} });
  const snapshotHlc = { wallTime: LONG_AGO + 100, counter: 0, nodeId: 'device-a' };

  test('that holds demo tasks does not give them to a device without any', async () => {
    const carried = demoTask(TIME_STONE);
    await replaceLocalData({ ownerId: 'user-b', maxUnsynced: Infinity, keepKvKeys: [] });
    _resetStorageForTesting();
    await initStorage();
    ensureBoardsInitialized();
    expect(loadTasksForBoard(BOARD)).toEqual([]);

    const realTask = { ...carried, id: NEW_TASK, title: 'Real task' };
    await adoptSnapshot(BOARD, stateWithTasks([{ ...carried, title: 'Edited on A' }, realTask]), snapshotHlc);

    expect(loadTasksForBoard(BOARD).map((task) => task.id)).toEqual([NEW_TASK]);
    expect((await loadSnapshot(BOARD)).state.tasks.map((task) => task.id)).toEqual([NEW_TASK]);
  });

  test('that holds a demo task this device also holds applies its edits', async () => {
    await adoptSnapshot(BOARD, stateWithTasks([{ ...demoTask(TIME_STONE), title: 'Edited on A' }]), snapshotHlc);

    expect(demoTask(TIME_STONE).title).toBe('Edited on A');
  });

  test('that lacks them leaves untouched demo tasks, and removes one its covered events edited', async () => {
    await ingestRemote('task.updated', TIME_STONE, 1, { fields: { title: 'Edited on A' } });

    await adoptSnapshot(BOARD, stateWithTasks([]), snapshotHlc);

    expect(demoTask(SOUL_STONE)).toBeDefined();
    expect(demoTask(TIME_STONE)).toBeUndefined();
  });
});

test('a snapshot holds the demo tasks with the changes it covers', async () => {
  _resetSnapshotSchedulerForTesting(); // seeding already scheduled a check, with a random delay
  _setJitterForTesting(() => 0);
  const edits = Array.from({ length: SNAPSHOT_EVENT_THRESHOLD }, (_, i) => ({
    event: olderRemoteEvent('task.updated', TIME_STONE, i + 1, { fields: { title: `Edit ${i + 1}` } })
  }));
  await ingestRemoteBatch(edits);
  // A late event only rebuilds; the next one in order is what checks for a due snapshot.
  const inOrder = olderRemoteEvent('task.updated', SOUL_STONE, 0, { fields: { title: 'Edited just now' } });
  await ingestEvent({ ...inOrder, hlc: { wallTime: Date.now() + 1_000, counter: 0, nodeId: 'device-a' } }, { origin: EVENT_ORIGIN.REMOTE });

  await expect.poll(async () => (await loadSnapshot(BOARD))?.state.tasks.find((task) => task.id === TIME_STONE)?.title, { timeout: 5000 })
    .toBe(`Edit ${SNAPSHOT_EVENT_THRESHOLD}`);
  expect((await loadSnapshot(BOARD)).state.tasks).toHaveLength(7);
}, 30000);

// #178: the event log's memory of "deleted" (task delete records) and "already
// applied" (event ids) survives a reload and a snapshot adoption.
import { beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  loadTasksForBoard,
  loadColumnsForBoard,
  loadGlobalSettings
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, adoptSnapshot, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';
import { createProjectionState } from '../../../src/modules/reducer.js';
import { loadSnapshot, _setJitterForTesting } from '../../../src/modules/event-sourcing/snapshot.js';
import { openStore, READ_MODEL_STORE, SNAPSHOTS_STORE } from '../../../src/modules/idb-store.js';

// Ids must be UUIDs: initStorage() remaps non-UUID ids on load.
const TASK_ID = '7a5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
let boardId;

function taskEvent(type, { id, counter, entityId = TASK_ID, payload = {} }) {
  return {
    id,
    type,
    hlc: { wallTime: 10_000 + counter, counter, nodeId: 'node-a' },
    at: '2026-10-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: boardId,
    entity_id: entityId,
    payload
  };
}

const ingestLocal = (event) => ingestEvent(event, { origin: EVENT_ORIGIN.LOCAL });
const ingestRemote = (event) => ingestEvent(event, { origin: EVENT_ORIGIN.REMOTE });

async function reload() {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
  await initStorage();
}

const column = () => loadColumnsForBoard(boardId)[0].id;
const task = (id) => loadTasksForBoard(boardId).find((t) => t.id === id);

beforeEach(async () => {
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
  boardId = createBoard('Durable').id;
  await _flushPersistsForTesting();
});

test('a task deleted before a reload is not resurrected by an older task.created', async () => {
  await ingestLocal(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: column() } } }));
  await ingestLocal(taskEvent('task.deleted', { id: 'e-delete', counter: 2 }));
  await reload();

  await ingestRemote(taskEvent('task.created', { id: 'e-create-late', counter: 0, payload: { task: { title: 'Zombie', column: column() } } }));

  expect(task(TASK_ID)).toBeUndefined();
});

test('the remote echo of an edit applied before a reload does not overwrite a newer edit', async () => {
  await ingestLocal(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: column() } } }));
  const e1 = taskEvent('task.updated', { id: 'e1', counter: 2, payload: { fields: { title: 'E1' } } });
  await ingestLocal(e1);
  await reload();

  await ingestLocal(taskEvent('task.updated', { id: 'e2', counter: 3, payload: { fields: { title: 'E2' } } }));
  await ingestRemote({ ...e1 });

  expect(task(TASK_ID).title).toBe('E2');
});

test('a delete record in an adopted snapshot makes later edits of that task a no-op, also after a reload', async () => {
  await ingestLocal(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: column() } } }));

  // Another device deleted the task; its snapshot carries the delete record.
  await adoptSnapshot(boardId, createProjectionState({
    boards: [{ id: boardId, name: 'Durable' }],
    columns: loadColumnsForBoard(boardId),
    appliedEventIds: new Set(['e-create', 'e-delete-elsewhere']),
    taskTombstones: new Set([TASK_ID])
  }), { wallTime: 10_001, counter: 1, nodeId: 'node-z' });

  await ingestRemote(taskEvent('task.created', { id: 'e-recreate', counter: 2, payload: { task: { title: 'Zombie', column: column() } } }));
  await ingestRemote(taskEvent('task.updated', { id: 'e-update', counter: 3, payload: { fields: { title: 'Edited' } } }));
  expect(task(TASK_ID)).toBeUndefined();

  await reload();
  await ingestRemote(taskEvent('task.created', { id: 'e-recreate-2', counter: 4, payload: { task: { title: 'Zombie', column: column() } } }));
  await ingestRemote(taskEvent('task.updated', { id: 'e-update-2', counter: 5, payload: { fields: { title: 'Edited' } } }));
  expect(task(TASK_ID)).toBeUndefined();
});

test('a snapshot holds the board memory and the live applied set is pruned of what it holds', async () => {
  // An old snapshot makes the next event take a new one (age trigger).
  const db = await openStore();
  await db.put(SNAPSHOTS_STORE, {
    payload: { boards: [], tasks: [], columns: [], labels: [], settings: {}, appliedEventIds: ['e-old'], taskTombstones: [] },
    hlc: { wallTime: 1, counter: 0, nodeId: 'node-a' },
    at: '2020-01-01T00:00:00.000Z'
  }, boardId);
  await reload();
  _setJitterForTesting(() => 0);

  await ingestLocal(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: column() } } }));
  await ingestLocal(taskEvent('task.deleted', { id: 'e-delete', counter: 2 }));
  await vi.waitFor(async () => {
    expect((await loadSnapshot(boardId)).at).not.toBe('2020-01-01T00:00:00.000Z');
  });
  await _flushPersistsForTesting();

  const snapshot = (await loadSnapshot(boardId)).state;
  expect([...snapshot.appliedEventIds]).toEqual(expect.arrayContaining(['e-old', 'e-create']));
  const live = await (await openStore()).get(READ_MODEL_STORE, `${boardId}:appliedEventIds`);
  expect(live).not.toContain('e-old');
  expect(live).not.toContain('e-create');

  // Pruned ids are still answered as applied, from the snapshot, after a reload.
  await reload();
  await ingestRemote(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: column() } } }));
  expect(task(TASK_ID)).toBeUndefined();
  expect(await (await openStore()).get(READ_MODEL_STORE, `${boardId}:taskTombstones`)).toEqual([TASK_ID]);
});

test('a global-scope echo of an event stored before a reload is answered as applied from the event store', async () => {
  const globalEvent = (id, counter, theme) => ({
    id,
    type: 'settings.updated',
    hlc: { wallTime: 10_000 + counter, counter, nodeId: 'node-a' },
    at: '2026-10-01T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'global',
    board_id: null,
    entity_id: 'global',
    payload: { fields: { timeTracking: { theme } } }
  });
  const g1 = globalEvent('g1', 1, 'dark');
  await ingestLocal(g1);
  await reload();

  await ingestLocal(globalEvent('g2', 2, 'light'));
  await ingestRemote({ ...g1 });

  expect(loadGlobalSettings().timeTracking.theme).toBe('light');
});

// #178: the event log's memory of "deleted" (task delete records) and "already
// applied" (event ids) survives a reload and a snapshot adoption.
import { beforeEach, expect, test } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  loadTasksForBoard,
  loadColumnsForBoard
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';

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

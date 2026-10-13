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
  loadTasksForBoard
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';

let boardId;

function taskEvent(type, { id, counter, entityId = 'task-1', payload = {} }) {
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
  await ingestLocal(taskEvent('task.created', { id: 'e-create', counter: 1, payload: { task: { title: 'T', column: 'todo' } } }));
  await ingestLocal(taskEvent('task.deleted', { id: 'e-delete', counter: 2 }));
  await reload();

  await ingestRemote(taskEvent('task.created', { id: 'e-create-late', counter: 0, payload: { task: { title: 'Zombie', column: 'todo' } } }));

  expect(task('task-1')).toBeUndefined();
});

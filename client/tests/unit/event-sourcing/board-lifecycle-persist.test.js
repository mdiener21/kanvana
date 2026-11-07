// #278: a created or seeded board is written through the Read Model, so a failed save of it is retried by the
// next edit on that board like any other unsaved slice (#141).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  ensureBoardsInitialized,
  getActiveBoardId,
  listBoards,
  loadColumnsForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadTasksForBoard
} from '../../../src/modules/storage.js';
import { schedulePersist } from '../../../src/modules/idb-store.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';

let consoleError;

// What a reload must bring back; field defaults a load fills in are not what this is about.
function board(id) {
  const ids = (items) => items.map((item) => item.id);
  return {
    name: listBoards().find((item) => item.id === id)?.name,
    tasks: ids(loadTasksForBoard(id)),
    columns: loadColumnsForBoard(id).map(({ id: columnId, name }) => ({ id: columnId, name })),
    labels: ids(loadLabelsForBoard(id)),
    settings: loadSettingsForBoard(id)
  };
}

// A value IndexedDB cannot clone fails the whole write batch of this tick (#256).
const failThisTicksWrites = () => schedulePersist('kanvana:test:uncloneable', () => {});

async function editBoard(boardId) {
  const column = loadColumnsForBoard(boardId)[0];
  await ingestEvent({
    id: crypto.randomUUID(),
    type: 'column.updated',
    hlc: { wallTime: Date.now() + 1_000, counter: 0, nodeId: 'node-a' },
    at: new Date().toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: boardId,
    entity_id: column.id,
    payload: { fields: { name: 'Renamed' } }
  }, { origin: EVENT_ORIGIN.LOCAL });
  await _flushPersistsForTesting();
}

async function reload() {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
  await initStorage();
}

beforeEach(async () => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
});

afterEach(() => consoleError.mockRestore());

test('a created board whose save failed is stored whole by the next edit on it', async () => {
  ensureBoardsInitialized();
  await _flushPersistsForTesting();
  const { id } = createBoard('Created');
  failThisTicksWrites();
  await _flushPersistsForTesting();

  await editBoard(id);
  const before = board(id);
  await reload();

  expect(board(id)).toEqual(before);
});

test('a seeded default board whose save failed is stored whole by the next edit on it', async () => {
  ensureBoardsInitialized();
  failThisTicksWrites();
  await _flushPersistsForTesting();
  const id = getActiveBoardId();

  await editBoard(id);
  const before = board(id);
  await reload();

  expect(board(id)).toEqual(before);
});

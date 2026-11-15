import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';

// Event ids whose store write waits until the test lets it go.
const heldWrites = vi.hoisted(() => new Map());
vi.mock('../../../src/modules/idb-store.js', async (importOriginal) => {
  const actual = await importOriginal();
  const persistEvent = async (event) => {
    await heldWrites.get(event.id)?.();
    return actual.persistEvent(event);
  };
  return { ...actual, persistEvent };
});

// Not for a fresh Read Model (createReadModel gives one) but for the idb-store mock: the setup file's storage
// already loaded the real idb-store, and only a fresh module graph imports the mocked one.
vi.resetModules();
const { createReadModel, ingestRemoteBatch } = await import('../../../src/modules/event-sourcing/ingest.js');
const { READ_MODEL_KEYS } = await import('../../../src/modules/event-sourcing/read-model-projector.js');
const {
  KV_STORE, READ_MODEL_STORE, openStore, readModelKeyFor, schedulePersist, scheduleReadModelPersist, _flushPersistsForTesting, _resetIdbForTesting
} = await import('../../../src/modules/idb-store.js');

const BOARD_ID = 'board-a';
const at = (n) => ({ wallTime: 1000 + n, counter: 0, nodeId: 'node-a' });

function titleUpdate(id, n, title) {
  return {
    event: {
      id,
      type: 'task.updated',
      hlc: at(n),
      at: '2026-05-26T00:00:00.000Z',
      actor: { type: 'human', id: null },
      scope: 'board',
      board_id: BOARD_ID,
      entity_id: 'task-a',
      payload: { fields: { title } }
    }
  };
}

let readModel;

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
  const db = await openStore();
  await db.put(KV_STORE, [{ id: BOARD_ID, name: 'A', createdAt: '2026-01-01T00:00:00.000Z' }], READ_MODEL_KEYS.boards);
  await db.put(READ_MODEL_STORE, [{ id: 'task-a', title: 'Before', column: 'todo', columnHistory: [] }], readModelKeyFor(BOARD_ID, 'tasks'));
  await db.put(READ_MODEL_STORE, [{ id: 'todo', name: 'To Do' }], readModelKeyFor(BOARD_ID, 'columns'));
  readModel = createReadModel({
    schedulePersist,
    scheduleReadModelPersist,
    checkAndScheduleSnapshot: vi.fn()
  });
  await readModel.load();
  readModel.startProjecting();
});

afterEach(async () => {
  heldWrites.clear();
  readModel.reset();
  await _flushPersistsForTesting();
  _resetIdbForTesting();
});

test('overlapping catch-up batches each store the boards touched so far when they end', async () => {
  let release;
  const reached = new Promise((resolve) => {
    heldWrites.set('slow', () => {
      resolve();
      return new Promise((done) => { release = done; });
    });
  });
  const first = ingestRemoteBatch([titleUpdate('slow', 1, 'First')]);
  await reached;

  await ingestRemoteBatch([titleUpdate('fast', 2, 'Second')]);
  const stored = await (await openStore()).get(READ_MODEL_STORE, readModelKeyFor(BOARD_ID, 'tasks'));
  release();
  await first;

  expect(stored[0].title).toBe('Second');
});

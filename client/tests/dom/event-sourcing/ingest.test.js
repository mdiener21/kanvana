// One ingest interface for local and remote events (#177).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { DATA_CHANGED, EVENT_EMITTED, emit, off, on } from '../../../src/modules/events.js';
import { openStore, EVENTS_STORE } from '../../../src/modules/idb-store.js';
import {
  initStorage, createBoard, loadTasksForBoard,
  _flushPersistsForTesting, _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';
import { ingestEvent, EVENT_ORIGIN } from '../../../src/modules/event-sourcing/ingest.js';

let boardId;

beforeEach(async () => {
  _resetStorageForTesting();
  await deleteDB('kanvana-db');
  await initStorage();
  boardId = createBoard('Ingest').id;
  await _flushPersistsForTesting();
});

afterEach(async () => {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
});

function taskCreated(id, overrides = {}) {
  return {
    id: overrides.eventId || `evt-${id}`,
    type: 'task.created',
    hlc: { wallTime: Date.now(), counter: 0, nodeId: 'remote-node' },
    at: '2026-10-12T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: boardId,
    entity_id: id,
    payload: { task: { id, title: overrides.title || 'Remote task', column: 'todo' } },
  };
}

function captureDataChanged() {
  const seen = [];
  const handler = (e) => seen.push(e.detail);
  on(DATA_CHANGED, handler);
  return { seen, stop: () => off(DATA_CHANGED, handler) };
}

async function storedEvent(id) {
  const db = await openStore();
  return db.get(EVENTS_STORE, id);
}

describe('local events', () => {
  test('update the in-memory read model before scheduleDomainEvent() returns (ADR-0005 instant UI)', () => {
    const task = { id: 'local-task', title: 'Instant', column: 'todo' };
    scheduleDomainEvent({ type: 'task.created', boardId, entityId: task.id, payload: { task } });

    expect(loadTasksForBoard(boardId).map((t) => t.title)).toContain('Instant');
  });

  test('ingested with origin local are persisted unsynced for the outbound queue', async () => {
    const event = taskCreated('local-2', { eventId: 'evt-local-2' });
    ingestEvent(event, { origin: EVENT_ORIGIN.LOCAL });
    expect(loadTasksForBoard(boardId).map((t) => t.id)).toContain('local-2');

    await _flushPersistsForTesting();
    expect(await storedEvent('evt-local-2')).toMatchObject({ id: 'evt-local-2', synced: false });
  });
});

describe('remote events', () => {
  test('are projected, announced with DATA_CHANGED and persisted as synced', async () => {
    const changes = captureDataChanged();
    await ingestEvent(taskCreated('remote-1'), { origin: EVENT_ORIGIN.REMOTE });
    changes.stop();

    expect(loadTasksForBoard(boardId).map((t) => t.id)).toContain('remote-1');
    expect(changes.seen.map((d) => d.event?.id)).toEqual(['evt-remote-1']);
    expect(await storedEvent('evt-remote-1')).toMatchObject({ synced: true });
  });
});

describe('single path', () => {
  test('an event announced on the bus without ingest never reaches the read model', () => {
    emit(EVENT_EMITTED, taskCreated('bypass'));
    expect(loadTasksForBoard(boardId).map((t) => t.id)).not.toContain('bypass');
  });

  test('an echo of an already-ingested event changes nothing and announces nothing', async () => {
    const event = taskCreated('echoed');
    ingestEvent(event, { origin: EVENT_ORIGIN.LOCAL });
    const changes = captureDataChanged();
    await ingestEvent({ ...event, payload: { task: { id: 'echoed', title: 'Stale echo', column: 'todo' } } }, { origin: EVENT_ORIGIN.REMOTE });
    changes.stop();

    expect(changes.seen).toEqual([]);
    expect(loadTasksForBoard(boardId).filter((t) => t.id === 'echoed').map((t) => t.title)).toEqual(['Remote task']);
  });
});

// #181: malformed or hostile events are rejected before they are persisted or
// projected, for both origins. Rejection resolves (never throws) and logs once.
describe('rejected events', () => {
  async function expectRejected(event, origin = EVENT_ORIGIN.REMOTE) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const changes = captureDataChanged();
    const tasksBefore = loadTasksForBoard(boardId);
    await expect(ingestEvent(event, { origin })).resolves.toBeUndefined();
    await _flushPersistsForTesting();
    changes.stop();

    expect(changes.seen).toEqual([]);
    expect(loadTasksForBoard(boardId)).toEqual(tasksBefore);
    if (event?.id) expect(await storedEvent(event.id)).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  }

  test.each(['unknown.event', 'toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'an unknown type %s',
    async (type) => {
      await expectRejected({ ...taskCreated('bad-type'), id: `evt-type-${type}`, type });
    }
  );

  test.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '' }],
    ['a missing hlc', { hlc: undefined }],
    ['a string hlc', { hlc: '1000-0-node' }],
    ['an hlc with a non-numeric wallTime', { hlc: { wallTime: 'soon', counter: 0, nodeId: 'n' } }],
    ['an hlc with an infinite counter', { hlc: { wallTime: 1000, counter: Infinity, nodeId: 'n' } }],
    ['an hlc without a nodeId', { hlc: { wallTime: 1000, counter: 0, nodeId: '' } }],
    ['a scope outside board/global/timetracking', { scope: 'admin' }],
    ['a board-scope event without a board_id', { board_id: null }],
    ['a board-scope event with a non-string board_id', { board_id: 42 }],
  ])('%s', async (label, overrides) => {
    await expectRejected({ ...taskCreated('bad-envelope'), id: `evt-${label}`, ...overrides });
  });

  test('a malformed local event is rejected too', async () => {
    await expectRejected({ ...taskCreated('bad-local'), scope: 'nowhere' }, EVENT_ORIGIN.LOCAL);
  });
});

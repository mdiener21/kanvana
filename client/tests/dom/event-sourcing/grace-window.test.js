// #179: a late event inside the grace window is ordered in on both inbound
// paths (SSE and catch-up); one that reached the server more than a window
// after it was stamped is dropped on both, with one log line.
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { getPb } from '../../../src/modules/sync.js';
import { _resetIdbForTesting, openStore, EVENTS_STORE } from '../../../src/modules/idb-store.js';
import {
  initStorage,
  loadTasksForBoard,
  _flushPersistsForTesting,
  _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { _resetHlcForTesting } from '../../../src/modules/event-sourcing/hlc.js';
import { applyRemoteEvent, catchUp, recordToEvent, _resetRealtimeForTesting } from '../../../src/modules/event-sourcing/realtime.js';
import { GRACE_WINDOW_MS, saveSnapshot } from '../../../src/modules/event-sourcing/snapshot.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';
const BOARD = 'board-grace';
const TASK = 'task-1';

function hlc(counter) {
  return { wallTime: 1000, counter, nodeId: 'node-b' };
}

function record(local_id, type, counter, payload, entity_id = TASK) {
  return {
    id: `rec-${local_id}`, local_id, event_type: type, hlc: hlc(counter),
    at: '2026-10-01T00:00:00Z', actor_type: 'human', actor_id: null,
    board: BOARD, scope: 'board', entity_id, payload,
  };
}

// PocketBase's autodate format: the time the server received the event.
const receivedAfter = (ms) => new Date(1000 + ms).toISOString().replace('T', ' ');

const boardCreated = record('e-board', 'board.created', 10, { board: { name: 'Grace' } }, BOARD);
const taskCreated = record('e-task', 'task.created', 20, { task: { title: 'T0', column: 'todo', priority: 'none' } });
const newerEdit = record('e-new', 'task.updated', 40, { fields: { title: 'New' } });
const lateInsideWindow = record('e-late', 'task.updated', 30, { fields: { title: 'Mid', priority: 'high' } });
const olderThanWindow = { ...record('e-ancient', 'task.updated', 15, { fields: { priority: 'low' } }), created: receivedAfter(GRACE_WINDOW_MS + 1) };

const task = () => loadTasksForBoard(BOARD).find((t) => t.id === TASK);

async function stored(id) {
  return (await openStore()).get(EVENTS_STORE, id);
}

function serveEvents(records) {
  server.use(http.get(EVT_LIST, () => HttpResponse.json({ page: 1, perPage: 500, totalItems: records.length, totalPages: 1, items: records })));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

// The device has applied the board up to e-new. With `snapshot`, its snapshot
// covers up to hlc 25 and holds e-board and e-task; e-new is newer.
async function startDevice({ snapshot }) {
  await _resetRealtimeForTesting();
  _resetStorageForTesting();
  _resetIdbForTesting();
  _resetHlcForTesting();
  await deleteDB('kanvana-db');
  getPb().authStore.clear();
  await initStorage();

  await applyRemoteEvent(boardCreated);
  await applyRemoteEvent(taskCreated);
  if (snapshot) {
    const covered = [boardCreated, taskCreated].map(recordToEvent);
    await saveSnapshot(BOARD, applyEvents(createProjectionState(), covered), hlc(25));
    const db = await openStore();
    for (const event of covered) await db.delete(EVENTS_STORE, event.id);
  }
  await applyRemoteEvent(newerEdit);

  server.use(http.get(SNAP_LIST, () => HttpResponse.json({ page: 1, perPage: 500, totalItems: 0, totalPages: 1, items: [] })));
  getPb().authStore.save('test-token', { id: 'user1', email: 't@e.st' });
}

beforeEach(() => startDevice({ snapshot: true }));

afterEach(async () => {
  await _flushPersistsForTesting();
  await _resetRealtimeForTesting();
  server.resetHandlers();
  getPb().authStore.clear();
  vi.restoreAllMocks();
});

describe('a late event inside the grace window', () => {
  it('is ordered in when it arrives over SSE', async () => {
    await applyRemoteEvent(lateInsideWindow);

    expect(task()).toMatchObject({ title: 'New', priority: 'high' });
    expect(await stored('e-late')).toBeDefined();
  });

  it('is ordered in when it arrives through catch-up', async () => {
    serveEvents([newerEdit, lateInsideWindow]);
    await catchUp();

    expect(task()).toMatchObject({ title: 'New', priority: 'high' });
    expect(await stored('e-late')).toBeDefined();
  });
});

// A snapshot lags the grace window, so adopting one must keep what came after.
describe('adopting a server snapshot', () => {
  async function gzip(obj) {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(JSON.stringify(obj)));
    writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  it('rebuilds from it plus the stored events newer than it', async () => {
    const state = applyEvents(createProjectionState(), [boardCreated, taskCreated].map(recordToEvent));
    const bytes = await gzip({ ...state, appliedEventIds: [...state.appliedEventIds], taskTombstones: [] });
    server.use(
      http.get(SNAP_LIST, () => HttpResponse.json({ page: 1, perPage: 500, totalItems: 1, totalPages: 1, items: [
        { id: 'snap-1', collectionId: 'kanvana_snapshots', collectionName: 'snapshots', board_id: BOARD, hlc: hlc(25), payload: 'snapshot.json.gz' },
      ] })),
      http.get('*/api/files/:collection/:record/:filename', () => new HttpResponse(bytes)),
    );
    serveEvents([]);

    await catchUp();

    expect(task()).toMatchObject({ title: 'New' });
  });
});

describe('the drop decision', () => {
  const lateOnTime = { ...record('e-on-time', 'task.updated', 22, { fields: { priority: 'high' } }), created: receivedAfter(GRACE_WINDOW_MS - 1) };
  const tooLate = { ...record('e-too-late', 'task.updated', 23, { fields: { priority: 'low' } }), created: receivedAfter(GRACE_WINDOW_MS + 1) };

  async function viewAfterLateEvents({ snapshot }) {
    await startDevice({ snapshot });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await applyRemoteEvent(lateOnTime);
    await applyRemoteEvent(tooLate);
    await _flushPersistsForTesting();
    return { task: task(), onTime: Boolean(await stored('e-on-time')), tooLate: Boolean(await stored('e-too-late')) };
  }

  it('is the same on devices with different snapshot histories', async () => {
    const withSnapshot = await viewAfterLateEvents({ snapshot: true });
    const withoutSnapshot = await viewAfterLateEvents({ snapshot: false });

    expect(withSnapshot).toEqual(withoutSnapshot);
    expect(withSnapshot.task).toMatchObject({ title: 'New', priority: 'high' });
    expect(withSnapshot).toMatchObject({ onTime: true, tooLate: false });
  });

  it('applies an event without a server receipt time on every device', async () => {
    const unstamped = record('e-unstamped', 'task.updated', 19, { fields: { priority: 'low' } });

    await applyRemoteEvent(unstamped);

    expect(task()).toMatchObject({ title: 'New', priority: 'low' });
  });
});

describe('an event older than the grace window', () => {
  it('is dropped over SSE and through catch-up, logged once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await applyRemoteEvent(olderThanWindow);
    serveEvents([olderThanWindow, newerEdit]);
    await catchUp();
    await applyRemoteEvent(olderThanWindow);

    expect(task()).toMatchObject({ title: 'New', priority: 'none' });
    expect(await stored('e-ancient')).toBeUndefined();
    const drops = warn.mock.calls.filter(([message]) => String(message).includes('e-ancient'));
    expect(drops).toHaveLength(1);
  });

  it('is dropped silently when the snapshot already holds it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await applyRemoteEvent(taskCreated);

    expect(task()).toMatchObject({ title: 'New' });
    expect(warn.mock.calls.filter(([message]) => String(message).includes('e-task'))).toHaveLength(0);
  });
});

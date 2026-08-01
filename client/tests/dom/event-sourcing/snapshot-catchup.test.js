// Bug #4: uploadSnapshot() deletes the server events a snapshot covers, but
// catch-up only ever read the events collection. A device joining after that GC
// pulled an empty log and reconstructed nothing — the board's whole history was
// unreachable. Catch-up must hydrate from the snapshot, then replay what's newer.
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { getPb } from '../../../src/modules/sync.js';
import { _resetIdbForTesting } from '../../../src/modules/idb-store.js';
import {
  initStorage,
  listBoards,
  loadTasksForBoard,
  loadColumnsForBoard,
  _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { _resetHlcForTesting } from '../../../src/modules/event-sourcing/hlc.js';
import { catchUp, _resetRealtimeForTesting } from '../../../src/modules/event-sourcing/realtime.js';

const SNAP_LIST = '*/api/collections/snapshots/records';
const SNAP_FILE = '*/api/files/:collection/:record/:filename';
const EVT_LIST = '*/api/collections/events/records';

const BOARD = 'board-gomogi';

function setAuth(id = 'user1') {
  getPb().authStore.save('test-token', { id, email: 't@e.st' });
}

function hlc(counter, wallTime = 1000, nodeId = 'node-a') {
  return { wallTime, counter, nodeId };
}

function listResponse(items) {
  return HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });
}

const SNAPSHOT_BODY = {
  boards: [{ id: BOARD, name: 'GOMOGI', createdAt: '2026-01-01T00:00:00.000Z' }],
  tasks: [
    { id: 'task-1', title: 'TU Invoice number for bill', column: 'todo', order: 0 },
    { id: 'task-2', title: 'UNIVIE Offer decision', column: 'todo', order: 1 },
  ],
  columns: [{ id: 'todo', name: 'To Do', order: 0 }, { id: 'done', name: 'Done', order: 1 }],
  labels: [{ id: 'label-1', name: 'urgent' }],
  settings: {},
  globalSettings: {},
  appliedEventIds: [],
  taskTombstones: [],
};

async function gzip(obj) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(JSON.stringify(obj)));
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function snapRecord(hlcValue) {
  return {
    id: 'snap-1',
    collectionId: 'kanvana_snapshots',
    collectionName: 'snapshots',
    board_id: BOARD,
    hlc: hlcValue,
    payload: 'snapshot.json.gz',
  };
}

function eventRecord({ local_id, type, h, entity_id, payload = {} }) {
  return {
    id: `rec-${local_id}`, local_id, event_type: type, hlc: h,
    at: '2026-06-07T00:00:00Z', actor_type: 'human', actor_id: null,
    board: BOARD, scope: 'board', entity_id, payload,
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(async () => {
  await _resetRealtimeForTesting();
  _resetStorageForTesting();
  _resetIdbForTesting();
  _resetHlcForTesting();
  await deleteDB('kanvana-db');
  getPb().authStore.clear();
  await initStorage();
});

afterEach(async () => {
  await _resetRealtimeForTesting();
  server.resetHandlers();
  getPb().authStore.clear();
});

describe('catch-up with a server snapshot', () => {
  it('reconstructs a board whose events were GC-ed, from the snapshot alone', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord(hlc(100))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
      http.get(EVT_LIST, () => listResponse([])),
    );
    setAuth();

    await catchUp();

    expect(listBoards().map((b) => b.name)).toContain('GOMOGI');
    expect(loadTasksForBoard(BOARD).map((t) => t.title)).toEqual([
      'TU Invoice number for bill', 'UNIVIE Offer decision',
    ]);
    expect(loadColumnsForBoard(BOARD).map((c) => c.id)).toEqual(['todo', 'done']);
  });

  it('replays events newer than the snapshot on top of it', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord(hlc(100))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
      http.get(EVT_LIST, () => listResponse([
        eventRecord({
          local_id: 'evt-new', type: 'task.created', h: hlc(150), entity_id: 'task-3',
          payload: { task: { title: 'MazeMap Merger Aquisition', column: 'todo', order: 2 } },
        }),
      ])),
    );
    setAuth();

    await catchUp();

    expect(loadTasksForBoard(BOARD).map((t) => t.title)).toContain('MazeMap Merger Aquisition');
    expect(loadTasksForBoard(BOARD)).toHaveLength(3);
  });

  it('ignores events the snapshot already covers', async () => {
    const bytes = await gzip(SNAPSHOT_BODY);
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord(hlc(100))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
      http.get(EVT_LIST, () => listResponse([
        eventRecord({
          local_id: 'evt-stale', type: 'task.created', h: hlc(50), entity_id: 'task-stale',
          payload: { task: { title: 'Already in the snapshot', column: 'todo' } },
        }),
      ])),
    );
    setAuth();

    await catchUp();

    expect(loadTasksForBoard(BOARD).map((t) => t.title)).not.toContain('Already in the snapshot');
    expect(loadTasksForBoard(BOARD)).toHaveLength(2);
  });

  it('still replays events normally when the server has no snapshot', async () => {
    server.use(
      http.get(SNAP_LIST, () => listResponse([])),
      http.get(EVT_LIST, () => listResponse([
        eventRecord({
          local_id: 'evt-b', type: 'board.created', h: hlc(10), entity_id: BOARD,
          payload: { board: { id: BOARD, name: 'prod dev' } },
        }),
      ])),
    );
    setAuth();

    await catchUp();

    expect(listBoards().map((b) => b.name)).toContain('prod dev');
  });
});

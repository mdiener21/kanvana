// Bug #4: uploadSnapshot() deletes the server events a snapshot covers, but
// catch-up only ever read the events collection. A device joining after that GC
// pulled an empty log and reconstructed nothing — the board's whole history was
// unreachable. Catch-up must hydrate from the snapshot, then replay what's newer.
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { getPb } from '../../../src/modules/sync.js';
import { _resetIdbForTesting, openStore, getUnsyncedEvents, KV_STORE } from '../../../src/modules/idb-store.js';
import {
  initStorage,
  listBoards,
  loadTasksForBoard,
  loadColumnsForBoard,
  loadLabelsForBoard,
  loadGlobalSettings,
  loadTimeTracking,
  _flushPersistsForTesting,
  _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import { _resetHlcForTesting } from '../../../src/modules/event-sourcing/hlc.js';
import { catchUp, LAST_SEEN_PREFIX, _resetRealtimeForTesting } from '../../../src/modules/event-sourcing/realtime.js';
import { scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';

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
  it('does not discover unrelated boards from a board-scoped snapshot', async () => {
    const bytes = await gzip({
      ...SNAPSHOT_BODY,
      boards: [...SNAPSHOT_BODY.boards, { id: 'unrelated-db', name: 'db' }],
    });
    server.use(
      http.get(SNAP_LIST, () => listResponse([snapRecord(hlc(100))])),
      http.get(SNAP_FILE, () => new HttpResponse(bytes)),
      http.get(EVT_LIST, () => listResponse([])),
    );
    setAuth();

    await catchUp();

    expect(listBoards().map(board => board.name)).toEqual(['GOMOGI']);
    expect(loadColumnsForBoard(BOARD).map(column => column.name)).toEqual(['To Do', 'Done']);
  });

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

  it('ignores events the snapshot already holds', async () => {
    const bytes = await gzip({ ...SNAPSHOT_BODY, appliedEventIds: ['evt-stale'] });
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

  it('hydrates a timetracking snapshot into the time-tracking slot, not a board', async () => {
    const slot = { customers: [{ id: 'c1', name: 'Acme' }], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } };
    const boardBytes = await gzip(SNAPSHOT_BODY);
    const ttBytes = await gzip({ ...SNAPSHOT_BODY, boards: [], tasks: [], columns: [], labels: [], timeTracking: slot });
    server.use(
      http.get(SNAP_LIST, () => listResponse([
        snapRecord(hlc(100)),
        { ...snapRecord(hlc(120)), id: 'snap-tt', board_id: '__timetracking__' },
      ])),
      http.get(SNAP_FILE, ({ params }) => new HttpResponse(params.record === 'snap-tt' ? ttBytes : boardBytes)),
      http.get(EVT_LIST, () => listResponse([])),
    );
    setAuth();

    await catchUp();

    await _flushPersistsForTesting();
    const db = await openStore();
    // The projector persists the time-tracking read model under its own KV key.
    expect(await db.get(KV_STORE, 'kanvana:timetracking')).toEqual(slot);
    expect(listBoards().map((b) => b.id)).toEqual([BOARD]);
    expect(loadTasksForBoard(BOARD)).toHaveLength(2);
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}__timetracking__`)).toEqual(hlc(120));
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

// #180: adopting a server snapshot rebuilds the key from the snapshot plus this
// device's stored newer events, so unsynced local edits stay on screen.
describe('adopting a snapshot keeps newer local edits', () => {
  const TT_SLOT = { customers: [{ id: 'c-remote', name: 'Remote Co' }], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } };
  const EMPTY = { ...SNAPSHOT_BODY, boards: [], tasks: [], columns: [], labels: [] };

  function serveSnapshots(snapshots) {
    const bytes = new Map(snapshots.map((s) => [s.id, s.bytes]));
    server.use(
      http.get(SNAP_LIST, () => listResponse(snapshots.map((s) => ({ ...snapRecord(s.hlc), id: s.id, board_id: s.key })))),
      http.get(SNAP_FILE, ({ params }) => new HttpResponse(bytes.get(params.record))),
      http.get(EVT_LIST, () => listResponse([])),
    );
  }

  async function localEdit(input) {
    await scheduleDomainEvent(input);
    await _flushPersistsForTesting();
    const [event] = (await getUnsyncedEvents()).filter((e) => e.type === input.type);
    return event;
  }

  async function queuedIds() {
    return (await getUnsyncedEvents()).map((e) => e.id);
  }

  function later(h) {
    return { ...h, wallTime: h.wallTime + 60_000 };
  }

  it('board: a reconnect adopting a snapshot older than an unsynced edit keeps the edit visible and queued', async () => {
    serveSnapshots([{ id: 'snap-1', key: BOARD, hlc: hlc(100), bytes: await gzip(SNAPSHOT_BODY) }]);
    setAuth();
    await catchUp();

    const edit = await localEdit({
      type: 'task.created', boardId: BOARD, entityId: 'task-local',
      payload: { task: { title: 'Unsynced local task', column: 'todo', order: 2 } },
    });

    const remote = { ...SNAPSHOT_BODY, tasks: [...SNAPSHOT_BODY.tasks, { id: 'task-remote', title: 'From another device', column: 'todo', order: 3 }] };
    serveSnapshots([{ id: 'snap-2', key: BOARD, hlc: hlc(200), bytes: await gzip(remote) }]);
    await catchUp();

    expect(loadTasksForBoard(BOARD).map((t) => t.title)).toEqual(expect.arrayContaining([
      'TU Invoice number for bill', 'UNIVIE Offer decision', 'From another device', 'Unsynced local task',
    ]));
    expect(await queuedIds()).toContain(edit.id);
  });

  it('board: a snapshot newer than every local event becomes the view', async () => {
    serveSnapshots([{ id: 'snap-1', key: BOARD, hlc: hlc(100), bytes: await gzip(SNAPSHOT_BODY) }]);
    setAuth();
    await catchUp();
    const edit = await localEdit({
      type: 'task.created', boardId: BOARD, entityId: 'task-local',
      payload: { task: { title: 'Local task', column: 'todo', order: 2 } },
    });

    const tasks = [{ id: 'task-local', title: 'Local task, renamed remotely', column: 'todo', order: 0 }];
    const snapshot = { ...SNAPSHOT_BODY, tasks, appliedEventIds: [edit.id] };
    serveSnapshots([{ id: 'snap-2', key: BOARD, hlc: later(edit.hlc), bytes: await gzip(snapshot) }]);
    await catchUp();

    expect(loadTasksForBoard(BOARD)).toEqual(tasks);
    expect(loadColumnsForBoard(BOARD)).toEqual(SNAPSHOT_BODY.columns);
  });

  it('board: an entity a stored event created but the newer snapshot dropped is gone', async () => {
    serveSnapshots([{ id: 'snap-1', key: BOARD, hlc: hlc(100), bytes: await gzip(SNAPSHOT_BODY) }]);
    server.use(http.get(EVT_LIST, () => listResponse([
      eventRecord({ local_id: 'evt-label', type: 'label.created', h: hlc(150), entity_id: 'label-2', payload: { label: { name: 'later', color: '#123456' } } }),
    ])));
    setAuth();
    await catchUp();
    expect(loadLabelsForBoard(BOARD).map((l) => l.id)).toContain('label-2');

    serveSnapshots([{ id: 'snap-2', key: BOARD, hlc: hlc(200), bytes: await gzip({ ...SNAPSHOT_BODY, appliedEventIds: ['evt-label'] }) }]);
    await catchUp();

    expect(loadLabelsForBoard(BOARD)).toEqual(SNAPSHOT_BODY.labels);
  });

  it('global: adopting a snapshot older than an unsynced settings edit keeps the edit', async () => {
    const edit = await localEdit({
      type: 'settings.updated', scope: 'global', entityId: 'timeTracking', payload: { fields: { timeTracking: { dateFormat: 'local' } } },
    });

    serveSnapshots([{ id: 'snap-g', key: '', hlc: hlc(100), bytes: await gzip({ ...EMPTY, globalSettings: { timeTracking: { dateFormat: 'remote', timezone: 'Europe/Vienna' } } }) }]);
    setAuth();
    await catchUp();

    expect(loadGlobalSettings().timeTracking).toEqual({ dateFormat: 'local' });
    expect(await queuedIds()).toContain(edit.id);
  });

  it('global: a snapshot newer than every local event becomes the view', async () => {
    const edit = await localEdit({
      type: 'settings.updated', scope: 'global', entityId: 'timeTracking', payload: { fields: { timeTracking: { dateFormat: 'local' } } },
    });

    serveSnapshots([{ id: 'snap-g', key: '', hlc: later(edit.hlc), bytes: await gzip({ ...EMPTY, globalSettings: { timeTracking: { dateFormat: 'remote', timezone: 'Europe/Vienna' } }, appliedEventIds: [edit.id] }) }]);
    setAuth();
    await catchUp();

    expect(loadGlobalSettings().timeTracking).toEqual({ dateFormat: 'remote', timezone: 'Europe/Vienna' });
  });

  it('time tracking: adopting a snapshot older than an unsynced edit keeps the edit', async () => {
    const edit = await localEdit({
      type: 'customer.created', scope: 'timetracking', entityId: 'c-local',
      payload: { customer: { id: 'c-local', name: 'Local Co' } },
    });

    serveSnapshots([{ id: 'snap-tt', key: '__timetracking__', hlc: hlc(100), bytes: await gzip({ ...EMPTY, timeTracking: TT_SLOT }) }]);
    setAuth();
    await catchUp();

    expect(loadTimeTracking().customers.map((c) => c.name)).toEqual(expect.arrayContaining(['Remote Co', 'Local Co']));
    expect(await queuedIds()).toContain(edit.id);
  });

  it('time tracking: a snapshot newer than every local event becomes the view', async () => {
    const edit = await localEdit({
      type: 'customer.created', scope: 'timetracking', entityId: 'c-local',
      payload: { customer: { id: 'c-local', name: 'Local Co' } },
    });

    serveSnapshots([{ id: 'snap-tt', key: '__timetracking__', hlc: later(edit.hlc), bytes: await gzip({ ...EMPTY, timeTracking: TT_SLOT, appliedEventIds: [edit.id] }) }]);
    setAuth();
    await catchUp();

    expect(loadTimeTracking()).toEqual(TT_SLOT);
  });
});

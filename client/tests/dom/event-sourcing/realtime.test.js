// Inbound sync: SSE subscription + catch-up pull (issue #114, AC-001..007).
// PB realtime is stubbed at pb.realtime.subscribe; catch-up runs over MSW.
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { DATA_CHANGED, EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import { getPb } from '../../../src/modules/sync.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';
import { addTask, moveTaskToTopInColumn } from '../../../src/modules/tasks.js';
import {
  getUnsyncedEvents,
  openStore,
  KV_STORE,
  _resetIdbForTesting,
} from '../../../src/modules/idb-store.js';
import {
  initStorage,
  createBoard,
  deleteBoard,
  listBoards,
  setActiveBoardId,
  loadColumnsForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadTasksForBoard,
  renameBoard,
  _flushPersistsForTesting,
  _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import {
  MAX_DRIFT_MS,
  emitLocal,
  _setHlcForTesting,
  _resetHlcForTesting,
} from '../../../src/modules/event-sourcing/hlc.js';
import {
  applyRemoteEvent,
  startRealtime,
  stopRealtime,
  catchUp,
  initRealtime,
  LAST_SEEN_PREFIX,
  _resetRealtimeForTesting,
} from '../../../src/modules/event-sourcing/realtime.js';

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';

function setAuth(id = 'user1') {
  getPb().authStore.save('test-token', { id, email: 't@e.st' });
}

function hlc(counter, wallTime = 1000, nodeId = 'node-a') {
  return { wallTime, counter, nodeId };
}

function record({ local_id, type = 'board.created', h, board = 'board-1', scope = 'board', payload = {} }) {
  return { id: `rec-${local_id}`, local_id, event_type: type, hlc: h, at: '2026-06-07T00:00:00Z', actor_type: 'human', actor_id: null, board, scope, entity_id: board, payload };
}

function listResponse(items) {
  return HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });
}

// Stub PB realtime so no real EventSource is opened.
function stubRealtime() {
  const calls = [];
  let unsubs = 0;
  getPb().realtime.subscribe = async (topic, cb, opts) => {
    calls.push({ topic, opts, cb });
    return async () => { unsubs += 1; };
  };
  return { calls, unsubCount: () => unsubs };
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

describe('realtime subscription', () => {
  it('AC-001: opens exactly one owner-filtered subscription; second call is a no-op', async () => {
    const rt = stubRealtime();
    setAuth();
    await Promise.all([startRealtime(), startRealtime()]);
    await startRealtime();
    expect(rt.calls.map(call => call.topic)).toEqual(['PB_CONNECT', 'events/*']);
    expect(rt.calls[1].opts.filter).toBe('owner = "user1"');
  });

  it('AC-002: stopRealtime closes the subscription', async () => {
    const rt = stubRealtime();
    setAuth();
    await startRealtime();
    await stopRealtime();
    expect(rt.unsubCount()).toBe(2);
  });

  it('does not subscribe when unauthenticated', async () => {
    const rt = stubRealtime();
    await startRealtime();
    expect(rt.calls).toHaveLength(0);
  });
});

describe('applyRemoteEvent', () => {
  it('AC-003/AC-007: projects, emits EVENT_EMITTED, advances HLC, stores as synced', async () => {
    const emitted = [];
    const handler = (e) => emitted.push(e.detail);
    on(EVENT_EMITTED, handler);

    const future = Date.now() + 30_000; // within the drift limit
    await applyRemoteEvent(record({ local_id: 'r1', h: { wallTime: future, counter: 2, nodeId: 'remote' }, payload: { board: { name: 'Remote' } } }));
    off(EVENT_EMITTED, handler);

    // projection ran
    expect(listBoards().some(b => b.id === 'board-1')).toBe(true);
    // EVENT_EMITTED fired through the local pipeline
    expect(emitted.map(e => e.id)).toContain('r1');
    // stored as already-synced (never re-pushed)
    expect(await getUnsyncedEvents()).toHaveLength(0);
    // HLC observed the future remote wall time
    expect((await emitLocal()).wallTime).toBe(future);
  });

  it('a remote HLC far in the future is rejected and does not advance the local clock (#181)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = Date.now();
    await applyRemoteEvent(record({ local_id: 'r-future', h: { wallTime: before + 365 * 86_400_000, counter: 0, nodeId: 'remote' }, payload: { board: { name: 'Future' } } }));
    expect(listBoards().some(b => b.id === 'board-1')).toBe(false);
    expect((await emitLocal()).wallTime).toBeLessThanOrEqual(Date.now() + MAX_DRIFT_MS);
  });

  it('AC-004: an echo of an already-applied event is a no-op in the projection', async () => {
    const rec = record({ local_id: 'r-echo', h: hlc(1), payload: { board: { name: 'Once' } } });
    await applyRemoteEvent(rec);
    await applyRemoteEvent(rec);
    expect(listBoards().filter(b => b.id === 'board-1')).toHaveLength(1);
    expect(await getUnsyncedEvents()).toHaveLength(0);
  });

  it('AC-004 after a reload: an SSE echo of an edit applied before the reload does not undo a newer edit (#178)', async () => {
    const board = 'b0a4d000-0000-4000-8000-000000000178';
    await applyRemoteEvent(record({ local_id: 'r-create', board, h: hlc(1), payload: { board: { name: 'Shared' } } }));
    const e1 = record({ local_id: 'r-e1', type: 'board.updated', board, h: hlc(2), payload: { fields: { name: 'E1' } } });
    await applyRemoteEvent(e1);
    await _flushPersistsForTesting();
    _resetStorageForTesting();
    await initStorage();

    renameBoard(board, 'E2');
    await applyRemoteEvent(e1);

    expect(listBoards().find(b => b.id === board).name).toBe('E2');
  });

  it('projects a live timetracking event into the time-tracking slot, never into a board', async () => {
    const boardsBefore = listBoards();
    // A board-shaped payload proves the scope, not the type, decides the projection.
    await applyRemoteEvent(record({ local_id: 'tt1', h: hlc(1), board: '', scope: 'timetracking', payload: { board: { name: 'Leak' } } }));
    await _flushPersistsForTesting();

    expect(listBoards()).toEqual(boardsBefore);
    const db = await openStore();
    expect(await db.get(KV_STORE, 'kanvana:timetracking')).toEqual({ customers: [], projects: [], timeEntries: [], tombstones: { customers: {}, projects: {} } });
    expect(await getUnsyncedEvents()).toHaveLength(0);
  });
});

describe('catch-up pull', () => {
  // Catch-up hydrates from server snapshots before replaying events; these cases
  // cover the event path, so the snapshot scope is empty.
  beforeEach(() => {
    server.use(http.get(SNAP_LIST, () => listResponse([])));
  });

  it('discovers all account boards even while the realtime connection is pending', async () => {
    let release;
    getPb().realtime.subscribe = async (topic) => {
      if (topic === 'PB_CONNECT') return async () => {};
      return new Promise(resolve => { release = () => resolve(async () => {}); });
    };
    server.use(http.get(EVT_LIST, ({ request }) => {
      expect(new URL(request.url).searchParams.get('filter')).toBe('owner = "user1"');
      return listResponse([
        record({ local_id: 'device-a', board: 'board-a', h: hlc(1), payload: { board: { name: 'Device A' } } }),
        record({ local_id: 'device-b', board: 'board-b', h: hlc(2), payload: { board: { name: 'Device B' } } }),
      ]);
    }));
    initRealtime();
    setAuth();
    try {
      await waitFor(() => expect(listBoards().map(b => b.name)).toEqual(['Device A', 'Device B']));
    } finally {
      release();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });

  it('downloads boards when realtime subscription fails', async () => {
    getPb().realtime.subscribe = async () => { throw new Error('SSE unavailable'); };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'remote-board', h: hlc(1), payload: { board: { name: 'Remote' } } }),
    ])));
    initRealtime();
    setAuth();
    try {
      await waitFor(() => expect(listBoards().map(b => b.name)).toContain('Remote'));
    } finally {
      log.mockRestore();
    }
  });

  it('fetches boards missed during an automatic SSE reconnect', async () => {
    const rt = stubRealtime();
    setAuth();
    await startRealtime();
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'missed', h: hlc(1), payload: { board: { name: 'Created while disconnected' } } }),
    ])));
    const connect = rt.calls.find(call => call.topic === 'PB_CONNECT');
    expect(connect).toBeDefined();
    await connect.cb({});
    await waitFor(() => expect(listBoards().map(b => b.name)).toContain('Created while disconnected'));
  });

  it('does not skip a delayed board creation older than the catch-up watermark', async () => {
    const newer = record({ local_id: 'task', type: 'task.created', h: hlc(2), payload: { task: { title: 'Already uploaded' } } });
    server.use(http.get(EVT_LIST, () => listResponse([newer])));
    setAuth();
    await catchUp();
    server.use(http.get(EVT_LIST, () => listResponse([
      newer,
      record({ local_id: 'late-create', h: hlc(1), payload: { board: { name: 'Delayed board' } } }),
    ])));
    await catchUp();
    expect(listBoards().map(b => b.id)).toContain('board-1');
    const db = await openStore();
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}board-1`)).toEqual(hlc(2));
  });

  it('AC-005: pulls events > lastSeenHlc, applies in order, advances lastSeenHlc atomically', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'c2', h: hlc(2), payload: { board: { name: 'B' } } }),
      record({ local_id: 'c1', h: hlc(1), payload: { board: { name: 'B' } } }),
    ])));
    setAuth();

    const emitted = [];
    const handler = (e) => emitted.push(e.detail.id);
    on(EVENT_EMITTED, handler);
    await catchUp();
    off(EVENT_EMITTED, handler);

    expect(emitted).toEqual(['c1', 'c2']); // HLC order
    expect(await getUnsyncedEvents()).toHaveLength(0);

    const db = await openStore();
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}board-1`)).toEqual(hlc(2));
  });

  // Each DATA_CHANGED is a full board render; one per pulled event made a large catch-up crawl.
  it('signals DATA_CHANGED once for the whole pulled batch', async () => {
    const tasks = Array.from({ length: 30 }, (_, i) => ({
      ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
      entity_id: `task-${i}`,
    }));
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Big' } } }),
      ...tasks,
    ])));
    setAuth();

    let changes = 0;
    const handler = () => { changes += 1; };
    on(DATA_CHANGED, handler);
    await catchUp();
    off(DATA_CHANGED, handler);

    expect(listBoards().map(b => b.name)).toContain('Big');
    expect(changes).toBe(1);
  });

  // The board's full task list was rewritten after every pulled event (#237).
  it('saves each part of a caught-up board once per batch, not once per event', async () => {
    const tasks = Array.from({ length: 20 }, (_, i) => ({
      ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
      entity_id: `task-${i}`,
    }));
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Big' } } }),
      ...tasks,
    ])));
    setAuth();
    await _flushPersistsForTesting();

    const writes = new Map();
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (this.name === 'read_model' || ['kanbanBoards', 'kanbanBoard:board-1:settings', 'kanvana:ingest:newestAppliedHlc'].includes(key)) {
        writes.set(key, (writes.get(key) ?? 0) + 1);
      }
      return originalPut.call(this, value, key);
    });
    try {
      await catchUp();
      await _flushPersistsForTesting();
    } finally {
      put.mockRestore();
    }

    expect(loadTasksForBoard('board-1')).toHaveLength(20);
    expect(Object.fromEntries(writes)).toEqual({
      'board-1:tasks': 1,
      'board-1:columns': 1,
      'board-1:labels': 1,
      'board-1:taskTombstones': 1,
      'board-1:appliedEventIds': 1,
      kanbanBoards: 1,
      'kanbanBoard:board-1:settings': 1,
      'kanvana:ingest:newestAppliedHlc': 1,
    });
  });

  it('saves a local edit made during a catch-up at once, not when the batch ends', async () => {
    const localBoard = createBoard('Local').id;
    await _flushPersistsForTesting();
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Remote' } } }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();

    let caughtUp = false;
    let savedDuringBatch;
    const editOnce = (e) => {
      if (e.detail.id !== 'b') return;
      off(EVENT_EMITTED, editOnce);
      queueMicrotask(async () => {
        addTask('Written offline', '', 'none', '', 'todo');
        await _flushPersistsForTesting();
        const db = await openStore();
        savedDuringBatch = { caughtUp, tasks: await db.get('read_model', `${localBoard}:tasks`) };
      });
    };
    on(EVENT_EMITTED, editOnce);
    const done = catchUp().then(() => { caughtUp = true; });
    await waitFor(() => expect(savedDuringBatch).toBeDefined());
    await done;

    expect(savedDuringBatch.caughtUp).toBe(false);
    expect(savedDuringBatch.tasks.map(t => t.title)).toContain('Written offline');
  });

  it('saves the boards a catch-up has touched so far when the page is hidden', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Remote' } } }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();

    let caughtUp = false;
    let savedOnHide;
    const hideOnce = (e) => {
      if (e.detail.id !== 't4') return;
      off(EVENT_EMITTED, hideOnce);
      queueMicrotask(async () => {
        window.dispatchEvent(new Event('pagehide'));
        await _flushPersistsForTesting();
        const db = await openStore();
        savedOnHide = { caughtUp, tasks: await db.get('read_model', 'board-1:tasks') };
      });
    };
    on(EVENT_EMITTED, hideOnce);
    const done = catchUp().then(() => { caughtUp = true; });
    await waitFor(() => expect(savedOnHide).toBeDefined());
    await done;

    expect(savedOnHide.caughtUp).toBe(false);
    expect(savedOnHide.tasks.map(t => t.title)).toContain('Task 4');
  });


  // The batch applies each board's events as one list (#238); a local edit made meanwhile must still see them.
  it('a local edit made during a catch-up applies on top of the events the batch already took in', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Remote' } } }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();

    let edited;
    const editOnce = (e) => {
      if (e.detail.id !== 't9') return;
      off(EVENT_EMITTED, editOnce);
      edited = ingestEvent({
        id: 'local-edit', type: 'task.updated', hlc: hlc(0, Date.now()), at: new Date().toISOString(),
        actor: { type: 'human', id: null }, scope: 'board', board_id: 'board-1', entity_id: 'task-0',
        payload: { fields: { title: 'Edited meanwhile' } },
      }, { origin: EVENT_ORIGIN.LOCAL });
    };
    on(EVENT_EMITTED, editOnce);
    await catchUp();
    await edited;

    expect(loadTasksForBoard('board-1')).toHaveLength(10);
    expect(loadTasksForBoard('board-1').find(t => t.id === 'task-0').title).toBe('Edited meanwhile');
  });

  it('a local command issued during a catch-up builds on the events the batch already took in', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Remote' } } }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();

    let moved;
    const moveOnce = (e) => {
      if (e.detail.id !== 't9') return;
      off(EVENT_EMITTED, moveOnce);
      setActiveBoardId('board-1');
      moveTaskToTopInColumn('task-9', 'todo');
    };
    const captureMove = (e) => {
      if (e.detail.type === 'task.moved') moved = e.detail;
    };
    on(EVENT_EMITTED, moveOnce);
    on(EVENT_EMITTED, captureMove);
    await catchUp();
    off(EVENT_EMITTED, captureMove);

    expect(moved.board_id).toBe('board-1');
    expect(moved.payload.order).toHaveLength(10);
    expect(moved.payload.order.find(entry => entry.id === 'task-9').order).toBe(1);
    expect(loadTasksForBoard('board-1').find(t => t.id === 'task-9').order).toBe(1);
  });

  it('a board deleted during a catch-up stays deleted when the batch ends', async () => {
    const keep = createBoard('Keep').id;
    // A clock ahead of this device keeps the events after the delete in order rather than late.
    const ahead = Date.now() + 30_000;
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1, ahead), payload: { board: { name: 'Remote' } } }),
      ...Array.from({ length: 10 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc((i + 2) * 10, ahead), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();

    const deleteOnce = (e) => {
      if (e.detail.id !== 't4') return;
      off(EVENT_EMITTED, deleteOnce);
      deleteBoard('board-1');
    };
    on(EVENT_EMITTED, deleteOnce);
    await catchUp();
    await _flushPersistsForTesting();

    expect(listBoards().map(b => b.id)).toContain(keep);
    expect(listBoards().map(b => b.id)).not.toContain('board-1');
    expect(loadTasksForBoard('board-1')).toEqual([]);
    const db = await openStore();
    expect(await db.get('read_model', 'board-1:tasks')).toBeUndefined();
  });

  it('a reload after a catch-up shows the same board', async () => {
    const board = 'b0a4d000-0000-4000-8000-000000000237';
    const doing = 'a6bd8bf6-220d-44ed-82db-77d8133573a1';
    const done = '4918ed87-fd87-4870-ba1c-18e0ffced28a';
    const keep = 'c0a4d000-0000-4000-8000-000000000001';
    const gone = 'c0a4d000-0000-4000-8000-000000000002';
    const pulled = [
      record({ local_id: 'b', board, h: hlc(1), payload: { board: { name: 'Synced', createdAt: '2026-06-07T00:00:00.000Z' } } }),
      { ...record({ local_id: 'c', type: 'column.created', board, h: hlc(2), payload: { column: { name: 'Doing', order: 1, color: '#3b82f6', collapsed: false, wipLimit: 0 } } }), entity_id: doing },
      { ...record({ local_id: 'cd', type: 'column.created', board, h: hlc(2, 1001), payload: { column: { name: 'Done', order: 2, role: 'done', color: '#16a34a', collapsed: false, wipLimit: 0 } } }), entity_id: done },
      { ...record({ local_id: 'l', type: 'label.created', board, h: hlc(3), payload: { label: { name: 'Bug', color: '#f00', group: '' } } }), entity_id: '95c69be2-84b6-4d83-ab98-c7f239bae63f' },
      record({ local_id: 's', type: 'settings.updated', board, h: hlc(4), payload: { fields: { showPriority: false, swimLaneCellCollapsedKeys: [], swimLaneCollapsedKeys: [], swimLaneOrder: [] } } }),
      { ...record({ local_id: 't1', type: 'task.created', board, h: hlc(5), payload: { task: { title: 'Keep', column: doing, labels: [], relationships: [] } } }), entity_id: keep },
      { ...record({ local_id: 't2', type: 'task.created', board, h: hlc(6), payload: { task: { title: 'Gone', column: doing, labels: [], relationships: [] } } }), entity_id: gone },
      { ...record({ local_id: 'u1', type: 'task.updated', board, h: hlc(7), payload: { fields: { title: 'Kept' } } }), entity_id: keep },
      { ...record({ local_id: 'd2', type: 'task.deleted', board, h: hlc(8) }), entity_id: gone },
    ];
    server.use(http.get(EVT_LIST, () => listResponse(pulled)));
    setAuth();
    await catchUp();
    const before = {
      boards: listBoards(),
      tasks: loadTasksForBoard(board),
      columns: loadColumnsForBoard(board),
      labels: loadLabelsForBoard(board),
      settings: loadSettingsForBoard(board),
    };

    _resetStorageForTesting();
    await initStorage();

    expect({
      boards: listBoards(),
      tasks: loadTasksForBoard(board),
      columns: loadColumnsForBoard(board),
      labels: loadLabelsForBoard(board),
      settings: loadSettingsForBoard(board),
    }).toEqual(before);
    expect(before.tasks.map(t => t.title)).toEqual(['Kept']);
    const db = await openStore();
    expect((await db.get('read_model', `${board}:appliedEventIds`)).sort()).toEqual(pulled.map(r => r.local_id).sort());
    // The tombstone survived the reload: a re-created deleted task stays deleted.
    await applyRemoteEvent({ ...record({ local_id: 'again', type: 'task.created', board, h: hlc(9), payload: { task: { title: 'Gone', column: doing } } }), entity_id: gone });
    expect(loadTasksForBoard(board).map(t => t.title)).toEqual(['Kept']);
  });

  it('advances the catch-up watermark only after the board read model is stored', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Synced' } } }),
      ...Array.from({ length: 5 }, (_, i) => ({
        ...record({ local_id: `t${i}`, type: 'task.created', h: hlc(i + 2), payload: { task: { title: `Task ${i}`, column: 'todo' } } }),
        entity_id: `task-${i}`,
      })),
    ])));
    setAuth();
    await _flushPersistsForTesting();

    const log = [];
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (key === `${LAST_SEEN_PREFIX}board-1`) log.push('watermark');
      const request = originalPut.call(this, value, key);
      if (this.name === 'read_model') request.addEventListener('success', () => log.push(`stored ${key}`));
      return request;
    });
    try {
      await catchUp();
    } finally {
      put.mockRestore();
    }

    expect(log.at(-1)).toBe('watermark');
    expect(log).toEqual(expect.arrayContaining(['stored board-1:tasks', 'stored board-1:appliedEventIds']));
  });

  it('signals no DATA_CHANGED when the pulled batch is already stored', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b', h: hlc(1), payload: { board: { name: 'Seen' } } }),
    ])));
    setAuth();
    await catchUp();

    let changes = 0;
    const handler = () => { changes += 1; };
    on(DATA_CHANGED, handler);
    await catchUp();
    off(DATA_CHANGED, handler);

    expect(changes).toBe(0);
  });

  it('a poison event among good ones is skipped: good ones applied, poison not persisted, logged once (#181)', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'good-1', h: hlc(1), payload: { board: { name: 'Good' } } }),
      record({ local_id: 'poison-type', type: 'constructor', h: hlc(2) }),
      record({ local_id: 'poison-hlc', type: 'task.created', h: 'not-an-hlc', payload: { task: { title: 'Bad' } } }),
      record({ local_id: 'poison-far', type: 'customer.created', h: hlc(0, 9_999_999_999_999), board: '', scope: 'timetracking' }),
      { ...record({ local_id: 'good-2', type: 'task.created', h: hlc(3), payload: { task: { title: 'Survivor', column: 'todo' } } }), entity_id: 'task-good' },
    ])));
    setAuth();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await catchUp();
    await catchUp();
    await _flushPersistsForTesting();

    expect(listBoards().map(b => b.name)).toContain('Good');
    const db = await openStore();
    expect(await db.get('events', 'good-1')).toBeDefined();
    expect(await db.get('events', 'good-2')).toBeDefined();
    for (const id of ['poison-type', 'poison-hlc', 'poison-far']) {
      expect(await db.get('events', id)).toBeUndefined();
      expect(error.mock.calls.filter(([msg]) => String(msg).includes(id))).toHaveLength(1);
    }
    // The watermark moves past the batch, and a rejected event never sets one.
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}board-1`)).toEqual(hlc(3));
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}__timetracking__`)).toBeUndefined();
    error.mockRestore();
  });

  it('ingests timetracking events under their own watermark without touching boards', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'b1', h: hlc(1), payload: { board: { name: 'B' } } }),
      { ...record({ local_id: 't1', type: 'customer.created', h: hlc(3), board: '', scope: 'timetracking', payload: { customer: { name: 'Acme' } } }), entity_id: 'customer-1' },
      { ...record({ local_id: 'g1', type: 'settings.updated', h: hlc(2), board: '', scope: 'global', payload: { fields: { locale: 'de-DE' } } }), entity_id: 'global' },
    ])));
    setAuth();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const emitted = [];
    const handler = (e) => emitted.push(e.detail);
    on(EVENT_EMITTED, handler);
    await catchUp();
    await catchUp(); // dedup: a second pull re-ingests nothing
    off(EVENT_EMITTED, handler);
    warn.mockRestore();

    expect(emitted.map(e => e.id)).toEqual(['b1', 'g1', 't1']);
    expect(emitted.find(e => e.id === 't1')).toMatchObject({ scope: 'timetracking', board_id: null });
    expect(listBoards().map(b => b.id)).toEqual(['board-1']);
    expect(await getUnsyncedEvents()).toHaveLength(0);

    const db = await openStore();
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}__timetracking__`)).toEqual(hlc(3));
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}__global__`)).toEqual(hlc(2));
    expect(await db.get(KV_STORE, `${LAST_SEEN_PREFIX}board-1`)).toEqual(hlc(1));
    expect(await db.get(KV_STORE, LAST_SEEN_PREFIX)).toBeUndefined();
  });

  it('AC-005/AC-006: re-running catch-up applies nothing new (idempotent overlap)', async () => {
    server.use(http.get(EVT_LIST, () => listResponse([
      record({ local_id: 'c1', h: hlc(1), payload: { board: { name: 'B' } } }),
    ])));
    setAuth();
    await catchUp();

    const emitted = [];
    const handler = (e) => emitted.push(e.detail.id);
    on(EVENT_EMITTED, handler);
    await catchUp();
    off(EVENT_EMITTED, handler);

    expect(emitted).toHaveLength(0);
  });
});

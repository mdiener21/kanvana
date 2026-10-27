// Inbound sync: SSE subscription + catch-up pull (issue #114, AC-001..007).
// PB realtime is stubbed at pb.realtime.subscribe; catch-up runs over MSW.
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { DATA_CHANGED, EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
import { getPb } from '../../../src/modules/sync.js';
import {
  getUnsyncedEvents,
  openStore,
  KV_STORE,
  _resetIdbForTesting,
} from '../../../src/modules/idb-store.js';
import {
  initStorage,
  listBoards,
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

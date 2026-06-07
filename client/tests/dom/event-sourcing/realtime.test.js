// Inbound sync: SSE subscription + catch-up pull (issue #114, AC-001..007).
// PB realtime is stubbed at pb.realtime.subscribe; catch-up runs over MSW.
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { EVENT_EMITTED, on, off } from '../../../src/modules/events.js';
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
  _resetStorageForTesting,
} from '../../../src/modules/storage.js';
import {
  emitLocal,
  _setHlcForTesting,
  _resetHlcForTesting,
} from '../../../src/modules/event-sourcing/hlc.js';
import {
  applyRemoteEvent,
  startRealtime,
  stopRealtime,
  catchUp,
  LAST_SEEN_PREFIX,
  _resetRealtimeForTesting,
} from '../../../src/modules/event-sourcing/realtime.js';

const EVT_LIST = '*/api/collections/events/records';

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
    await startRealtime();
    await startRealtime();
    expect(rt.calls).toHaveLength(1);
    expect(rt.calls[0].topic).toBe('events/*');
    expect(rt.calls[0].opts.filter).toBe('owner = "user1"');
  });

  it('AC-002: stopRealtime closes the subscription', async () => {
    const rt = stubRealtime();
    setAuth();
    await startRealtime();
    await stopRealtime();
    expect(rt.unsubCount()).toBe(1);
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

    const future = Date.now() + 100_000;
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

  it('AC-004: an echo of an already-applied event is a no-op in the projection', async () => {
    const rec = record({ local_id: 'r-echo', h: hlc(1), payload: { board: { name: 'Once' } } });
    await applyRemoteEvent(rec);
    await applyRemoteEvent(rec);
    expect(listBoards().filter(b => b.id === 'board-1')).toHaveLength(1);
    expect(await getUnsyncedEvents()).toHaveLength(0);
  });
});

describe('catch-up pull', () => {
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

// Outbound event push queue (issue #112, AC-004..008, AC-011).
// Real PocketBase client driven against MSW-intercepted HTTP; events live in
// fake-indexeddb. Timing is shrunk via _setTimingForTesting so the suite uses
// real timers (fake timers deadlock fake-indexeddb's internal scheduling).
import { waitFor } from '@testing-library/dom';
import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';
import { emit, EVENT_EMITTED } from '../../../src/modules/events.js';
import {
  claimDataOwner,
  persistEvent,
  getUnsyncedEvents,
  _resetIdbForTesting,
} from '../../../src/modules/idb-store.js';
import { getPb } from '../../../src/modules/sync.js';
import {
  initSyncQueue,
  startSyncQueue,
  stopSyncQueue,
  drainSyncQueue,
  scheduleDrain,
  _resetSyncQueueForTesting,
  _setTimingForTesting,
  _settleForTesting,
  getSyncStatus,
} from '../../../src/modules/event-sourcing/sync-queue.js';
import {
  SNAPSHOT_EVENT_THRESHOLD,
  checkAndScheduleSnapshot,
  loadSnapshot,
  _resetSnapshotSchedulerForTesting,
  _setJitterForTesting,
} from '../../../src/modules/event-sourcing/snapshot.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';

const replayFold = (snapshot, events) => applyEvents(snapshot?.state ?? createProjectionState(), events);
const EVENTS_URL = '*/api/collections/events/records';

function setAuth(id = 'user1') {
  getPb().authStore.save('test-token', { id, email: 't@e.st' });
}

function makeEvent({ counter = 0, id = `evt-${counter}`, type = 'task.updated' } = {}) {
  return {
    id,
    type,
    hlc: { wallTime: 1000, counter, nodeId: 'node-a' },
    at: '2026-06-07T00:00:00.000Z',
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: 'board-1',
    entity_id: 'task-1',
    payload: { fields: { title: 'x' } },
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

afterEach(async () => {
  _resetSyncQueueForTesting();
  await _settleForTesting(); // let any in-flight push finish before tearing down IDB
  server.resetHandlers();
});

beforeEach(async () => {
  _resetSyncQueueForTesting();
  _resetIdbForTesting();
  await deleteDB('kanvana-db');
  await claimDataOwner('user1');
  getPb().authStore.clear();
  _setTimingForTesting({ debounceMs: 1 });
});

describe('sync-queue and the Data Owner (#221 AC-014)', () => {
  it('stamps pushed events with the Data Owner', async () => {
    const owners = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      owners.push((await request.json()).owner);
      return HttpResponse.json({ id: 'rec' });
    }));
    await persistEvent(makeEvent());

    setAuth('user1');
    startSyncQueue();
    await drainSyncQueue();

    expect(owners).toEqual(['user1']);
    expect(await getUnsyncedEvents()).toHaveLength(0);
  });

  it('pushes nothing when the signed-in account is not the Data Owner', async () => {
    let posts = 0;
    server.use(http.post(EVENTS_URL, () => { posts += 1; return HttpResponse.json({ id: 'rec' }); }));
    await persistEvent(makeEvent());

    setAuth('someone-else');
    startSyncQueue();
    await drainSyncQueue();

    expect(posts).toBe(0);
    expect(await getUnsyncedEvents()).toHaveLength(1);
  });

  it('pushes nothing when local data has no Data Owner yet', async () => {
    _resetIdbForTesting();
    await deleteDB('kanvana-db');
    let posts = 0;
    server.use(http.post(EVENTS_URL, () => { posts += 1; return HttpResponse.json({ id: 'rec' }); }));
    await persistEvent(makeEvent());

    setAuth('user1');
    startSyncQueue();
    await drainSyncQueue();

    expect(posts).toBe(0);
  });

  it('stops pushing once another account signs in during a drain', async () => {
    const owners = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      owners.push((await request.json()).owner);
      setAuth('someone-else');
      return HttpResponse.json({ id: 'rec' });
    }));
    _setTimingForTesting({ debounceMs: 1, maxInFlight: 1 });
    await persistEvent(makeEvent({ counter: 0 }));
    await persistEvent(makeEvent({ counter: 1 }));
    await persistEvent(makeEvent({ counter: 2 }));

    setAuth('user1');
    startSyncQueue();
    await drainSyncQueue();

    expect(owners).toEqual(['user1']);
  });
});

describe('sync-queue across a local snapshot (#176)', () => {
  afterEach(() => _resetSnapshotSchedulerForTesting());

  // Editing offline past the snapshot threshold used to GC the still-queued
  // events, so they never reached the server once the user reconnected.
  it('pushes every event queued offline even after a snapshot covered them', async () => {
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push((await request.json()).local_id);
      return HttpResponse.json({ id: 'rec' });
    }));
    _setTimingForTesting({ debounceMs: 1, maxInFlight: 20 });
    _setJitterForTesting(() => 0);

    initSyncQueue(); // not started: nothing drains
    const ids = [];
    for (let counter = 0; counter < SNAPSHOT_EVENT_THRESHOLD; counter++) {
      const event = makeEvent({ counter });
      ids.push(event.id);
      await persistEvent(event);
      emit(EVENT_EMITTED, event);
    }

    checkAndScheduleSnapshot('board-1', { fold: replayFold });
    await waitFor(async () => expect(await loadSnapshot('board-1')).not.toBeNull());
    expect(received).toHaveLength(0);

    setAuth();
    startSyncQueue();
    drainSyncQueue();

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0), { timeout: 10000 });
    expect(received.sort()).toEqual(ids.sort());
  }, 20000);
});

describe('sync-queue commands (#219)', () => {
  it('drains on command, with no new activity', async () => {
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push(await request.json());
      return HttpResponse.json({ id: 'rec-1' });
    }));

    setAuth();
    await persistEvent(makeEvent({ counter: 0, id: 'evt-leftover' }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(received.map((r) => r.local_id)).toEqual(['evt-leftover']);
  });

  it('does not push on a drain command when signed out', async () => {
    let posted = 0;
    server.use(http.post(EVENTS_URL, () => { posted += 1; return HttpResponse.json({ id: 'r' }); }));

    await persistEvent(makeEvent({ counter: 0, id: 'evt-offline' }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    await _settleForTesting();

    expect(posted).toBe(0);
    expect(await getUnsyncedEvents()).toHaveLength(1);
  });

  it('does not react to an emitted event, or a drain command, until started', async () => {
    let posted = 0;
    server.use(http.post(EVENTS_URL, () => { posted += 1; return HttpResponse.json({ id: 'r' }); }));
    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    emit(EVENT_EMITTED, event);
    drainSyncQueue();
    await new Promise((r) => setTimeout(r, 20));

    expect(posted).toBe(0);
  });

  it('stop cancels a pending debounced drain', async () => {
    let posted = 0;
    server.use(http.post(EVENTS_URL, () => { posted += 1; return HttpResponse.json({ id: 'r' }); }));
    _setTimingForTesting({ debounceMs: 10 });
    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, event);
    stopSyncQueue();
    await new Promise((r) => setTimeout(r, 40));

    expect(posted).toBe(0);
  });

  it('stop cancels a pending retry and clears the retrying status', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, () => { attempts += 1; return HttpResponse.json({ message: 'down' }, { status: 503 }); }));
    _setTimingForTesting({ debounceMs: 1, backoff: [5] });
    setAuth();
    await persistEvent(makeEvent({ counter: 0 }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    await waitFor(async () => expect((await getSyncStatus()).retrying).toBe(true));
    stopSyncQueue();
    const attemptsAtStop = attempts;
    await new Promise((r) => setTimeout(r, 40));

    expect(attempts).toBe(attemptsAtStop);
    await expect(getSyncStatus()).resolves.toMatchObject({ depth: 1, retrying: false });
  });

  it('stop ends a drain in flight: no event starts pushing after it, and no retry is scheduled', async () => {
    let release;
    const held = new Promise((res) => { release = res; });
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      await held;
      return HttpResponse.json({ message: 'down' }, { status: 503 });
    }));
    const retries = [];
    _setTimingForTesting({ debounceMs: 1, maxInFlight: 1, schedule: (ms) => { retries.push(ms); return 0; } });
    setAuth();
    for (let counter = 0; counter < 3; counter++) await persistEvent(makeEvent({ counter }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    await waitFor(() => expect(attempts).toBe(1));

    stopSyncQueue();
    release();
    await _settleForTesting();

    expect(attempts).toBe(1);
    expect(retries).toEqual([]);
    expect(await getUnsyncedEvents()).toHaveLength(3);
  });

  it('a start during a stopped drain still pushes, once that drain has ended', async () => {
    let release;
    const held = new Promise((res) => { release = res; });
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push((await request.json()).local_id);
      await held;
      return HttpResponse.json({ id: 'rec' });
    }));
    _setTimingForTesting({ debounceMs: 1, maxInFlight: 1 });
    setAuth();
    for (let counter = 0; counter < 2; counter++) await persistEvent(makeEvent({ counter }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    await waitFor(() => expect(received).toHaveLength(1));

    stopSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    release();

    await waitFor(async () => expect(await getUnsyncedEvents()).toHaveLength(0));
  });

  it('pushes an event emitted during a drain, which read its list before that event existed', async () => {
    let release;
    const held = new Promise((res) => { release = res; });
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push((await request.json()).local_id);
      await held;
      return HttpResponse.json({ id: 'rec' });
    }));
    setAuth();
    await persistEvent(makeEvent({ counter: 0, id: 'evt-first' }));

    initSyncQueue();
    startSyncQueue();
    drainSyncQueue();
    await waitFor(() => expect(received).toEqual(['evt-first']));

    const late = makeEvent({ counter: 1, id: 'evt-late' });
    await persistEvent(late);
    emit(EVENT_EMITTED, late);
    await new Promise((r) => setTimeout(r, 10));
    release();

    await waitFor(async () => expect(await getUnsyncedEvents()).toHaveLength(0));
    expect(received).toEqual(['evt-first', 'evt-late']);
  });
});

describe('sync-queue push', () => {
  it('AC-004: pushes a queued event and flips synced after debounce', async () => {
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push(await request.json());
      return HttpResponse.json({ id: 'rec-1' });
    }));

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(received).toHaveLength(1);
    expect(received[0].local_id).toBe(event.id);
    expect(received[0].event_type).toBe('task.updated');
  });

  it('pushes a timetracking event with its scope and no board', async () => {
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push(await request.json());
      return HttpResponse.json({ id: 'rec-tt' });
    }));

    setAuth();
    const event = { ...makeEvent({ counter: 0, id: 'evt-tt', type: 'customer.created' }), scope: 'timetracking', board_id: null, entity_id: 'customer-1' };
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ local_id: 'evt-tt', scope: 'timetracking', board: null, entity_id: 'customer-1' });
  });

  it('AC-005: caps concurrent pushes at 5 and drains the whole queue', async () => {
    let inFlight = 0;
    let peak = 0;
    let count = 0;
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const body = await request.json();
      count += 1;
      await delay(5);
      inFlight -= 1;
      return HttpResponse.json({ id: `rec-${body.local_id}` });
    }));

    setAuth();
    for (let i = 0; i < 50; i++) await persistEvent(makeEvent({ counter: i }));

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0), { timeout: 4000 });
    expect(count).toBe(50);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('AC-005: drains in HLC order (sequential)', async () => {
    const received = [];
    server.use(http.post(EVENTS_URL, async ({ request }) => {
      received.push((await request.json()).hlc.counter);
      return HttpResponse.json({ id: 'rec' });
    }));
    _setTimingForTesting({ debounceMs: 1, maxInFlight: 1 });

    setAuth();
    for (const c of [3, 1, 4, 2, 0]) await persistEvent(makeEvent({ counter: c }));

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(() => expect(received).toHaveLength(5));
    expect(received).toEqual([0, 1, 2, 3, 4]);
  });

  it('AC-008: a rejected event is left queued, never rolled back', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      return HttpResponse.json({ message: 'Boom' }, { status: 500 });
    }));
    _setTimingForTesting({ debounceMs: 1, schedule: () => 0 }); // swallow backoff retry

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(attempts).toBe(1));
    const unsynced = await getUnsyncedEvents();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].id).toBe(event.id);
  });

  it('AC-006: a drain command resumes without waiting for backoff', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.error(); // simulate offline
      return HttpResponse.json({ id: 'rec-ok' });
    }));
    // Capture the backoff callback but never fire it — only the command may resume.
    _setTimingForTesting({ debounceMs: 1, schedule: () => 0 });

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(attempts).toBe(1));
    await _settleForTesting();
    expect(await getUnsyncedEvents()).toHaveLength(1);

    drainSyncQueue();

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(attempts).toBe(2);
  });

  it('AC-007: stops and reports on auth failure; a restart resumes', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.json({ message: 'unauth' }, { status: 401 });
      return HttpResponse.json({ id: 'rec-ok' });
    }));
    _setTimingForTesting({ debounceMs: 1 });
    let rejections = 0;

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    startSyncQueue({ onAuthRejected: () => { rejections += 1; } });
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(rejections).toBe(1));
    expect(attempts).toBe(1);
    expect(await getUnsyncedEvents()).toHaveLength(1);

    // Further emissions are ignored while stopped.
    emit(EVENT_EMITTED, event);
    await new Promise(r => setTimeout(r, 20));
    expect(attempts).toBe(1);

    startSyncQueue();
    drainSyncQueue();

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(attempts).toBe(2);
  });

  it('AC-011: network failures advance the backoff tiers, capped at 5min', async () => {
    server.use(http.post(EVENTS_URL, async () => HttpResponse.json({ message: 'down' }, { status: 503 })));
    const calls = [];
    let lastFn = null;
    _setTimingForTesting({
      debounceMs: 1,
      backoff: [5000, 30000, 120000, 300000],
      schedule: (ms, fn) => { calls.push(ms); lastFn = fn; return 0; }, // capture, never auto-fire
    });

    setAuth();
    await persistEvent(makeEvent({ counter: 0 }));
    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(() => expect(calls).toEqual([5000]));
    for (const expected of [30000, 120000, 300000, 300000]) {
      lastFn(); // simulate the scheduled retry firing
      await _settleForTesting();
      await waitFor(() => expect(calls[calls.length - 1]).toBe(expected));
    }
    expect(calls).toEqual([5000, 30000, 120000, 300000, 300000]);
  });

  it('AC-011: a permanent 4xx schedules a ~1h retry', async () => {
    server.use(http.post(EVENTS_URL, async () => HttpResponse.json({ message: 'bad' }, { status: 400 })));
    const calls = [];
    _setTimingForTesting({ debounceMs: 1, schedule: (ms) => { calls.push(ms); return 0; } });

    setAuth();
    await persistEvent(makeEvent({ counter: 0 }));
    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(() => expect(calls).toEqual([60 * 60 * 1000]));
    expect(await getUnsyncedEvents()).toHaveLength(1);
    await expect(getSyncStatus()).resolves.toMatchObject({ depth: 1, retrying: true });
  });
});

// #217: the server holds a unique index on (owner, local_id). A second push of
// an event it already holds (two tabs, or a retry after a lost response) comes
// back as this exact PocketBase 0.40 body, recorded against a local instance.
const DUPLICATE_LOCAL_ID_BODY = {
  data: {
    local_id: { code: 'validation_not_unique', message: 'Value must be unique.' },
    owner: { code: 'validation_not_unique', message: 'Value must be unique.' },
  },
  message: 'Failed to create record.',
  status: 400,
};

describe('sync-queue duplicate rejection (#217)', () => {
  it('AC-003/AC-005: a unique (owner, local_id) rejection marks the event synced with no retry', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      return HttpResponse.json(DUPLICATE_LOCAL_ID_BODY, { status: 400 });
    }));
    const calls = [];
    _setTimingForTesting({ debounceMs: 1, schedule: (ms) => { calls.push(ms); return 0; } });

    setAuth();
    await persistEvent(makeEvent({ counter: 0, id: 'evt-already-on-server' }));
    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    await _settleForTesting();
    expect(attempts).toBe(1);
    expect(calls).toEqual([]);
    await expect(getSyncStatus()).resolves.toMatchObject({ depth: 0, retrying: false });
  });

  it.each([
    ['a not-unique error on another field', { hlc: { code: 'validation_not_unique', message: 'Value must be unique.' } }],
    ['a not-unique local_id alongside another validation error', {
      local_id: { code: 'validation_not_unique', message: 'Value must be unique.' },
      event_type: { code: 'validation_required', message: 'Cannot be blank.' },
    }],
    ['a missing required field', { event_type: { code: 'validation_required', message: 'Cannot be blank.' } }],
  ])('still treats %s as a permanent failure', async (_label, data) => {
    server.use(http.post(EVENTS_URL, async () => HttpResponse.json(
      { data, message: 'Failed to create record.', status: 400 }, { status: 400 },
    )));
    const calls = [];
    _setTimingForTesting({ debounceMs: 1, schedule: (ms) => { calls.push(ms); return 0; } });

    setAuth();
    await persistEvent(makeEvent({ counter: 0 }));
    initSyncQueue();
    startSyncQueue();
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(() => expect(calls).toEqual([60 * 60 * 1000]));
    expect(await getUnsyncedEvents()).toHaveLength(1);
  });
});

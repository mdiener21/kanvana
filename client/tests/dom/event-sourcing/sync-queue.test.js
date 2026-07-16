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
  persistEvent,
  getUnsyncedEvents,
  _resetIdbForTesting,
} from '../../../src/modules/idb-store.js';
import { getPb } from '../../../src/modules/sync.js';
import {
  initSyncQueue,
  scheduleDrain,
  _resetSyncQueueForTesting,
  _setTimingForTesting,
  _isPausedForTesting,
  _settleForTesting,
} from '../../../src/modules/event-sourcing/sync-queue.js';

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
  getPb().authStore.clear();
  _setTimingForTesting({ debounceMs: 1 });
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
    emit(EVENT_EMITTED, event);

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(received).toHaveLength(1);
    expect(received[0].local_id).toBe(event.id);
    expect(received[0].event_type).toBe('task.updated');
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
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(attempts).toBe(1));
    const unsynced = await getUnsyncedEvents();
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].id).toBe(event.id);
  });

  it('AC-006: resumes on the online event without waiting for backoff', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.error(); // simulate offline
      return HttpResponse.json({ id: 'rec-ok' });
    }));
    // Capture the backoff callback but never fire it — only `online` may resume.
    _setTimingForTesting({ debounceMs: 1, schedule: () => 0 });

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(attempts).toBe(1));
    expect(await getUnsyncedEvents()).toHaveLength(1);

    window.dispatchEvent(new Event('online'));

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(attempts).toBe(2);
  });

  it('AC-007: pauses on auth failure and resumes on auth-changed', async () => {
    let attempts = 0;
    server.use(http.post(EVENTS_URL, async () => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.json({ message: 'unauth' }, { status: 401 });
      return HttpResponse.json({ id: 'rec-ok' });
    }));
    _setTimingForTesting({ debounceMs: 1 });

    setAuth();
    const event = makeEvent({ counter: 0 });
    await persistEvent(event);

    initSyncQueue();
    emit(EVENT_EMITTED, event);

    await waitFor(() => expect(attempts).toBe(1));
    expect(_isPausedForTesting()).toBe(true);
    expect(await getUnsyncedEvents()).toHaveLength(1);

    // Further emissions are ignored while paused.
    emit(EVENT_EMITTED, event);
    await new Promise(r => setTimeout(r, 20));
    expect(attempts).toBe(1);

    window.dispatchEvent(new Event('auth-changed'));

    await waitFor(async () => expect((await getUnsyncedEvents()).length).toBe(0));
    expect(attempts).toBe(2);
    expect(_isPausedForTesting()).toBe(false);
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
    emit(EVENT_EMITTED, makeEvent({ counter: 0 }));

    await waitFor(() => expect(calls).toEqual([60 * 60 * 1000]));
    expect(await getUnsyncedEvents()).toHaveLength(1);
  });
});

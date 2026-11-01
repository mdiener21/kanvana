// #219 ACs through the shared page boot: the real PocketBase SDK over MSW, with a fake
// EventSource so the SDK's own connect, PB_CONNECT and unsubscribe behaviour is under test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { server } from '../../mocks/server.js';

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';
const REFRESH = '*/api/collections/users/auth-refresh';
const HEALTH = '*/api/health';
const REALTIME = '*/api/realtime';
const USER = { id: 'user1', email: 't@e.st' };

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = new Map();
    FakeEventSource.instances.push(this);
    // The server answers the stream as soon as it opens, which the SDK waits for.
    setTimeout(() => {
      if (!this.closed) this.fire('PB_CONNECT', { lastEventId: 'client-id', data: '{}' });
    }, 0);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  fire(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

const openSources = () => FakeEventSource.instances.filter((source) => !source.closed);

function jwt() {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: USER.id, type: 'auth', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const listResponse = (items) => HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });

function unsyncedEvent(id) {
  return {
    id, type: 'board.created', hlc: { wallTime: Date.now(), counter: 0, nodeId: 'node-local' },
    at: new Date().toISOString(), actor: { type: 'human', id: null },
    scope: 'board', board_id: `board-${id}`, entity_id: `board-${id}`, payload: { board: { name: 'Local board' } },
  };
}

function setBrowserOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

let page = null;
let requests = [];
const track = ({ request }) => {
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}`);
};
const eventPulls = () => requests.filter((r) => r === 'GET /api/collections/events/records').length;
const pushes = () => requests.filter((r) => r === 'POST /api/collections/events/records').length;
const indicator = () => document.getElementById('sync-indicator');

let pushResponse = () => null;

function serveBackend() {
  server.use(
    http.post(REFRESH, () => HttpResponse.json({ token: jwt(), record: USER })),
    http.get(HEALTH, () => HttpResponse.json({ code: 200 })),
    http.post(REALTIME, () => new HttpResponse(null, { status: 204 })),
    http.get(EVT_LIST, () => listResponse([])),
    http.post(EVT_LIST, async ({ request }) => {
      const body = await request.json();
      return pushResponse(body) ?? HttpResponse.json({ id: `rec-${body.local_id}`, ...body });
    }),
    http.get(SNAP_LIST, () => listResponse([])),
    http.post(SNAP_LIST, () => HttpResponse.json({ id: 'snap-new' })),
  );
}

// The shared boot, on the board page's markup: the one page with the indicator.
async function openBoard({ signedIn = false, unsynced = [], snapshots = {} } = {}) {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const modules = {
    sync: await import('../../../src/modules/sync.js'),
    idb: await import('../../../src/modules/idb-store.js'),
    queue: await import('../../../src/modules/event-sourcing/sync-queue.js'),
    realtime: await import('../../../src/modules/event-sourcing/realtime.js'),
    session: await import('../../../src/modules/event-sourcing/sync-session.js'),
    indicator: await import('../../../src/modules/event-sourcing/sync-indicator.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
    boot: await import('../../../src/modules/page-boot.js'),
  };
  page = modules;
  modules.queue._setTimingForTesting({ debounceMs: 1, maxInFlight: 50, backoff: [5] });
  modules.snapshot._setJitterForTesting(() => 0);
  for (const event of unsynced) await modules.idb.persistEvent(event);
  const db = await modules.idb.openStore();
  for (const [key, snap] of Object.entries(snapshots)) await db.put(modules.idb.SNAPSHOTS_STORE, snap, key);
  modules.idb._resetIdbForTesting();

  if (signedIn) modules.sync.getPb().authStore.save(jwt(), USER);

  const source = readFileSync(resolve(__dirname, '../../../src/index.html'), 'utf8');
  document.body.innerHTML = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

  requests = [];
  server.events.on('request:start', track);
  await modules.boot.bootPage();
  await waitFor(() => expect(indicator().className).toContain('sync-indicator--'));
  return modules;
}

const sessionState = () => page.session.getSyncSessionState();

async function goLive() {
  await waitFor(() => expect(sessionState()).toBe('live'), { timeout: 5000 });
}

// Long enough for anything wrongly still running to reach MSW.
const settle = () => new Promise((r) => setTimeout(r, 100));

beforeAll(() => {
  globalThis.EventSource = FakeEventSource;
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  delete globalThis.EventSource;
});

afterEach(async () => {
  if (page) {
    page.session._resetSyncSessionForTesting();
    page.queue._resetSyncQueueForTesting();
    await page.queue._settleForTesting();
    await page.realtime._resetRealtimeForTesting();
    page.sync._resetAuthRefreshForTesting();
    page.indicator._resetSyncIndicatorForTesting();
    page.snapshot._resetSnapshotSchedulerForTesting();
    page.sync.getPb().authStore.clear();
    page.idb._resetIdbForTesting();
  }
  page = null;
  pushResponse = () => null;
  FakeEventSource.instances = [];
  setBrowserOnline(true);
  server.events.removeListener('request:start', track);
  server.resetHandlers();
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('sign-in through the page boot (#219 AC-001)', () => {
  it('goes signed-out -> catching-up -> live with exactly one pull, and realtime running', async () => {
    serveBackend();
    await openBoard();
    expect(sessionState()).toBe('signed-out');
    expect(indicator().textContent).toContain('Offline');

    page.sync.getPb().authStore.save(jwt(), USER);
    expect(sessionState()).toBe('signed-out'); // the sign-in check is async
    await waitFor(() => expect(sessionState()).toBe('catching-up'));

    await goLive();
    await settle();

    expect(eventPulls()).toBe(1);
    expect(page.realtime.isRealtimeActive()).toBe(true);
    await waitFor(() => expect(indicator().textContent).toContain('Live'));
  }, 30000); // first page in the file pays the cold module import

  it('runs one pull on a signed-in launch, and the token refresh during it adds none', async () => {
    serveBackend();
    await openBoard({ signedIn: true });

    await goLive();
    await settle();

    expect(requests).toContain('POST /api/collections/users/auth-refresh');
    expect(eventPulls()).toBe(1);
    expect(sessionState()).toBe('live');
  }, 20000);

  it('catches up once more, once, when SSE reconnects', async () => {
    serveBackend();
    await openBoard({ signedIn: true });
    await goLive();
    await settle();
    expect(eventPulls()).toBe(1);

    // The stream drops; the SDK opens a new one by itself and reports PB_CONNECT on it.
    const dropped = openSources()[0];
    dropped.onerror(new Event('error'));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));

    await waitFor(() => expect(eventPulls()).toBe(2));
    await waitFor(() => expect(sessionState()).toBe('live'));
    await settle();
    expect(eventPulls()).toBe(2);
  }, 20000);
});

describe('offline and online through the page boot (#219 AC-002, AC-003)', () => {
  it('offline closes SSE, fires no drain or retry, and shows Offline', async () => {
    serveBackend();
    await openBoard({ signedIn: true });
    await goLive();
    await settle();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));
    // A failing push leaves a backoff retry pending at the moment the browser goes offline.
    pushResponse = () => HttpResponse.json({ message: 'down' }, { status: 503 });
    const { emit, EVENT_EMITTED } = await import('../../../src/modules/events.js');
    const event = unsyncedEvent('evt-before-offline');
    await page.idb.persistEvent(event);
    emit(EVENT_EMITTED, event);
    await waitFor(() => expect(pushes()).toBeGreaterThan(0));

    setBrowserOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(sessionState()).toBe('offline');
    await waitFor(() => expect(openSources()).toHaveLength(0));
    await waitFor(() => expect(indicator().textContent).toContain('Offline'));
    await settle();
    requests = [];
    const queued = unsyncedEvent('evt-offline');
    await page.idb.persistEvent(queued);
    emit(EVENT_EMITTED, queued);
    await settle();

    expect(requests).toEqual([]);
  }, 20000);

  it('online runs exactly one pull before going live, and queued events drain', async () => {
    serveBackend();
    await openBoard({ signedIn: true });
    await goLive();
    await settle();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));
    setBrowserOnline(false);
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(openSources()).toHaveLength(0));
    await settle();
    const { emit, EVENT_EMITTED } = await import('../../../src/modules/events.js');
    const queued = unsyncedEvent('evt-queued-offline');
    await page.idb.persistEvent(queued);
    emit(EVENT_EMITTED, queued);
    requests = [];

    setBrowserOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(sessionState()).toBe('catching-up');
    await goLive();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));
    await settle();

    expect(eventPulls()).toBe(1);
    expect(requests.indexOf('GET /api/collections/events/records'))
      .toBeLessThan(requests.indexOf('POST /api/collections/events/records'));
    expect(pushes()).toBe(1);
    await waitFor(() => expect(indicator().textContent).toContain('Live'));
  }, 20000);

  it('a launch with no network stays offline and sends nothing', async () => {
    serveBackend();
    setBrowserOnline(false);
    await openBoard({ signedIn: true, unsynced: [unsyncedEvent('evt-offline')] });
    await waitFor(() => expect(sessionState()).toBe('offline'));
    await settle();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(eventPulls()).toBe(0);
    expect(pushes()).toBe(0);
    expect(indicator().textContent).toContain('Offline');
  }, 20000);
});

describe('sign-out through the page boot (#219 AC-004)', () => {
  it('stops realtime, the queue and snapshot upload, and PocketBase hears nothing until the next sign-in', async () => {
    serveBackend();
    await openBoard({ signedIn: true });
    await goLive();
    await settle();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));
    requests = [];

    page.sync.logoutUser();

    expect(sessionState()).toBe('signed-out');
    await waitFor(() => expect(openSources()).toHaveLength(0));
    const { emit, EVENT_EMITTED } = await import('../../../src/modules/events.js');
    const event = unsyncedEvent('evt-signed-out');
    await page.idb.persistEvent(event);
    emit(EVENT_EMITTED, event);
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(requests.filter((r) => !r.endsWith('/api/health'))).toEqual([]);
    expect((await page.idb.getUnsyncedEvents()).map((e) => e.id)).toEqual(['evt-signed-out']);
    await waitFor(() => expect(indicator().textContent).toContain('Offline'));

    page.sync.getPb().authStore.save(jwt(), USER);
    await goLive();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));
    expect(eventPulls()).toBe(1);
  }, 20000);
});

// A token stays in the store while offline, so only the session's stop keeps this from uploading.
describe('snapshot upload is stopped with the session (#219)', () => {
  it('saves the snapshot locally but does not upload it while offline', async () => {
    serveBackend();
    setBrowserOnline(false);
    const aged = { payload: {}, hlc: { wallTime: 500, counter: 0, nodeId: 'node-local' }, at: '2020-01-01T00:00:00Z' };
    const { idb, snapshot } = await openBoard({ signedIn: true, snapshots: { 'board-evt-old': aged } });
    await waitFor(() => expect(sessionState()).toBe('offline'));
    const old = { ...unsyncedEvent('evt-old'), hlc: { wallTime: 1000, counter: 0, nodeId: 'node-local' } };
    await idb.persistEvent(old);
    const { applyEvents, createProjectionState } = await import('../../../src/modules/reducer.js');
    requests = [];

    snapshot.checkAndScheduleSnapshot('board-evt-old', {
      fold: (snap, events) => applyEvents(snap?.state ?? createProjectionState(), events),
    });

    await waitFor(async () => expect((await snapshot.loadSnapshot('board-evt-old')).hlc).toEqual(old.hlc), { timeout: 5000 });
    await settle();
    expect(requests).toEqual([]);
  }, 20000);
});

describe('a rejected push through the page boot (#219 AC-005)', () => {
  it('enters paused, shows unsynced, and resumes through catching-up on re-authentication', async () => {
    serveBackend();
    pushResponse = () => HttpResponse.json({ message: 'unauth' }, { status: 401 });
    await openBoard({ signedIn: true, unsynced: [unsyncedEvent('evt-rejected')] });

    await waitFor(() => expect(sessionState()).toBe('paused'), { timeout: 5000 });
    await waitFor(() => expect(indicator().textContent).toContain('unsynced'));
    const pushesWhilePaused = pushes();
    const pullsWhilePaused = eventPulls();
    await settle();
    expect(pushes()).toBe(pushesWhilePaused);

    pushResponse = () => null;
    page.sync.getPb().authStore.save(jwt(), USER);

    await waitFor(() => expect(sessionState()).toBe('live'), { timeout: 5000 });
    expect(eventPulls()).toBe(pullsWhilePaused + 1);
    await waitFor(async () => expect((await page.idb.getUnsyncedEvents()).map((e) => e.id)).not.toContain('evt-rejected'));
  }, 20000);
});

describe('trigger ownership (#219 AC-006)', () => {
  it.each([
    'event-sourcing/sync-queue.js',
    'event-sourcing/realtime.js',
    'event-sourcing/snapshot-sync.js',
    'event-sourcing/sync-indicator.js',
  ])('%s registers no auth-changed, online or offline listener', (file) => {
    const source = readFileSync(resolve(__dirname, '../../../src/modules', file), 'utf8');
    expect(source).not.toMatch(/addEventListener\(\s*['"](auth-changed|online|offline)['"]/);
  });
});

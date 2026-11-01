// #222: tabs electing a sync leader, through the shared page boot. One module graph per tab
// with the real PocketBase SDK over MSW; each tab's requests are told apart by its own client.
import { waitFor } from '@testing-library/dom';
import { IDBFactory } from 'fake-indexeddb';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server.js';
import { FakeBroadcastChannel, createFakeLocks, installLocks, removeLocks } from './helpers/fake-tabs.js';

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';
const REFRESH = '*/api/collections/users/auth-refresh';
const HEALTH = '*/api/health';
const REALTIME = '*/api/realtime';
const USER = { id: 'user1', email: 't@e.st' };
const BOARD = 'board-1';
const LOCK = 'kanvana:sync-leader';
const DAY_MS = 24 * 60 * 60 * 1000;

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = new Map();
    FakeEventSource.instances.push(this);
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

let pushed = [];
let pushResponse = () => null;
let snapshotPosts = 0;
const tabs = [];

function serveBackend() {
  server.use(
    http.post(REFRESH, () => HttpResponse.json({ token: jwt(), record: USER })),
    http.get(HEALTH, () => HttpResponse.json({ code: 200 })),
    http.post(REALTIME, () => new HttpResponse(null, { status: 204 })),
    http.get(EVT_LIST, () => listResponse([])),
    http.post(EVT_LIST, async ({ request }) => {
      const body = await request.json();
      pushed.push(body.local_id);
      return pushResponse(body) ?? HttpResponse.json({ id: `rec-${body.local_id}`, ...body });
    }),
    http.get(SNAP_LIST, () => listResponse([])),
    http.post(SNAP_LIST, () => {
      snapshotPosts += 1;
      return HttpResponse.json({ id: 'snap-new' });
    }),
  );
}

async function openTab({ signedIn = true, snapshotJitter = () => DAY_MS } = {}) {
  vi.resetModules();
  const tab = {
    sync: await import('../../../src/modules/sync.js'),
    idb: await import('../../../src/modules/idb-store.js'),
    queue: await import('../../../src/modules/event-sourcing/sync-queue.js'),
    realtime: await import('../../../src/modules/event-sourcing/realtime.js'),
    session: await import('../../../src/modules/event-sourcing/sync-session.js'),
    leader: await import('../../../src/modules/event-sourcing/sync-leader.js'),
    indicator: await import('../../../src/modules/event-sourcing/sync-indicator.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
    emitter: await import('../../../src/modules/event-sourcing/emitter.js'),
    storage: await import('../../../src/modules/storage.js'),
    boot: await import('../../../src/modules/page-boot.js'),
    sent: [],
  };
  tab.queue._setTimingForTesting({ debounceMs: 1, maxInFlight: 50, backoff: [50] });
  tab.snapshot._setJitterForTesting(snapshotJitter);
  const pb = tab.sync.getPb();
  pb.beforeSend = (url, options) => {
    tab.sent.push(`${options.method} ${new URL(url, 'http://x').pathname}`);
    return { url, options };
  };
  if (signedIn) pb.authStore.save(jwt(), USER);

  const element = document.createElement('div');
  element.id = 'sync-indicator';
  document.body.appendChild(element);
  await tab.boot.bootPage();
  element.removeAttribute('id');
  tab.element = element;
  tabs.push(tab);
  return tab;
}

async function closeTab(tab) {
  tabs.splice(tabs.indexOf(tab), 1);
  tab.session._resetSyncSessionForTesting();
  tab.queue._resetSyncQueueForTesting();
  await tab.queue._settleForTesting();
  await tab.realtime._resetRealtimeForTesting();
  tab.sync._resetAuthRefreshForTesting();
  tab.indicator._resetSyncIndicatorForTesting();
  tab.snapshot._resetSnapshotSchedulerForTesting();
  await tab.emitter.flushDomainEvents();
  tab.sync.getPb().beforeSend = null;
  // Last: closing releases the lock, and the next tab takes over from here.
  tab.leader._resetSyncLeaderForTesting();
  tab.idb._resetIdbForTesting();
}

const stateOf = (tab) => tab.session.getSyncSessionState();
const pullsBy = (tab) => tab.sent.filter((entry) => entry === 'GET /api/collections/events/records').length;
const pushesBy = (tab) => tab.sent.filter((entry) => entry === 'POST /api/collections/events/records').length;
const networkBy = (tab) => tab.sent.filter((entry) => !entry.includes('auth-refresh'));

async function goLive(...list) {
  await waitFor(() => list.forEach((tab) => expect(stateOf(tab)).toBe('live')), { timeout: 5000 });
}

function edit(tab, entityId = 'task-1') {
  return tab.emitter.scheduleDomainEvent({
    type: 'task.created',
    boardId: BOARD,
    entityId,
    payload: { task: { id: entityId, title: entityId, column: 'c1', labels: [] } },
  });
}

function signOut(tab) {
  tab.sync.getPb().authStore.clear();
}

function setBrowserOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

// Long enough for anything wrongly still running to reach MSW.
const settle = () => new Promise((res) => setTimeout(res, 100));

let locks = null;

beforeAll(() => {
  globalThis.EventSource = FakeEventSource;
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  delete globalThis.EventSource;
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  locks = createFakeLocks();
  installLocks(locks);
  serveBackend();
  pushed = [];
  pushResponse = () => null;
  snapshotPosts = 0;
  FakeEventSource.instances = [];
});

afterEach(async () => {
  for (const tab of [...tabs]) await closeTab(tab);
  FakeBroadcastChannel.reset();
  vi.unstubAllGlobals();
  removeLocks();
  setBrowserOnline(true);
  server.resetHandlers();
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('election (AC-001)', () => {
  it('lets one tab hold the subscription and pull, while the other does no network work', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    await settle();

    expect(openSources()).toHaveLength(1);
    expect(pullsBy(leader)).toBe(1);
    expect(networkBy(follower)).toEqual([]);
  });

  it('pushes each event exactly once, whichever tab made it, and only from the leader', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);

    edit(leader, 'from-leader');
    edit(follower, 'from-follower');

    await waitFor(() => expect(pushed).toHaveLength(2));
    await settle();
    expect(pushed).toHaveLength(2);
    expect(new Set(pushed).size).toBe(2);
    expect(pushesBy(leader)).toBe(2);
    expect(pushesBy(follower)).toBe(0);
    expect(await leader.idb.getUnsyncedEvents()).toEqual([]);
  });

  it('drains a follower edit as soon as it is stored', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);

    await edit(follower);

    await waitFor(() => expect(pushesBy(leader)).toBe(1));
  });
});

describe('handover (AC-003)', () => {
  it('has the follower subscribe, pull once and drain within 5 seconds of the leader closing', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    // Stored, but the leader dies before it pushes.
    leader.queue.stopSyncQueue();
    await edit(follower, 'left-behind');

    await closeTab(leader);
    const closedAt = Date.now();

    await waitFor(() => expect(pushesBy(follower)).toBe(1), { timeout: 5000 });
    expect(Date.now() - closedAt).toBeLessThan(5000);
    expect(pullsBy(follower)).toBe(1);
    expect(openSources()).toHaveLength(1);
    await waitFor(() => expect(stateOf(follower)).toBe('live'));
    await settle();
    expect(pullsBy(follower)).toBe(1);
    expect(await follower.idb.getUnsyncedEvents()).toEqual([]);
  });

  it('passes on through a chain of tabs, with only ever one subscription', async () => {
    const first = await openTab();
    const second = await openTab();
    const third = await openTab();
    await goLive(first, second, third);

    await closeTab(first);
    await waitFor(() => expect(pullsBy(second)).toBe(1));
    await goLive(second);
    expect(openSources()).toHaveLength(1);
    expect(networkBy(third)).toEqual([]);

    await closeTab(second);
    await waitFor(() => expect(pullsBy(third)).toBe(1));
    expect(openSources()).toHaveLength(1);
  });

  it('runs no network work when the new leader is signed out, then starts at sign-in', async () => {
    const leader = await openTab({ signedIn: false });
    const follower = await openTab({ signedIn: false });
    await settle();

    await closeTab(leader);
    await settle();

    expect(stateOf(follower)).toBe('signed-out');
    expect(networkBy(follower)).toEqual([]);

    follower.sync.getPb().authStore.save(jwt(), USER);
    await goLive(follower);
    expect(pullsBy(follower)).toBe(1);
    expect(openSources()).toHaveLength(1);
  });

  it('stops the network side everywhere at sign-out, and starts again only in the leader', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    await settle(); // a token refresh answered after the sign-out would sign back in

    signOut(leader);
    signOut(follower);
    await waitFor(() => expect(stateOf(follower)).toBe('signed-out'));
    await waitFor(() => expect(openSources()).toHaveLength(0));
    leader.sent.length = 0;
    await edit(follower);
    await settle();
    expect(pushed).toEqual([]);

    leader.sync.getPb().authStore.save(jwt(), USER);
    follower.sync.getPb().authStore.save(jwt(), USER);
    await goLive(leader, follower);
    await waitFor(() => expect(pushed).toHaveLength(1));
    expect(networkBy(follower)).toEqual([]);
  });

  it('waits for the network when the new leader is offline, then catches up and drains once', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    setBrowserOnline(false);
    await waitFor(() => expect(stateOf(follower)).toBe('offline'));
    await edit(follower, 'made-offline');

    await closeTab(leader);
    await settle();
    expect(networkBy(follower)).toEqual([]);
    expect(stateOf(follower)).toBe('offline');

    setBrowserOnline(true);
    await waitFor(() => expect(pushesBy(follower)).toBe(1));
    expect(pullsBy(follower)).toBe(1);
  });

  it('stays paused when taking over from a paused leader, until fresh credentials', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    pushResponse = () => new HttpResponse(null, { status: 401 });
    await edit(leader, 'rejected');
    await waitFor(() => expect(stateOf(follower)).toBe('paused'));
    const rejected = pushed.length;

    await closeTab(leader);
    await waitFor(() => expect(pullsBy(follower)).toBe(1));
    await settle();

    expect(stateOf(follower)).toBe('paused');
    expect(openSources()).toHaveLength(1);
    expect(pushed).toHaveLength(rejected);

    pushResponse = () => null;
    follower.sync.getPb().authStore.save(jwt(), USER);
    await goLive(follower);
    await waitFor(() => expect(pushesBy(follower)).toBe(1));
  });
});

describe('a frozen tab', () => {
  it('gives up the lock when frozen, so another tab can lead, and follows on resuming', async () => {
    const first = await openTab();
    await goLive(first);

    document.dispatchEvent(new Event('freeze'));
    await waitFor(() => expect(openSources()).toHaveLength(0));
    await waitFor(() => expect(locks.held(LOCK)).toBe(false));

    const second = await openTab();
    await goLive(second);
    await waitFor(() => expect(pullsBy(second)).toBe(1));
    first.sent.length = 0;

    document.dispatchEvent(new Event('resume'));
    await settle();

    expect(openSources()).toHaveLength(1);
    expect(networkBy(first)).toEqual([]);
    expect(locks.waiting(LOCK)).toBe(1);
    await edit(first);
    await waitFor(() => expect(pushesBy(second)).toBe(1));
  });

  it('leaves the lock queue when frozen, so it can not be granted the lock asleep', async () => {
    await openTab();
    await openTab();
    expect(locks.waiting(LOCK)).toBe(1);

    document.dispatchEvent(new Event('freeze'));
    await waitFor(() => expect(locks.held(LOCK)).toBe(false));
    expect(locks.waiting(LOCK)).toBe(0);

    document.dispatchEvent(new Event('resume'));
    await waitFor(() => expect(locks.held(LOCK)).toBe(true));
    expect(locks.waiting(LOCK)).toBe(1);
    await waitFor(() => expect(openSources()).toHaveLength(1));
  });
});

describe('no Web Locks (AC-004)', () => {
  beforeEach(() => removeLocks());

  it('has each tab sync on its own, with the server deduping the pushes', async () => {
    const duplicate = () => HttpResponse.json({
      data: { local_id: { code: 'validation_not_unique', message: 'x' } },
    }, { status: 400 });
    const seen = new Set();
    pushResponse = (body) => {
      if (seen.has(body.local_id)) return duplicate();
      seen.add(body.local_id);
      return null;
    };
    const one = await openTab();
    const two = await openTab();
    await goLive(one, two);

    expect(openSources()).toHaveLength(2);
    expect(pullsBy(one)).toBe(1);
    expect(pullsBy(two)).toBe(1);

    await edit(one);
    await waitFor(() => expect(seen.size).toBe(1));
    await waitFor(async () => expect(await one.idb.getUnsyncedEvents()).toEqual([]));
    await settle();
    expect(pushesBy(two)).toBe(0);
  });

  it('still shows an edit in the other tab', async () => {
    const one = await openTab();
    const two = await openTab();
    await goLive(one, two);

    await edit(one);

    await waitFor(() => expect(two.storage.loadTasksForBoard(BOARD).map((task) => task.id)).toContain('task-1'));
  });

  it('works with no BroadcastChannel either', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const one = await openTab();
    const two = await openTab();
    await goLive(one, two);
    expect(openSources()).toHaveLength(2);
  });

  it('runs as its own leader when Web Locks exist but no channel does', async () => {
    installLocks(createFakeLocks());
    vi.stubGlobal('BroadcastChannel', undefined);
    const one = await openTab();
    const two = await openTab();
    await goLive(one, two);
    expect(openSources()).toHaveLength(2);
  });
});

describe('the sync indicator of every tab', () => {
  async function expectSameText(expected, ...list) {
    await waitFor(() => list.forEach((tab) => expect(tab.element.textContent).toContain(expected)), { timeout: 5000 });
  }

  it('shows Live, then the queue depth, then Live again', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    await expectSameText('Live', leader, follower);

    let respond;
    const held = new Promise((res) => { respond = res; });
    server.use(http.post(EVT_LIST, async ({ request }) => {
      const body = await request.json();
      await held;
      return HttpResponse.json({ id: `rec-${body.local_id}`, ...body });
    }));
    await edit(follower);

    await expectSameText('Syncing… (1)', leader, follower);
    respond();
    await expectSameText('Live', leader, follower);
  });

  it('shows the leader retrying', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    pushResponse = () => new HttpResponse(null, { status: 503 });

    await edit(follower);

    await expectSameText('1 unsynced', leader, follower);
    pushResponse = () => null;
    await expectSameText('Live', leader, follower);
  });

  it('shows the leader paused', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    pushResponse = () => new HttpResponse(null, { status: 403 });

    await edit(leader);

    await expectSameText('1 unsynced', leader, follower);
    expect(stateOf(follower)).toBe('paused');
  });

  it('shows a tab opened later what the others show', async () => {
    const leader = await openTab();
    const first = await openTab();
    await goLive(leader, first);
    pushResponse = () => new HttpResponse(null, { status: 503 });
    await edit(leader);
    await expectSameText('1 unsynced', leader, first);

    const late = await openTab();

    await expectSameText('1 unsynced', late);
    expect(networkBy(late)).toEqual([]);
  });

  it('shows Offline with the leader, and recovers', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);

    setBrowserOnline(false);
    await expectSameText('Offline', leader, follower);

    setBrowserOnline(true);
    await expectSameText('Live', leader, follower);
  });

  it('shows Offline in a tab the browser reports offline, whatever the leader last said', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);

    follower.session._resetSyncSessionForTesting();
    follower.session.initSyncSession({
      network: await follower.leader.initSyncLeader(),
      isOnline: () => false,
    });
    await settle();

    expect(stateOf(leader)).toBe('live');
    expect(stateOf(follower)).toBe('offline');
  });

  it('shows the new leader own state once the old leader has gone', async () => {
    const leader = await openTab();
    const follower = await openTab();
    await goLive(leader, follower);
    pushResponse = () => new HttpResponse(null, { status: 503 });
    await edit(leader);
    await expectSameText('1 unsynced', follower);
    pushResponse = () => null;

    await closeTab(leader);

    await expectSameText('Live', follower);
    await waitFor(() => expect(pushesBy(follower)).toBe(1));
  });
});

describe('snapshots (saved in a follower)', () => {
  async function seedDueEvents(tab) {
    const db = await tab.idb.openStore();
    const wallTime = Date.now() - 60 * DAY_MS;
    const tx = db.transaction('events', 'readwrite');
    for (let counter = 0; counter < 500; counter += 1) {
      tx.store.put({
        id: `old-${counter}`,
        type: 'task.updated',
        hlc: { wallTime, counter, nodeId: 'old-device' },
        at: new Date(wallTime).toISOString(),
        actor: { type: 'human', id: null },
        scope: 'board',
        board_id: BOARD,
        entity_id: 'old-task',
        payload: { fields: { title: `v${counter}` } },
        synced: true,
      });
    }
    await tx.done;
  }

  it('uploads from the leader, not from the follower that saved it', async () => {
    const leader = await openTab();
    const follower = await openTab({ snapshotJitter: () => 0 });
    await goLive(leader, follower);
    await seedDueEvents(follower);

    await edit(follower);

    await waitFor(() => expect(FakeBroadcastChannel.log.some((message) => message.type === 'snapshot-saved')).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(snapshotPosts).toBe(1), { timeout: 5000 });
    expect(leader.sent).toContain('POST /api/collections/snapshots/records');
    expect(follower.sent.filter((entry) => entry.includes('snapshots'))).toEqual([]);
  });

  it('uploads nothing while signed out', async () => {
    const leader = await openTab({ signedIn: false });
    const follower = await openTab({ signedIn: false, snapshotJitter: () => 0 });
    await seedDueEvents(follower);

    await edit(follower);
    const db = await follower.idb.openStore();
    await waitFor(async () => expect(await db.get('snapshots', BOARD)).toBeTruthy(), { timeout: 5000 });
    await settle();

    expect(snapshotPosts).toBe(0);
    expect(FakeBroadcastChannel.log.some((message) => message.type === 'snapshot-saved')).toBe(false);
    expect(leader.sent.filter((entry) => entry.includes('snapshots'))).toEqual([]);
  });
});

// #221 / ADR-0006: local data belongs to one account. Real page boot, real PocketBase SDK
// over MSW; "the same browser" is one fake IndexedDB shared by fresh module graphs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { server } from '../../mocks/server.js';

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';
const REFRESH = '*/api/collections/users/auth-refresh';
const HEALTH = '*/api/health';
const USER_A = { id: 'user-a', email: 'a@e.st' };
const USER_B = { id: 'user-b', email: 'b@e.st' };

function jwt(user) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: user.id, type: 'auth', exp })}.sig`;
}

const listResponse = (items) => HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });

function localEvent(id, boardId = 'board-a') {
  return {
    id, type: 'board.created', hlc: { wallTime: Date.now(), counter: 0, nodeId: 'node-local' },
    at: new Date().toISOString(), actor: { type: 'human', id: null },
    scope: 'board', board_id: boardId, entity_id: boardId, payload: { board: { name: `Board ${id}` } },
  };
}

let page = null;
let requests = [];
let pushes = [];
let reloads = 0;

const track = ({ request }) => { requests.push(`${request.method} ${new URL(request.url).pathname}`); };

function serveBackend({ remoteFor = () => [] } = {}) {
  server.use(
    http.post(REFRESH, () => new HttpResponse(null, { status: 503 })),
    http.get(HEALTH, () => HttpResponse.json({ code: 200 })),
    http.get(EVT_LIST, ({ request }) => {
      const filter = new URL(request.url).searchParams.get('filter') || '';
      const owner = /owner = "([^"]+)"/.exec(filter)?.[1];
      return listResponse(remoteFor(owner));
    }),
    http.post(EVT_LIST, async ({ request }) => {
      const body = await request.json();
      pushes.push(body);
      return HttpResponse.json({ id: `rec-${body.local_id}`, ...body });
    }),
    http.get(SNAP_LIST, () => listResponse([])),
  );
}

async function teardownPage() {
  if (!page) return;
  page.dataOwner._resetDataOwnerForTesting();
  page.session._resetSyncSessionForTesting();
  page.queue._resetSyncQueueForTesting();
  await page.queue._settleForTesting();
  await page.realtime._resetRealtimeForTesting();
  page.sync._resetAuthRefreshForTesting();
  page.indicator._resetSyncIndicatorForTesting();
  page.snapshot._resetSnapshotSchedulerForTesting();
  page.idb._resetIdbForTesting();
  page = null;
}

// Loads the board page the way a browser does; the IndexedDB and localStorage carry over.
async function openPage({ html = 'index.html', entry = '../../../src/kanban.js', domReady = true, user = null, seed = async () => {} } = {}) {
  await teardownPage();
  vi.resetModules();
  const modules = {
    sync: await import('../../../src/modules/sync.js'),
    idb: await import('../../../src/modules/idb-store.js'),
    storage: await import('../../../src/modules/storage.js'),
    queue: await import('../../../src/modules/event-sourcing/sync-queue.js'),
    realtime: await import('../../../src/modules/event-sourcing/realtime.js'),
    session: await import('../../../src/modules/event-sourcing/sync-session.js'),
    indicator: await import('../../../src/modules/event-sourcing/sync-indicator.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
    dataOwner: await import('../../../src/modules/event-sourcing/data-owner.js'),
  };
  page = modules;
  modules.dataOwner._setReloadForTesting(() => { reloads += 1; });
  modules.queue._setTimingForTesting({ debounceMs: 1, maxInFlight: 50 });
  await seed(modules);
  modules.idb._resetIdbForTesting();

  const pb = modules.sync.getPb();
  pb.realtime.subscribe = async () => async () => {};
  if (user) pb.authStore.save(jwt(user), user);

  const source = readFileSync(resolve(__dirname, '../../../src', html), 'utf8');
  document.body.innerHTML = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  await import(entry);
  if (domReady) document.dispatchEvent(new Event('DOMContentLoaded'));
  return modules;
}

const signIn = (user) => page.sync.getPb().authStore.save(jwt(user), user);
const signOut = () => page.sync.getPb().authStore.clear();
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const promptEl = () => document.getElementById('dialog-modal');
const promptIsOpen = () => promptEl() && !promptEl().classList.contains('hidden');
const live = () => waitFor(() => expect(page.session.getSyncSessionState()).toBe('live'), { timeout: 5000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  requests = [];
  pushes = [];
  reloads = 0;
  server.events.on('request:start', track);
});

afterEach(async () => {
  await teardownPage();
  server.events.removeListener('request:start', track);
  server.resetHandlers();
  document.body.innerHTML = '';
  localStorage.clear();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('switching accounts on one browser (ADR-0006)', () => {
  it('AC-005: A signs out with unsynced events and B signs in: nothing of A is pushed under B', async () => {
    serveBackend();
    await openPage({ user: USER_A });
    await live();
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0), { timeout: 5000 });

    signOut();
    await waitFor(() => expect(page.session.getSyncSessionState()).toBe('signed-out'));
    await page.idb.persistEvent(localEvent('evt-of-a'));
    pushes = [];

    signIn(USER_B);
    await settle(400);

    expect(pushes.filter((body) => body.local_id === 'evt-of-a')).toEqual([]);
    expect(pushes.filter((body) => body.owner === USER_B.id)).toEqual([]);
    expect(promptIsOpen()).toBe(true);
  }, 30000);
});

// #218: what each page's shared boot does against PocketBase (MSW over the real client).
// Each test loads a fresh module graph, the way a browser loads one page.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { server } from '../../mocks/server.js';

vi.mock('echarts/core', () => ({ use: () => {}, init: () => ({ setOption: () => {}, resize: () => {} }) }));

const EVT_LIST = '*/api/collections/events/records';
const EVT_ONE = '*/api/collections/events/records/:id';
const SNAP_LIST = '*/api/collections/snapshots/records';
const REFRESH = '*/api/collections/users/auth-refresh';
const HEALTH = '*/api/health';
const USER = { id: 'user1', email: 't@e.st' };

const PAGES = {
  board: { html: 'index.html', entry: '../../../src/kanban.js', domReady: true },
  timetracking: { html: 'timetracking.html', entry: '../../../src/modules/timetracking.js' },
  calendar: { html: 'calendar.html', entry: '../../../src/modules/calendar.js' },
  reports: { html: 'reports.html', entry: '../../../src/modules/reports.js' },
};

function jwt(expiresInSeconds = 3600) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: USER.id, type: 'auth', exp })}.sig`;
}

const listResponse = (items) => HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });

function record({ local_id, type, counter, board = '', scope = 'board', entity_id = board, payload }) {
  return {
    id: `rec-${local_id}`, local_id, event_type: type, hlc: { wallTime: 1000, counter, nodeId: 'node-remote' },
    at: '2026-06-07T00:00:00Z', actor_type: 'human', actor_id: null, board, scope, entity_id, payload,
  };
}

function unsyncedEvent(id) {
  return {
    id, type: 'board.created', hlc: { wallTime: Date.now(), counter: 0, nodeId: 'node-local' },
    at: new Date().toISOString(), actor: { type: 'human', id: null },
    scope: 'board', board_id: 'board-local', entity_id: 'board-local', payload: { board: { name: 'Offline board' } },
  };
}

let page = null;
let requests = [];
const track = ({ request }) => { requests.push(new URL(request.url).pathname); };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

afterEach(async () => {
  if (page) {
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
  server.events.removeListener('request:start', track);
  server.resetHandlers();
  document.body.innerHTML = '';
  vi.resetModules();
});

// Loads one page: seed IDB, sign in (or not), then run the page's entry as the browser would.
async function openPage(name, { signedIn = false, unsynced = [] } = {}) {
  vi.resetModules();
  await deleteDB('kanvana-db');
  const modules = {
    sync: await import('../../../src/modules/sync.js'),
    idb: await import('../../../src/modules/idb-store.js'),
    queue: await import('../../../src/modules/event-sourcing/sync-queue.js'),
    realtime: await import('../../../src/modules/event-sourcing/realtime.js'),
    indicator: await import('../../../src/modules/event-sourcing/sync-indicator.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
  };
  page = modules;
  modules.queue._setTimingForTesting({ debounceMs: 1, maxInFlight: 50 });
  modules.snapshot._setJitterForTesting(() => 0);
  for (const event of unsynced) await modules.idb.persistEvent(event);
  modules.idb._resetIdbForTesting();

  const pb = modules.sync.getPb();
  pb.realtime.subscribe = async () => async () => {};
  if (signedIn) pb.authStore.save(jwt(), USER);

  const { html, entry, domReady } = PAGES[name];
  const source = readFileSync(resolve(__dirname, '../../../src', html), 'utf8');
  document.body.innerHTML = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

  requests = [];
  server.events.on('request:start', track);
  await import(entry);
  if (domReady) document.dispatchEvent(new Event('DOMContentLoaded'));
  return modules;
}

function serveSignedInBackend({ remote = [], onEventPost = () => {}, onSnapshotPost = () => {} } = {}) {
  server.use(
    http.post(REFRESH, () => HttpResponse.json({ token: jwt(), record: USER })),
    http.get(HEALTH, () => HttpResponse.json({ code: 200 })),
    http.get(EVT_LIST, ({ request }) => {
      const filter = new URL(request.url).searchParams.get('filter') || '';
      return listResponse(filter === `owner = "${USER.id}"` ? remote : []);
    }),
    http.post(EVT_LIST, async ({ request }) => {
      const body = await request.json();
      onEventPost(body);
      return HttpResponse.json({ id: `rec-${body.local_id}`, ...body });
    }),
    http.delete(EVT_ONE, () => new HttpResponse(null, { status: 204 })),
    http.get(SNAP_LIST, () => listResponse([])),
    http.post(SNAP_LIST, async ({ request }) => {
      const form = await request.formData();
      onSnapshotPost({ board_id: form.get('board_id'), owner: form.get('owner') });
      return HttpResponse.json({ id: 'snap-new' });
    }),
  );
}

describe('time-tracking page boot (#218 AC-001, AC-005)', () => {
  it('uploads a locally saved time-tracking snapshot to PocketBase under __timetracking__', async () => {
    const { TIMETRACKING_SNAPSHOT_KEY, SNAPSHOT_EVENT_THRESHOLD } = await import('../../../src/modules/event-sourcing/snapshot.js');
    const remote = Array.from({ length: SNAPSHOT_EVENT_THRESHOLD }, (_, i) => record({
      local_id: `cust-${i}`, type: 'customer.created', counter: i, scope: 'timetracking',
      entity_id: `customer-${i}`, payload: { customer: { name: `Customer ${i}` } },
    }));
    const uploaded = [];
    serveSignedInBackend({ remote, onSnapshotPost: (s) => uploaded.push(s) });

    const { snapshot } = await openPage('timetracking', { signedIn: true });

    await waitFor(async () => expect(await snapshot.loadSnapshot(TIMETRACKING_SNAPSHOT_KEY)).not.toBeNull(), { timeout: 15000 });
    await waitFor(() => expect(uploaded).toEqual([{ board_id: TIMETRACKING_SNAPSHOT_KEY, owner: USER.id }]), { timeout: 5000 });
  }, 30000);
});

describe('calendar and reports page boot (#218 AC-003)', () => {
  it.each(['calendar', 'reports'])('the %s page pushes unsynced events and catches up remote ones', async (name) => {
    const pushed = [];
    serveSignedInBackend({
      remote: [record({ local_id: 'remote-board', type: 'board.created', counter: 1, board: 'board-remote', payload: { board: { name: 'From another device' } } })],
      onEventPost: (body) => pushed.push(body.local_id),
    });

    const { idb } = await openPage(name, { signedIn: true, unsynced: [unsyncedEvent('evt-offline')] });

    await waitFor(async () => expect(await idb.getUnsyncedEvents()).toHaveLength(0), { timeout: 5000 });
    expect(pushed).toEqual(['evt-offline']);
    const db = await idb.openStore();
    await waitFor(async () => expect(await db.get(idb.EVENTS_STORE, 'remote-board')).toMatchObject({ synced: true }));
  }, 20000);
});

describe('signed-out page boot (#218 AC-004)', () => {
  it.each(Object.keys(PAGES))('the %s page makes no PocketBase request beyond the health probe', async (name) => {
    server.use(http.get(HEALTH, () => HttpResponse.json({ code: 200 })));

    const { idb } = await openPage(name, { unsynced: [unsyncedEvent('evt-local')] });
    await new Promise((r) => setTimeout(r, 200));

    expect(requests.filter((path) => path !== '/api/health')).toEqual([]);
    expect(await idb.getUnsyncedEvents()).toHaveLength(1);
  }, 20000);
});

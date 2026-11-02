// #221 / ADR-0006: local data belongs to one account. Real page boot, real PocketBase SDK
// over MSW; "the same browser" is one fake IndexedDB shared by fresh module graphs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waitFor } from '@testing-library/dom';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { server } from '../../mocks/server.js';

// jsdom has no canvas; the reports page only needs to get as far as its boot.
vi.mock('echarts/core', () => ({ use: () => {}, init: () => ({ setOption: () => {}, resize: () => {} }) }));

const EVT_LIST = '*/api/collections/events/records';
const SNAP_LIST = '*/api/collections/snapshots/records';
const REFRESH = '*/api/collections/users/auth-refresh';
const HEALTH = '*/api/health';
const USER_A = { id: 'user-a', email: 'a@e.st' };
const USER_B = { id: 'user-b', email: 'b@e.st' };
const BOARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOARD_OF_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOARD_OFFLINE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BOARD_OLD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function jwt(user) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: user.id, type: 'auth', exp })}.sig`;
}

const listResponse = (items) => HttpResponse.json({ page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items });

function localEvent(id, boardId = BOARD_A) {
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

// A real reload takes the page's listeners with it; in one jsdom the old module graph's
// would keep running, and its DOMContentLoaded handler would boot it again.
const pageListeners = [];
const listenerTargets = [document, window].map((target) => ({ target, add: target.addEventListener }));
function trackPageListeners() {
  for (const { target, add } of listenerTargets) {
    target.addEventListener = function addListener(...args) {
      pageListeners.push([target, args]);
      return add.apply(target, args);
    };
  }
}
function removePageListeners() {
  for (const [target, args] of pageListeners.splice(0)) target.removeEventListener(...args);
}

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
  // The board entry is still rendering when a fast test is done; a real page just dies here.
  if (page.isBoard) await waitFor(() => expect(document.getElementById('board-container')?.dataset.viewMode).toBeTruthy(), { timeout: 20000 });
  // Going live publishes a deferred default board; it must land in this test's database.
  if (page.session.getSyncSessionState() === 'live') {
    await waitFor(async () => expect(await page.idb.isFirstPullPending()).toBe(false), { timeout: 500 }).catch(() => {});
    await settle(50);
  }
  await page.storage._flushPersistsForTesting().catch(() => {});
  page.dataOwner._resetDataOwnerForTesting();
  page.leader._resetSyncLeaderForTesting();
  page.session._resetSyncSessionForTesting();
  page.queue._resetSyncQueueForTesting();
  await page.queue._settleForTesting();
  await page.realtime._resetRealtimeForTesting();
  page.sync._resetAuthRefreshForTesting();
  page.indicator._resetSyncIndicatorForTesting();
  page.snapshot._resetSnapshotSchedulerForTesting();
  page.idb._resetIdbForTesting();
  removePageListeners();
  page = null;
}

// Loads the board page the way a browser does; the IndexedDB and localStorage carry over.
async function openPage({ html = 'index.html', entry = '../../../src/kanban.js', domReady = true, user = null, seed = async () => {}, beforeBoot = () => {} } = {}) {
  await teardownPage();
  vi.resetModules();
  trackPageListeners();
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
    leader: await import('../../../src/modules/event-sourcing/sync-leader.js'),
  };
  page = modules;
  modules.isBoard = domReady;
  modules.dataOwner._setReloadForTesting(() => { reloads += 1; });
  modules.queue._setTimingForTesting({ debounceMs: 1, maxInFlight: 50 });
  await seed(modules);
  modules.idb._resetIdbForTesting();

  const pb = modules.sync.getPb();
  pb.realtime.subscribe = async () => async () => {};
  if (user) pb.authStore.save(jwt(user), user);
  beforeBoot();

  const source = readFileSync(resolve(__dirname, '../../../src', html), 'utf8');
  document.body.innerHTML = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  await import(entry);
  if (domReady) document.dispatchEvent(new Event('DOMContentLoaded'));
  return modules;
}

function seedUnowned({ boards = [BOARD_A], unsynced = [] } = {}) {
  return async ({ idb }) => {
    const db = await idb.openStore();
    await db.put(idb.KV_STORE, boards.map((id) => ({ id, name: `Board ${id}`, createdAt: '2026-01-01T00:00:00Z' })), 'kanbanBoards');
    for (const id of boards) {
      await db.put(idb.READ_MODEL_STORE, [], `${id}:tasks`);
      await db.put(idb.READ_MODEL_STORE, [], `${id}:labels`);
      await db.put(idb.READ_MODEL_STORE, [{ id: '11111111-1111-4111-8111-111111111111', name: 'To Do', color: '#3583ff' }], `${id}:columns`);
    }
    // Set for every install past the event-log migration, so boot emits nothing of its own.
    await db.put(idb.KV_STORE, { at: 'x', emitted: 0 }, 'kanvana:migrations:eventBackfill:v1');
    for (const id of unsynced) await idb.persistEvent(localEvent(id));
  };
}

function seedOwnedBy(user, data) {
  return async (modules) => {
    await seedUnowned(data)(modules);
    await modules.idb.claimDataOwner(user.id);
  };
}

function remoteBoard(boardId, name = 'From the server') {
  return {
    id: `rec-${boardId}`, local_id: `remote-${boardId}`, event_type: 'board.created',
    hlc: { wallTime: Date.now() - 1000, counter: 1, nodeId: 'node-remote' },
    at: '2026-06-07T00:00:00Z', actor_type: 'human', actor_id: null, board: boardId, scope: 'board', entity_id: boardId,
    created: new Date().toISOString(),
    payload: { board: { name } },
  };
}

async function ownerOnDisk() {
  const db = await openDB('kanvana-db');
  const owner = await db.get('kv', 'kanvana:dataOwner');
  db.close();
  return owner ?? null;
}

const signIn = (user) => page.sync.getPb().authStore.save(jwt(user), user);
const signOut = () => page.sync.getPb().authStore.clear();
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const promptEl = () => document.getElementById('dialog-modal');
const promptIsOpen = () => Boolean(promptEl()) && !promptEl().classList.contains('hidden');
const live = () => waitFor(() => expect(page.session.getSyncSessionState()).toBe('live'), { timeout: 20000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => {
  server.close();
  for (const { target, add } of listenerTargets) target.addEventListener = add;
});

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

  it('AC-001, AC-009: the prompt names N and nothing syncs until the user chooses', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1', 'evt-2', 'evt-3'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));
    await settle();

    const message = document.getElementById('dialog-modal-message').textContent;
    expect(message).toContain('3 unsynced changes');
    expect(document.getElementById('dialog-confirm-btn').textContent).toBe('Discard 3 unsynced changes and continue');
    expect(document.getElementById('dialog-cancel-btn').textContent).toBe('Cancel');
    expect(page.session.getSyncSessionState()).toBe('signed-out');
    expect(pushes).toEqual([]);
    expect(requests.filter((r) => r.includes('/collections/events') || r.includes('/collections/snapshots') || r.includes('/realtime'))).toEqual([]);
    expect(reloads).toBe(0);
  }, 30000);

  it('makes Cancel the default action of the prompt, not Discard', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    expect(document.activeElement?.id).toBe('dialog-cancel-btn');
  }, 30000);

  it('AC-002, AC-008: with nothing unsynced, B replaces A without a prompt and sees only their own data', async () => {
    serveBackend({ remoteFor: (owner) => (owner === USER_B.id ? [remoteBoard(BOARD_OF_B)] : []) });
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });
    await waitFor(() => expect(reloads).toBe(1));
    expect(promptIsOpen()).toBe(false);
    expect(await ownerOnDisk()).toBe(USER_B.id);

    await openPage({ user: USER_B });
    await live();

    await waitFor(() => expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_OF_B));
    expect(page.storage.listBoards().map((b) => b.id)).not.toContain(BOARD_A);
    expect(promptIsOpen()).toBe(false);
    expect(pushes.filter((body) => body.board === BOARD_A)).toEqual([]);
  }, 30000);

  it('AC-001, AC-010: Discard wipes, B becomes the Data Owner and catches up, and none of A\'s events reach the server', async () => {
    serveBackend({ remoteFor: (owner) => (owner === USER_B.id ? [remoteBoard(BOARD_OF_B)] : []) });
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A], unsynced: ['evt-1', 'evt-2'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    document.getElementById('dialog-confirm-btn').click();
    await waitFor(() => expect(reloads).toBe(1));
    expect(await ownerOnDisk()).toBe(USER_B.id);

    await openPage({ user: USER_B });
    await live();
    await waitFor(() => expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_OF_B));

    expect(page.storage.listBoards().map((b) => b.id)).not.toContain(BOARD_A);
    expect((await page.idb.getUnsyncedEvents()).map((e) => e.id)).not.toContain('evt-1');
    expect(pushes.filter((body) => ['evt-1', 'evt-2'].includes(body.local_id))).toEqual([]);
  }, 30000);

  it('AC-011: Cancel signs B out and leaves the data, queue and Data Owner of A as they were', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A], unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    document.getElementById('dialog-cancel-btn').click();

    await waitFor(() => expect(page.sync.isAuthenticated()).toBe(false));
    await settle();
    expect(reloads).toBe(0);
    expect(page.session.getSyncSessionState()).toBe('signed-out');
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect((await page.idb.getUnsyncedEvents()).map((e) => e.id)).toEqual(['evt-1']);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_A);
    expect(pushes).toEqual([]);
  }, 30000);

  it('asks again when more events were queued than the user agreed to discard', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    await page.idb.persistEvent(localEvent('evt-from-another-tab'));
    document.getElementById('dialog-confirm-btn').click();

    await waitFor(() => expect(document.getElementById('dialog-confirm-btn').textContent).toContain('Discard 2 unsynced changes'));
    expect(reloads).toBe(0);
    expect(await page.idb.getUnsyncedEvents()).toHaveLength(2);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
  }, 30000);

  it('does nothing on a prompt answered after its account already left', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    signOut();
    document.getElementById('dialog-confirm-btn').click();
    await settle();

    expect(reloads).toBe(0);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect(await page.idb.getUnsyncedEvents()).toHaveLength(1);
  }, 30000);

  it('does not sign out the account now signed in when an older prompt is cancelled', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    signOut();
    signIn(USER_A);
    document.getElementById('dialog-cancel-btn').click();
    await live();

    expect(page.sync.getUser()?.id).toBe(USER_A.id);
    await waitFor(() => expect(pushes.map((body) => [body.local_id, body.owner])).toEqual([['evt-1', USER_A.id]]));
  }, 30000);
});

describe('what a wipe keeps and removes', () => {
  it('removes account data and derived state, and keeps what belongs to the browser', async () => {
    serveBackend();
    const seed = seedOwnedBy(USER_A, { boards: [BOARD_A] });
    await openPage({
      user: USER_B,
      seed: async (modules) => {
        await seed(modules);
        const db = await modules.idb.openStore();
        await db.put(modules.idb.KV_STORE, 'node-of-this-browser', 'kanvana:hlc:node');
        await db.put(modules.idb.KV_STORE, { wallTime: 5, counter: 0, nodeId: 'n' }, `kanvana:sync:lastSeenHlc:${BOARD_A}`);
        await db.put(modules.idb.KV_STORE, { [BOARD_A]: { wallTime: 5, counter: 0, nodeId: 'n' } }, 'kanvana:ingest:newestAppliedHlc');
        await db.put(modules.idb.KV_STORE, { hideDone: true }, 'kanvana:settings:global');
        await db.put(modules.idb.KV_STORE, { customers: [{ id: 'c1' }] }, 'kanvana:timetracking');
        await db.put(modules.idb.READ_MODEL_STORE, ['task-id'], `${BOARD_A}:taskTombstones`);
        await db.put(modules.idb.SNAPSHOTS_STORE, { hlc: { wallTime: 5, counter: 0, nodeId: 'n' } }, BOARD_A);
        localStorage.setItem('kanban-theme', 'dark');
        localStorage.setItem('kanvana:timetracking:lastUsedProjectId', 'project-of-a');
      },
    });
    await waitFor(() => expect(reloads).toBe(1));

    const db = await openDB('kanvana-db');
    const kvKeys = await db.getAllKeys('kv');
    expect(kvKeys.sort()).toEqual(['kanvana:dataGeneration', 'kanvana:dataOwner', 'kanvana:dataReplaced:0', 'kanvana:hlc:node', 'kanvana:sync:firstPullPending']);
    expect(await db.get('kv', 'kanvana:hlc:node')).toBe('node-of-this-browser');
    expect(await db.getAllKeys('events')).toEqual([]);
    expect(await db.getAllKeys('snapshots')).toEqual([]);
    expect(await db.getAllKeys('read_model')).toEqual([]);
    db.close();
    expect(localStorage.getItem('kanban-theme')).toBe('dark');
    expect(localStorage.getItem('kanvana:timetracking:lastUsedProjectId')).toBeNull();
  }, 30000);
});

describe('the default board after a wipe', () => {
  const stableId = '00000000-0000-4000-8000-000000000001';

  it('emits nothing for it when the new account already has that board, and shows no demo tasks', async () => {
    const remote = [remoteBoard(stableId, 'Renamed by B')];
    serveBackend({ remoteFor: (owner) => (owner === USER_B.id ? remote : []) });
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });
    await waitFor(() => expect(reloads).toBe(1));

    await openPage({ user: USER_B });
    await live();
    await settle(400);

    expect(pushes).toEqual([]);
    expect(page.storage.loadTasksForBoard(stableId)).toEqual([]);
  }, 30000);

  it('publishes it once when the new account has nothing yet', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });
    await waitFor(() => expect(reloads).toBe(1));

    await openPage({ user: USER_B });
    await live();

    await waitFor(() => expect(pushes.filter((body) => body.event_type === 'board.created').map((body) => [body.board, body.owner])).toEqual([[stableId, USER_B.id]]));
    await waitFor(() => expect(pushes.filter((body) => body.event_type === 'column.created')).toHaveLength(3));
    expect(page.storage.loadTasksForBoard(stableId)).toEqual([]);
    await waitFor(async () => expect(await page.idb.getUnsyncedEvents()).toHaveLength(0));

    const pushedOnce = pushes.length;
    await openPage({ user: USER_B });
    await live();
    await settle(400);
    expect(pushes).toHaveLength(pushedOnce);
  }, 40000);
});

describe('an interrupted wipe', () => {
  it('leaves the old data and owner whole, signs B out and uploads nothing', async () => {
    serveBackend();
    await openPage({
      user: USER_B,
      seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }),
      beforeBoot: () => {
        const realClear = IDBObjectStore.prototype.clear;
        vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function clear() {
          if (this.name === 'read_model') throw new Error('interrupted');
          return realClear.call(this);
        });
      },
    });

    await waitFor(() => expect(page.sync.isAuthenticated()).toBe(false));
    vi.restoreAllMocks();
    expect(reloads).toBe(0);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    const db = await page.idb.openStore();
    expect((await db.get(page.idb.KV_STORE, 'kanbanBoards')).map((b) => b.id)).toContain(BOARD_A);
    expect(await db.get(page.idb.READ_MODEL_STORE, `${BOARD_A}:columns`)).not.toBeUndefined();
    expect(pushes).toEqual([]);
    expect(page.session.getSyncSessionState()).toBe('signed-out');
  }, 30000);

  it('a boot with B\'s token and A still the owner runs the check again and uploads nothing', async () => {
    serveBackend();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    await openPage({ user: USER_B }); // the browser died with the prompt open
    await waitFor(() => expect(promptIsOpen()).toBe(true));
    await settle();

    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect(await page.idb.getUnsyncedEvents()).toHaveLength(1);
    expect(pushes).toEqual([]);
  }, 30000);
});

describe('first sign-in and the same account (ADR-0006)', () => {
  it('AC-003, AC-006: offline data with no Data Owner goes to the first account, silently, and uploads under it', async () => {
    serveBackend();
    await openPage({ seed: seedUnowned({ boards: [BOARD_OFFLINE], unsynced: ['evt-offline'] }) });
    expect(await page.idb.getDataOwner()).toBeNull();

    signIn(USER_A);
    await live();

    await waitFor(() => expect(pushes.map((body) => [body.local_id, body.owner])).toContainEqual(['evt-offline', USER_A.id]));
    expect(promptIsOpen()).toBe(false);
    expect(reloads).toBe(0);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_OFFLINE);
  }, 30000);

  it('AC-004, AC-007: the Data Owner signing back in gets no prompt, keeps everything, and the queue drains', async () => {
    serveBackend();
    await openPage({ seed: seedOwnedBy(USER_A, { boards: [BOARD_A], unsynced: ['evt-1'] }) });

    signIn(USER_A);
    await live();

    await waitFor(() => expect(pushes.map((body) => [body.local_id, body.owner])).toContainEqual(['evt-1', USER_A.id]));
    expect(promptIsOpen()).toBe(false);
    expect(reloads).toBe(0);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_A);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
  }, 30000);

  it('AC-012: after sign-out the data stays visible, offline edits stay queued, and they push under the same account', async () => {
    serveBackend();
    await openPage({ user: USER_A, seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });
    await live();

    signOut();
    await waitFor(() => expect(page.session.getSyncSessionState()).toBe('signed-out'));
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_A);

    const created = page.storage.createBoard('Written while signed out').id;
    await settle();
    expect(pushes.filter((body) => body.board === created)).toEqual([]);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(created);

    signIn(USER_A);
    await live();

    await waitFor(() => expect(pushes.filter((body) => body.board === created).length).toBeGreaterThan(0));
    expect(pushes.filter((body) => body.board === created).every((body) => body.owner === USER_A.id)).toBe(true);
    expect(promptIsOpen()).toBe(false);
  }, 30000);

  it('AC-013: an install from before this change, signed in at launch, is claimed by that account and nothing is wiped', async () => {
    serveBackend();
    await openPage({ user: USER_A, seed: seedUnowned({ boards: [BOARD_OLD] }) });
    await live();

    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
    expect(reloads).toBe(0);
    expect(promptIsOpen()).toBe(false);
    expect(page.storage.listBoards().map((b) => b.id)).toContain(BOARD_OLD);
  }, 30000);

  it('AC-015: logging out clears the token locally and asks nothing of the server', async () => {
    serveBackend();
    await openPage({ user: USER_A, seed: seedOwnedBy(USER_A, {}) });
    await live();
    await settle();
    requests = [];

    document.getElementById('logout-btn').click();
    await settle();

    expect(page.sync.getPb().authStore.token).toBe('');
    expect(requests).toEqual([]);
  }, 30000);
});

describe('launching offline with a stored token', () => {
  const goOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

  it('prompts when another account has unsynced data, with no network', async () => {
    serveBackend();
    goOffline();
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });

    await waitFor(() => expect(promptIsOpen()).toBe(true));
    expect(page.session.getSyncSessionState()).toBe('signed-out');
    expect(pushes).toEqual([]);
  }, 30000);

  it('goes offline straight away for the Data Owner', async () => {
    serveBackend();
    goOffline();
    await openPage({ user: USER_A, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });

    await waitFor(() => expect(page.session.getSyncSessionState()).toBe('offline'));
    expect(promptIsOpen()).toBe(false);
    expect(pushes).toEqual([]);
  }, 30000);
});

describe('every page', () => {
  it.each([
    ['calendar.html', '../../../src/modules/calendar.js'],
    ['reports.html', '../../../src/modules/reports.js'],
    ['timetracking.html', '../../../src/modules/timetracking.js'],
  ])('%s shows the prompt, and Cancel works', async (html, entry) => {
    serveBackend();
    await openPage({ html, entry, domReady: false, user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await waitFor(() => expect(promptIsOpen()).toBe(true));

    document.getElementById('dialog-cancel-btn').click();

    await waitFor(() => expect(page.sync.isAuthenticated()).toBe(false));
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
  }, 30000);
});

describe('other tabs', () => {
  const setVisibility = (state) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('a hidden tab leaves the prompt until it is looked at', async () => {
    serveBackend();
    setVisibility('hidden');
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await settle(400);
    expect(promptIsOpen()).toBe(false);
    expect(page.session.getSyncSessionState()).toBe('signed-out');

    setVisibility('visible');

    await waitFor(() => expect(promptIsOpen()).toBe(true));
  }, 30000);

  it('a tab hidden during another tab\'s Cancel never prompts for the account that left', async () => {
    serveBackend();
    setVisibility('hidden');
    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
    await settle();

    signOut();
    setVisibility('visible');
    await settle();

    expect(promptIsOpen()).toBe(false);
    expect(await page.idb.getDataOwner()).toBe(USER_A.id);
  }, 30000);

  it('reloads when another tab announces a wipe', async () => {
    serveBackend();
    await openPage({ seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });
    await settle(50);

    const otherTab = new BroadcastChannel('kanvana:data-owner-wipe');
    otherTab.postMessage('wiped');
    otherTab.close();

    await waitFor(() => expect(reloads).toBe(1));
  }, 30000);

  it('announces its own wipe to other tabs', async () => {
    serveBackend();
    const otherTab = new BroadcastChannel('kanvana:data-owner-wipe');
    const notices = [];
    otherTab.onmessage = (e) => notices.push(e.data);

    await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { boards: [BOARD_A] }) });

    await waitFor(() => expect(notices).toEqual(['wiped']));
    otherTab.close();
  }, 30000);

  it('keeps the new account signed in when the wipe notice reaches a tab in the middle of its own check', async () => {
    serveBackend();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name, ...rest) => {
          const work = rest.at(-1);
          if (name === 'kanvana:sync-leader') return work({ name });
          const otherTab = new BroadcastChannel('kanvana:data-owner-wipe');
          otherTab.postMessage('wiped');
          otherTab.close();
          await waitFor(() => expect(reloads).toBe(1));
          return work(); // this page's connection is closed by now
        },
      },
    });
    try {
      await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
      await waitFor(() => expect(reloads).toBe(1));
      await settle();
    } finally {
      delete navigator.locks;
    }

    expect(page.sync.isAuthenticated()).toBe(true);
    expect(promptIsOpen()).toBe(false);
  }, 30000);

  describe('the first pull after a wipe', () => {
    const stableId = '00000000-0000-4000-8000-000000000001';
    const wiped = async ({ idb }) => {
      await idb.replaceLocalData({ ownerId: USER_B.id, maxUnsynced: 0 });
    };
    // Another tab holds the leader lock until the test hands it over.
    function anotherTabLeads() {
      let handOver;
      const handedOver = new Promise((res) => { handOver = res; });
      Object.defineProperty(navigator, 'locks', {
        configurable: true,
        value: {
          request: (name, ...rest) => {
            const work = rest.at(-1);
            if (name !== 'kanvana:sync-leader') return Promise.resolve(work({ name }));
            if (rest[0].ifAvailable) return Promise.resolve(work(null));
            return handedOver.then(() => work({ name }));
          },
        },
      });
      return handOver;
    }

    afterEach(() => { delete navigator.locks; });

    it('a follower going live is not a finished pull: it publishes nothing and leaves the pull pending', async () => {
      serveBackend();
      anotherTabLeads();
      await openPage({ user: USER_B, seed: wiped });
      await live();
      await settle(400);

      expect(requests.filter((r) => r.includes('/collections/events'))).toEqual([]);
      expect(await page.idb.isFirstPullPending()).toBe(true);
      const db = await page.idb.openStore();
      expect((await db.getAll(page.idb.EVENTS_STORE)).filter((e) => e.board_id === stableId)).toEqual([]);
    }, 30000);

    it('is finished by the tab that takes over as leader', async () => {
      serveBackend();
      const handOver = anotherTabLeads();
      await openPage({ user: USER_B, seed: wiped });
      await live();

      handOver();

      await waitFor(() => expect(requests.filter((r) => r === 'GET /api/collections/events/records').length).toBeGreaterThan(0), { timeout: 10000 });
      await waitFor(async () => expect(await page.idb.isFirstPullPending()).toBe(false), { timeout: 10000 });
      expect(reloads).toBe(0);
    }, 30000);

    it('a pull that failed leaves it pending and emits nothing for the default board', async () => {
      serveBackend();
      server.use(http.get(EVT_LIST, () => new HttpResponse(null, { status: 500 })));
      await openPage({ user: USER_B, seed: wiped });
      await live();
      await settle(400);

      expect(await page.idb.isFirstPullPending()).toBe(true);
      expect(pushes).toEqual([]);
    }, 30000);

    it('later launches find it finished and sync as usual', async () => {
      serveBackend();
      await openPage({ user: USER_B, seed: wiped });
      await live();
      await waitFor(async () => expect(await page.idb.isFirstPullPending()).toBe(false));
    }, 30000);
  });

  it('a tab that waited out another tab\'s wipe reloads instead of syncing the old data it still holds', async () => {
    serveBackend();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name, ...rest) => {
          const work = rest.at(-1);
          if (name === 'kanvana:sync-leader') return work({ name });
          await page.idb.replaceLocalData({ ownerId: USER_B.id, maxUnsynced: 99 });
          return work();
        },
      },
    });
    try {
      await openPage({ user: USER_B, seed: seedOwnedBy(USER_A, { unsynced: ['evt-1'] }) });
      await waitFor(() => expect(reloads).toBe(1));
      await settle();
    } finally {
      delete navigator.locks;
    }

    expect(promptIsOpen()).toBe(false);
    expect(page.session.getSyncSessionState()).toBe('signed-out');
    expect(pushes).toEqual([]);
  }, 30000);
});

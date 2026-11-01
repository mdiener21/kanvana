// #221: an account switch with two tabs open, in a real browser: the auth store's storage
// event, Web Locks, BroadcastChannel and page reloads are what is under test. The backend
// is mocked at the network layer.
import { expect, test } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

const USERS = {
  'a@e.st': { id: 'useraaaaaaaaaaa', email: 'a@e.st', name: 'User A' },
  'b@e.st': { id: 'userbbbbbbbbbbb', email: 'b@e.st', name: 'User B' },
};
const BOARD_OF_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jwt(user) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: user.id, type: 'auth', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const list = (items) => ({ json: { page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items } });

// One server per test: pushes are stored and served back per owner, as PocketBase would.
async function mockBackend(context) {
  const server = { events: [] };
  server.events.push({
    id: 'rec-b', local_id: 'remote-board-b', owner: USERS['b@e.st'].id, event_type: 'board.created',
    hlc: { wallTime: Date.now() - 60_000, counter: 0, nodeId: 'node-remote' }, at: new Date().toISOString(),
    actor_type: 'human', actor_id: null, board: BOARD_OF_B, scope: 'board', entity_id: BOARD_OF_B,
    created: new Date().toISOString(), payload: { board: { name: 'Board of B' } },
  });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/health') return route.fulfill({ json: { code: 200 } });
    if (url.pathname === '/api/realtime') return route.abort();
    if (url.pathname.endsWith('/auth-with-password')) {
      const user = USERS[request.postDataJSON().identity];
      return route.fulfill({ json: { token: jwt(user), record: user } });
    }
    if (url.pathname.endsWith('/auth-refresh')) return route.fulfill({ status: 503, json: {} });
    if (url.pathname.endsWith('/snapshots/records')) return route.fulfill(list([]));
    if (url.pathname.endsWith('/events/records') && request.method() === 'POST') {
      const body = request.postDataJSON();
      const stored = { ...body, id: `rec-${body.local_id}`, created: new Date().toISOString() };
      server.events.push(stored);
      return route.fulfill({ json: stored });
    }
    if (url.pathname.endsWith('/events/records')) {
      const owner = /owner = "([^"]+)"/.exec(url.searchParams.get('filter') || '')?.[1];
      return route.fulfill(list(server.events.filter((event) => event.owner === owner)));
    }
    return route.fulfill({ status: 404, json: {} });
  });
  server.eventsOf = (email) => server.events.filter((event) => event.owner === USERS[email].id);
  return server;
}

async function signIn(page, email) {
  await page.locator('#login-btn').click();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill('secret-password');
  await page.locator('#email-auth-submit').click();
}

const boardsOf = (page) => page.evaluate(async () => {
  const { listBoards } = await import('/modules/storage.js');
  return listBoards().map((board) => board.name);
});

const dataOwner = (page) => page.evaluate(async () => {
  const { getDataOwner } = await import('/modules/idb-store.js');
  return getDataOwner();
});

const unsyncedCount = (page) => page.evaluate(async () => {
  const { getUnsyncedEvents } = await import('/modules/idb-store.js');
  return (await getUnsyncedEvents()).length;
});

const createBoard = (page, name) => page.evaluate(async (boardName) => {
  const { createBoard: create } = await import('/modules/storage.js');
  create(boardName);
}, name);

// A signed in and fully synced, then signed out with one edit the server never got.
async function twoTabsWithUnsyncedDataOfA(context, server) {
  const first = await context.newPage();
  await first.goto('/');
  await waitForBoardReady(first);
  const second = await context.newPage();
  await second.goto('/');
  await waitForBoardReady(second);

  await signIn(first, 'a@e.st');
  await expect.poll(() => server.eventsOf('a@e.st').length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => unsyncedCount(first), { timeout: 20_000 }).toBe(0);
  await expect(second.locator('#user-name')).toHaveText('User A');
  await first.locator('#logout-btn').click();
  await expect(second.locator('#login-btn')).toBeVisible();
  await createBoard(first, 'Unsynced board of A');
  return { first, second };
}

const visiblePrompts = async (pages) => {
  const open = [];
  for (const page of pages) {
    if (await page.locator('#dialog-modal').isVisible()) open.push(page);
  }
  return open;
};

test('one prompt across two tabs; Discard replaces the data in both and nothing of A reaches B', async ({ context }) => {
  const server = await mockBackend(context);
  const { first, second } = await twoTabsWithUnsyncedDataOfA(context, server);

  await signIn(first, 'b@e.st');

  await expect.poll(async () => (await visiblePrompts([first, second])).length, { timeout: 15_000 }).toBe(1);
  await first.waitForTimeout(1000);
  const [promptPage] = await visiblePrompts([first, second]);
  expect((await visiblePrompts([first, second])).length).toBe(1);
  const queued = await unsyncedCount(promptPage);
  expect(queued).toBeGreaterThan(0);
  await expect(promptPage.locator('#dialog-modal-message')).toContainText(`${queued} unsynced change`);
  await expect(promptPage.locator('#dialog-cancel-btn')).toBeFocused();
  expect(server.eventsOf('b@e.st').filter((event) => event.local_id !== 'remote-board-b')).toEqual([]);

  const reloads = [first, second].map((page) => page.waitForEvent('load'));
  await promptPage.locator('#dialog-confirm-btn').click();
  await Promise.all(reloads);

  for (const page of [first, second]) {
    await waitForBoardReady(page);
    await expect.poll(() => boardsOf(page), { timeout: 20_000 }).toContain('Board of B');
    expect(await boardsOf(page)).not.toContain('Unsynced board of A');
    expect(await dataOwner(page)).toBe(USERS['b@e.st'].id);
    await expect(page.locator('#dialog-modal')).toBeHidden();
  }
  // What both tabs saved is whole: a later page load still has the account's board.
  await first.reload();
  await waitForBoardReady(first);
  await expect.poll(() => boardsOf(first), { timeout: 20_000 }).toContain('Board of B');
  const pushedByB = JSON.stringify(server.eventsOf('b@e.st'));
  expect(pushedByB).not.toContain('Unsynced board of A');
});

test('Cancel in one tab signs B out of both and leaves the data of A in both', async ({ context }) => {
  const server = await mockBackend(context);
  const { first, second } = await twoTabsWithUnsyncedDataOfA(context, server);

  await signIn(first, 'b@e.st');
  await expect.poll(async () => (await visiblePrompts([first, second])).length, { timeout: 15_000 }).toBe(1);
  const [promptPage] = await visiblePrompts([first, second]);

  await promptPage.locator('#dialog-cancel-btn').click();

  for (const page of [first, second]) {
    await expect(page.locator('#login-btn')).toBeVisible();
    expect(await dataOwner(page)).toBe(USERS['a@e.st'].id);
  }
  await first.waitForTimeout(500);
  expect((await visiblePrompts([first, second])).length).toBe(0);
  expect(await boardsOf(first)).toContain('Unsynced board of A');
  expect(server.eventsOf('b@e.st').filter((event) => event.local_id !== 'remote-board-b')).toEqual([]);

  // A can still send it from either tab.
  await signIn(second, 'a@e.st');
  await expect.poll(() => JSON.stringify(server.eventsOf('a@e.st')), { timeout: 20_000 }).toContain('Unsynced board of A');
});

// #222 AC-001..AC-004 against a live PocketBase: several tabs of one browser, one leader.
// A second browser context plays another device. Run with npm run test:e2e:live; the spec
// skips itself when PocketBase is unreachable, so a green run with it down proves nothing.
import { test, expect, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';

const PB_URL = process.env.PB_PROXY_TARGET || process.env.VITE_PB_URL || 'http://localhost:8090';
const PASSWORD = 'sync-leader-pw-123';

let pbReachable = false;

test.beforeAll(async () => {
  try {
    pbReachable = (await fetch(`${PB_URL}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    pbReachable = false;
  }
});

async function registerAccount(email: string): Promise<void> {
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, passwordConfirm: PASSWORD, name: 'Leader' }),
  });
  if (!res.ok) throw new Error(`PB user registration failed (${res.status}): ${await res.text()}`);
}

async function serverEvents(email: string): Promise<{ local_id: string; event_type: string; payload: { task?: { title?: string } } }[]> {
  const auth = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: PASSWORD }),
  });
  const { token } = await auth.json();
  const res = await fetch(`${PB_URL}/api/collections/events/records?perPage=500`, { headers: { Authorization: token } });
  const { items } = await res.json();
  return items;
}

async function pushesOfTask(email: string, title: string): Promise<number> {
  const events = await serverEvents(email);
  return events.filter((event) => event.event_type === 'task.created' && event.payload?.task?.title === title).length;
}

// What each tab asks of the server, for telling which one does the sync work.
function watchNetwork(page: Page) {
  const log = { streams: [] as Request[], pulls: 0, pushes: 0 };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/realtime' && request.method() === 'GET') log.streams.push(request);
    if (url.pathname === '/api/collections/events/records') {
      if (request.method() === 'GET' && url.searchParams.get('page') === '1') log.pulls += 1;
      if (request.method() === 'POST') log.pushes += 1;
    }
  });
  return log;
}

async function logIn(page: Page, email: string): Promise<void> {
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-modal')).toBeVisible();
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('#email-auth-submit').click();
  await expect(page.locator('#login-btn')).toBeHidden();
}

async function openTab(context: BrowserContext) {
  const page = await context.newPage();
  const network = watchNetwork(page);
  await page.goto('/');
  await expect(page.locator('#board-container')).toHaveAttribute('data-view-mode', /^(columns|swimlanes)$/, { timeout: 30_000 });
  return { page, network };
}

// The first tab opened is the leader; the second tab is open before sign-in, so it hears of it.
async function signedInTabs(browser: Browser, email: string) {
  const context = await browser.newContext();
  const leader = await openTab(context);
  const follower = await openTab(context);
  await logIn(leader.page, email);
  await expect(follower.page.locator('#login-btn')).toBeHidden({ timeout: 5000 });
  await expectIndicator(leader.page, 'Live');
  await expectIndicator(follower.page, 'Live');
  return { context, leader, follower };
}

async function expectIndicator(page: Page, text: string) {
  await expect(page.locator('#sync-indicator')).toContainText(text, { timeout: 15_000 });
}

async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add task to To Do' }).click();
  const modal = page.locator('#task-modal');
  await expect(modal).toBeVisible();
  await modal.locator('#task-title').fill(title);
  await page.locator('#task-submit-btn').click();
  await expect(modal).toBeHidden();
}

const card = (page: Page, title: string) => page.getByRole('listitem', { name: new RegExp(`Task: ${title}`, 'i') });
const uniqueEmail = (name: string) => `${name}-${Date.now()}@example.test`;

test.describe('sync leader (live PocketBase)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    test.skip(!pbReachable, `PocketBase not reachable at ${PB_URL}.`);
  });

  test('AC-001: each edit is pushed once, and one tab alone holds the subscription', async ({ browser }) => {
    const email = uniqueEmail('ac1');
    await registerAccount(email);
    const { context, leader, follower } = await signedInTabs(browser, email);

    await addTask(follower.page, 'From the follower');
    await addTask(leader.page, 'From the leader');

    await expect.poll(() => pushesOfTask(email, 'From the follower'), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => pushesOfTask(email, 'From the leader'), { timeout: 10_000 }).toBe(1);
    await expectIndicator(follower.page, 'Live');
    await expectIndicator(leader.page, 'Live');

    expect(leader.network.streams).toHaveLength(1);
    expect(follower.network.streams).toHaveLength(0);
    expect(follower.network.pushes).toBe(0);
    expect(follower.network.pulls).toBe(0);

    // Settled: a repeat push would show as a second record.
    await new Promise((res) => setTimeout(res, 1500));
    expect(await pushesOfTask(email, 'From the follower')).toBe(1);
    expect(await pushesOfTask(email, 'From the leader')).toBe(1);
    await context.close();
  });

  test('AC-002: a remote event shows in both tabs without a reload, and a follower edit right after it keeps both', async ({ browser }) => {
    const email = uniqueEmail('ac2');
    await registerAccount(email);
    const { context, leader, follower } = await signedInTabs(browser, email);
    let reloads = 0;
    leader.page.on('framenavigated', () => { reloads += 1; });
    follower.page.on('framenavigated', () => { reloads += 1; });

    const otherDevice = await browser.newContext();
    const device = await openTab(otherDevice);
    await logIn(device.page, email);
    await expectIndicator(device.page, 'Live');
    await addTask(device.page, 'From another device');

    await expect(card(leader.page, 'From another device')).toBeVisible({ timeout: 5000 });
    await expect(card(follower.page, 'From another device')).toBeVisible({ timeout: 5000 });
    expect(reloads).toBe(0);

    await addTask(follower.page, 'Right after it');
    await expect(card(leader.page, 'Right after it')).toBeVisible({ timeout: 5000 });
    await expect(card(device.page, 'Right after it')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => pushesOfTask(email, 'Right after it'), { timeout: 10_000 }).toBe(1);

    await follower.page.reload();
    await expect(card(follower.page, 'From another device')).toBeVisible({ timeout: 15_000 });
    await expect(card(follower.page, 'Right after it')).toBeVisible();
    await otherDevice.close();
    await context.close();
  });

  test('AC-003: the follower takes over within 5 seconds: one subscription, one catch-up, draining', async ({ browser }) => {
    const email = uniqueEmail('ac3');
    await registerAccount(email);
    const { context, leader, follower } = await signedInTabs(browser, email);

    // The edit stays stored for the new leader: the old one can't get it to the server.
    await leader.page.route('**/api/collections/events/records', (route) => (
      route.request().method() === 'POST' ? route.abort() : route.continue()
    ));
    await addTask(follower.page, 'Left for the next leader');
    await expect.poll(() => leader.network.pushes, { timeout: 5000 }).toBeGreaterThan(0);
    expect(await pushesOfTask(email, 'Left for the next leader')).toBe(0);
    await leader.page.close();
    const closedAt = Date.now();

    await expect.poll(() => follower.network.streams.length, { timeout: 5000 }).toBe(1);
    await expect.poll(() => follower.network.pulls, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => pushesOfTask(email, 'Left for the next leader'), { timeout: 5000, intervals: [200] }).toBe(1);
    expect(Date.now() - closedAt).toBeLessThan(5000);

    await addTask(follower.page, 'Made by the new leader');
    await expect.poll(() => pushesOfTask(email, 'Made by the new leader'), { timeout: 5000 }).toBe(1);
    await expectIndicator(follower.page, 'Live');
    expect(follower.network.pulls).toBe(1);
    expect(follower.network.streams).toHaveLength(1);
    await context.close();
  });

  test('AC-003: the session carries over: signing out in the follower stops the leader; sign-in in a new leader runs', async ({ browser }) => {
    const email = uniqueEmail('ac3-signout');
    await registerAccount(email);
    const { context, leader, follower } = await signedInTabs(browser, email);

    await follower.page.locator('#logout-btn').click();
    await expect(leader.page.locator('#login-btn')).toBeVisible({ timeout: 5000 });
    await expectIndicator(leader.page, 'Offline');
    await expectIndicator(follower.page, 'Offline');

    await leader.page.close();
    await new Promise((res) => setTimeout(res, 1000));
    expect(follower.network.streams).toHaveLength(0);
    expect(follower.network.pulls).toBe(0);

    await logIn(follower.page, email);
    await expectIndicator(follower.page, 'Live');
    expect(follower.network.streams).toHaveLength(1);
    await context.close();
  });

  test('AC-004: without Web Locks each tab syncs alone, and the server keeps one copy of each event', async ({ browser }) => {
    const email = uniqueEmail('ac4');
    await registerAccount(email);
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined });
    });
    const one = await openTab(context);
    const two = await openTab(context);
    await logIn(one.page, email);
    await expect(two.page.locator('#login-btn')).toBeHidden({ timeout: 5000 });
    await expectIndicator(one.page, 'Live');
    await expectIndicator(two.page, 'Live');

    await addTask(one.page, 'No locks here');

    await expect(card(two.page, 'No locks here')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => pushesOfTask(email, 'No locks here'), { timeout: 10_000 }).toBe(1);
    expect(one.network.streams).toHaveLength(1);
    expect(two.network.streams).toHaveLength(1);
    await expectIndicator(two.page, 'Live');
    await context.close();
  });
});

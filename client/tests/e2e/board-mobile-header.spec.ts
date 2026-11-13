import { test, expect, devices, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

test.use({ ...devices['Pixel 5'] });

// The header buttons are wired by kanban.js. On a cold dev server the first navigation
// can take seconds to boot, and a tap before then is lost, so wait for the rendered board.
async function openBoard(page: Page) {
  await page.goto('/index.html');
  await waitForBoardReady(page);
}

// A tap on the board well below the header and its drop-in panels.
async function tapElsewhere(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.touchscreen.tap(width / 2, height - 40);
}

const USER = { id: 'useraaaaaaaaaaa', email: 'a@e.st', name: 'User A' };

function jwt(user: { id: string }): string {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: user.id, type: 'auth', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

// A reachable backend that accepts the sign-in and every pushed event.
async function mockBackend(page: Page) {
  const list = (items: unknown[]) => ({ json: { page: 1, perPage: 500, totalItems: items.length, totalPages: 1, items } });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/health') return route.fulfill({ json: { code: 200 } });
    if (pathname === '/api/realtime') return route.abort();
    if (pathname.endsWith('/auth-with-password')) return route.fulfill({ json: { token: jwt(USER), record: USER } });
    if (pathname.endsWith('/auth-refresh')) return route.fulfill({ status: 503, json: {} });
    if (pathname.endsWith('/events/records') && request.method() === 'POST') {
      const body = request.postDataJSON();
      return route.fulfill({ json: { ...body, id: `rec-${body.local_id}`, created: new Date().toISOString() } });
    }
    if (pathname.endsWith('/records')) return route.fulfill(list([]));
    return route.fulfill({ status: 404, json: {} });
  });
}

test('on a phone the board header carries search, sync and time tracking; the menu only board controls', async ({ page }) => {
  await openBoard(page);

  const search = page.locator('#board-search-input');
  const session = page.locator('.session-status');
  await expect(search).toBeHidden();
  await expect(session).toBeHidden();

  // The menu no longer surfaces search, sign-in or the time-tracking entry
  await page.locator('#desktop-menu-btn').tap();
  await expect(page.locator('#board-controls-menu')).toBeVisible();
  await expect(search).toBeHidden();
  await expect(session).toBeHidden();
  await expect(search).not.toBeFocused();
  await expect(page.locator('#board-controls-menu').getByText('Time Tracking')).toHaveCount(0);
  await page.locator('#mobile-menu-close-btn').tap();

  // Search drops in below the header from its toggle
  await page.locator('#search-quick-btn').tap();
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.locator('#search-quick-btn')).toHaveAttribute('aria-expanded', 'true');
  await search.press('Escape');
  await expect(search).toBeHidden();

  // Signed out: the cloud button goes straight to sign-in
  await page.locator('#sync-quick-btn').tap();
  await expect(page.locator('#login-modal')).toBeVisible();
});

test('signed in, the cloud icon drops in the session panel and a second tap or a tap elsewhere closes it', async ({ page }) => {
  await mockBackend(page);
  await openBoard(page);

  await page.locator('#sync-quick-btn').tap();
  await page.locator('#login-email').fill(USER.email);
  await page.locator('#login-password').fill('secret-password');
  await page.locator('#email-auth-submit').tap();
  await expect(page.locator('#login-modal')).toBeHidden();

  const cloud = page.locator('#sync-quick-btn');
  const panel = page.locator('.session-status');
  await expect(panel).toBeHidden();

  await cloud.tap();
  await expect(panel).toBeVisible();
  await expect(cloud).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('#user-name')).toHaveText(USER.name);
  await expect(panel.locator('#logout-btn')).toBeVisible();
  await expect(panel.locator('#sync-indicator')).toBeVisible();

  await cloud.tap();
  await expect(panel).toBeHidden();
  await expect(cloud).toHaveAttribute('aria-expanded', 'false');

  await cloud.tap();
  await expect(panel).toBeVisible();
  await tapElsewhere(page);
  await expect(panel).toBeHidden();
  await expect(cloud).toHaveAttribute('aria-expanded', 'false');
});

test('a tap outside the drop-in search field closes it', async ({ page }) => {
  await openBoard(page);
  const search = page.locator('#board-search-input');

  await page.locator('#search-quick-btn').tap();
  await expect(search).toBeVisible();
  await tapElsewhere(page);
  await expect(search).toBeHidden();
  await expect(page.locator('#search-quick-btn')).toHaveAttribute('aria-expanded', 'false');
});

test('with the field closed, a dot on the search icon shows a filter is applied until it is cleared', async ({ page }) => {
  await openBoard(page);
  const searchBtn = page.locator('#search-quick-btn');
  const search = page.locator('#board-search-input');
  const hasDot = () => searchBtn.evaluate((btn) => getComputedStyle(btn, '::after').content !== 'none');

  expect(await hasDot()).toBe(false);

  // Close by tapping elsewhere: Escape in a type=search field also clears it (browser default).
  await searchBtn.tap();
  await search.fill('Soul Stone');
  await tapElsewhere(page);
  await expect(search).toBeHidden();
  await expect(page.locator('.task')).toHaveCount(1);
  await expect.poll(hasDot).toBe(true);

  await searchBtn.tap();
  await search.fill('');
  await tapElsewhere(page);
  await expect(search).toBeHidden();
  await expect.poll(hasDot).toBe(false);
});

test('the cloud icon dot takes the colour of each sync state', async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('#sync-indicator')).toHaveText('Offline');

  // The dot mirrors #sync-indicator's state class (sync-indicator.js owns which state applies).
  // Set each class and read the dot in the same task so no re-render can interleave.
  const colours = await page.evaluate(() => {
    const indicator = document.getElementById('sync-indicator')!;
    const dot = document.querySelector('#sync-quick-btn .sync-quick-dot')!;
    const original = indicator.className;
    const result: Record<string, string> = {};
    for (const state of ['offline', 'live', 'syncing', 'unsynced']) {
      indicator.className = `sync-indicator sync-indicator--${state}`;
      result[state] = getComputedStyle(dot).backgroundColor;
    }
    indicator.className = original;
    return result;
  });

  expect(colours).toEqual({
    offline: 'rgb(148, 163, 184)', // grey
    live: 'rgb(22, 163, 74)', // green, --color-success
    syncing: 'rgb(245, 158, 11)', // amber, --color-warning
    unsynced: 'rgb(234, 88, 12)', // orange
  });
});

// The clock link comes straight before the bell in the header, on the same row.
async function expectClockBesideBell(page: Page) {
  const clock = page.locator('#timetracking-quick-btn');
  const bell = page.locator('#notifications-quick-btn');
  expect(await clock.evaluate((el) => el.nextElementSibling?.id)).toBe('notifications-quick-btn');
  const clockBox = (await clock.boundingBox())!;
  const bellBox = (await bell.boundingBox())!;
  expect(Math.abs(clockBox.y - bellBox.y)).toBeLessThanOrEqual(1);
  const gap = bellBox.x - (clockBox.x + clockBox.width);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(12);
}

test('on a phone the clock quick-action sits beside the notifications bell', async ({ page }) => {
  await openBoard(page);
  await expectClockBesideBell(page);
});

test.describe('at desktop width', () => {
  const { defaultBrowserType, ...desktop } = devices['Desktop Chrome'];
  test.use(desktop);

  test('search and sign-in/sync stay inline in the header and the phone-only icons are hidden', async ({ page }) => {
    await openBoard(page);

    await expect(page.locator('#search-quick-btn')).toBeHidden();
    await expect(page.locator('#sync-quick-btn')).toBeHidden();

    const header = (await page.locator('nav.controls').boundingBox())!;
    for (const selector of ['#board-search-input', '#login-btn', '#sync-indicator']) {
      const el = page.locator(selector);
      await expect(el).toBeVisible();
      const box = (await el.boundingBox())!;
      expect(box.y, `${selector} sits within the header bar`).toBeGreaterThanOrEqual(header.y);
      expect(box.y + box.height, `${selector} sits within the header bar`).toBeLessThanOrEqual(header.y + header.height);
    }

    await expectClockBesideBell(page);
  });
});

test('the time-tracking quick link sits in the header and opens the tracker', async ({ page }) => {
  await openBoard(page);
  const link = page.locator('#timetracking-quick-btn');
  await expect(link).toBeInViewport();
  const box = await link.boundingBox();
  const menuBox = await page.locator('#desktop-menu-btn').boundingBox();
  expect(box!.height).toBe(menuBox!.height);
  await link.tap();
  await expect(page).toHaveURL(/timetracking\.html/);
});

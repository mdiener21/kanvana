import { test, expect, devices, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

test.use({ ...devices['Pixel 5'] });

async function openBoard(page: Page) {
  await page.goto('/index.html');
  await waitForBoardReady(page);
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

const bar = (page: Page) => page.getByRole('group', { name: 'Board actions' });

const FIRST_PAGE = [
  { selector: '#desktop-menu-btn', label: 'Controls' },
  { selector: '#notifications-quick-btn', label: 'Notifications' },
  { selector: '#timetracking-quick-btn', label: 'Time Tracker' },
  { selector: '#search-quick-btn', label: 'Search' },
];

for (const width of [320, 360, 393]) {
  test(`at ${width}px the bottom bar shows Controls, Notifications, Time Tracker and Search, labelled, at least 44px, in order`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await openBoard(page);

    const barBox = (await bar(page).boundingBox())!;
    expect(barBox.y + barBox.height, 'bar is pinned to the bottom edge').toBeCloseTo(740, 0);

    let previousRight = 0;
    for (const { selector, label } of FIRST_PAGE) {
      const tab = page.locator(selector);
      await expect(tab).toBeInViewport({ ratio: 1 });
      await expect(tab.getByText(label, { exact: true })).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
      expect(box.y, `${label} sits in the bar`).toBeGreaterThanOrEqual(barBox.y);
      expect(box.x, `${label} comes after the previous tab`).toBeGreaterThanOrEqual(previousRight - 1);
      previousRight = box.x + box.width;
    }
  });
}

test('on a phone there is no header brand or footer; the logo sits in the Controls sheet', async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('.brand')).toBeHidden();
  await expect(page.locator('.footer')).toBeHidden();
  const header = (await page.locator('body > header').boundingBox())!;
  expect(header.height, 'header takes no space').toBe(0);
  await page.locator('#desktop-menu-btn').tap();
  await expect(page.locator('.controls-menu-logo')).toBeVisible();
});

// Touch emulation has no swipe gesture; a horizontal wheel scroll over the bar moves the same scroller.
async function swipeBar(page: Page) {
  const barBox = (await bar(page).boundingBox())!;
  await page.mouse.move(barBox.width / 2, barBox.y + barBox.height / 2);
  await page.mouse.wheel(barBox.width, 0);
}

const SECOND_PAGE = [
  { selector: '#reports-quick-btn', label: 'Reports' },
  { selector: '#calendar-quick-btn', label: 'Calendar' },
  { selector: '#theme-quick-btn', label: 'Dark mode' },
  { selector: '#help-quick-btn', label: 'Help' },
];

test('Reports, Calendar, Dark mode and Help wait off-screen until the bar is swiped', async ({ page }) => {
  await openBoard(page);

  for (const { selector } of SECOND_PAGE) await expect(page.locator(selector)).not.toBeInViewport();

  await swipeBar(page);

  for (const { selector, label } of SECOND_PAGE) {
    const tab = page.locator(selector);
    await expect(tab).toBeInViewport({ ratio: 1 });
    await expect(tab.getByText(label, { exact: true })).toBeVisible();
  }
  for (const { selector } of FIRST_PAGE) await expect(page.locator(selector)).not.toBeInViewport();
});

test('the Search tab opens the field just above the bar, focused, and a tap on the board closes it', async ({ page }) => {
  await openBoard(page);
  const searchTab = page.locator('#search-quick-btn');
  const field = page.locator('#board-search-input');
  await expect(field).toBeHidden();

  await searchTab.tap();
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await expect(searchTab).toHaveAttribute('aria-expanded', 'true');

  const fieldBox = (await page.locator('.board-search').boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(fieldBox.y + fieldBox.height, 'field ends above the bar').toBeLessThanOrEqual(barBox.y);
  expect(barBox.y - (fieldBox.y + fieldBox.height), 'field sits right on the bar').toBeLessThanOrEqual(16);

  const { width, height } = page.viewportSize()!;
  await page.touchscreen.tap(width / 2, height / 2);
  await expect(field).toBeHidden();
  await expect(searchTab).toHaveAttribute('aria-expanded', 'false');
});

test('Online/Offline is not in the bar: the Controls sheet opens with it on top, and Go Online signs in', async ({ page }) => {
  await mockBackend(page);
  await openBoard(page);
  const session = page.locator('#session-status');
  await expect(session).toBeHidden();
  await expect(bar(page).getByRole('button', { name: /sync/i })).toHaveCount(0);

  await page.locator('#desktop-menu-btn').tap();
  await expect(page.locator('#board-controls-menu')).toBeVisible();
  await expect(session).toBeVisible();
  await expect(session).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#sync-indicator')).toHaveText('Offline');
  const sessionBox = (await session.boundingBox())!;
  const pickerBox = (await page.locator('#board-select').boundingBox())!;
  const sheetHeader = (await page.locator('.controls-menu-mobile-title').boundingBox())!;
  expect(sessionBox.y, 'below the sheet title').toBeGreaterThanOrEqual(sheetHeader.y + sheetHeader.height);
  expect(sessionBox.y + sessionBox.height, 'above the board picker').toBeLessThanOrEqual(pickerBox.y);

  await page.locator('#login-btn').tap();
  await expect(page.locator('#login-modal')).toBeVisible();
  await page.locator('#login-email').fill(USER.email);
  await page.locator('#login-password').fill('secret-password');
  await page.locator('#email-auth-submit').tap();
  await expect(page.locator('#login-modal')).toBeHidden();

  await page.locator('#desktop-menu-btn').tap();
  await expect(session.locator('#user-name')).toHaveText(USER.name);
  await expect(session.locator('#logout-btn')).toBeInViewport();
  await expect(page.locator('#sync-indicator')).toHaveText(/^Live/);
});

test('the Dark mode tab is a toggle: it switches the theme and shows as pressed while dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openBoard(page);
  await swipeBar(page);
  const tab = page.locator('#theme-quick-btn');
  await expect(tab).toHaveAccessibleName('Dark mode');
  await expect(tab).toHaveAttribute('aria-pressed', 'false');

  await tab.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
  await expect(tab).toHaveAccessibleName('Dark mode');

  await tab.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(tab).toHaveAttribute('aria-pressed', 'false');
});

test('the Help tab opens the help dialog', async ({ page }) => {
  await openBoard(page);
  await swipeBar(page);
  await page.locator('#help-quick-btn').tap();
  await expect(page.locator('#help-modal')).toBeVisible();
});

for (const { selector, url } of [
  { selector: '#reports-quick-btn', url: /reports\.html/ },
  { selector: '#calendar-quick-btn', url: /calendar\.html/ },
  { selector: '#timetracking-quick-btn', url: /timetracking\.html/ },
]) {
  test(`${selector} opens its page`, async ({ page }) => {
    await openBoard(page);
    const tab = page.locator(selector);
    await tab.scrollIntoViewIfNeeded();
    await tab.tap();
    await expect(page).toHaveURL(url);
  });
}

for (const height of [640, 844]) {
  test(`at ${height}px tall the column ends just above the bar`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height });
    await openBoard(page);
    const barTop = (await bar(page).boundingBox())!.y;
    const column = (await page.locator('.task-column').first().boundingBox())!;
    expect(column.y + column.height, 'column ends above the bar').toBeLessThanOrEqual(barTop);
    expect(column.y + column.height, 'column fills the space above the bar').toBeGreaterThan(barTop - 24);
  });
}

test('the Controls sheet does not repeat what the bar already offers', async ({ page }) => {
  await openBoard(page);
  await page.locator('#desktop-menu-btn').tap();
  const sheet = page.locator('#board-controls-menu');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('#manage-boards-btn')).toBeVisible();
  for (const id of ['#show-reports-btn', '#show-calendar-btn', '#theme-toggle-btn', '#help-btn', '#notifications-btn']) {
    await expect(sheet.locator(id), id).toBeHidden();
  }
});

// A tap on the board, clear of the bar and the search field above it.
async function tapBoard(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.touchscreen.tap(width / 2, height / 2);
}

test('Escape closes the search field', async ({ page }) => {
  await openBoard(page);
  await page.locator('#search-quick-btn').tap();
  await expect(page.locator('#board-search-input')).toBeFocused();
  await page.locator('#board-search-input').press('Escape');
  await expect(page.locator('#board-search-input')).toBeHidden();
});

test('with the field closed, a dot and the name of the Search tab show a filter is applied until it is cleared', async ({ page }) => {
  await openBoard(page);
  const searchTab = page.locator('#search-quick-btn');
  const field = page.locator('#board-search-input');
  const hasDot = () => searchTab.evaluate((btn) => getComputedStyle(btn, '::after').content !== 'none');
  await expect(searchTab).toHaveAccessibleName('Search tasks');
  await expect(searchTab).toHaveAttribute('aria-controls', 'board-search-input');
  expect(await hasDot()).toBe(false);

  // Close by tapping elsewhere: Escape in a type=search field also clears it (browser default).
  await searchTab.tap();
  await field.fill('Soul Stone');
  await tapBoard(page);
  await expect(field).toBeHidden();
  await expect(page.locator('.task')).toHaveCount(1);
  await expect.poll(hasDot).toBe(true);
  await expect(searchTab).toHaveAccessibleName('Search tasks, filter applied');

  await searchTab.tap();
  await field.fill('');
  await tapBoard(page);
  await expect(field).toBeHidden();
  await expect.poll(hasDot).toBe(false);
  await expect(searchTab).toHaveAccessibleName('Search tasks');
});

test('the bar tabs have accessible names that contain their visible labels', async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('#desktop-menu-btn')).toHaveAccessibleName('Controls');
  await expect(page.locator('#notifications-quick-btn')).toHaveAccessibleName(/^Notifications/);
  await expect(page.locator('#timetracking-quick-btn')).toHaveAccessibleName('Time Tracker');
  await expect(page.locator('#reports-quick-btn')).toHaveAccessibleName('Reports');
  await expect(page.locator('#calendar-quick-btn')).toHaveAccessibleName('Calendar');
  await expect(page.locator('#help-quick-btn')).toHaveAccessibleName('Help');
});

test.describe('at desktop width', () => {
  const { defaultBrowserType, ...desktop } = devices['Desktop Chrome'];
  test.use(desktop);

  test('the header is unchanged: search and sign-in inline, clock then bell then menu, no phone tabs or labels', async ({ page }) => {
    await openBoard(page);

    const header = (await page.locator('nav.controls').boundingBox())!;
    for (const selector of ['#board-search-input', '#login-btn', '#sync-indicator', '#timetracking-quick-btn', '#notifications-quick-btn', '#desktop-menu-btn']) {
      const el = page.locator(selector);
      await expect(el).toBeVisible();
      const box = (await el.boundingBox())!;
      expect(box.y, `${selector} sits within the header bar`).toBeGreaterThanOrEqual(header.y);
      expect(box.y + box.height, `${selector} sits within the header bar`).toBeLessThanOrEqual(header.y + header.height);
    }

    for (const selector of ['#search-quick-btn', '#reports-quick-btn', '#calendar-quick-btn', '#theme-quick-btn', '#help-quick-btn']) {
      await expect(page.locator(selector), selector).toBeHidden();
    }
    await expect(page.locator('.toolbar-quick-actions .quick-label').first()).toBeHidden();

    const clock = (await page.locator('#timetracking-quick-btn').boundingBox())!;
    const bell = (await page.locator('#notifications-quick-btn').boundingBox())!;
    const menu = (await page.locator('#desktop-menu-btn').boundingBox())!;
    expect(clock.x).toBeLessThan(bell.x);
    expect(bell.x).toBeLessThan(menu.x);
    expect(bell.x - (clock.x + clock.width)).toBeLessThanOrEqual(12);
    expect(bell.height).toBe(clock.height);
  });
});

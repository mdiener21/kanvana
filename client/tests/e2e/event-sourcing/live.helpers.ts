import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { allCards, columnHeadings, createBoard, dialog, openApp, reloadBoard } from '../journey.helpers.js';

// Shared steps for the live sync journeys (#231). Each browser context plays one device.
// The browser only goes through the UI; the node side may ask PocketBase what it stored.

const PB_URL = process.env.PB_PROXY_TARGET || process.env.VITE_PB_URL || 'http://localhost:8090';
const PASSWORD = 'live-journeys-pw-123';
// Realtime usually takes well under a second; a machine under load gets some room.
export const SYNC_TIMEOUT = 10_000;

let accounts = 0;

// A green run with PocketBase down would otherwise prove nothing: say so in the skip reason.
export function requirePocketBase(): void {
  test.beforeEach(async () => {
    let healthy = false;
    try {
      healthy = (await fetch(`${PB_URL}/api/health`, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      healthy = false;
    }
    test.skip(!healthy, `PocketBase not reachable at ${PB_URL}.`);
  });
}

export async function registerAccount(name: string): Promise<string> {
  accounts += 1;
  const email = `${name}-${Date.now()}-${accounts}@example.test`;
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, passwordConfirm: PASSWORD, name }),
  });
  if (!res.ok) throw new Error(`PB user registration failed (${res.status}): ${await res.text()}`);
  return email;
}

export interface ServerEvent {
  id: string;
  local_id: string;
  owner: string;
  event_type: string;
  entity_id: string;
  board: string;
  payload: unknown;
}

// Every event this account can read. The events collection only lets an owner read their own.
export async function serverEvents(email: string): Promise<ServerEvent[]> {
  const auth = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: PASSWORD }),
  });
  if (!auth.ok) throw new Error(`PB auth failed (${auth.status}): ${await auth.text()}`);
  const { token } = await auth.json();
  const items: ServerEvent[] = [];
  for (let page = 1; ; page += 1) {
    const res = await fetch(`${PB_URL}/api/collections/events/records?perPage=500&page=${page}`, { headers: { Authorization: token } });
    if (!res.ok) throw new Error(`PB events read failed (${res.status}): ${await res.text()}`);
    const body = await res.json();
    items.push(...body.items);
    if (page >= body.totalPages) return items;
  }
}

export const syncIndicator = (page: Page): Locator => page.getByRole('status', { name: 'Sync state' });

export async function expectLive(page: Page): Promise<void> {
  await expect(syncIndicator(page)).toContainText('Live', { timeout: 20_000 });
}

export async function submitSignIn(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: 'Sign in to sync', exact: true }).click();
  const form = dialog(page, 'Sign In');
  await expect(form).toBeVisible();
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill(PASSWORD);
  await form.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(form).toBeHidden();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to sync', exact: true })).toBeVisible();
}

export async function signedInDevice(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ timezoneId: 'Europe/Berlin', locale: 'en-US' });
  const page = await context.newPage();
  await openApp(page);
  await submitSignIn(page, email);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expectLive(page);
  return page;
}

export interface Devices {
  a: Page;
  b: Page;
  reloadsOnB: () => number;
  close: () => Promise<void>;
}

// A signs in first and publishes the first-run board. B then catches up to it, so both show
// one board, and B's subscription is up before A does anything: what reaches B after this
// came over realtime. reloadsOnB counts navigations from here on.
export async function twoDevices(browser: Browser, email: string): Promise<Devices> {
  const a = await signedInDevice(browser, email);
  const b = await signedInDevice(browser, email);
  let reloads = 0;
  b.on('framenavigated', (frame) => { if (frame === b.mainFrame()) reloads += 1; });
  return {
    a,
    b,
    reloadsOnB: () => reloads,
    close: async () => {
      const contexts: BrowserContext[] = [a.context(), b.context()];
      await Promise.all(contexts.map((context) => context.close()));
    },
  };
}

// Both devices on a new blank board, for a journey that the first-run board's demo tasks would clutter.
export async function twoDevicesOnNewBoard(browser: Browser, email: string, name = 'Shared Board'): Promise<Devices> {
  const devices = await twoDevices(browser, email);
  await createBoard(devices.a, name);
  await selectBoard(devices.b, name);
  await expect(allCards(devices.b)).toHaveCount(0);
  return devices;
}

export async function selectBoard(page: Page, name: string): Promise<void> {
  // The selector sits in the closed toolbar menu, so its options only match with includeHidden.
  const select = page.getByLabel('Select board', { exact: true });
  await expect(select.getByRole('option', { name, exact: true, includeHidden: true })).toHaveCount(1, { timeout: SYNC_TIMEOUT });
  if (!(await select.isVisible())) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await select.selectOption({ label: name });
  await expect(page.locator('#brand-text')).toHaveText(name);
}

export interface BoardView {
  columns: string[];
  cards: string[];
}

// What the user sees on the board, top left to bottom right: columns, then each card's name.
export async function boardView(page: Page): Promise<BoardView> {
  return {
    columns: await columnHeadings(page).allTextContents(),
    cards: await allCards(page).evaluateAll((cards) => cards.map((el) => el.getAttribute('aria-label') ?? '')),
  };
}

export async function expectSameBoard(a: Page, b: Page): Promise<void> {
  await expect.poll(() => boardView(b), { timeout: SYNC_TIMEOUT }).toEqual(await boardView(a));
}

// A replay from the stored events must land where the live updates did.
export async function expectSameBoardAfterReload(a: Page, b: Page): Promise<void> {
  await expectSameBoard(a, b);
  const before = await boardView(a);
  await reloadBoard(a);
  await reloadBoard(b);
  await expect.poll(() => boardView(a), { timeout: SYNC_TIMEOUT }).toEqual(before);
  await expect.poll(() => boardView(b), { timeout: SYNC_TIMEOUT }).toEqual(before);
}

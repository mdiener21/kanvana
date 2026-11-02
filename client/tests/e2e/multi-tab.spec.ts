// #222: two tabs of one browser, with no backend. A browser's own Web Locks and
// BroadcastChannel decide the election and carry edits between tabs; the sync itself is in
// tests/e2e/event-sourcing/sync-leader.spec.ts.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

async function openBoard(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await waitForBoardReady(page);
  return page;
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

const lockState = (page: Page) => page.evaluate(async () => {
  const { held = [], pending = [] } = await navigator.locks.query();
  const named = (locks: LockInfo[]) => locks.filter((lock) => lock.name === 'kanvana:sync-leader').length;
  return { held: named(held), pending: named(pending) };
});

test('an edit in either tab shows in the other with no reload, and both survive a reload', async ({ context }) => {
  const first = await openBoard(context);
  const second = await openBoard(context);
  let reloads = 0;
  first.on('framenavigated', () => { reloads += 1; });
  second.on('framenavigated', () => { reloads += 1; });

  await addTask(first, 'Made in the first tab');
  await expect(card(second, 'Made in the first tab')).toBeVisible();

  await addTask(second, 'Made in the second tab');
  await expect(card(first, 'Made in the second tab')).toBeVisible();

  // Right after the other tab's edit: neither copy may overwrite the other's.
  await addTask(first, 'Another from the first tab');
  await expect(card(second, 'Another from the first tab')).toBeVisible();
  expect(reloads).toBe(0);

  await second.reload();
  await waitForBoardReady(second);
  for (const title of ['Made in the first tab', 'Made in the second tab', 'Another from the first tab']) {
    await expect(card(second, title)).toBeVisible();
  }
});

test('one tab holds the leader lock, and the other takes it when that tab closes', async ({ context }) => {
  const first = await openBoard(context);
  const second = await openBoard(context);

  await expect.poll(() => lockState(second)).toEqual({ held: 1, pending: 1 });

  await first.close();

  await expect.poll(() => lockState(second)).toEqual({ held: 1, pending: 0 });
  await addTask(second, 'After the handover');
  await expect(card(second, 'After the handover')).toBeVisible();
});

test('a browser without Web Locks still opens, edits and shares edits between tabs', async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined });
  });
  const first = await openBoard(context);
  const second = await openBoard(context);

  await addTask(first, 'Without Web Locks');

  await expect(card(second, 'Without Web Locks')).toBeVisible();
});

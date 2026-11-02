// #231 journey 5: changes made offline reach the other device on return. Going offline uses
// context.setOffline, which fires the browser's real offline and online events: since #219
// those stop and restart the whole sync session.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { addTask, card, clickMenuButton, column, columnTasks, dialog, moveTaskWithEditor, openApp, taskTitle } from '../journey.helpers.js';
import { expectLive, expectSameBoardAfterReload, registerAccount, requirePocketBase, serverEvents, signedInDevice, submitSignIn, SYNC_TIMEOUT, syncIndicator, twoDevicesOnNewBoard } from './live.helpers.js';

requirePocketBase();

// Everything the indicator has said from now on, including states too short to catch by polling.
async function recordIndicator(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const el = document.getElementById('sync-indicator')!;
    const seen: string[] = [];
    (window as unknown as { indicatorHistory: string[] }).indicatorHistory = seen;
    new MutationObserver(() => {
      if (seen[seen.length - 1] !== el.textContent) seen.push(el.textContent ?? '');
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { indicatorHistory: string[] }).indicatorHistory);
}

const titled = (events: { payload: unknown }[], title: string) => events.filter((event) => JSON.stringify(event.payload).includes(title));

test('changes made offline on A reach B on return, and the indicator goes from Offline to Live', async ({ browser }) => {
  test.slow();
  const email = await registerAccount('offline');
  const { a, b, reloadsOnB, close } = await twoDevicesOnNewBoard(browser, email);
  await addTask(a, 'To Do', 'Before the tunnel');
  await expect(card(b, 'Before the tunnel')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectLive(a);
  const history = await recordIndicator(a);

  await a.context().setOffline(true);
  await expect(syncIndicator(a)).toHaveText('Offline');

  // Create, edit, move, and a new column
  await addTask(a, 'To Do', 'Written in the tunnel');
  await card(a, 'Before the tunnel').locator('.task-title').click();
  const form = dialog(a, 'Edit Task');
  await taskTitle(form).fill('Renamed in the tunnel');
  await form.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(form).toBeHidden();
  await addTask(a, 'To Do', 'Moved in the tunnel');
  await moveTaskWithEditor(a, 'Moved in the tunnel', 'In Progress');
  await clickMenuButton(a, 'Add Column');
  const addColumn = dialog(a, 'Add New Column');
  await addColumn.getByLabel('Column Name').fill('Tunnel column');
  await addColumn.getByRole('button', { name: 'Add Column', exact: true }).click();
  await expect(addColumn).toBeHidden();

  // B stays live and hears nothing, and the app keeps saying Offline
  await addTask(b, 'To Do', 'Made while A was away');
  await a.waitForTimeout(1500);
  await expect(syncIndicator(a)).toHaveText('Offline');
  await expectLive(b);
  await expect(card(b, 'Written in the tunnel')).toHaveCount(0);
  await expect(card(b, 'Renamed in the tunnel')).toHaveCount(0);
  await expect(column(b, 'Tunnel column')).toHaveCount(0);
  await expect(card(a, 'Made while A was away')).toHaveCount(0);
  expect(titled(await serverEvents(email), 'Written in the tunnel')).toEqual([]);

  await a.context().setOffline(false);

  await expect(columnTasks(b, 'To Do').getByRole('listitem', { name: 'Task: Written in the tunnel', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(b, 'Renamed in the tunnel')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(b, 'Before the tunnel')).toHaveCount(0);
  await expect(columnTasks(b, 'In Progress').getByRole('listitem', { name: 'Task: Moved in the tunnel', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(column(b, 'Tunnel column')).toBeVisible({ timeout: SYNC_TIMEOUT });

  // A catches up on what it missed, and settles
  await expect(card(a, 'Made while A was away')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectLive(a);
  const said = await history();
  expect(said[0]).toBe('Offline');
  expect(said.slice(1).some((text) => /^Syncing… \(\d+\)$/.test(text))).toBe(true);
  expect(said[said.length - 1]).toBe('Live ●');

  // Each offline change reached the server once
  expect(titled(await serverEvents(email), 'Written in the tunnel').filter((event) => event.event_type === 'task.created')).toHaveLength(1);
  expect(reloadsOnB()).toBe(0);

  // Both directions work again: A pushes, and A's subscription came back too
  await addTask(a, 'To Do', 'Out of the tunnel');
  await expect(card(b, 'Out of the tunnel')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await addTask(b, 'To Do', 'Heard over realtime');
  await expect(card(a, 'Heard over realtime')).toBeVisible({ timeout: SYNC_TIMEOUT });

  // A second trip works like the first
  await a.context().setOffline(true);
  await expect(syncIndicator(a)).toHaveText('Offline');
  await addTask(a, 'To Do', 'Second tunnel');
  await a.context().setOffline(false);
  await expect(card(b, 'Second tunnel')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectLive(a);

  await expectSameBoardAfterReload(a, b);
  await close();
});

test('when the server cannot be reached the indicator shows the unsynced count, then Live once it can', async ({ browser }) => {
  test.slow();
  const { a, b, close } = await twoDevicesOnNewBoard(browser, await registerAccount('unreachable'));

  // The browser still believes it is online: only the push fails, so the queue backs off.
  await a.route('**/api/collections/events/records', (route) => (
    route.request().method() === 'POST' ? route.abort() : route.continue()
  ));
  await addTask(a, 'To Do', 'Stuck in the queue');
  await expect(syncIndicator(a)).toHaveText(/^⚠ \d+ unsynced$/, { timeout: SYNC_TIMEOUT });
  await expect(card(b, 'Stuck in the queue')).toHaveCount(0);

  await a.unroute('**/api/collections/events/records');

  // The first retry comes after 5 seconds.
  await expect(card(b, 'Stuck in the queue')).toBeVisible({ timeout: 15_000 });
  await expectLive(a);
  await close();
});

async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await openApp(page);
  return page;
}

test('offline with two tabs: an edit in the follower is pushed once, even if the leader tab closes first', async ({ browser }) => {
  test.slow();
  const email = await registerAccount('offline-tabs');
  const context = await browser.newContext();
  const leader = await openTab(context);
  const follower = await openTab(context);
  await submitSignIn(leader, email);
  await expectLive(leader);
  await expectLive(follower);
  const other = await signedInDevice(browser, email);

  await context.setOffline(true);
  await expect(syncIndicator(leader)).toHaveText('Offline');
  await expect(syncIndicator(follower)).toHaveText('Offline');
  await addTask(follower, 'To Do', 'From the follower');
  await expect(card(leader, 'From the follower')).toBeVisible({ timeout: SYNC_TIMEOUT });

  await context.setOffline(false);
  await expect(card(other, 'From the follower')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectLive(leader);
  await expectLive(follower);

  // The next offline trip loses the leader before the network comes back.
  await context.setOffline(true);
  await expect(syncIndicator(follower)).toHaveText('Offline');
  await addTask(follower, 'To Do', 'Leader gone');
  await leader.close();
  await follower.waitForTimeout(1000);
  await context.setOffline(false);

  await expect(card(other, 'Leader gone')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expectLive(follower);
  await addTask(other, 'To Do', 'Back to the follower');
  await expect(card(follower, 'Back to the follower')).toBeVisible({ timeout: SYNC_TIMEOUT });

  for (const title of ['From the follower', 'Leader gone']) {
    await expect.poll(async () => titled(await serverEvents(email), title).filter((event) => event.event_type === 'task.created').length).toBe(1);
  }
  await other.context().close();
  await context.close();
});

// #231, beyond the issue: an account switch against a real server. #221 had only been tested
// with a mocked backend, so what PocketBase ends up storing under each account was unproven.
// ADR-0006 is the policy under test.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { waitForBoardReady } from '../board.helpers.js';
import { addTask, boardNames, card, closeManageBoards, createBoard, dialog, openApp, openManageBoards } from '../journey.helpers.js';
import {
  expectLive,
  registerAccount,
  requirePocketBase,
  selectBoard,
  serverEvents,
  signedInDevice,
  signOut,
  submitSignIn,
  SYNC_TIMEOUT,
  syncIndicator,
} from './live.helpers.js';

requirePocketBase();

const BOARD_OF_A = 'Board of A';
const BOARD_OF_B = 'Board of B';
const UNSYNCED_BOARD = 'Unsynced board of A';
const UNSYNCED_TASK = 'Unsynced task of A';
const SIGNED_OUT_TASK = 'Written while signed out';

const discardPrompt = (page: Page) => dialog(page, 'Discard unsynced changes?');
const discardButton = (page: Page) => discardPrompt(page).getByRole('button', { name: /^Discard \d+ unsynced changes? and continue$/ });

const eventsMentioning = async (email: string, text: string) => (
  (await serverEvents(email)).filter((event) => JSON.stringify(event.payload).includes(text))
);

async function openPrompts(pages: Page[]): Promise<Page[]> {
  const open: Page[] = [];
  for (const page of pages) if (await discardPrompt(page).isVisible()) open.push(page);
  return open;
}

async function boardList(page: Page): Promise<string[]> {
  const boards = await openManageBoards(page);
  const names = await boardNames(boards).allTextContents();
  await closeManageBoards(page);
  return names;
}

// B has a board of their own on the server, made on another device.
async function accountBWithABoard(browser: Browser): Promise<string> {
  const email = await registerAccount('switch-b');
  const device = await signedInDevice(browser, email);
  await createBoard(device, BOARD_OF_B);
  await addTask(device, 'To Do', 'Task of B');
  await expectLive(device);
  await expect.poll(async () => (await eventsMentioning(email, 'Task of B')).length, { timeout: SYNC_TIMEOUT }).toBe(1);
  await device.context().close();
  return email;
}

// A synced a board, went offline, changed more, and signed out with that still unsent. The
// browser is back online but signed out, so nothing may leave it. No event should carry the
// unsynced names yet.
async function deviceWithUnsyncedDataOfA(browser: Browser, emailA: string): Promise<Page> {
  const page = await signedInDevice(browser, emailA);
  await createBoard(page, BOARD_OF_A);
  await addTask(page, 'To Do', 'Synced task of A');
  await expectLive(page);
  await expect.poll(async () => (await eventsMentioning(emailA, 'Synced task of A')).length, { timeout: SYNC_TIMEOUT }).toBe(1);

  await page.context().setOffline(true);
  await expect(syncIndicator(page)).toHaveText('Offline');
  await addTask(page, 'To Do', UNSYNCED_TASK);
  await createBoard(page, UNSYNCED_BOARD);
  await selectBoard(page, BOARD_OF_A);
  await signOut(page);
  await addTask(page, 'To Do', SIGNED_OUT_TASK);
  await page.context().setOffline(false);
  await page.waitForTimeout(1000);
  await expect(syncIndicator(page)).toHaveText('Offline');
  for (const text of [UNSYNCED_TASK, UNSYNCED_BOARD, SIGNED_OUT_TASK]) {
    expect(await eventsMentioning(emailA, text)).toEqual([]);
  }
  return page;
}

test('Discard: none of the unsynced events reach either account, and B sees none of A\'s boards', async ({ browser }) => {
  test.slow();
  const emailA = await registerAccount('switch-a');
  const emailB = await accountBWithABoard(browser);
  const page = await deviceWithUnsyncedDataOfA(browser, emailA);
  const eventsOfBBefore = (await serverEvents(emailB)).length;

  await submitSignIn(page, emailB);
  await expect(discardButton(page)).toBeVisible({ timeout: SYNC_TIMEOUT });
  // Nothing moves while the prompt is up.
  expect((await serverEvents(emailB)).length).toBe(eventsOfBBefore);

  const reloaded = page.waitForEvent('load');
  await discardButton(page).click();
  await reloaded;
  await waitForBoardReady(page);
  await expectLive(page);

  // Give a wrongful push time to land, then ask the server directly under both accounts.
  await page.waitForTimeout(2000);
  for (const email of [emailA, emailB]) {
    for (const text of [UNSYNCED_TASK, UNSYNCED_BOARD, SIGNED_OUT_TASK]) {
      expect(await eventsMentioning(email, text), `${text} under ${email}`).toEqual([]);
    }
  }
  // A's synced data stayed under A and did not come along to B.
  expect(await eventsMentioning(emailB, 'Synced task of A')).toEqual([]);
  expect(await eventsMentioning(emailB, BOARD_OF_A)).toEqual([]);
  expect(await eventsMentioning(emailA, 'Synced task of A')).toHaveLength(1);

  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await selectBoard(page, BOARD_OF_B);
  await expect(card(page, 'Task of B')).toBeVisible({ timeout: SYNC_TIMEOUT });
  const boards = await boardList(page);
  for (const name of [BOARD_OF_A, UNSYNCED_BOARD]) expect(boards).not.toContain(name);
  await expect(card(page, UNSYNCED_TASK)).toHaveCount(0);

  // B's own work goes up under B.
  await addTask(page, 'To Do', 'New work of B');
  await expect.poll(async () => (await eventsMentioning(emailB, 'New work of B')).length, { timeout: SYNC_TIMEOUT }).toBe(1);
  expect(await eventsMentioning(emailA, 'New work of B')).toEqual([]);

  // Nothing is unsynced now, so A switches back with no prompt, to the server's copy.
  await signOut(page);
  const reloadedForA = page.waitForEvent('load');
  await submitSignIn(page, emailA);
  await reloadedForA;
  await waitForBoardReady(page);
  await expectLive(page);
  await expect(discardPrompt(page)).toHaveCount(0);
  await selectBoard(page, BOARD_OF_A);
  await expect(card(page, 'Synced task of A')).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(page, UNSYNCED_TASK)).toHaveCount(0);
  const boardsOfA = await boardList(page);
  expect(boardsOfA).not.toContain(BOARD_OF_B);
  expect(boardsOfA).not.toContain(UNSYNCED_BOARD);

  await page.context().close();
});

test('Cancel: B is signed out, A\'s data stays, and the events push under A when A signs back in', async ({ browser }) => {
  test.slow();
  const emailA = await registerAccount('switch-a');
  const emailB = await accountBWithABoard(browser);
  const page = await deviceWithUnsyncedDataOfA(browser, emailA);
  const eventsOfBBefore = (await serverEvents(emailB)).length;

  await submitSignIn(page, emailB);
  await expect(discardButton(page)).toBeVisible({ timeout: SYNC_TIMEOUT });
  await discardPrompt(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(discardPrompt(page)).toBeHidden();

  // Signed out, with A's work on screen and nothing sent anywhere
  await expect(page.getByRole('button', { name: 'Sign in to sync', exact: true })).toBeVisible();
  await expect(syncIndicator(page)).toHaveText('Offline');
  await expect(card(page, UNSYNCED_TASK)).toBeVisible();
  await expect(card(page, SIGNED_OUT_TASK)).toBeVisible();
  expect(await boardList(page)).toContain(UNSYNCED_BOARD);
  await page.waitForTimeout(1000);
  expect((await serverEvents(emailB)).length).toBe(eventsOfBBefore);
  for (const text of [UNSYNCED_TASK, UNSYNCED_BOARD, SIGNED_OUT_TASK]) {
    expect(await eventsMentioning(emailA, text), `${text} under A`).toEqual([]);
  }

  // A signs back in: no prompt, and it all goes up under A alone
  await submitSignIn(page, emailA);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await expectLive(page);
  await expect(discardPrompt(page)).toHaveCount(0);
  for (const text of [UNSYNCED_TASK, UNSYNCED_BOARD, SIGNED_OUT_TASK]) {
    await expect.poll(async () => (await eventsMentioning(emailA, text)).length, { timeout: SYNC_TIMEOUT, message: `${text} under A` }).toBeGreaterThan(0);
    expect(await eventsMentioning(emailB, text), `${text} under B`).toEqual([]);
  }
  expect((await serverEvents(emailB)).length).toBe(eventsOfBBefore);

  // Another device of A sees what was pushed.
  const other = await signedInDevice(browser, emailA);
  await selectBoard(other, BOARD_OF_A);
  await expect(card(other, UNSYNCED_TASK)).toBeVisible({ timeout: SYNC_TIMEOUT });
  await expect(card(other, SIGNED_OUT_TASK)).toBeVisible({ timeout: SYNC_TIMEOUT });
  expect(await boardList(other)).toContain(UNSYNCED_BOARD);

  await other.context().close();
  await page.context().close();
});

test('two tabs: one prompt, and Discard switches both tabs with nothing of A on the server under B', async ({ browser }) => {
  test.slow();
  const emailA = await registerAccount('switch-a');
  const emailB = await accountBWithABoard(browser);
  const context = await browser.newContext();
  const first = await context.newPage();
  await openApp(first);
  const second = await context.newPage();
  await openApp(second);
  await submitSignIn(first, emailA);
  await expectLive(first);
  await expectLive(second);

  await context.setOffline(true);
  await expect(syncIndicator(second)).toHaveText('Offline');
  await addTask(second, 'To Do', UNSYNCED_TASK);
  await signOut(first);
  await expect(second.getByRole('button', { name: 'Sign in to sync', exact: true })).toBeVisible({ timeout: SYNC_TIMEOUT });
  await context.setOffline(false);

  await submitSignIn(first, emailB);
  await expect.poll(async () => (await openPrompts([first, second])).length, { timeout: SYNC_TIMEOUT }).toBe(1);
  await first.waitForTimeout(1000);
  const prompts = await openPrompts([first, second]);
  expect(prompts).toHaveLength(1);

  const reloads = [first, second].map((page) => page.waitForEvent('load'));
  await discardButton(prompts[0]).click();
  await Promise.all(reloads);

  for (const page of [first, second]) {
    await waitForBoardReady(page);
    await expectLive(page);
    await selectBoard(page, BOARD_OF_B);
    await expect(card(page, 'Task of B')).toBeVisible({ timeout: SYNC_TIMEOUT });
    await expect(card(page, UNSYNCED_TASK)).toHaveCount(0);
  }
  await first.waitForTimeout(2000);
  for (const email of [emailA, emailB]) expect(await eventsMentioning(email, UNSYNCED_TASK), `under ${email}`).toEqual([]);
  await context.close();
});

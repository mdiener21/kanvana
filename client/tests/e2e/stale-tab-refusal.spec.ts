import { expect, test, type Page } from '@playwright/test';
import { dialog, openApp, taskTitle } from './journey.helpers.js';

const TITLE = 'Written by the stale tab';

// Real Chromium must abort a batch that was committed before its add() failed (#256, ADR-0006); fake-indexeddb can not show that.
async function storedMentions(page: Page, text: string): Promise<{ events: number; readModel: number }> {
  return page.evaluate((needle) => new Promise<{ events: number; readModel: number }>((resolve, reject) => {
    const open = indexedDB.open('kanvana-db');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(['events', 'read_model']);
      const events = tx.objectStore('events').getAll();
      const readModel = tx.objectStore('read_model').getAll();
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        open.result.close();
        const mentioning = (rows: unknown[]) => rows.filter((row) => JSON.stringify(row).includes(needle)).length;
        resolve({ events: mentioning(events.result), readModel: mentioning(readModel.result) });
      };
    };
  }), text);
}

async function wipeForAnotherAccount(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { replaceLocalData } = await import(/* @vite-ignore */ `${location.origin}/modules/idb-store.js`);
    await replaceLocalData({ ownerId: 'another-account', maxUnsynced: Infinity, keepKvKeys: [] });
  });
}

test('an edit in a tab that missed a wipe stores nothing and reloads that tab', async ({ context }) => {
  const stale = await context.newPage();
  await openApp(stale);
  const other = await context.newPage();
  await openApp(other);

  // No wipe notice is sent: the tab has not heard of the wipe, the window under test.
  await wipeForAnotherAccount(other);

  const reloaded = stale.waitForEvent('load');
  await stale.getByRole('button', { name: 'Add task to To Do', exact: true }).click();
  const form = dialog(stale, 'Add New Task');
  await taskTitle(form).fill(TITLE);
  await form.getByRole('button', { name: 'Add Task', exact: true }).click();
  await reloaded;

  await expect.poll(() => storedMentions(stale, TITLE)).toEqual({ events: 0, readModel: 0 });
});

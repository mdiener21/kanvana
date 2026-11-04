// #141: two browser contexts stand in for two devices, with no backend. Each one's stored events reach the other
// through the remote ingest paths SSE and catch-up use. Saving only the changed slices must leave both devices
// with the same board, in memory and after a reload. The live version of this is event-sourcing/two-context-convergence.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';

async function openDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const writes: string[] = [];
    (globalThis as any).__readModelWrites = writes;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function countWrite(value: unknown, key?: IDBValidKey) {
      if (this.name === 'read_model' || (this.name === 'kv' && typeof key === 'string' && (key === 'kanbanBoards' || key.endsWith(':settings')))) {
        writes.push(String(key));
      }
      return put.call(this, value, key);
    };
  });
  const page = await context.newPage();
  await page.goto('/');
  await waitForBoardReady(page);
  return page;
}

// Runs the same kinds of edit on either device, so each device's log touches every slice.
function edit(page: Page, suffix: string) {
  return page.evaluate(async (suffix) => {
    const { addTask, getCurrentTaskOrder } = await import(/* @vite-ignore */ `${location.origin}/modules/tasks.js`);
    const { addColumn } = await import(/* @vite-ignore */ `${location.origin}/modules/columns.js`);
    const { addLabel } = await import(/* @vite-ignore */ `${location.origin}/modules/labels.js`);
    const { loadColumns } = await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`);
    addLabel(`Label ${suffix}`, '#123456');
    addColumn(`Column ${suffix}`, '#654321');
    addTask(`Task ${suffix}`, '', 'none', '', loadColumns()[0].id, []);
    return getCurrentTaskOrder().length;
  }, suffix);
}

function storedEvents(page: Page) {
  return page.evaluate(async () => {
    const { getUnsyncedEvents } = await import(/* @vite-ignore */ `${location.origin}/modules/idb-store.js`);
    await (await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`))._flushPersistsForTesting();
    return getUnsyncedEvents();
  });
}

// The first half arrives one by one as over SSE, the rest as one catch-up batch.
function receive(page: Page, events: unknown[]) {
  return page.evaluate(async (events) => {
    const { EVENT_ORIGIN, ingestEvent, ingestRemoteBatch } = await import(/* @vite-ignore */ `${location.origin}/modules/event-sourcing/ingest.js`);
    const middle = Math.floor(events.length / 2);
    for (const event of events.slice(0, middle)) await ingestEvent(event, { origin: EVENT_ORIGIN.REMOTE });
    await ingestRemoteBatch(events.slice(middle).map((event) => ({ event })));
    await (await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`))._flushPersistsForTesting();
  }, events);
}

// Each device stamps its own first-run dates, which a duplicate create rightly keeps, so those are left out.
function boardView(page: Page) {
  return page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`);
    const id = storage.getActiveBoardId();
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    return {
      id,
      name: storage.getActiveBoardName(),
      tasks: storage.loadTasksForBoard(id).map(({ id, title, column, order }: any) => ({ id, title, column, order })).sort(byId),
      columns: storage.loadColumnsForBoard(id).map(({ id, name, color }: any) => ({ id, name, color })).sort(byId),
      labels: storage.loadLabelsForBoard(id).map(({ id, name, color }: any) => ({ id, name, color })).sort(byId),
    };
  });
}

async function reload(page: Page) {
  await page.reload();
  await waitForBoardReady(page);
}

test('two devices that exchange their events show the same board, and still do after a reload', async ({ browser }) => {
  const first = await openDevice(browser);
  const second = await openDevice(browser);

  await edit(first, 'from first');
  await edit(second, 'from second');
  const [fromFirst, fromSecond] = await Promise.all([storedEvents(first), storedEvents(second)]);
  await receive(second, fromFirst);
  await receive(first, fromSecond);

  const shown = await boardView(first);
  expect(shown.tasks.map((task: any) => task.title)).toEqual(expect.arrayContaining(['Task from first', 'Task from second']));
  expect(shown.columns.map((column: any) => column.name)).toEqual(expect.arrayContaining(['Column from first', 'Column from second']));
  expect(shown.labels.map((label: any) => label.name)).toEqual(expect.arrayContaining(['Label from first', 'Label from second']));
  expect(await boardView(second)).toEqual(shown);

  await reload(first);
  await reload(second);
  expect(await boardView(first)).toEqual(shown);
  expect(await boardView(second)).toEqual(shown);
  await expect(first.locator('.task')).toHaveCount(await second.locator('.task').count());

  await first.context().close();
  await second.context().close();
});

test('a remote task edit stores the tasks and applied ids on the receiving device, and no other slice', async ({ browser }) => {
  const device = await openDevice(browser);
  const { id, tasks } = await boardView(device);
  await device.evaluate(() => { (globalThis as any).__readModelWrites.length = 0; });

  const wallTime = Date.now() + 1_000;
  await device.evaluate(async (event) => {
    const { EVENT_ORIGIN, ingestEvent } = await import(/* @vite-ignore */ `${location.origin}/modules/event-sourcing/ingest.js`);
    await ingestEvent(event, { origin: EVENT_ORIGIN.REMOTE });
    await (await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`))._flushPersistsForTesting();
  }, {
    id: crypto.randomUUID(),
    type: 'task.updated',
    hlc: { wallTime, counter: 0, nodeId: 'other-device' },
    at: new Date(wallTime).toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: id,
    entity_id: tasks[0].id,
    payload: { fields: { title: 'Edited elsewhere' } },
  });

  await expect(device.getByRole('listitem', { name: /Task: Edited elsewhere/i })).toBeVisible();
  const writes = await device.evaluate(() => (globalThis as any).__readModelWrites);
  expect([...writes].sort()).toEqual([`${id}:appliedEventIds`, `${id}:tasks`].sort());

  await device.context().close();
});

test('a board without the migration flag backfills once, and a reopen shows the same board with no new events', async ({ browser }) => {
  const device = await openDevice(browser);
  const flagKey = 'kanvana:migrations:eventBackfill:v1';
  const eventCount = () => device.evaluate(async () => {
    const { openStore, EVENTS_STORE } = await import(/* @vite-ignore */ `${location.origin}/modules/idb-store.js`);
    return (await openStore()).count(EVENTS_STORE);
  });

  // Back to a pre-migration database: the read model stays, the event log goes.
  await device.evaluate(async (flagKey) => {
    const { openStore, EVENTS_STORE, KV_STORE } = await import(/* @vite-ignore */ `${location.origin}/modules/idb-store.js`);
    await (await import(/* @vite-ignore */ `${location.origin}/modules/storage.js`))._flushPersistsForTesting();
    const db = await openStore();
    await db.clear(EVENTS_STORE);
    await db.delete(KV_STORE, flagKey);
  }, flagKey);
  const before = await boardView(device);

  await reload(device);
  const migrated = await eventCount();
  expect(migrated).toBeGreaterThan(0);
  expect(await boardView(device)).toEqual(before);

  await reload(device);
  expect(await eventCount()).toBe(migrated);
  expect(await boardView(device)).toEqual(before);

  await device.context().close();
});

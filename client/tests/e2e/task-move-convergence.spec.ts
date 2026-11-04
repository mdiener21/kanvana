// #140: two devices (browser contexts with their own IndexedDB) hold the same task.moved events,
// one from a device still emitting the old full-board order and one from a real drag on this
// build, and receive them in opposite orders. No backend: the events reach a device through the
// same ingest call a catch-up uses, imported from the dev server into the running app.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { waitForBoardReady } from './board.helpers.js';
import { dragByMouse } from './dragdrop.helpers.js';

type Task = { id: string; column: string; order: number; doneDate?: string; columnHistory: { column: string; at: string }[] };
type MoveEvent = { id: string; hlc: { wallTime: number }; at: string; entity_id: string; payload: { order: { id: string; column: string; order: number }[] } };

const INGEST_MODULE = '/modules/event-sourcing/ingest.js';

async function openDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await waitForBoardReady(page);
  return page;
}

// Raw IndexedDB, so this sees what a reload would load rather than the app's memory.
function readStore(page: Page, store: string, key?: string) {
  return page.evaluate(async ({ store, key }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const open = indexedDB.open('kanvana-db');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const objects = db.transaction(store).objectStore(store);
      const read = key === undefined ? objects.getAll() : objects.get(key);
      return await new Promise<any>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  }, { store, key });
}

const boardIdOf = (page: Page) => readStore(page, 'kv', 'kanbanActiveBoardId') as Promise<string>;

async function readTasks(page: Page): Promise<Task[]> {
  const tasks: Task[] = await readStore(page, 'read_model', `${await boardIdOf(page)}:tasks`);
  return [...tasks].sort((left, right) => left.id.localeCompare(right.id));
}

function deliver(page: Page, events: unknown[]) {
  return page.evaluate(async ({ events, modulePath }) => {
    const { ingestRemoteBatch } = await import(/* @vite-ignore */ modulePath);
    await ingestRemoteBatch(events.map((event) => ({ event, receivedAt: new Date().toISOString() })));
  }, { events, modulePath: INGEST_MODULE });
}

function envelope(type: string, boardId: string, entityId: string, wallTime: number, payload: unknown) {
  return {
    id: crypto.randomUUID(),
    type,
    hlc: { wallTime, counter: 0, nodeId: 'other-device' },
    at: new Date(wallTime).toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: boardId,
    entity_id: entityId,
    payload,
  };
}

// What a device on the old build emits: every task on the board, this one in its new column.
function fullBoardMove(boardId: string, tasks: Task[], taskId: string, toColumn: string, wallTime: number) {
  const from = tasks.find((task) => task.id === taskId)!.column;
  return envelope('task.moved', boardId, taskId, wallTime, {
    from_column: from,
    to_column: toColumn,
    order: tasks.map((task) => ({ id: task.id, column: task.id === taskId ? toColumn : task.column, order: task.order })),
  });
}

const listOf = (page: Page, columnId: string) => page.locator(`.task-column[data-column="${columnId}"] .tasks`);
const cardOf = (page: Page, taskId: string) => page.locator(`.task[data-task-id="${taskId}"]`);

function movesOf(page: Page, taskId: string): Promise<MoveEvent[]> {
  return readStore(page, 'events').then((events: (MoveEvent & { type: string })[]) =>
    events.filter((event) => event.type === 'task.moved' && event.entity_id === taskId));
}

async function realDrag(page: Page, taskId: string, toColumn: string, previousMoves: number): Promise<MoveEvent> {
  await dragByMouse(page, cardOf(page, taskId), listOf(page, toColumn));
  await expect.poll(async () => (await movesOf(page, taskId)).length).toBe(previousMoves + 1);
  return (await movesOf(page, taskId)).sort((left, right) => left.hlc.wallTime - right.hlc.wallTime).at(-1)!;
}

test('old full-board and new affected-column moves converge in either arrival order', async ({ browser }) => {
  const deviceA = await openDevice(browser);
  const deviceB = await openDevice(browser);
  const boardId = await boardIdOf(deviceA);
  expect(await boardIdOf(deviceB)).toBe(boardId);

  const columns: { id: string; name: string }[] = await readStore(deviceA, 'read_model', `${boardId}:columns`);
  const columnId = (name: string) => columns.find((column) => column.name === name)!.id;
  const [todo, doing, done] = [columnId('To Do'), columnId('In Progress'), columnId('Done')];

  const base = Date.now();
  const task = (id: string, title: string, column: string, wallTime: number) => {
    const at = new Date(wallTime).toISOString();
    return envelope('task.created', boardId, id, wallTime, {
      task: { id, title, column, order: 0, description: '', priority: 'none', dueDate: '', labels: [], relationships: [], subTasks: [], creationDate: at, changeDate: at, columnHistory: [{ column, at }] },
    });
  };
  const [mover, oldMover, unrelated] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const seed = [
    task(unrelated, 'Unrelated', done, base + 1),
    task(oldMover, 'Moved by an old device', todo, base + 2),
    task(mover, 'Moved by this build', todo, base + 3),
  ];
  // Each device seeded its own demo tasks at boot, stamped with its own clock, and has no sync here
  // to reconcile those stamps. Their placement must still match; the seeded tasks must match whole.
  const seeded = new Set([mover, oldMover, unrelated]);
  const converged = async (page: Page) => (await readTasks(page)).map((candidate) => (
    seeded.has(candidate.id) ? candidate : { id: candidate.id, column: candidate.column, order: candidate.order }
  ));
  await deliver(deviceA, seed);
  await deliver(deviceB, seed);
  await expect(cardOf(deviceA, mover)).toBeVisible();

  // Old event older than the new one: A takes its own drag first, so the old event arrives late.
  const oldEvent = fullBoardMove(boardId, await readTasks(deviceB), oldMover, doing, base + 4);
  const unrelatedBefore = (await readTasks(deviceA)).find((candidate) => candidate.id === unrelated);

  const newEvent = await realDrag(deviceA, mover, doing, 0);
  expect(newEvent.hlc.wallTime).toBeGreaterThan(oldEvent.hlc.wallTime);
  const named = (event: { payload: unknown }) => (event.payload as MoveEvent['payload']).order.map((entry) => entry.id);
  expect(named(oldEvent)).toContain(unrelated);
  expect(named(newEvent)).not.toContain(unrelated);

  await deliver(deviceA, [oldEvent]);
  await deliver(deviceB, [oldEvent]);
  await deliver(deviceB, [newEvent]);

  await expect.poll(() => converged(deviceB)).toEqual(await converged(deviceA));
  const afterFirst = await readTasks(deviceA);
  const pick = (tasks: Task[], id: string) => tasks.find((candidate) => candidate.id === id)!;
  expect(pick(afterFirst, mover).column).toBe(doing);
  // Whole-column overwrite: the drag, newer by HLC and written without the old event, names To Do.
  expect(pick(afterFirst, oldMover).column).toBe(todo);
  expect(pick(afterFirst, unrelated)).toEqual(unrelatedBefore);

  // New event older than the old one: this time B gets the old event first and the new one late.
  const intoDone = await realDrag(deviceA, mover, done, 1);
  expect(named(intoDone)).toContain(unrelated);
  expect(pick(await readTasks(deviceA), mover).doneDate).toBe(intoDone.at);
  const staleOldEvent = fullBoardMove(boardId, await readTasks(deviceB), oldMover, doing, intoDone.hlc.wallTime + 1000);

  await deliver(deviceA, [staleOldEvent]);
  await deliver(deviceB, [staleOldEvent]);
  await deliver(deviceB, [intoDone]);

  await expect.poll(() => converged(deviceB)).toEqual(await converged(deviceA));
  const afterSecond = await readTasks(deviceA);
  // The old shape's whole-board overwrite, written before it saw the drag, still wins by HLC.
  expect(pick(afterSecond, oldMover).column).toBe(doing);
  expect(pick(afterSecond, mover).column).toBe(doing);
  expect(pick(afterSecond, mover).columnHistory.map((entry) => entry.column)).toEqual([todo, doing, done]);

  await deviceA.reload();
  await deviceB.reload();
  await waitForBoardReady(deviceA);
  await waitForBoardReady(deviceB);
  await expect(listOf(deviceA, doing).locator(`.task[data-task-id="${mover}"]`)).toBeVisible();
  await expect(listOf(deviceB, doing).locator(`.task[data-task-id="${mover}"]`)).toBeVisible();
  expect(await converged(deviceB)).toEqual(await converged(deviceA));

  await deviceA.context().close();
  await deviceB.context().close();
});

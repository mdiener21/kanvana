// #141 and #138 against a real IndexedDB: writes counted where they reach the store, a selective save hydrating to
// the same board a full replay builds, and a snapshot that holds the whole board though no save wrote all of it.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage,
  _resetStorageForTesting,
  _flushPersistsForTesting,
  createBoard,
  listBoards,
  loadColumnsForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadTasksForBoard
} from '../../../src/modules/storage.js';
import { EVENT_ORIGIN, ingestEvent } from '../../../src/modules/event-sourcing/ingest.js';
import { BACKFILL_FLAG_KEY } from '../../../src/modules/event-sourcing/backfill.js';
import { GRACE_WINDOW_MS, SNAPSHOT_EVENT_THRESHOLD, _setJitterForTesting, loadSnapshot } from '../../../src/modules/event-sourcing/snapshot.js';
import { validateEvent } from '../../../src/modules/event-sourcing/event-validation.js';
import { DATA_CHANGED, off, on } from '../../../src/modules/events.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';
import { EVENTS_STORE, KV_STORE, READ_MODEL_STORE, SNAPSHOTS_STORE, openStore } from '../../../src/modules/idb-store.js';

const TASK_ID = '7a5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
const COLUMN_ID = '1b5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
const LABEL_ID = '2c5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';
const NEW_BOARD_ID = '3d5c0d2e-1b3f-4c6d-8e9f-0a1b2c3d4e5f';

let boardId;
let clock;

function boardEvent(type, entityId, payload, { board = boardId, wallTime = (clock += 1), id = crypto.randomUUID() } = {}) {
  return {
    id,
    type,
    hlc: { wallTime, counter: 0, nodeId: 'node-a' },
    at: new Date(wallTime).toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: board,
    entity_id: entityId,
    payload
  };
}

const ingestLocal = (event) => ingestEvent(event, { origin: EVENT_ORIGIN.LOCAL });

const createdTask = (options) => boardEvent('task.created', TASK_ID, { task: { title: 'T', column: COLUMN_ID, order: 1 } }, options);

// Puts on the stores the projector owns, by key; the event log is not the read model.
function countReadModelPuts() {
  const puts = [];
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
    if (this.name === READ_MODEL_STORE || (this.name === KV_STORE && key !== 'kanvana:hlc:state')) puts.push(String(key));
    return original.call(this, value, key);
  });
  return { puts, restore: () => spy.mockRestore() };
}

function board(id = boardId) {
  return {
    board: listBoards().find((item) => item.id === id),
    tasks: loadTasksForBoard(id),
    columns: loadColumnsForBoard(id),
    labels: loadLabelsForBoard(id),
    settings: loadSettingsForBoard(id)
  };
}

async function reload() {
  await _flushPersistsForTesting();
  _resetStorageForTesting();
  await initStorage();
}

beforeEach(async () => {
  _resetStorageForTesting();
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
  boardId = createBoard('Selective').id;
  clock = Date.now() + 1_000;
  await ingestLocal(boardEvent('column.created', COLUMN_ID, { column: { name: 'Extra', order: 9 } }));
  await ingestLocal(boardEvent('label.created', LABEL_ID, { label: { name: 'L', color: '#123456' } }));
  await ingestLocal(createdTask());
  await _flushPersistsForTesting();
});

describe('writes that reach IndexedDB', () => {
  let counter;
  beforeEach(() => { counter = countReadModelPuts(); });
  afterEach(() => counter.restore());

  const slices = (key = boardId) => [`${key}:appliedEventIds`, 'kanvana:ingest:newestAppliedHlc'];

  test('a task move stores the tasks and the event memory, and no other slice', async () => {
    await ingestLocal(boardEvent('task.moved', TASK_ID, { order: [{ id: TASK_ID, column: COLUMN_ID, order: 5 }] }));
    await _flushPersistsForTesting();

    expect(counter.puts.sort()).toEqual([`${boardId}:tasks`, ...slices()].sort());
  });

  test('a column, a label, a settings and a board event each store their own slice', async () => {
    const cases = [
      [boardEvent('column.updated', COLUMN_ID, { fields: { name: 'Renamed' } }), `${boardId}:columns`],
      [boardEvent('label.updated', LABEL_ID, { fields: { name: 'Renamed' } }), `${boardId}:labels`],
      [boardEvent('settings.updated', boardId, { fields: { showAge: true } }), `kanbanBoard:${boardId}:settings`],
      [boardEvent('board.updated', boardId, { fields: { name: 'Renamed' } }), 'kanbanBoards']
    ];
    for (const [event, slice] of cases) {
      counter.puts.length = 0;
      await ingestLocal(event);
      await _flushPersistsForTesting();
      expect(counter.puts.sort()).toEqual([slice, ...slices()].sort());
    }
  });

  test('a duplicate create stores the event memory only, and renders nothing', async () => {
    const onChanged = vi.fn();
    on(DATA_CHANGED, onChanged);
    await ingestLocal(createdTask());
    off(DATA_CHANGED, onChanged);
    await _flushPersistsForTesting();

    expect(onChanged).not.toHaveBeenCalled();
    expect(counter.puts.sort()).toEqual(slices().sort());
  });
});

describe('hydration and replay', () => {
  function history() {
    return [
      boardEvent('task.updated', TASK_ID, { fields: { title: 'Edited' } }),
      createdTask(),
      boardEvent('task.moved', TASK_ID, { order: [{ id: TASK_ID, column: COLUMN_ID, order: 7 }] }),
      boardEvent('label.added_to_task', TASK_ID, { label_id: LABEL_ID }),
      boardEvent('column.updated', COLUMN_ID, { fields: { name: 'Renamed' } }),
      boardEvent('label.updated', LABEL_ID, { fields: { name: 'Renamed' } }),
      boardEvent('settings.updated', boardId, { fields: { showAge: true } }),
      boardEvent('board.updated', boardId, { fields: { name: 'Renamed' } }),
      boardEvent('task.created', 'task-gone', { task: { title: 'Gone', column: COLUMN_ID } }),
      boardEvent('task.deleted', 'task-gone', {})
    ];
  }

  test('a board saved slice by slice hydrates to what was in memory', async () => {
    for (const event of history()) await ingestLocal(event);
    const inMemory = structuredClone(board());
    expect(inMemory.tasks[0]).toMatchObject({ title: 'Edited', order: 7, labels: [LABEL_ID] });

    await reload();

    // Hydration adds defaults (a column's wipLimit, a task's relationships), so what was in memory is a subset.
    expect(board()).toMatchObject(inMemory);
  });

  test('a board saved slice by slice matches a replay of the same events from its start', async () => {
    for (const event of history()) await ingestLocal(event);
    await reload();

    const stored = await (await openStore()).getAll(EVENTS_STORE);
    const replayed = applyEvents(createProjectionState(), stored.filter((event) => event.board_id === boardId));

    expect(board().tasks).toMatchObject(replayed.tasks);
    expect(loadColumnsForBoard(boardId).find((column) => column.id === COLUMN_ID).name).toBe('Renamed');
    expect(replayed.columns.find((column) => column.id === COLUMN_ID).name).toBe('Renamed');
    expect(loadLabelsForBoard(boardId).map((label) => label.name)).toEqual(replayed.labels.map((label) => label.name));
    expect(board().board.name).toBe(replayed.boards[0].name);
    expect(board().settings.showAge).toBe(replayed.settings.showAge);
  });

  test('a reload still remembers a task deletion and every applied id, so neither replays', async () => {
    const gone = boardEvent('task.deleted', TASK_ID, {});
    await ingestLocal(gone);
    await reload();

    const onChanged = vi.fn();
    on(DATA_CHANGED, onChanged);
    await ingestLocal(gone);
    await ingestLocal(createdTask());
    off(DATA_CHANGED, onChanged);

    expect(loadTasksForBoard(boardId)).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('snapshots', () => {
  const old = Date.now() - GRACE_WINDOW_MS - 60_000;
  const atOld = (offset) => ({ board: NEW_BOARD_ID, wallTime: old + offset });

  function oldBoardHistory() {
    return [
      boardEvent('board.created', NEW_BOARD_ID, { board: { name: 'Old', createdAt: new Date(old).toISOString() } }, atOld(0)),
      boardEvent('column.created', COLUMN_ID, { column: { name: 'Col', order: 1 } }, atOld(1)),
      boardEvent('label.created', LABEL_ID, { label: { name: 'Lab', color: '#123456' } }, atOld(2)),
      boardEvent('settings.updated', NEW_BOARD_ID, { fields: { showAge: true } }, atOld(3)),
      boardEvent('task.created', TASK_ID, { task: { title: 'First', column: COLUMN_ID } }, atOld(4))
    ];
  }

  async function snapshotPutsDuring(run) {
    const puts = vi.spyOn(IDBObjectStore.prototype, 'put');
    try {
      await run();
      await vi.waitFor(async () => expect(await loadSnapshot(NEW_BOARD_ID)).not.toBeNull(), { timeout: 5_000 });
      await _flushPersistsForTesting();
      return puts.mock.contexts.filter((store) => store.name === SNAPSHOTS_STORE).length;
    } finally {
      puts.mockRestore();
    }
  }

  test('a run of no-ops takes one snapshot, not one per event', async () => {
    _setJitterForTesting(() => 0);
    const onChanged = vi.fn();

    const snapshots = await snapshotPutsDuring(() => {
      const writes = oldBoardHistory().map(ingestLocal);
      on(DATA_CHANGED, onChanged);
      const duplicates = Array.from({ length: SNAPSHOT_EVENT_THRESHOLD }, (_, index) => createdTask(atOld(5 + index)));
      writes.push(...duplicates.map(ingestLocal));
      off(DATA_CHANGED, onChanged);
      return Promise.all(writes);
    });

    expect(snapshots).toBe(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('a snapshot holds the whole board though each event stored only its slice', async () => {
    _setJitterForTesting(() => 0);

    await snapshotPutsDuring(() => {
      const edits = Array.from({ length: SNAPSHOT_EVENT_THRESHOLD }, (_, index) => boardEvent('task.updated', TASK_ID, { fields: { title: `T${index}` } }, atOld(5 + index)));
      return Promise.all([...oldBoardHistory(), ...edits].map(ingestLocal));
    });

    const { state } = await loadSnapshot(NEW_BOARD_ID);
    expect(state.boards.map((item) => item.name)).toEqual(['Old']);
    expect(state.columns).toEqual(loadColumnsForBoard(NEW_BOARD_ID).filter((column) => column.id === COLUMN_ID).map((column) => expect.objectContaining({ id: column.id, name: 'Col' })));
    expect(state.labels.map((label) => label.name)).toEqual(['Lab']);
    expect(state.settings).toMatchObject({ showAge: true });
    expect(state.tasks).toEqual(loadTasksForBoard(NEW_BOARD_ID));
    expect(state.tasks[0].title).toBe(`T${SNAPSHOT_EVENT_THRESHOLD - 1}`);
  });
});

describe('backfill at boot (#138)', () => {
  async function forgetEventLog() {
    await _flushPersistsForTesting();
    const db = await openStore();
    await db.clear(EVENTS_STORE);
    await db.delete(KV_STORE, BACKFILL_FLAG_KEY);
    _resetStorageForTesting();
  }

  test('fills the log with valid syncable events, without projecting or announcing them', async () => {
    await forgetEventLog();
    const onChanged = vi.fn();
    on(DATA_CHANGED, onChanged);
    const counter = countReadModelPuts();
    try {
      await initStorage();
      await _flushPersistsForTesting();
    } finally {
      counter.restore();
      off(DATA_CHANGED, onChanged);
    }

    const db = await openStore();
    const events = (await db.getAll(EVENTS_STORE)).filter((event) => event.board_id === boardId);
    const flag = await db.get(KV_STORE, BACKFILL_FLAG_KEY);
    expect(events.map((event) => event.type).sort()).toEqual(expect.arrayContaining(['board.created', 'column.created', 'label.created', 'task.created', 'settings.updated']));
    expect(events.every((event) => validateEvent(event) && event.synced !== true)).toBe(true);
    expect(flag.emitted).toBeGreaterThanOrEqual(events.length);
    expect(onChanged).not.toHaveBeenCalled();
    // Hydration may store its normalised lists once; an event projected at boot would add event memory, and repeat them.
    const boardPuts = counter.puts.filter((key) => key.startsWith(`${boardId}:`));
    expect(boardPuts).not.toContain(`${boardId}:appliedEventIds`);
    expect(new Set(boardPuts).size).toBe(boardPuts.length);
  });

  test('a reopen with the flag set adds no events and shows the same board', async () => {
    await forgetEventLog();
    await initStorage();
    const before = structuredClone(board());
    await _flushPersistsForTesting();
    const db = await openStore();
    const eventsBefore = await db.count(EVENTS_STORE);

    await reload();

    expect(await (await openStore()).count(EVENTS_STORE)).toBe(eventsBefore);
    expect(board()).toEqual(before);
  });
});

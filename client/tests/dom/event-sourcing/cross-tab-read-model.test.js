// #222: each tab holds its own in-memory read model. These tests load one module graph per
// tab over one IndexedDB, and show a tab can't lose another tab's events to a stale copy.
import { waitFor } from '@testing-library/dom';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBroadcastChannel, createFakeLocks, installLocks, removeLocks } from './helpers/fake-tabs.js';

const BOARD = 'board-1';
const TASK = 'task-1';
const tabs = [];

function inertNetwork() {
  const nothing = async () => {};
  return {
    startRealtime: nothing,
    stopRealtime: nothing,
    catchUp: nothing,
    startQueue: () => {},
    stopQueue: () => {},
    startSnapshots: () => {},
    stopSnapshots: () => {},
    uploadStoredSnapshot: nothing,
  };
}

async function openTab() {
  vi.resetModules();
  const tab = {
    storage: await import('../../../src/modules/storage.js'),
    idb: await import('../../../src/modules/idb-store.js'),
    ingest: await import('../../../src/modules/event-sourcing/ingest.js'),
    emitter: await import('../../../src/modules/event-sourcing/emitter.js'),
    leader: await import('../../../src/modules/event-sourcing/sync-leader.js'),
    events: await import('../../../src/modules/events.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
    reducer: await import('../../../src/modules/reducer.js'),
  };
  await tab.storage.initStorage();
  await tab.leader.initSyncLeader({ network: inertNetwork() });
  tab.renders = 0;
  tab.events.on(tab.events.DATA_CHANGED, () => { tab.renders += 1; });
  tabs.push(tab);
  return tab;
}

async function closeTab(tab) {
  tabs.splice(tabs.indexOf(tab), 1);
  tab.leader._resetSyncLeaderForTesting();
  await tab.emitter.flushDomainEvents();
  await tab.idb.flushPendingPersists();
  tab.snapshot._resetSnapshotSchedulerForTesting();
  tab.idb._resetIdbForTesting();
}

function emitEvent(tab, type, fields) {
  return tab.emitter.scheduleDomainEvent({ type, boardId: BOARD, ...fields });
}

function createBoardAndTask(tab) {
  emitEvent(tab, 'board.created', { entityId: BOARD, payload: { board: { id: BOARD, name: 'Shared' } } });
  return emitEvent(tab, 'task.created', {
    entityId: TASK,
    payload: { task: { id: TASK, title: 'First', description: '', column: 'c1', priority: 'none', labels: [] } },
  });
}

const updateTask = (tab, fields) => emitEvent(tab, 'task.updated', { entityId: TASK, payload: { fields } });

function remoteEvent(fields, { id = 'remote-1', wallTime = Date.now(), counter = 0 } = {}) {
  return {
    id,
    type: 'task.updated',
    hlc: { wallTime, counter, nodeId: 'other-device' },
    at: new Date().toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: BOARD,
    entity_id: TASK,
    payload: { fields },
  };
}

function remoteUpdate(tab, fields, options) {
  return tab.ingest.ingestEvent(remoteEvent(fields, options), { origin: 'remote' });
}

const taskIn = (tab) => tab.storage.loadTasksForBoard(BOARD).find((task) => task.id === TASK);

// A fresh tab reads only IndexedDB, so it shows what survives a reload.
async function taskAfterReload() {
  for (const tab of tabs) {
    await tab.emitter.flushDomainEvents();
    await tab.idb.flushPendingPersists();
  }
  // Missed-event repair must not be what makes these assertions pass.
  const db = await tabs[0].idb.openStore();
  const tasks = await db.get('read_model', `${BOARD}:tasks`);
  return (tasks ?? []).find((task) => task.id === TASK);
}

async function leaderAndFollower() {
  const leader = await openTab();
  const follower = await openTab();
  createBoardAndTask(leader);
  await waitFor(() => expect(taskIn(follower)?.title).toBe('First'));
  return { leader, follower };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.BroadcastChannel = FakeBroadcastChannel;
  installLocks(createFakeLocks());
});

afterEach(async () => {
  FakeBroadcastChannel.release();
  for (const tab of [...tabs]) await closeTab(tab);
  FakeBroadcastChannel.reset();
  delete globalThis.BroadcastChannel;
  removeLocks();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('a remote event the leader ingests', () => {
  it('reaches the follower tab read model and re-renders it, with no reload', async () => {
    const { leader, follower } = await leaderAndFollower();
    const renders = follower.renders;

    await remoteUpdate(leader, { title: 'From another device' });

    await waitFor(() => expect(taskIn(follower).title).toBe('From another device'));
    expect(follower.renders).toBeGreaterThan(renders);
  });

  it('is not stored again or queued by the follower', async () => {
    const { leader, follower } = await leaderAndFollower();
    await remoteUpdate(leader, { title: 'From another device' });
    await waitFor(() => expect(taskIn(follower).title).toBe('From another device'));

    const db = await follower.idb.openStore();
    expect((await db.get('events', 'remote-1')).synced).toBe(true);
  });

  it('moves the follower clock past it, so the next edit there wins everywhere', async () => {
    const { leader, follower } = await leaderAndFollower();
    await remoteUpdate(leader, { title: 'Clock ahead' }, { wallTime: Date.now() + 30_000 });
    await waitFor(() => expect(taskIn(follower).title).toBe('Clock ahead'));

    updateTask(follower, { title: 'Newer edit' });

    await waitFor(() => expect(taskIn(leader).title).toBe('Newer edit'));
    expect(taskIn(follower).title).toBe('Newer edit');
    expect((await taskAfterReload()).title).toBe('Newer edit');
  });

  it('renders a catch-up batch in the follower once', async () => {
    const { leader, follower } = await leaderAndFollower();
    await waitFor(() => expect(follower.renders).toBeGreaterThan(0));
    const renders = follower.renders;
    const wallTime = Date.now() + 1000;
    const items = Array.from({ length: 20 }, (_, index) => ({
      event: remoteEvent({ title: `Batch ${index}` }, { id: `batch-${index}`, wallTime, counter: index }),
    }));

    await leader.ingest.ingestRemoteBatch(items);

    await waitFor(() => expect(taskIn(follower).title).toBe('Batch 19'));
    expect(follower.renders - renders).toBe(1);
  });
});

describe('a follower edit right after a remote event', () => {
  it('keeps both changes in every tab and in what a reload reads, when the edit beats the notice', async () => {
    const { leader, follower } = await leaderAndFollower();

    FakeBroadcastChannel.hold();
    await remoteUpdate(leader, { title: 'From another device' });
    await leader.idb.flushPendingPersists();
    // The follower has not heard yet, so it edits on a stale copy and writes that copy out.
    await updateTask(follower, { description: 'Edited on a stale copy' });
    await follower.idb.flushPendingPersists();
    FakeBroadcastChannel.release();

    const both = { title: 'From another device', description: 'Edited on a stale copy' };
    await waitFor(() => {
      expect(taskIn(follower)).toMatchObject(both);
      expect(taskIn(leader)).toMatchObject(both);
    });
    await waitFor(async () => expect(await taskAfterReload()).toMatchObject(both));
  });

  it('orders the same field by clock, not by which tab heard first', async () => {
    const { leader, follower } = await leaderAndFollower();

    FakeBroadcastChannel.hold();
    await remoteUpdate(leader, { title: 'Older remote title' }, { wallTime: Date.now() - 5000 });
    await updateTask(follower, { title: 'Newer local title' });
    FakeBroadcastChannel.release();

    await new Promise((res) => setTimeout(res, 50));
    await waitFor(() => {
      expect(taskIn(follower).title).toBe('Newer local title');
      expect(taskIn(leader).title).toBe('Newer local title');
    });
    await waitFor(async () => expect((await taskAfterReload()).title).toBe('Newer local title'));
  });

  it('does not bring back old data once the notice was applied', async () => {
    const { leader, follower } = await leaderAndFollower();
    await remoteUpdate(leader, { title: 'From another device' });
    await waitFor(() => expect(taskIn(follower).title).toBe('From another device'));

    updateTask(follower, { description: 'Edited after hearing' });

    await waitFor(() => expect(taskIn(leader).description).toBe('Edited after hearing'));
    expect(await taskAfterReload()).toMatchObject({ title: 'From another device', description: 'Edited after hearing' });
  });
});

describe('a local edit', () => {
  it('is in the shared store before any tab hears of it', async () => {
    const { leader } = await leaderAndFollower();
    const db = await leader.idb.openStore();
    const lookups = [];
    const realPost = FakeBroadcastChannel.prototype.postMessage;
    vi.spyOn(FakeBroadcastChannel.prototype, 'postMessage').mockImplementation(function post(message) {
      if (message.type === 'events-stored') lookups.push(...message.ids.map((id) => db.get('events', id)));
      realPost.call(this, message);
    });

    updateTask(leader, { title: 'Local' });
    await waitFor(() => expect(lookups.length).toBe(1));

    expect((await Promise.all(lookups)).every(Boolean)).toBe(true);
  });

  it('shows in the other tab, with no reload, whichever tab made it', async () => {
    const { leader, follower } = await leaderAndFollower();

    updateTask(follower, { title: 'From the follower' });
    await waitFor(() => expect(taskIn(leader).title).toBe('From the follower'));

    updateTask(leader, { description: 'From the leader' });
    await waitFor(() => expect(taskIn(follower).description).toBe('From the leader'));
  });

  it('stays queued for push after the other tab applied it', async () => {
    const { leader, follower } = await leaderAndFollower();
    updateTask(follower, { title: 'From the follower' });
    await waitFor(() => expect(taskIn(leader).title).toBe('From the follower'));

    const unsynced = await leader.idb.getUnsyncedEvents();
    expect(unsynced.some((event) => event.payload?.fields?.title === 'From the follower')).toBe(true);
  });
});

describe('a board setting written without an event', () => {
  it('survives the other tab writing out its copy of the board, and shows there', async () => {
    const { leader, follower } = await leaderAndFollower();
    leader.storage.setActiveBoardId(BOARD);
    follower.storage.setActiveBoardId(BOARD);

    leader.storage.saveSettings({ ...leader.storage.loadSettings(), swimLanesEnabled: true });
    await waitFor(() => expect(follower.storage.loadSettings().swimLanesEnabled).toBe(true));

    updateTask(follower, { title: 'Written out by the follower' });
    await waitFor(() => expect(taskIn(leader).title).toBe('Written out by the follower'));
    await follower.idb.flushPendingPersists();
    await leader.idb.flushPendingPersists();

    const db = await leader.idb.openStore();
    expect((await db.get('kv', `kanbanBoard:${BOARD}:settings`)).swimLanesEnabled).toBe(true);
  });
});

describe('a snapshot the leader adopts', () => {
  it('drops from the follower what it dropped itself', async () => {
    const { leader, follower } = await leaderAndFollower();
    await leader.emitter.flushDomainEvents();
    const hlc = { wallTime: Date.now() + 1000, counter: 0, nodeId: 'other-device' };
    const state = leader.reducer.createProjectionState({ boards: [{ id: BOARD, name: 'Snapshotted' }] });

    await leader.ingest.adoptSnapshot(BOARD, state, hlc);

    expect(taskIn(leader)).toBeUndefined();
    await waitFor(() => expect(taskIn(follower)).toBeUndefined());
    expect(follower.storage.getBoardById(BOARD).name).toBe('Snapshotted');
    await waitFor(async () => expect(await taskAfterReload()).toBeUndefined());
  });
});

describe('events a tab missed', () => {
  it('a follower tab opening shows events stored before it could hear of them', async () => {
    const leader = await openTab();
    createBoardAndTask(leader);
    await leader.emitter.flushDomainEvents();
    await leader.idb.flushPendingPersists();
    // In the store, but the tab that stored it died before its read model reached IndexedDB.
    const db = await leader.idb.openStore();
    await db.put('events', { ...remoteEvent({ title: 'Never announced' }, { id: 'unheard', wallTime: Date.now() + 1000 }), synced: true });

    const follower = await openTab();

    await waitFor(() => expect(taskIn(follower).title).toBe('Never announced'));
  });

  it('does not bring back a board deleted in this tab', async () => {
    const leader = await openTab();
    const follower = await openTab();
    createBoardAndTask(leader);
    await waitFor(() => expect(follower.storage.getBoardById(BOARD)).toBeTruthy());
    follower.storage.createBoard('Keep');
    follower.storage.deleteBoard(BOARD);
    await follower.emitter.flushDomainEvents();

    await follower.ingest.ingestMissedEvents();

    expect(follower.storage.getBoardById(BOARD)).toBeNull();
    expect(follower.storage.loadTasksForBoard(BOARD)).toEqual([]);
  });

  it('does not apply a time-tracking event twice after a reload', async () => {
    const leader = await openTab();
    const customer = { id: 'cust-1', name: 'Acme' };
    leader.emitter.scheduleDomainEvent({ type: 'customer.created', scope: 'timetracking', entityId: customer.id, payload: { customer } });
    await leader.emitter.flushDomainEvents();
    await leader.idb.flushPendingPersists();

    const follower = await openTab();
    const renders = follower.renders;
    await follower.ingest.ingestMissedEvents();

    expect(follower.renders).toBe(renders);
  });
});

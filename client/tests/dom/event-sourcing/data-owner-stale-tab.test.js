// ADR-0006: a tab that still believes in the old owner has not heard of a wipe yet. Nothing it
// writes in that window may reach the new owner's data. One module graph per tab, one IndexedDB.
import { waitFor } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';

const OWNER_A = 'user-a';
const OWNER_B = 'user-b';
const BOARD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const tabs = [];

function eventOfA(id, wallTime = Date.now()) {
  return {
    id,
    type: 'board.created',
    hlc: { wallTime, counter: 0, nodeId: 'node-a' },
    at: new Date().toISOString(),
    actor: { type: 'human', id: null },
    scope: 'board',
    board_id: BOARD_A,
    entity_id: BOARD_A,
    payload: { board: { name: `Board of A ${id}` } },
  };
}

async function openTab() {
  vi.resetModules();
  const tab = {
    idb: await import('../../../src/modules/idb-store.js'),
    sync: await import('../../../src/modules/sync.js'),
    storage: await import('../../../src/modules/storage.js'),
    ingest: await import('../../../src/modules/event-sourcing/ingest.js'),
    snapshot: await import('../../../src/modules/event-sourcing/snapshot.js'),
    realtime: await import('../../../src/modules/event-sourcing/realtime.js'),
    dataOwner: await import('../../../src/modules/event-sourcing/data-owner.js'),
    reloads: 0,
  };
  tab.dataOwner._setReloadForTesting(() => { tab.reloads += 1; });
  tab.dataOwner.listenForDataOwnerWipe();
  await tab.storage.initStorage();
  await tab.storage._flushPersistsForTesting();
  tabs.push(tab);
  return tab;
}

// The wipe commits and the notice has not arrived: exactly the window under test.
const wipeFor = (tab, ownerId) => tab.idb.replaceLocalData({ ownerId, maxUnsynced: Infinity, keepKvKeys: [] });

async function onDisk() {
  const db = await openDB('kanvana-db');
  const read = async (store) => Object.fromEntries(await Promise.all((await db.getAllKeys(store)).map(async (key) => [key, await db.get(store, key)])));
  const contents = { kv: await read('kv'), events: await read('events'), snapshots: await read('snapshots'), readModel: await read('read_model') };
  db.close();
  return contents;
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
});

afterEach(() => {
  for (const tab of tabs.splice(0)) {
    tab.dataOwner._resetDataOwnerForTesting();
    tab.idb._resetIdbForTesting();
  }
  vi.unstubAllGlobals();
});

describe('a write from a tab that missed a wipe', () => {
  let stale;
  let other;
  let afterWipe;

  beforeEach(async () => {
    stale = await openTab();
    await stale.idb.claimDataOwner(OWNER_A);
    other = await openTab();
    await wipeFor(other, OWNER_B);
    afterWipe = await onDisk();
  });

  it('keeps a catch-up batch of the old owner out of the events store and the read model', async () => {
    await stale.ingest.ingestRemoteBatch([{ event: eventOfA('remote-1'), receivedAt: new Date().toISOString() }]);
    await stale.storage._flushPersistsForTesting();

    const disk = await onDisk();
    expect(disk.events).toEqual({});
    expect(disk.readModel).toEqual({});
    expect(disk.kv).toEqual(afterWipe.kv);
  });

  it('keeps a local edit out of the queue, so it can not be pushed as the new owner', async () => {
    await stale.ingest.ingestEvent(eventOfA('local-1'));

    expect(await (await openTab()).idb.getUnsyncedEvents()).toEqual([]);
  });

  it('leaves nothing for a new owner\'s tab to fold in', async () => {
    await stale.ingest.ingestEvent(eventOfA('local-1'));
    const fresh = await openTab();

    await fresh.ingest.ingestMissedEvents();

    expect(fresh.storage.listBoards().some((board) => board.id === BOARD_A)).toBe(false);
  });

  it('reloads the page, which is what clears the old owner from its memory', async () => {
    await stale.ingest.ingestEvent(eventOfA('local-1'));

    await waitFor(() => expect(stale.reloads).toBe(1));
    expect(other.reloads).toBe(0);
  });

  it.each([
    ['persistEvent', (tab) => tab.idb.persistEvent(eventOfA('e1'))],
    ['schedulePersist', (tab) => tab.idb.schedulePersist('kanbanBoards', [{ id: BOARD_A }])],
    ['scheduleDelete', (tab) => tab.idb.scheduleDelete('kanvana:dataOwner')],
    ['scheduleReadModelPersist', (tab) => tab.idb.scheduleReadModelPersist(BOARD_A, 'tasks', [{ id: 't' }])],
    ['saveSnapshot', (tab) => tab.snapshot.saveSnapshot(BOARD_A, {}, eventOfA('e1').hlc)],
    ['adoptSnapshot', (tab) => tab.ingest.adoptSnapshot(BOARD_A, { tasks: [], columns: [], labels: [] }, eventOfA('e1').hlc)],
    ['clearFirstPullPending', (tab) => tab.idb.clearFirstPullPending()],
  ])('drops %s', async (_name, write) => {
    // The closed connection ends what the dropped write was part of; the page is reloading.
    await Promise.resolve(write(stale)).catch(() => {});
    await stale.storage._flushPersistsForTesting();

    const disk = await onDisk();
    expect(disk.events).toEqual({});
    expect(disk.snapshots).toEqual({});
    expect(disk.readModel).toEqual({});
    expect(disk.kv).toEqual(afterWipe.kv);
    expect(stale.reloads).toBe(1);
  });

  it('stores nothing from a whole pull of the old owner, watermarks included', async () => {
    const event = eventOfA('pulled');
    const record = {
      local_id: event.id, event_type: event.type, hlc: event.hlc, at: event.at, scope: event.scope,
      board: event.board_id, entity_id: event.entity_id, payload: event.payload, created: new Date().toISOString(),
    };
    const pb = stale.sync.getPb();
    pb.authStore.save('token', { id: OWNER_B });
    pb.collection = (name) => ({ getFullList: async () => (name === 'events' ? [record] : []) });
    Object.defineProperty(pb.authStore, 'isValid', { get: () => true });

    await stale.realtime.catchUp().catch(() => {});

    const disk = await onDisk();
    expect(disk.events).toEqual({});
    expect(disk.kv).toEqual(afterWipe.kv);
    pb.authStore.clear();
  });
});

describe('a tab that slept through more than one wipe', () => {
  it('still has its writes dropped', async () => {
    const stale = await openTab();
    await stale.idb.claimDataOwner(OWNER_A);
    await wipeFor(await openTab(), OWNER_B);
    await wipeFor(await openTab(), OWNER_A);

    await stale.idb.persistEvent(eventOfA('old-edit'));

    expect((await onDisk()).events).toEqual({});
    expect(stale.reloads).toBe(1);
  });
});

describe('marking an event synced around a wipe', () => {
  it('can not bring a wiped event back', async () => {
    const stale = await openTab();
    await stale.idb.claimDataOwner(OWNER_A);
    await stale.idb.persistEvent(eventOfA('pushed'));
    const other = await openTab();
    await wipeFor(other, OWNER_B);

    await stale.idb.markEventSynced('pushed');

    expect((await onDisk()).events).toEqual({});
  });
});

describe('writes that must keep working', () => {
  it('lets a tab write after another tab claims unowned data, because a claim wipes nothing', async () => {
    const first = await openTab();
    const second = await openTab();

    await second.idb.claimDataOwner(OWNER_A);
    await first.idb.persistEvent(eventOfA('offline-edit'));

    expect(Object.keys((await onDisk()).events)).toEqual(['offline-edit']);
    expect(first.reloads).toBe(0);
  });

  it('lets a tab opened after the wipe write', async () => {
    const before = await openTab();
    await before.idb.claimDataOwner(OWNER_A);
    await wipeFor(before, OWNER_B);
    const fresh = await openTab();

    await fresh.idb.persistEvent(eventOfA('edit-of-b'));

    expect(Object.keys((await onDisk()).events)).toEqual(['edit-of-b']);
    expect(fresh.reloads).toBe(0);
  });

  it('still catches a tab opened before a second wipe back to the first owner', async () => {
    const stale = await openTab();
    await stale.idb.claimDataOwner(OWNER_A);
    const other = await openTab();
    await wipeFor(other, OWNER_B);
    await wipeFor(other, OWNER_A);

    await stale.idb.persistEvent(eventOfA('old-edit'));

    expect((await onDisk()).events).toEqual({});
  });

  it('keeps the order of writes made in one tick', async () => {
    const tab = await openTab();

    tab.idb.schedulePersist('order-test', 1);
    tab.idb.schedulePersist('order-test', 2);
    tab.idb.schedulePersist('order-test', 3);
    await tab.storage._flushPersistsForTesting();

    expect((await onDisk()).kv['order-test']).toBe(3);
  });

  it('stores the value as it was when the write was asked for', async () => {
    const tab = await openTab();
    const value = { name: 'before' };

    tab.idb.schedulePersist('clone-test', value);
    value.name = 'after';
    await tab.storage._flushPersistsForTesting();

    expect((await onDisk()).kv['clone-test']).toEqual({ name: 'before' });
  });
});

describe('with no BroadcastChannel to bring the notice', () => {
  it('still reloads on the first dropped write', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const stale = await openTab();
    await stale.idb.claimDataOwner(OWNER_A);
    const other = await openTab();
    await wipeFor(other, OWNER_B);

    await stale.idb.persistEvent(eventOfA('e1'));

    expect(stale.reloads).toBe(1);
  });
});

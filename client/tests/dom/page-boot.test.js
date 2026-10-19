// #218 AC-002: the shared page boot sets up the same sync pieces in one fixed order.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls, initStorage } = vi.hoisted(() => {
  const calls = [];
  return { calls, initStorage: vi.fn(async () => { calls.push('storage'); }) };
});
const record = (name) => () => { calls.push(name); };

vi.mock('../../src/modules/storage.js', () => ({ initStorage }));
vi.mock('../../src/modules/theme.js', () => ({ initializeThemeToggle: record('theme') }));
vi.mock('../../src/modules/sync.js', () => ({ initAuthRefresh: record('auth refresh') }));
vi.mock('../../src/modules/authsync.js', () => ({ initializeAuthSyncUI: record('auth UI') }));
vi.mock('../../src/modules/event-sourcing/sync-queue.js', () => ({ initSyncQueue: record('queue') }));
vi.mock('../../src/modules/event-sourcing/snapshot-sync.js', () => ({ initSnapshotSync: record('snapshot upload') }));
vi.mock('../../src/modules/event-sourcing/realtime.js', () => ({ initRealtime: record('realtime') }));
vi.mock('../../src/modules/event-sourcing/sync-indicator.js', () => ({ initSyncIndicator: record('sync indicator') }));

const { bootPage } = await import('../../src/modules/page-boot.js');

const SYNC_ORDER = ['storage', 'theme', 'auth refresh', 'queue', 'snapshot upload', 'realtime', 'sync indicator'];

beforeEach(() => { calls.length = 0; });

describe('bootPage (#218)', () => {
  it('sets up storage, theme, auth refresh, queue, snapshot upload, realtime and the indicator in that order', async () => {
    await bootPage();
    expect(calls).toEqual(SYNC_ORDER);
  });

  it('mounts the auth UI after auth refresh only when the page asks for it', async () => {
    await bootPage({ mountAuthUi: true });
    expect(calls).toEqual(['storage', 'theme', 'auth refresh', 'auth UI', 'queue', 'snapshot upload', 'realtime', 'sync indicator']);
  });

  it('still sets up theme and sync when storage fails to open', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    initStorage.mockRejectedValueOnce(new Error('IDB blocked'));
    try {
      await bootPage();
    } finally {
      log.mockRestore();
    }
    expect(calls).toEqual(SYNC_ORDER.slice(1));
  });
});

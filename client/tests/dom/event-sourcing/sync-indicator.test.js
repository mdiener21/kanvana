import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';

// Mutable stand-ins for the state sources the indicator derives from.
// `getSyncStatus()` mirrors sync-queue.js; `session` mirrors sync-session.js.
const fake = vi.hoisted(() => ({
  status: { depth: 0, retrying: false },
  session: 'live',
}));

vi.mock('../../../src/modules/event-sourcing/sync-queue.js', () => ({
  getSyncStatus: vi.fn(async () => fake.status),
  SYNC_STATUS_CHANGED: 'sync:status-changed',
}));

vi.mock('../../../src/modules/event-sourcing/sync-session.js', () => ({
  getSyncSessionState: vi.fn(() => fake.session),
  SESSION_STATE: { SIGNED_OUT: 'signed-out', CATCHING_UP: 'catching-up', LIVE: 'live', OFFLINE: 'offline', PAUSED: 'paused' },
}));

// events.js kept real: the indicator subscribes via the real on/emit bus.
import {
  initSyncIndicator,
  _resetSyncIndicatorForTesting,
} from '../../../src/modules/event-sourcing/sync-indicator.js';
import { emit, DATA_CHANGED } from '../../../src/modules/events.js';

const FIXTURE = '<div id="sync-indicator"></div>';

beforeEach(() => {
  _resetSyncIndicatorForTesting();
  fake.status = { depth: 0, retrying: false };
  fake.session = 'live';
  document.body.innerHTML = FIXTURE;
  vi.clearAllMocks();
});

afterEach(() => {
  _resetSyncIndicatorForTesting();
});

const el = () => document.getElementById('sync-indicator');

describe('sync state indicator', () => {
  it('AC-001: logged in, online, empty queue -> Live (green)', async () => {
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Live');
      expect(el().classList.contains('sync-indicator--live')).toBe(true);
    });
  });

  it('AC-002: N events draining -> Syncing… (N) (yellow)', async () => {
    fake.status = { depth: 3, retrying: false };
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Syncing');
      expect(el().textContent).toContain('3');
      expect(el().classList.contains('sync-indicator--syncing')).toBe(true);
    });
  });

  it('AC-003: events stuck retrying -> ⚠ N unsynced (orange)', async () => {
    fake.status = { depth: 2, retrying: true };
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('2');
      expect(el().textContent).toContain('unsynced');
      expect(el().classList.contains('sync-indicator--unsynced')).toBe(true);
    });
  });

  it('AC-003b: paused (auth failure) tier also shows unsynced', async () => {
    fake.status = { depth: 1, retrying: false };
    fake.session = 'paused';
    initSyncIndicator();
    await waitFor(() => {
      expect(el().classList.contains('sync-indicator--unsynced')).toBe(true);
    });
  });

  it('catching up with an empty queue still reads Live (the labels do not change, #219)', async () => {
    fake.session = 'catching-up';
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('Live'));
  });

  it('catching up with queued events reads Syncing (N)', async () => {
    fake.session = 'catching-up';
    fake.status = { depth: 2, retrying: false };
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('Syncing… (2)'));
  });

  it('AC-004: offline -> Offline (gray)', async () => {
    fake.session = 'offline';
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
      expect(el().classList.contains('sync-indicator--offline')).toBe(true);
    });
  });

  it('AC-004b: not logged in -> Offline (gray)', async () => {
    fake.session = 'signed-out';
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
      expect(el().classList.contains('sync-indicator--offline')).toBe(true);
    });
  });

  it('AC-005: updates live on DATA_CHANGED (queue drains) without reload', async () => {
    fake.status = { depth: 4, retrying: false };
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('4'));

    fake.status = { depth: 0, retrying: false };
    emit(DATA_CHANGED);
    await waitFor(() => {
      expect(el().textContent).toContain('Live');
      expect(el().classList.contains('sync-indicator--live')).toBe(true);
    });
  });

  it('AC-005b: updates live when the session state changes', async () => {
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('Live'));

    fake.session = 'offline';
    window.dispatchEvent(new CustomEvent('sync:status-changed'));
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
    });
  });

  it('updates live when the sync queue status changes', async () => {
    fake.status = { depth: 69, retrying: false };
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('69'));

    fake.status = { depth: 0, retrying: false };
    window.dispatchEvent(new CustomEvent('sync:status-changed'));

    await waitFor(() => {
      expect(el().textContent).toContain('Live');
      expect(el().classList.contains('sync-indicator--live')).toBe(true);
    });
  });
});

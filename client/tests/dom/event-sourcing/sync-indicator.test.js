import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';

// Mutable stand-ins for the state sources the indicator derives from.
// `getSyncStatus()` mirrors sync-queue.js; `authed` mirrors sync.js.
const fake = vi.hoisted(() => ({
  status: { depth: 0, retrying: false, paused: false },
  authed: true,
}));

vi.mock('../../../src/modules/event-sourcing/sync-queue.js', () => ({
  getSyncStatus: vi.fn(async () => fake.status),
}));

vi.mock('../../../src/modules/sync.js', () => ({
  isAuthenticated: vi.fn(() => fake.authed),
}));

// events.js kept real: the indicator subscribes via the real on/emit bus.
import {
  initSyncIndicator,
  _resetSyncIndicatorForTesting,
} from '../../../src/modules/event-sourcing/sync-indicator.js';
import { emit, DATA_CHANGED } from '../../../src/modules/events.js';

const FIXTURE = '<div id="sync-indicator"></div>';

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  _resetSyncIndicatorForTesting();
  fake.status = { depth: 0, retrying: false, paused: false };
  fake.authed = true;
  setOnline(true);
  document.body.innerHTML = FIXTURE;
  vi.clearAllMocks();
});

afterEach(() => {
  _resetSyncIndicatorForTesting();
  setOnline(true);
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
    fake.status = { depth: 3, retrying: false, paused: false };
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Syncing');
      expect(el().textContent).toContain('3');
      expect(el().classList.contains('sync-indicator--syncing')).toBe(true);
    });
  });

  it('AC-003: events stuck retrying -> ⚠ N unsynced (orange)', async () => {
    fake.status = { depth: 2, retrying: true, paused: false };
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('2');
      expect(el().textContent).toContain('unsynced');
      expect(el().classList.contains('sync-indicator--unsynced')).toBe(true);
    });
  });

  it('AC-003b: paused (auth failure) tier also shows unsynced', async () => {
    fake.status = { depth: 1, retrying: false, paused: true };
    initSyncIndicator();
    await waitFor(() => {
      expect(el().classList.contains('sync-indicator--unsynced')).toBe(true);
    });
  });

  it('AC-004: offline -> Offline (gray)', async () => {
    setOnline(false);
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
      expect(el().classList.contains('sync-indicator--offline')).toBe(true);
    });
  });

  it('AC-004b: not logged in -> Offline (gray)', async () => {
    fake.authed = false;
    initSyncIndicator();
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
      expect(el().classList.contains('sync-indicator--offline')).toBe(true);
    });
  });

  it('AC-005: updates live on DATA_CHANGED (queue drains) without reload', async () => {
    fake.status = { depth: 4, retrying: false, paused: false };
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('4'));

    fake.status = { depth: 0, retrying: false, paused: false };
    emit(DATA_CHANGED);
    await waitFor(() => {
      expect(el().textContent).toContain('Live');
      expect(el().classList.contains('sync-indicator--live')).toBe(true);
    });
  });

  it('AC-005b: updates live on offline window event', async () => {
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('Live'));

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => {
      expect(el().textContent).toContain('Offline');
    });
  });

  it('AC-005c: updates live on auth-changed window event', async () => {
    fake.authed = false;
    initSyncIndicator();
    await waitFor(() => expect(el().textContent).toContain('Offline'));

    fake.authed = true;
    window.dispatchEvent(new CustomEvent('auth-changed'));
    await waitFor(() => {
      expect(el().textContent).toContain('Live');
    });
  });
});

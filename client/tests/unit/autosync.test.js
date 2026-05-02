import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/modules/sync.js', () => ({
  ensureAuthenticated: vi.fn(),
  pushBoardFull: vi.fn(),
}));

vi.mock('../../src/modules/storage.js', () => ({
  listBoards: vi.fn(() => []),
}));

import {
  isAutoSyncEnabled,
  enableAutoSync,
  disableAutoSync,
  scheduleAutoSync,
  initializeAutoSync,
  _resetAutoSyncForTesting,
} from '../../src/modules/autosync.js';

import { ensureAuthenticated, pushBoardFull } from '../../src/modules/sync.js';
import { listBoards } from '../../src/modules/storage.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  _resetAutoSyncForTesting();
  ensureAuthenticated.mockResolvedValue(true);
  pushBoardFull.mockResolvedValue(undefined);
  listBoards.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Slice 1: feature flag ─────────────────────────────────────────────────────

describe('isAutoSyncEnabled', () => {
  it('returns false when not set', () => {
    expect(isAutoSyncEnabled()).toBe(false);
  });

  it('returns true after enableAutoSync', () => {
    enableAutoSync();
    expect(isAutoSyncEnabled()).toBe(true);
  });

  it('returns false after disableAutoSync', () => {
    enableAutoSync();
    disableAutoSync();
    expect(isAutoSyncEnabled()).toBe(false);
  });
});

// ── Slice 2: scheduleAutoSync debounce + scoping ──────────────────────────────

describe('scheduleAutoSync', () => {
  it('calls pushBoardFull for boardId after debounce delay', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    scheduleAutoSync('b1');
    expect(pushBoardFull).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledTimes(1);
    expect(pushBoardFull).toHaveBeenCalledWith('b1');
  });

  it('debounces: rapid calls produce a single push', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    scheduleAutoSync('b1');
    scheduleAutoSync('b1');
    scheduleAutoSync('b1');

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledTimes(1);
  });

  it('different boards run independently without interference', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    scheduleAutoSync('b1');
    scheduleAutoSync('b2');

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledTimes(2);
    expect(pushBoardFull).toHaveBeenCalledWith('b1');
    expect(pushBoardFull).toHaveBeenCalledWith('b2');
  });

  it('does nothing for falsy boardId', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    scheduleAutoSync(null);
    scheduleAutoSync(undefined);
    scheduleAutoSync('');

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });

  it('skips push when auto-sync is disabled', async () => {
    vi.useFakeTimers();

    scheduleAutoSync('b1');
    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });

  it('skips push when not authenticated', async () => {
    vi.useFakeTimers();
    enableAutoSync();
    ensureAuthenticated.mockResolvedValue(false);

    scheduleAutoSync('b1');
    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });

  it('queues second call that arrives while first is in-flight', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    let resolvePush;
    pushBoardFull.mockImplementationOnce(() => new Promise(r => { resolvePush = r; }));
    pushBoardFull.mockResolvedValue(undefined);

    scheduleAutoSync('b-flight');
    await vi.advanceTimersByTimeAsync(700); // fires first push, which hangs

    scheduleAutoSync('b-flight'); // arrives while first still in-flight
    await vi.advanceTimersByTimeAsync(700); // debounce for queued

    // Resolve first push
    resolvePush();
    await Promise.resolve(); // flush microtasks
    await vi.advanceTimersByTimeAsync(700); // queued push fires

    expect(pushBoardFull).toHaveBeenCalledTimes(2);
  });
});

// ── Slice 3: kanban-local-change event ────────────────────────────────────────

describe('kanban-local-change event', () => {
  it('schedules sync for boardId from event detail', async () => {
    vi.useFakeTimers();
    enableAutoSync();
    initializeAutoSync();

    window.dispatchEvent(new CustomEvent('kanban-local-change', {
      detail: { boardId: 'b1', entity: 'task' },
    }));

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledWith('b1');
  });

  it('ignores event with no boardId in detail', async () => {
    vi.useFakeTimers();
    enableAutoSync();
    initializeAutoSync();

    window.dispatchEvent(new CustomEvent('kanban-local-change', { detail: {} }));

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });

  it('ignores event with no detail', async () => {
    vi.useFakeTimers();
    enableAutoSync();
    initializeAutoSync();

    window.dispatchEvent(new CustomEvent('kanban-local-change'));

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });
});

// ── Slice 4: initializeAutoSync catch-up ─────────────────────────────────────

describe('initializeAutoSync', () => {
  it('schedules push for all boards on init when auto-sync enabled', async () => {
    vi.useFakeTimers();
    enableAutoSync();
    listBoards.mockReturnValue([{ id: 'b1' }, { id: 'b2' }]);

    initializeAutoSync();

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledTimes(2);
    expect(pushBoardFull).toHaveBeenCalledWith('b1');
    expect(pushBoardFull).toHaveBeenCalledWith('b2');
  });

  it('does not schedule catch-up when auto-sync is disabled', async () => {
    vi.useFakeTimers();
    listBoards.mockReturnValue([{ id: 'b1' }]);

    initializeAutoSync();

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).not.toHaveBeenCalled();
  });

  it('does not register duplicate listeners on repeated calls', async () => {
    vi.useFakeTimers();
    enableAutoSync();

    initializeAutoSync();
    initializeAutoSync(); // second call is a no-op

    window.dispatchEvent(new CustomEvent('kanban-local-change', {
      detail: { boardId: 'b1' },
    }));

    await vi.advanceTimersByTimeAsync(700);
    expect(pushBoardFull).toHaveBeenCalledTimes(1);
  });
});

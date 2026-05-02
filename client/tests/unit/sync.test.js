import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoisted mock objects — run before vi.mock factories
const mockAuthStore = vi.hoisted(() => ({
  token: null,
  record: null,
  isValid: false,
  clear: vi.fn(),
  save: vi.fn(),
  onChange: vi.fn(),
}));

const mockCollection = vi.hoisted(() => ({
  authWithPassword: vi.fn(),
  authWithOAuth2: vi.fn(),
  authRefresh: vi.fn(),
  create: vi.fn(),
  getFullList: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('pocketbase', () => ({
  default: class MockPocketBase {
    constructor() {
      this.authStore = mockAuthStore;
      this.collection = vi.fn(() => mockCollection);
    }
  },
}));

vi.mock('../../src/modules/storage.js', () => ({
  loadColumnsForBoard: vi.fn(() => []),
  loadTasksForBoard: vi.fn(() => []),
  loadLabelsForBoard: vi.fn(() => []),
  loadSettingsForBoard: vi.fn(() => null),
  loadDeletedColumnsForBoard: vi.fn(() => []),
  loadDeletedTasksForBoard: vi.fn(() => []),
  loadDeletedLabelsForBoard: vi.fn(() => []),
  purgeDeleted: vi.fn(),
  saveColumnsForBoard: vi.fn(),
  saveTasksForBoard: vi.fn(),
  saveLabelsForBoard: vi.fn(),
  saveSettingsForBoard: vi.fn(),
  getBoardById: vi.fn(() => null),
  setActiveBoardId: vi.fn(),
  getActiveBoardId: vi.fn(() => null),
}));

import {
  isAuthenticated,
  ensureAuthenticated,
  loginUser,
  registerUser,
  logoutUser,
  pushBoardFull,
  pullAllBoards,
} from '../../src/modules/sync.js';

import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadDeletedTasksForBoard,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  setActiveBoardId,
} from '../../src/modules/storage.js';

beforeEach(() => {
  mockAuthStore.token = null;
  mockAuthStore.record = null;
  mockAuthStore.isValid = false;
  localStorage.clear();
  vi.clearAllMocks();
  // Restore storage mock defaults after clearAllMocks resets call history
  loadColumnsForBoard.mockReturnValue([]);
  loadTasksForBoard.mockReturnValue([]);
  loadDeletedTasksForBoard.mockReturnValue([]);
});

// ── Slice 1+2: isAuthenticated ────────────────────────────────────────────────

describe('isAuthenticated', () => {
  it('returns false when authStore has no token', () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    expect(isAuthenticated()).toBe(false);
  });

  it('returns false when token present but no record', () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = null;
    expect(isAuthenticated()).toBe(false);
  });

  it('returns true when both token and record present', () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = { id: 'user1' };
    expect(isAuthenticated()).toBe(true);
  });
});

// ── Slice 3: ensureAuthenticated ──────────────────────────────────────────────

describe('ensureAuthenticated', () => {
  it('returns false when no token or record', async () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    await expect(ensureAuthenticated()).resolves.toBe(false);
  });

  it('returns true when token and record are valid', async () => {
    mockAuthStore.token = 'tok123';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    await expect(ensureAuthenticated()).resolves.toBe(true);
  });

  it('returns false when token present but refresh fails', async () => {
    mockAuthStore.token = 'expired-tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = false;
    mockCollection.authRefresh.mockRejectedValueOnce(new Error('Token expired'));
    await expect(ensureAuthenticated()).resolves.toBe(false);
  });

  it('returns true after successful refresh', async () => {
    mockAuthStore.token = 'old-tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = false;
    mockCollection.authRefresh.mockResolvedValueOnce({ token: 'new-tok', record: { id: 'user1' } });
    // After refresh, simulate authStore updated
    mockCollection.authRefresh.mockImplementationOnce(async () => {
      mockAuthStore.token = 'new-tok';
      mockAuthStore.record = { id: 'user1' };
    });
    await expect(ensureAuthenticated()).resolves.toBe(true);
  });
});

// ── Slice 4: loginUser ────────────────────────────────────────────────────────

describe('loginUser', () => {
  it('calls authWithPassword with email and password', async () => {
    const authData = { token: 'tok', record: { id: 'u1' } };
    mockCollection.authWithPassword.mockResolvedValueOnce(authData);
    const result = await loginUser('user@example.com', 'pass123');
    expect(mockCollection.authWithPassword).toHaveBeenCalledWith('user@example.com', 'pass123');
    expect(result).toEqual(authData);
  });

  it('propagates errors from PocketBase', async () => {
    mockCollection.authWithPassword.mockRejectedValueOnce(new Error('Invalid credentials'));
    await expect(loginUser('bad@email.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});

// ── Slice 5: registerUser ─────────────────────────────────────────────────────

describe('registerUser', () => {
  it('creates user with passwordConfirm field', async () => {
    const record = { id: 'u1', email: 'user@example.com' };
    mockCollection.create.mockResolvedValueOnce(record);
    const result = await registerUser('user@example.com', 'pass123', 'Alice');
    expect(mockCollection.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'pass123',
      passwordConfirm: 'pass123',
      name: 'Alice',
    });
    expect(result).toEqual(record);
  });

  it('does not call authStore.save — no auto-login', async () => {
    mockCollection.create.mockResolvedValueOnce({ id: 'u1' });
    await registerUser('user@example.com', 'pass123');
    expect(mockAuthStore.save).not.toHaveBeenCalled();
  });

  it('defaults name to empty string when not provided', async () => {
    mockCollection.create.mockResolvedValueOnce({ id: 'u1' });
    await registerUser('user@example.com', 'pass123');
    expect(mockCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '' })
    );
  });
});

// ── Slice 6: logoutUser ───────────────────────────────────────────────────────

describe('logoutUser', () => {
  it('clears the auth store', () => {
    logoutUser();
    expect(mockAuthStore.clear).toHaveBeenCalled();
  });
});

// ── Slice 7: pushBoardFull ────────────────────────────────────────────────────

describe('pushBoardFull', () => {
  it('throws when not authenticated', async () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    await expect(pushBoardFull('board-1')).rejects.toThrow('Not authenticated');
  });

  it('loads board data from storage by boardId', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-1' });

    await pushBoardFull('board-1');

    expect(loadColumnsForBoard).toHaveBeenCalledWith('board-1');
    expect(loadTasksForBoard).toHaveBeenCalledWith('board-1');
  });

  it('calls purgeDeleted after syncing', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-1' });

    await pushBoardFull('board-1');

    expect(purgeDeleted).toHaveBeenCalledWith('board-1');
  });

  it('deletes soft-deleted tasks from PocketBase when syncMap entry exists', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });

    // Simulate a deleted task with a known PB mapping in localStorage
    const syncMap = { boards: {}, columns: {}, labels: {}, tasks: { 'task-del': 'pb-task-del' } };
    localStorage.setItem('kanbanSyncMap', JSON.stringify(syncMap));

    const { loadDeletedTasksForBoard: ldt } = await import('../../src/modules/storage.js');
    ldt.mockReturnValueOnce([{ id: 'task-del', deleted: true }]);

    await pushBoardFull('board-1');

    expect(mockCollection.delete).toHaveBeenCalledWith('pb-task-del');
  });
});

// ── Slice 8: pullAllBoards ────────────────────────────────────────────────────

describe('pullAllBoards', () => {
  it('throws when not authenticated', async () => {
    mockAuthStore.token = null;
    mockAuthStore.record = null;
    await expect(pullAllBoards()).rejects.toThrow('Not authenticated');
  });

  it('returns empty array when server has no boards', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.getFullList.mockResolvedValueOnce([]);

    const result = await pullAllBoards();
    expect(result).toEqual([]);
  });

  it('writes pulled board data to storage', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    mockCollection.getFullList
      .mockResolvedValueOnce([{ id: 'pb-b1', local_id: 'b1', name: 'Board 1', settings: {} }])
      .mockResolvedValueOnce([])  // columns (parallel)
      .mockResolvedValueOnce([])  // labels  (parallel)
      .mockResolvedValueOnce([]); // tasks   (parallel)

    const result = await pullAllBoards();

    expect(result).toEqual([{ id: 'b1', name: 'Board 1' }]);
    expect(saveColumnsForBoard).toHaveBeenCalledWith('b1', []);
    expect(saveTasksForBoard).toHaveBeenCalledWith('b1', []);
    expect(saveLabelsForBoard).toHaveBeenCalledWith('b1', []);
    expect(saveSettingsForBoard).toHaveBeenCalledWith('b1', {});
  });

  it('maps PocketBase column IDs back to local IDs in tasks', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    mockCollection.getFullList
      .mockResolvedValueOnce([{ id: 'pb-b1', local_id: 'b1', name: 'Board 1', settings: {} }])
      .mockResolvedValueOnce([{ id: 'pb-col1', local_id: 'col1', name: 'To Do', color: '', order: 0, collapsed: false }]) // columns
      .mockResolvedValueOnce([]) // labels
      .mockResolvedValueOnce([{ id: 'pb-t1', local_id: 't1', title: 'Task 1', column: 'pb-col1',
        description: '', priority: 'medium', due_date: '', order: 0, labels: [],
        creation_date: '', change_date: '', done_date: '', column_history: [] }]); // tasks

    await pullAllBoards();

    expect(saveTasksForBoard).toHaveBeenCalledWith('b1',
      expect.arrayContaining([expect.objectContaining({ id: 't1', column: 'col1' })])
    );
  });

  it('preserves active board ID if it exists in pulled boards', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    const { getActiveBoardId: gab } = await import('../../src/modules/storage.js');
    gab.mockReturnValue('b1');

    mockCollection.getFullList
      .mockResolvedValueOnce([
        { id: 'pb-b1', local_id: 'b1', name: 'Board 1', settings: {} },
        { id: 'pb-b2', local_id: 'b2', name: 'Board 2', settings: {} },
      ])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]) // b1 entities
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]); // b2 entities

    await pullAllBoards();

    expect(setActiveBoardId).not.toHaveBeenCalled();
  });

  it('sets active board to first when current active not in pulled boards', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    const { getActiveBoardId: gab } = await import('../../src/modules/storage.js');
    gab.mockReturnValue('missing-board');

    mockCollection.getFullList
      .mockResolvedValueOnce([{ id: 'pb-b1', local_id: 'b1', name: 'Board 1', settings: {} }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await pullAllBoards();

    expect(setActiveBoardId).toHaveBeenCalledWith('b1');
  });
});

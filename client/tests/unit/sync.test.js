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
  loadBoardEvents: vi.fn(() => []),
  loadDeletedColumnsForBoard: vi.fn(() => []),
  loadDeletedTasksForBoard: vi.fn(() => []),
  loadDeletedLabelsForBoard: vi.fn(() => []),
  getPendingHardDeletes: vi.fn(() => []),
  clearPendingHardDeleteEntry: vi.fn(),
  addPendingHardDelete: vi.fn(),
  purgeDeleted: vi.fn(),
  saveColumnsForBoard: vi.fn(),
  saveTasksForBoard: vi.fn(),
  saveLabelsForBoard: vi.fn(),
  saveSettingsForBoard: vi.fn(),
  saveBoardEvents: vi.fn(),
  getBoardById: vi.fn(() => null),
  setActiveBoardId: vi.fn(),
  getActiveBoardId: vi.fn(() => null),
  loadGlobalSettings: vi.fn(() => ({ softDeleteEnabled: false })),
}));

import {
  isAuthenticated,
  ensureAuthenticated,
  loginUser,
  registerUser,
  logoutUser,
  pushBoardFull,
  deleteBoardRemote,
  pullAllBoards,
  runPurge,
  getPb,
} from '../../src/modules/sync.js';

import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadLabelsForBoard,
  loadDeletedTasksForBoard,
  loadDeletedColumnsForBoard,
  loadDeletedLabelsForBoard,
  getPendingHardDeletes,
  clearPendingHardDeleteEntry,
  addPendingHardDelete,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  getBoardById,
  setActiveBoardId,
  getActiveBoardId,
  loadGlobalSettings,
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
  getPendingHardDeletes.mockReturnValue([]);
  loadGlobalSettings.mockReturnValue({ softDeleteEnabled: false });
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

  it('calls purgeDeleted after syncing (purges tasks when soft-delete is off)', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-1' });

    await pushBoardFull('board-1');

    expect(purgeDeleted).toHaveBeenCalledWith('board-1', { tasks: true });
  });

  it('with soft-delete OFF (default), hard-deletes soft-deleted tasks from PocketBase when syncMap entry exists', async () => {
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

  it('hard-deletes queued pending entries that have a PocketBase ID and clears them', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });
    localStorage.setItem('kanbanSyncMap', JSON.stringify({
      boards: {},
      columns: {},
      labels: {},
      tasks: { 'task-hard-delete': 'pb-task-hard-delete' }
    }));
    getPendingHardDeletes.mockReturnValueOnce([
      { localTaskId: 'task-hard-delete', boardId: 'board-1' }
    ]);

    await pushBoardFull('board-1');

    expect(mockCollection.delete).toHaveBeenCalledWith('pb-task-hard-delete');
    expect(clearPendingHardDeleteEntry).toHaveBeenCalledWith('task-hard-delete');
  });

  it('clears queued pending entries without a delete call when no PocketBase ID exists', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });
    getPendingHardDeletes.mockReturnValueOnce([
      { localTaskId: 'offline-task', boardId: 'board-1' }
    ]);

    await pushBoardFull('board-1');

    expect(mockCollection.delete).not.toHaveBeenCalled();
    expect(clearPendingHardDeleteEntry).toHaveBeenCalledWith('offline-task');
  });

  it('with soft-delete ON, does not hard-delete soft-deleted tasks during push', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });
    loadGlobalSettings.mockReturnValue({ softDeleteEnabled: true });

    const syncMap = { boards: {}, columns: {}, labels: {}, tasks: { 'task-soft': 'pb-task-soft' }, task_relationships: {}, events: {} };
    localStorage.setItem('kanbanSyncMap', JSON.stringify(syncMap));
    loadDeletedTasksForBoard.mockReturnValue([{ id: 'task-soft', deleted: true, column: 'col-1', labels: [] }]);

    await pushBoardFull('board-1');

    expect(mockCollection.delete).not.toHaveBeenCalledWith('pb-task-soft');
  });

  it('with soft-delete ON, upserts deleted tasks to PocketBase with deleted flag', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    loadGlobalSettings.mockReturnValue({ softDeleteEnabled: true });

    const syncMap = { boards: { 'board-1': 'pb-b1' }, columns: { 'col-1': 'pb-col-1' }, labels: {}, tasks: {}, task_relationships: {}, events: {} };
    localStorage.setItem('kanbanSyncMap', JSON.stringify(syncMap));
    getBoardById.mockReturnValue({ id: 'board-1', name: 'Board' });
    loadDeletedTasksForBoard.mockReturnValue([{
      id: 'task-soft', title: 'Soft deleted', deleted: true,
      column: 'col-1', labels: [], description: '', priority: 'none',
      dueDate: '', order: 0, creationDate: '', changeDate: '', doneDate: '',
      columnHistory: [], subTasks: [],
    }]);
    mockCollection.update.mockResolvedValue({ id: 'pb-b1' });
    mockCollection.create.mockResolvedValue({ id: 'pb-task-soft-new' });

    await pushBoardFull('board-1');

    const upsertCall = mockCollection.create.mock.calls.find(c => c[0]?.local_id === 'task-soft');
    expect(upsertCall).toBeDefined();
    expect(upsertCall[0].deleted).toBe(true);
  });

  it('with soft-delete ON, does not drain pending hard-deletes queue', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });
    loadGlobalSettings.mockReturnValue({ softDeleteEnabled: true });
    localStorage.setItem('kanbanSyncMap', JSON.stringify({
      boards: {}, columns: {}, labels: {}, tasks: { 'queued-task': 'pb-queued' }, task_relationships: {}, events: {}
    }));
    getPendingHardDeletes.mockReturnValue([{ localTaskId: 'queued-task', boardId: 'board-1' }]);

    await pushBoardFull('board-1');

    expect(mockCollection.delete).not.toHaveBeenCalledWith('pb-queued');
    expect(clearPendingHardDeleteEntry).not.toHaveBeenCalled();
  });

  it('with soft-delete ON, does not purge soft-deleted tasks from local storage', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    mockCollection.create.mockResolvedValue({ id: 'pb-board-1' });
    loadGlobalSettings.mockReturnValue({ softDeleteEnabled: true });

    await pushBoardFull('board-1');

    // Soft-deleted tasks must survive a push; only an explicit purge removes them.
    expect(purgeDeleted).toHaveBeenCalledWith('board-1', { tasks: false });
  });
});

// ── Slice 7b: deleteBoardRemote ───────────────────────────────────────────────

describe('deleteBoardRemote', () => {
  it('deletes the PocketBase board and all board-scoped records', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    localStorage.setItem('kanbanSyncMap', JSON.stringify({
      boards: { 'board-1': 'pb-board-1' },
      columns: { 'col-1': 'pb-col-1' },
      labels: { 'label-1': 'pb-label-1' },
      tasks: { 'task-1': 'pb-task-1' },
      task_relationships: { 'task-1::task-2': 'pb-rel-1' },
      events: { 'event-1': 'pb-event-1' },
    }));
    loadColumnsForBoard.mockReturnValue([{ id: 'col-1' }]);
    loadLabelsForBoard.mockReturnValue([{ id: 'label-1' }]);
    loadTasksForBoard.mockReturnValue([{
      id: 'task-1',
      relationships: [{ targetTaskId: 'task-2' }],
      activityLog: [{ id: 'event-1' }],
    }]);

    await deleteBoardRemote('board-1');

    expect(getPb().collection).toHaveBeenCalledWith('task_relationships');
    expect(getPb().collection).toHaveBeenCalledWith('events');
    expect(getPb().collection).toHaveBeenCalledWith('tasks');
    expect(getPb().collection).toHaveBeenCalledWith('labels');
    expect(getPb().collection).toHaveBeenCalledWith('columns');
    expect(getPb().collection).toHaveBeenCalledWith('boards');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-rel-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-event-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-task-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-label-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-col-1');
    expect(mockCollection.delete).toHaveBeenCalledWith('pb-board-1');
    expect(JSON.parse(localStorage.getItem('kanbanSyncMap'))).toEqual({
      boards: {},
      columns: {},
      labels: {},
      tasks: {},
      task_relationships: {},
      events: {},
    });
  });
});

// ── runPurge ──────────────────────────────────────────────────────────────────

describe('runPurge', () => {
  it('online: hard-deletes tasks with a known PB id', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'u1' };
    mockAuthStore.isValid = true;
    localStorage.setItem('kanbanSyncMap', JSON.stringify({ tasks: { 'local-t1': 'pb-t1' } }));
    loadDeletedTasksForBoard.mockReturnValue([{ id: 'local-t1' }]);

    await runPurge([{ id: 'board-1' }]);

    expect(mockCollection.delete).toHaveBeenCalledWith('pb-t1');
    expect(purgeDeleted).toHaveBeenCalledWith('board-1');
  });

  it('online: silently skips tasks with no PB id', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'u1' };
    mockAuthStore.isValid = true;
    localStorage.setItem('kanbanSyncMap', JSON.stringify({ tasks: {} }));
    loadDeletedTasksForBoard.mockReturnValue([{ id: 'ghost-task' }]);

    await runPurge([{ id: 'board-1' }]);

    expect(mockCollection.delete).not.toHaveBeenCalled();
    expect(purgeDeleted).toHaveBeenCalledWith('board-1');
  });

  it('offline: queues each task in pendingHardDeletes', async () => {
    mockAuthStore.token = null;
    loadDeletedTasksForBoard.mockReturnValue([{ id: 'task-a' }, { id: 'task-b' }]);

    await runPurge([{ id: 'board-1' }]);

    expect(addPendingHardDelete).toHaveBeenCalledWith({ localTaskId: 'task-a', boardId: 'board-1' });
    expect(addPendingHardDelete).toHaveBeenCalledWith({ localTaskId: 'task-b', boardId: 'board-1' });
    expect(mockCollection.delete).not.toHaveBeenCalled();
    expect(purgeDeleted).toHaveBeenCalledWith('board-1');
  });

  it('always: purgeDeleted called for every board', async () => {
    mockAuthStore.token = null;
    loadDeletedTasksForBoard.mockReturnValue([]);

    await runPurge([{ id: 'board-1' }, { id: 'board-2' }]);

    expect(purgeDeleted).toHaveBeenCalledWith('board-1');
    expect(purgeDeleted).toHaveBeenCalledWith('board-2');
    expect(purgeDeleted).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce([])  // tasks   (parallel)
      .mockResolvedValueOnce([])  // task_relationships (parallel)
      .mockResolvedValueOnce([]); // events (parallel)

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
        creation_date: '', change_date: '', done_date: '', column_history: [] }]) // tasks
      .mockResolvedValueOnce([]) // task_relationships
      .mockResolvedValueOnce([]); // events

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
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]) // b1 entities
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]); // b2 entities

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
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await pullAllBoards();

    expect(setActiveBoardId).toHaveBeenCalledWith('b1');
  });

  it('maps all PocketBase label IDs back to local IDs for a task with multiple labels', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;
    getActiveBoardId.mockReturnValueOnce('b1');

    mockCollection.getFullList
      .mockResolvedValueOnce([{ id: 'pb-b1', local_id: 'b1', name: 'Board 1', settings: {} }])
      .mockResolvedValueOnce([
        { id: 'pb-col1', local_id: 'col1', name: 'To Do', color: '', order: 0, collapsed: false },
      ])
      .mockResolvedValueOnce([
        { id: 'pb-l1', local_id: 'local-l1', name: 'Bug', color: '#f00', group: '' },
        { id: 'pb-l2', local_id: 'local-l2', name: 'Feature', color: '#0f0', group: '' },
        { id: 'pb-l3', local_id: 'local-l3', name: 'Urgent', color: '#00f', group: '' },
      ])
      .mockResolvedValueOnce([{
        id: 'pb-t1', local_id: 't1', title: 'Task 1', column: 'pb-col1',
        description: '', priority: 'high', due_date: '', order: 0,
        labels: ['pb-l1', 'pb-l2', 'pb-l3'],
        creation_date: '', change_date: '', done_date: '', column_history: [],
      }])
      .mockResolvedValueOnce([]) // task_relationships
      .mockResolvedValueOnce([]); // events

    await pullAllBoards();

    expect(saveTasksForBoard).toHaveBeenCalledWith('b1',
      expect.arrayContaining([
        expect.objectContaining({ id: 't1', labels: ['local-l1', 'local-l2', 'local-l3'] }),
      ])
    );
  });
});

// ── Slice 9: pushBoardFull — multi-label tasks ────────────────────────────────

describe('pushBoardFull multi-label', () => {
  it('sends all label PB IDs for a task with multiple labels', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    getBoardById.mockReturnValueOnce({ id: 'b1', name: 'Board 1' });
    loadLabelsForBoard.mockReturnValueOnce([
      { id: 'local-l1', name: 'Bug', color: '#f00', group: '' },
      { id: 'local-l2', name: 'Feature', color: '#0f0', group: '' },
    ]);
    loadColumnsForBoard.mockReturnValueOnce([
      { id: 'local-c1', name: 'To Do', color: '', order: 0, collapsed: false },
    ]);
    loadTasksForBoard.mockReturnValueOnce([{
      id: 'local-t1', title: 'Task 1', column: 'local-c1',
      labels: ['local-l1', 'local-l2'],
      description: '', priority: 'none', dueDate: '', order: 0,
      creationDate: '', changeDate: '', doneDate: '', columnHistory: [],
    }]);

    // board → pb-b1, label-1 → pb-l1, label-2 → pb-l2, column → pb-c1, task → pb-t1
    mockCollection.create
      .mockResolvedValueOnce({ id: 'pb-b1' })
      .mockResolvedValueOnce({ id: 'pb-l1' })
      .mockResolvedValueOnce({ id: 'pb-l2' })
      .mockResolvedValueOnce({ id: 'pb-c1' })
      .mockResolvedValueOnce({ id: 'pb-t1' });

    await pushBoardFull('b1');

    const taskCall = mockCollection.create.mock.calls.find(call => call[0]?.local_id === 'local-t1');
    expect(taskCall).toBeDefined();
    expect(taskCall[0].labels).toEqual(['pb-l1', 'pb-l2']);
  });

  it('sends correct label PB IDs when syncMap already has label mappings (update path)', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    // Pre-populate syncMap as if labels/board/column were previously synced
    localStorage.setItem('kanbanSyncMap', JSON.stringify({
      boards: { 'b1': 'pb-b1' },
      labels: { 'local-l1': 'pb-l1', 'local-l2': 'pb-l2', 'local-l3': 'pb-l3' },
      columns: { 'local-c1': 'pb-c1' },
      tasks: {},
    }));

    getBoardById.mockReturnValueOnce({ id: 'b1', name: 'Board 1' });
    loadLabelsForBoard.mockReturnValueOnce([
      { id: 'local-l1', name: 'Bug', color: '#f00', group: '' },
      { id: 'local-l2', name: 'Feature', color: '#0f0', group: '' },
      { id: 'local-l3', name: 'Urgent', color: '#00f', group: '' },
    ]);
    loadColumnsForBoard.mockReturnValueOnce([
      { id: 'local-c1', name: 'To Do', color: '', order: 0, collapsed: false },
    ]);
    loadTasksForBoard.mockReturnValueOnce([{
      id: 'local-t1', title: 'Task 1', column: 'local-c1',
      labels: ['local-l1', 'local-l2', 'local-l3'],
      description: '', priority: 'none', dueDate: '', order: 0,
      creationDate: '', changeDate: '', doneDate: '', columnHistory: [],
    }]);

    // All existing records → update path; task is new → create
    mockCollection.update.mockResolvedValue({ id: 'pb-existing' });
    mockCollection.create.mockResolvedValueOnce({ id: 'pb-t1' });

    await pushBoardFull('b1');

    const taskCall = mockCollection.create.mock.calls.find(call => call[0]?.local_id === 'local-t1');
    expect(taskCall).toBeDefined();
    expect(taskCall[0].labels).toEqual(['pb-l1', 'pb-l2', 'pb-l3']);
  });

  it('omits label IDs not present in syncMap rather than sending null', async () => {
    mockAuthStore.token = 'tok';
    mockAuthStore.record = { id: 'user1' };
    mockAuthStore.isValid = true;

    getBoardById.mockReturnValueOnce({ id: 'b1', name: 'Board 1' });
    // Only label-1 is pushed; task also references a ghost label not in labels list
    loadLabelsForBoard.mockReturnValueOnce([
      { id: 'local-l1', name: 'Bug', color: '#f00', group: '' },
    ]);
    loadColumnsForBoard.mockReturnValueOnce([
      { id: 'local-c1', name: 'To Do', color: '', order: 0, collapsed: false },
    ]);
    loadTasksForBoard.mockReturnValueOnce([{
      id: 'local-t1', title: 'Task 1', column: 'local-c1',
      labels: ['local-l1', 'ghost-label-id'],  // ghost not in syncMap
      description: '', priority: 'none', dueDate: '', order: 0,
      creationDate: '', changeDate: '', doneDate: '', columnHistory: [],
    }]);

    mockCollection.create
      .mockResolvedValueOnce({ id: 'pb-b1' })
      .mockResolvedValueOnce({ id: 'pb-l1' })
      .mockResolvedValueOnce({ id: 'pb-c1' })
      .mockResolvedValueOnce({ id: 'pb-t1' });

    await pushBoardFull('b1');

    const taskCall = mockCollection.create.mock.calls.find(call => call[0]?.local_id === 'local-t1');
    expect(taskCall).toBeDefined();
    // ghost-label-id has no PB ID — should be dropped, not sent as null/undefined
    expect(taskCall[0].labels).toEqual(['pb-l1']);
    expect(taskCall[0].labels).not.toContain(null);
    expect(taskCall[0].labels).not.toContain(undefined);
  });
});

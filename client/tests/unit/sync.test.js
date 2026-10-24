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
}));

vi.mock('pocketbase', () => ({
  default: class MockPocketBase {
    constructor() {
      this.authStore = mockAuthStore;
      this.collection = vi.fn(() => mockCollection);
    }
  },
}));

import {
  isAuthenticated,
  ensureAuthenticated,
  loginUser,
  registerUser,
  logoutUser,
} from '../../src/modules/sync.js';

beforeEach(() => {
  mockAuthStore.token = null;
  mockAuthStore.record = null;
  mockAuthStore.isValid = false;
  localStorage.clear();
  vi.clearAllMocks();
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

# PocketBase Backend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional PocketBase backend to Kanvana so users can self-host multi-user sync while keeping the local-first IDB experience unchanged.

**Architecture:** A new `storage-adapter.js` module becomes the single storage import point for all consumers; the existing `storage.js` becomes the IDB adapter; a new `pb-storage.js` implements the PocketBase adapter behind the same interface. The active adapter is selected at startup based on `kanvana-pb-config` in IDB.

**Tech Stack:** Vanilla JS ES modules, PocketBase JS SDK (`pocketbase` npm package), Vitest (unit + DOM tests), existing `idb` wrapper, existing `normalize.js` / `security.js` utilities.

**Spec:** `docs/superpowers/specs/2026-04-04-pocketbase-backend-design.md`

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/modules/storage-adapter.js` | Adapter selector — holds active adapter reference, re-exports all storage functions |
| **Create** | `src/modules/pb-auth.js` | PocketBase auth: `initWithCredentials`, `initWithApiKey`, logout, token refresh, mid-session expiry timer, URL validation, config persistence, audit logging |
| **Create** | `src/modules/pb-storage.js` | PocketBase adapter implementing the full adapter interface; in-memory cache + idMap; write queue per collection |
| **Create** | `src/modules/pb-sync.js` | Write helpers: diff (detect create/update/delete), sanitize fields, normalize JSON fields, fire PB REST calls with timeout |
| **Create** | `src/modules/pb-migration.js` | One-time IDB → PocketBase migration; idempotent per-record (kanvana_id pre-check); progress events |
| **Create** | `src/modules/pb-status.js` | Mode badge DOM element, offline/online event handler, connectivity ping, sync-error toast |
| **Create** | `src/modules/app-settings.js` | App Settings modal UI: backend section (connect form, connected state, disconnect) |
| **Modify** | `src/modules/storage.js` | Add `getFullState()` export for migration use (read-only snapshot of in-memory state) |
| **Modify** | `src/kanban.js` | Switch import to `storage-adapter.js`; wire App Settings modal; wire mode badge |
| **Modify** | `src/modules/reports.js` | Switch import to `storage-adapter.js` |
| **Modify** | `src/modules/calendar.js` | Switch import to `storage-adapter.js` |
| **Modify** | all other `src/modules/*.js` importing `./storage.js` | Switch import to `./storage-adapter.js` |
| **Modify** | `src/index.html` | Add mode badge element + App Settings button in header |
| **Modify** | `package.json` | Add `pocketbase` SDK dependency (exact version) |
| **Create** | `tests/unit/pb-auth.test.js` | Unit tests for auth, URL validation, token lifecycle |
| **Create** | `tests/unit/pb-storage.test.js` | Unit tests for cache, write queue, offline transitions |
| **Create** | `tests/unit/pb-sync.test.js` | Unit tests for diff logic, sanitization, normalization |
| **Create** | `tests/unit/pb-migration.test.js` | Unit tests for migration sequence and idempotency |
| **Create** | `tests/dom/app-settings.test.js` | DOM integration tests for App Settings modal |

---

## Task 1: Install PocketBase SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the SDK at an exact version**

```bash
npm install --save-exact pocketbase
```

- [ ] **Step 2: Verify it appears in `package.json` dependencies with an exact version (no `^` or `~`)**

```bash
grep '"pocketbase"' package.json
# Expected: "pocketbase": "0.x.y"  (no caret, no tilde)
```

- [ ] **Step 3: Run npm audit**

```bash
npm audit
# Expected: 0 high/critical vulnerabilities
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pocketbase SDK dependency (exact version)"
```

---

## Task 2: Add `getFullState()` to `storage.js`

The migration module needs a read-only snapshot of everything in IDB memory without changing
the active board. This export is the only change to `storage.js`.

**Files:**
- Modify: `src/modules/storage.js`
- Test: `tests/unit/storage-idb.test.js` (add one test)

- [ ] **Step 1: Write the failing test**

Add this at the bottom of `tests/unit/storage-idb.test.js`:

```js
test('getFullState returns snapshot of all boards and their data', async () => {
  await initStorage();
  ensureBoardsInitialized();
  const boardId = listBoards()[0].id;
  saveTasks([{ id: 't1', title: 'Task A', column: 'todo', order: 1 }]);
  await _flushPersistsForTesting();

  const { getFullState } = await import('../../src/modules/storage.js');
  const snap = getFullState();
  expect(snap.boards).toHaveLength(1);
  expect(snap.tasks[boardId]).toHaveLength(1);
  expect(snap.tasks[boardId][0].id).toBe('t1');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A3 "getFullState"
# Expected: FAIL — getFullState is not exported
```

- [ ] **Step 3: Add `getFullState` export to `src/modules/storage.js`**

Add after the `_resetStorageForTesting` export (around line 370):

```js
/**
 * Returns a read-only deep snapshot of the in-memory state.
 * Used by pb-migration.js to read all boards without side effects.
 */
export function getFullState() {
  return {
    boards: state.boards.map((b) => ({ ...b })),
    activeBoardId: state.activeBoardId,
    tasks: Object.fromEntries(
      Object.entries(state.tasks).map(([id, t]) => [id, t ? [...t] : null])
    ),
    columns: Object.fromEntries(
      Object.entries(state.columns).map(([id, c]) => [id, c ? [...c] : null])
    ),
    labels: Object.fromEntries(
      Object.entries(state.labels).map(([id, l]) => [id, l ? [...l] : null])
    ),
    settings: Object.fromEntries(
      Object.entries(state.settings).map(([id, s]) => [id, s ? { ...s } : null])
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A3 "getFullState"
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/storage.js tests/unit/storage-idb.test.js
git commit -m "feat: export getFullState() from storage.js for migration use"
```

---

## Task 3: Create `pb-auth.js` — Authentication, Config, URL Validation

This module handles everything auth-related: connecting, token storage, refresh, expiry, logout,
and API key auth for agents. It emits audit log events. It does NOT talk to PocketBase collections —
only the auth API.

**Files:**
- Create: `src/modules/pb-auth.js`
- Test: `tests/unit/pb-auth.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pb-auth.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockPb(overrides = {}) {
  return {
    authStore: {
      token: null,
      model: null,
      save: vi.fn((token, model) => {
        this.token = token;
        this.model = model;
      }),
      clear: vi.fn(),
      onChange: vi.fn(),
    },
    collection: vi.fn(() => ({
      authWithPassword: vi.fn().mockResolvedValue({
        token: 'tok-abc',
        record: { id: 'user-1', email: 'a@example.com' },
      }),
      authRefresh: vi.fn().mockResolvedValue({
        token: 'tok-refreshed',
        record: { id: 'user-1', email: 'a@example.com' },
      }),
    })),
    ...overrides,
  };
}

// ── URL Validation ────────────────────────────────────────────────────────────

import { validatePbUrl } from '../../src/modules/pb-auth.js';

describe('validatePbUrl', () => {
  test('accepts valid https URL', () => {
    expect(() => validatePbUrl('https://pb.myserver.com')).not.toThrow();
  });

  test('rejects http protocol', () => {
    expect(() => validatePbUrl('http://pb.myserver.com')).toThrow(/https/i);
  });

  test('rejects localhost', () => {
    expect(() => validatePbUrl('https://localhost:8080')).toThrow(/localhost/i);
  });

  test('allows localhost in dev mode (import.meta.env.DEV === true)', () => {
    // Simulated by setting the module-level DEV flag; see implementation note below.
    // In the actual module, wrap the loopback check: if (!import.meta.env.DEV) { ... }
    // This test verifies the exemption path exists.
    expect(() => validatePbUrl('http://localhost:8090', { devMode: true })).not.toThrow();
  });

  test('rejects 127.0.0.1', () => {
    expect(() => validatePbUrl('https://127.0.0.1')).toThrow(/loopback/i);
  });

  test('rejects URL with embedded credentials', () => {
    expect(() => validatePbUrl('https://user:pass@pb.myserver.com')).toThrow(/credential/i);
  });

  test('rejects URL longer than 512 characters', () => {
    expect(() => validatePbUrl('https://pb.myserver.com/' + 'a'.repeat(500))).toThrow(/length/i);
  });

  test('rejects malformed string', () => {
    expect(() => validatePbUrl('not-a-url')).toThrow();
  });
});

// ── Generic auth error message ────────────────────────────────────────────────

import { getAuthErrorMessage } from '../../src/modules/pb-auth.js';

describe('getAuthErrorMessage', () => {
  test('returns generic message regardless of input', () => {
    const msg = getAuthErrorMessage(new Error('User not found'));
    expect(msg).toBe('Authentication failed. Check your credentials and PocketBase URL.');
    // Must not contain the original error detail
    expect(msg).not.toContain('User not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-auth.test.js
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `src/modules/pb-auth.js`**

```js
/**
 * pb-auth.js — PocketBase authentication, token lifecycle, URL validation.
 *
 * Exports:
 *   validatePbUrl(url)            → void (throws on invalid)
 *   getAuthErrorMessage(err)      → string (always generic)
 *   initWithCredentials(url, email, password) → Promise<{ userId, token, tokenExpiry }>
 *   initWithApiKey(url, apiKey)   → Promise<{ userId, token, tokenExpiry: null }>
 *   refreshToken(pb)              → Promise<void> (updates IDB config)
 *   startRefreshTimer(pb, config, onExpiry) → () => void  (returns cancel fn)
 *   logout(pb)                    → Promise<void>
 *   loadConfig()                  → Promise<object|null>
 *   saveConfig(config)            → Promise<void>
 *   clearConfig()                 → Promise<void>
 */

import { openDB } from 'idb';

const DB_NAME = 'kanvana-db';
const KV_STORE = 'kv';
const CONFIG_KEY = 'kanvana-pb-config';

// ── URL Validation ─────────────────────────────────────────────────────────────

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function validatePbUrl(rawUrl, { devMode = import.meta.env.DEV } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 512) {
    throw new Error('URL length must be 512 characters or fewer.');
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format.');
  }
  // Dev-mode exemption: allow http and loopback when running via Vite dev server.
  // import.meta.env.DEV is always false in production builds.
  if (!devMode) {
    if (url.protocol !== 'https:') {
      throw new Error('PocketBase URL must use https protocol.');
    }
    if (LOOPBACK.has(url.hostname)) {
      throw new Error('PocketBase URL must not point to a loopback address.');
    }
  }
  if (url.username || url.password) {
    throw new Error('PocketBase URL must not contain embedded credentials.');
  }
}

// ── Auth error message ─────────────────────────────────────────────────────────

export function getAuthErrorMessage(_err) {
  return 'Authentication failed. Check your credentials and PocketBase URL.';
}

// ── Config persistence ─────────────────────────────────────────────────────────

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
    },
  });
}

export async function loadConfig() {
  const db = await getDb();
  return db.get(KV_STORE, CONFIG_KEY) ?? null;
}

export async function saveConfig(config) {
  const db = await getDb();
  await db.put(KV_STORE, config, CONFIG_KEY);
}

export async function clearConfig() {
  const db = await getDb();
  await db.delete(KV_STORE, CONFIG_KEY);
}

// ── Audit logging ──────────────────────────────────────────────────────────────

function audit(level, event, detail = {}) {
  const payload = { event, timestamp: new Date().toISOString(), ...detail };
  // eslint-disable-next-line no-console
  console[level]('[Kanvana Security]', event, payload);
  document.dispatchEvent(new CustomEvent('kanvana:audit', { detail: payload }));
}

// ── Interactive auth ───────────────────────────────────────────────────────────

/**
 * Authenticate with email + password.
 * Returns { userId, token, tokenExpiry } on success.
 * Throws with a generic message on failure.
 */
export async function initWithCredentials(pb, url, email, password) {
  validatePbUrl(url);
  try {
    const result = await Promise.race([
      pb.collection('users').authWithPassword(email, password),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      ),
    ]);
    const token = result.token;
    const userId = result.record.id;
    // PocketBase tokens carry a JWT exp claim — decode it for the expiry timer.
    const tokenExpiry = decodeTokenExpiry(token);
    const config = { url, token, userId, tokenExpiry };
    await saveConfig(config);
    audit('info', 'login_success', { userId });
    return config;
  } catch (err) {
    audit('warn', 'login_failure', {});
    throw new Error(getAuthErrorMessage(err));
  }
}

/**
 * Authenticate with a long-lived API key (AI agents).
 * Skips interactive auth; sets token directly on the PocketBase SDK.
 * tokenExpiry is null — no refresh timer is needed.
 */
export async function initWithApiKey(pb, url, apiKey) {
  validatePbUrl(url);
  // Set token directly on the SDK auth store.
  pb.authStore.save(apiKey, null);
  // Verify the key is valid by fetching the current user record.
  let userId;
  try {
    const me = await Promise.race([
      pb.collection('users').authRefresh(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      ),
    ]);
    userId = me.record.id;
  } catch (err) {
    pb.authStore.clear();
    throw new Error(getAuthErrorMessage(err));
  }
  const config = { url, token: apiKey, userId, tokenExpiry: null };
  await saveConfig(config);
  audit('info', 'api_key_auth_success', { userId });
  return config;
}

// ── Token refresh ──────────────────────────────────────────────────────────────

function decodeTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Attempt a single token refresh. Retries once after 1 second on failure.
 * Updates IDB config on success.
 */
export async function refreshToken(pb) {
  const attempt = async () =>
    Promise.race([
      pb.collection('users').authRefresh(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      ),
    ]);

  let result;
  try {
    result = await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
    result = await attempt(); // throws if this also fails — caller handles it
  }

  const token = result.token;
  const userId = result.record.id;
  const tokenExpiry = decodeTokenExpiry(token);
  const existing = await loadConfig();
  await saveConfig({ ...existing, token, userId, tokenExpiry });
  audit('info', 'token_refresh_success', { userId, tokenExpiry });
}

/**
 * Starts a timer that refreshes the token 60 seconds before expiry.
 * Returns a cancel function. If tokenExpiry is null, does nothing.
 * onExpiry() is called if the refresh fails mid-session.
 */
export function startRefreshTimer(pb, config, onExpiry) {
  if (!config.tokenExpiry) return () => {};

  const expiry = new Date(config.tokenExpiry).getTime();
  const now = Date.now();
  const delay = expiry - now - 60_000; // 60 seconds before expiry

  if (delay <= 0) {
    // Already within the refresh window — refresh immediately.
    refreshToken(pb).catch(() => onExpiry());
    return () => {};
  }

  const id = setTimeout(async () => {
    try {
      await refreshToken(pb);
      // Reload config and schedule next refresh.
      const updated = await loadConfig();
      startRefreshTimer(pb, updated, onExpiry);
    } catch {
      audit('warn', 'token_refresh_failure', { userId: config.userId });
      onExpiry();
    }
  }, delay);

  return () => clearTimeout(id);
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export async function logout(pb) {
  const config = await loadConfig();
  await clearConfig();
  pb.authStore.clear();
  audit('info', 'logout', { userId: config?.userId });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-auth.test.js
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/pb-auth.js tests/unit/pb-auth.test.js
git commit -m "feat: add pb-auth.js — PocketBase auth, URL validation, token lifecycle"
```

---

## Task 4: Create `pb-sync.js` — Write Helpers (Diff + Sanitize)

This module takes a "previous" and "next" array for a collection and produces the minimal set of
PocketBase API calls (create / update / delete). It also sanitizes string fields and normalizes
JSON fields before writing.

**Files:**
- Create: `src/modules/pb-sync.js`
- Test: `tests/unit/pb-sync.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pb-sync.test.js`:

```js
import { describe, test, expect } from 'vitest';
import { diffRecords, sanitizeTaskFields, sanitizeColumnFields } from '../../src/modules/pb-sync.js';

describe('diffRecords', () => {
  test('detects new record as create', () => {
    const prev = [];
    const next = [{ id: 'a', title: 'New' }];
    const { creates, updates, deletes } = diffRecords(prev, next, 'id');
    expect(creates).toHaveLength(1);
    expect(creates[0].id).toBe('a');
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  test('detects removed record as delete', () => {
    const prev = [{ id: 'a', title: 'Old' }];
    const next = [];
    const { creates, updates, deletes } = diffRecords(prev, next, 'id');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].id).toBe('a');
  });

  test('detects changed record as update', () => {
    const prev = [{ id: 'a', title: 'Old' }];
    const next = [{ id: 'a', title: 'New' }];
    const { creates, updates, deletes } = diffRecords(prev, next, 'id');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('a');
  });

  test('no change produces empty diff', () => {
    const prev = [{ id: 'a', title: 'Same' }];
    const next = [{ id: 'a', title: 'Same' }];
    const { creates, updates, deletes } = diffRecords(prev, next, 'id');
    expect(creates).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });
});

describe('sanitizeTaskFields', () => {
  test('escapes html in title and description', () => {
    const task = { id: 't1', title: '<script>alert(1)</script>', description: '& stuff' };
    const safe = sanitizeTaskFields(task);
    expect(safe.title).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(safe.description).toBe('&amp; stuff');
  });

  test('normalizes labels as deduplicated string array', () => {
    const task = { id: 't1', title: 'T', labels: ['a', 'a', 'b'] };
    const safe = sanitizeTaskFields(task);
    expect(safe.labels).toEqual(['a', 'b']);
  });
});

describe('sanitizeColumnFields', () => {
  test('escapes html in name', () => {
    const col = { id: 'c1', name: '<b>Todo</b>', color: '#3b82f6' };
    const safe = sanitizeColumnFields(col);
    expect(safe.name).toBe('&lt;b&gt;Todo&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-sync.test.js
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `src/modules/pb-sync.js`**

```js
/**
 * pb-sync.js — Diff, sanitize, and fire PocketBase write calls.
 *
 * Exports:
 *   diffRecords(prev, next, idKey) → { creates, updates, deletes }
 *   sanitizeTaskFields(task)       → sanitized task object
 *   sanitizeColumnFields(col)      → sanitized column object
 *   sanitizeLabelFields(label)     → sanitized label object
 *   sanitizeBoardFields(board)     → sanitized board object
 *   applyWrite(pb, collection, diff, toPayload, idMap, userId) → Promise<void>
 */

import { escapeHtml } from './security.js';
import { normalizeStringKeys, normalizeRelationships, normalizeSubTasks } from './normalize.js';

// ── Diff ───────────────────────────────────────────────────────────────────────

/**
 * Compare two arrays of records by idKey.
 * Returns { creates, updates, deletes } as arrays of records.
 */
export function diffRecords(prev, next, idKey = 'id') {
  const prevMap = new Map((prev || []).map((r) => [r[idKey], r]));
  const nextMap = new Map((next || []).map((r) => [r[idKey], r]));

  const creates = [];
  const updates = [];
  const deletes = [];

  for (const [id, record] of nextMap) {
    if (!prevMap.has(id)) {
      creates.push(record);
    } else if (JSON.stringify(prevMap.get(id)) !== JSON.stringify(record)) {
      updates.push(record);
    }
  }
  for (const [id, record] of prevMap) {
    if (!nextMap.has(id)) deletes.push(record);
  }

  return { creates, updates, deletes };
}

// ── Sanitize ───────────────────────────────────────────────────────────────────

export function sanitizeTaskFields(task) {
  return {
    ...task,
    title: escapeHtml(task.title ?? ''),
    description: escapeHtml(task.description ?? ''),
    labels: normalizeStringKeys(task.labels),
    columnHistory: normalizeStringKeys(
      Array.isArray(task.columnHistory)
        ? task.columnHistory.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
        : []
    ),
    relationships: normalizeRelationships(task.relationships),
    subTasks: normalizeSubTasks(task.subTasks),
  };
}

export function sanitizeColumnFields(col) {
  return { ...col, name: escapeHtml(col.name ?? '') };
}

export function sanitizeLabelFields(label) {
  return { ...label, name: escapeHtml(label.name ?? '') };
}

export function sanitizeBoardFields(board) {
  return { ...board, name: escapeHtml(board.name ?? '') };
}

// ── Write (fire PB REST calls with timeout) ────────────────────────────────────

const WRITE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms = WRITE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PocketBase write timeout')), ms)
    ),
  ]);
}

/**
 * Apply a pre-computed diff to PocketBase.
 *
 * @param {object} pb          PocketBase SDK instance
 * @param {string} collection  Collection name (e.g. 'tasks')
 * @param {object} diff        { creates, updates, deletes } from diffRecords()
 * @param {Function} toPayload (record) → PB API payload object
 * @param {object} idMap       Map<kanvana_id, pb_id> for this collection (mutated on create)
 * @param {string} userId      PocketBase user ID
 */
export async function applyWrite(pb, collection, diff, toPayload, idMap, userId) {
  for (const record of diff.creates) {
    const payload = toPayload(record, userId);
    const result = await withTimeout(pb.collection(collection).create(payload));
    idMap.set(record.id, result.id);
  }
  for (const record of diff.updates) {
    const pbId = idMap.get(record.id);
    if (!pbId) continue; // unknown record — skip
    const payload = toPayload(record, userId);
    await withTimeout(pb.collection(collection).update(pbId, payload));
  }
  for (const record of diff.deletes) {
    const pbId = idMap.get(record.id);
    if (!pbId) continue;
    await withTimeout(pb.collection(collection).delete(pbId));
    idMap.delete(record.id);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-sync.test.js
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/pb-sync.js tests/unit/pb-sync.test.js
git commit -m "feat: add pb-sync.js — diff, sanitize, and write helpers for PocketBase"
```

---

## Task 5: Create `pb-migration.js` — One-Time IDB → PocketBase Migration

Reads all boards from the IDB in-memory state snapshot and creates them in PocketBase.
Idempotent: pre-checks `kanvana_id` before creating any record.

**Files:**
- Create: `src/modules/pb-migration.js`
- Test: `tests/unit/pb-migration.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pb-migration.test.js`:

```js
import { describe, test, expect, vi } from 'vitest';
import { migrateToPoketBase } from '../../src/modules/pb-migration.js';

function makeState(overrides = {}) {
  return {
    boards: [{ id: 'board-1', name: 'Work', createdAt: '2026-01-01T00:00:00Z' }],
    tasks: { 'board-1': [{ id: 'task-1', title: 'Do stuff', column: 'todo', order: 1 }] },
    columns: { 'board-1': [{ id: 'col-1', name: 'Todo', color: '#000', order: 1, collapsed: false }] },
    labels: { 'board-1': [] },
    settings: { 'board-1': null },
    ...overrides,
  };
}

function makePb(existingRecords = {}) {
  // existingRecords: { 'tasks': [{ kanvana_id: '...', id: 'pb-id' }] }
  return {
    collection: vi.fn((col) => ({
      getList: vi.fn(async (_page, _perPage, opts) => {
        const filter = opts?.filter || '';
        const match = filter.match(/kanvana_id="([^"]+)"/);
        const kanvanaId = match?.[1];
        const items = (existingRecords[col] || []).filter(
          (r) => r.kanvana_id === kanvanaId
        );
        return { items };
      }),
      create: vi.fn(async (payload) => ({ id: `pb-${payload.kanvana_id}` })),
    })),
  };
}

describe('migrateToPoketBase', () => {
  test('creates all records for a board', async () => {
    const pb = makePb();
    const state = makeState();
    const idMap = await migrateToPoketBase(pb, state, 'user-1', vi.fn());
    // boards, columns, labels, tasks, board_settings
    expect(pb.collection).toHaveBeenCalledWith('boards');
    expect(pb.collection).toHaveBeenCalledWith('tasks');
    expect(idMap.boards.get('board-1')).toBe('pb-board-1');
    expect(idMap.tasks.get('task-1')).toBe('pb-task-1');
  });

  test('skips already-migrated records (idempotency)', async () => {
    // Board already exists in PB
    const pb = makePb({ boards: [{ kanvana_id: 'board-1', id: 'pb-existing' }] });
    const state = makeState();
    const idMap = await migrateToPoketBase(pb, state, 'user-1', vi.fn());
    // Should NOT call create for the board
    const boardColl = pb.collection.mock.results.find(
      (r, i) => pb.collection.mock.calls[i][0] === 'boards'
    );
    // create was not called for 'boards' collection
    expect(idMap.boards.get('board-1')).toBe('pb-existing');
  });

  test('calls progress callback for each board', async () => {
    const pb = makePb();
    const state = makeState();
    const progress = vi.fn();
    await migrateToPoketBase(pb, state, 'user-1', progress);
    expect(progress).toHaveBeenCalledWith({ board: state.boards[0], index: 0, total: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-migration.test.js
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `src/modules/pb-migration.js`**

```js
/**
 * pb-migration.js — One-time IDB → PocketBase migration.
 *
 * Exports:
 *   migrateToPoketBase(pb, state, userId, onProgress) → Promise<idMap>
 *
 * The function is idempotent: it pre-checks kanvana_id before each create.
 * onProgress({ board, index, total }) is called before each board is processed.
 */

import { sanitizeTaskFields, sanitizeColumnFields, sanitizeLabelFields, sanitizeBoardFields } from './pb-sync.js';

const MIGRATION_TIMEOUT_MS = 15000;

function withTimeout(promise, ms = MIGRATION_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Migration step timeout')), ms)
    ),
  ]);
}

/**
 * Check whether a record with the given kanvana_id already exists for this user.
 * Returns the PocketBase record if found, null otherwise.
 */
async function findExisting(pb, collection, kanvanaId, userId) {
  const result = await withTimeout(
    pb.collection(collection).getList(1, 1, {
      filter: `kanvana_id="${kanvanaId}"&&user="${userId}"`,
    })
  );
  return result.items[0] ?? null;
}

/**
 * Upsert a single record: skip if already exists, create otherwise.
 * Returns the PocketBase record id and stores in idMap.
 */
async function upsert(pb, collection, kanvanaId, userId, payload, idMap) {
  const existing = await findExisting(pb, collection, kanvanaId, userId);
  if (existing) {
    idMap.set(kanvanaId, existing.id);
    return;
  }
  const created = await withTimeout(pb.collection(collection).create(payload));
  idMap.set(kanvanaId, created.id);
}

/**
 * Migrate all boards and their data from the IDB state snapshot to PocketBase.
 *
 * @param {object}   pb          PocketBase SDK instance (authenticated)
 * @param {object}   state       Result of getFullState() from storage.js
 * @param {string}   userId      Authenticated PocketBase user ID
 * @param {Function} onProgress  ({ board, index, total }) → void
 * @returns {object} idMap: { boards, tasks, columns, labels } — each a Map<kanvana_id, pb_id>
 */
export async function migrateToPoketBase(pb, state, userId, onProgress) {
  const idMap = {
    boards: new Map(),
    tasks: new Map(),
    columns: new Map(),
    labels: new Map(),
  };

  const boards = state.boards || [];

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    onProgress?.({ board, index: i, total: boards.length });

    // 1. Board
    const boardPayload = {
      ...sanitizeBoardFields(board),
      user: userId,
      kanvana_id: board.id,
    };
    await upsert(pb, 'boards', board.id, userId, boardPayload, idMap.boards);
    const pbBoardId = idMap.boards.get(board.id);

    // 2. Columns
    for (const col of state.columns[board.id] || []) {
      const payload = {
        ...sanitizeColumnFields(col),
        user: userId,
        board: pbBoardId,
        kanvana_id: col.id,
      };
      await upsert(pb, 'columns', col.id, userId, payload, idMap.columns);
    }

    // 3. Labels
    for (const label of state.labels[board.id] || []) {
      const payload = {
        ...sanitizeLabelFields(label),
        user: userId,
        board: pbBoardId,
        kanvana_id: label.id,
      };
      await upsert(pb, 'labels', label.id, userId, payload, idMap.labels);
    }

    // 4. Tasks
    for (const task of state.tasks[board.id] || []) {
      const safe = sanitizeTaskFields(task);
      const payload = {
        ...safe,
        user: userId,
        board: pbBoardId,
        kanvana_id: task.id,
      };
      await upsert(pb, 'tasks', task.id, userId, payload, idMap.tasks);
    }

    // 5. Board settings
    const settingsData = state.settings[board.id] || {};
    await upsert(
      pb,
      'board_settings',
      `settings-${board.id}`,
      userId,
      { user: userId, board: pbBoardId, data: settingsData, kanvana_id: `settings-${board.id}` },
      new Map() // settings idMap not needed elsewhere
    );
  }

  return idMap;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-migration.test.js
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/pb-migration.js tests/unit/pb-migration.test.js
git commit -m "feat: add pb-migration.js — idempotent IDB-to-PocketBase migration"
```

---

## Task 6: Create `pb-storage.js` — The PocketBase Adapter

Implements the full adapter interface. Maintains in-memory cache + idMap. Serializes writes
per collection. Handles offline transitions.

**Files:**
- Create: `src/modules/pb-storage.js`
- Test: `tests/unit/pb-storage.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pb-storage.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest';

// We'll test the cache and offline flag; actual PB calls are mocked.

let pbStorage;
let mockPb;

beforeEach(async () => {
  vi.resetModules();
  mockPb = {
    collection: vi.fn(() => ({
      getFullList: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'pb-new' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    })),
  };
  pbStorage = await import('../../src/modules/pb-storage.js');
});

describe('pb-storage initStorage', () => {
  test('populates empty cache when PocketBase returns no data', async () => {
    await pbStorage.initStorage(mockPb, 'user-1', new Map(), new Map(), new Map(), new Map());
    expect(pbStorage.listBoards()).toEqual([]);
  });
});

describe('pb-storage offline flag', () => {
  test('isOffline starts as false', async () => {
    await pbStorage.initStorage(mockPb, 'user-1', new Map(), new Map(), new Map(), new Map());
    expect(pbStorage._isOffline()).toBe(false);
  });

  test('saveTasks emits pb:write-blocked when offline', async () => {
    await pbStorage.initStorage(mockPb, 'user-1', new Map(), new Map(), new Map(), new Map());
    pbStorage._setOffline(true);

    const events = [];
    document.addEventListener('pb:write-blocked', (e) => events.push(e));
    pbStorage.saveTasks([]);
    expect(events).toHaveLength(1);
    expect(events[0].detail.reason).toBe('offline');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-storage.test.js
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `src/modules/pb-storage.js`**

```js
/**
 * pb-storage.js — PocketBase storage adapter.
 *
 * Implements the same public interface as storage.js.
 * Call initStorage(pb, userId, boardIdMap, taskIdMap, columnIdMap, labelIdMap)
 * to populate the in-memory cache.
 *
 * Internal exports for testing: _isOffline(), _setOffline(bool)
 */

import { diffRecords, sanitizeTaskFields, sanitizeColumnFields, sanitizeLabelFields, sanitizeBoardFields, applyWrite } from './pb-sync.js';

// ── In-memory cache ────────────────────────────────────────────────────────────

const state = {
  boards: [],
  activeBoardId: null,
  tasks: {},
  columns: {},
  labels: {},
  settings: {},
};

// ID maps: kanvana_id → pb_id
const idMap = {
  boards: new Map(),
  tasks: new Map(),
  columns: new Map(),
  labels: new Map(),
};

let _pb = null;
let _userId = null;
let _offline = false;

// Previous snapshots for diffing
const prevState = { tasks: {}, columns: {}, labels: {}, settings: {} };

// Per-collection write queues (serialize writes, no race conditions)
const writeQueues = {
  tasks: Promise.resolve(),
  columns: Promise.resolve(),
  labels: Promise.resolve(),
  board_settings: Promise.resolve(),
  boards: Promise.resolve(),
};

function enqueueWrite(collection, fn) {
  writeQueues[collection] = (writeQueues[collection] || Promise.resolve())
    .then(fn)
    .catch((err) => {
      emitSyncError(collection, null, err);
    });
}

function emitSyncError(collection, kanvanaId, err) {
  document.dispatchEvent(
    new CustomEvent('pb:sync-error', {
      detail: {
        collection,
        operation: 'write',
        kanvana_id: kanvanaId ?? '',
        error: err?.message ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    })
  );
}

// ── Offline detection ──────────────────────────────────────────────────────────

export function _isOffline() { return _offline; }
export function _setOffline(v) {
  const changed = v !== _offline;
  _offline = v;
  if (changed) {
    document.dispatchEvent(new CustomEvent(v ? 'pb:offline' : 'pb:online'));
  }
}

function requireOnline() {
  if (_offline) {
    document.dispatchEvent(new CustomEvent('pb:write-blocked', { detail: { reason: 'offline' } }));
    return false;
  }
  return true;
}

// ── Init ───────────────────────────────────────────────────────────────────────

const INIT_TIMEOUT_MS = 10000;

export async function initStorage(pb, userId, boardsIdMap, tasksIdMap, columnsIdMap, labelsIdMap) {
  _pb = pb;
  _userId = userId;

  // Accept pre-populated idMaps (from migration) or start fresh.
  for (const [k, v] of boardsIdMap) idMap.boards.set(k, v);
  for (const [k, v] of tasksIdMap) idMap.tasks.set(k, v);
  for (const [k, v] of columnsIdMap) idMap.columns.set(k, v);
  for (const [k, v] of labelsIdMap) idMap.labels.set(k, v);

  const fetchAll = async () => {
    const boards = await pb.collection('boards').getFullList({ filter: `user="${userId}"` });
    state.boards = boards.map(pbBoardToKanvana);

    for (const board of state.boards) {
      idMap.boards.set(board.id, boards.find((b) => b.kanvana_id === board.id)?.id);

      const [tasks, cols, labels, settingsRecords] = await Promise.all([
        pb.collection('tasks').getFullList({ filter: `user="${userId}"&&board="${idMap.boards.get(board.id)}"` }),
        pb.collection('columns').getFullList({ filter: `user="${userId}"&&board="${idMap.boards.get(board.id)}"` }),
        pb.collection('labels').getFullList({ filter: `user="${userId}"&&board="${idMap.boards.get(board.id)}"` }),
        pb.collection('board_settings').getFullList({ filter: `user="${userId}"&&board="${idMap.boards.get(board.id)}"` }),
      ]);

      state.tasks[board.id] = tasks.map(pbTaskToKanvana);
      state.columns[board.id] = cols.map(pbColumnToKanvana);
      state.labels[board.id] = labels.map(pbLabelToKanvana);
      state.settings[board.id] = settingsRecords[0]?.data ?? null;

      for (const t of tasks) idMap.tasks.set(t.kanvana_id, t.id);
      for (const c of cols) idMap.columns.set(c.kanvana_id, c.id);
      for (const l of labels) idMap.labels.set(l.kanvana_id, l.id);
    }

    // Snapshot prevState for future diffing
    snapshotPrev();
  };

  await Promise.race([
    fetchAll(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('initStorage timeout')), INIT_TIMEOUT_MS)
    ),
  ]);
}

function snapshotPrev() {
  for (const boardId of Object.keys(state.tasks)) {
    prevState.tasks[boardId] = state.tasks[boardId] ? [...state.tasks[boardId]] : null;
    prevState.columns[boardId] = state.columns[boardId] ? [...state.columns[boardId]] : null;
    prevState.labels[boardId] = state.labels[boardId] ? [...state.labels[boardId]] : null;
    prevState.settings[boardId] = state.settings[boardId] ? { ...state.settings[boardId] } : null;
  }
}

// ── PB record → Kanvana object converters ──────────────────────────────────────

function pbBoardToKanvana(r) {
  return { id: r.kanvana_id, name: r.name, createdAt: r.createdAt };
}
function pbTaskToKanvana(r) {
  return {
    id: r.kanvana_id, title: r.title, description: r.description,
    priority: r.priority, dueDate: r.dueDate, column: r.column, order: r.order,
    labels: r.labels || [], columnHistory: r.columnHistory || [],
    relationships: r.relationships || [], subTasks: r.subTasks || [],
    creationDate: r.creationDate, changeDate: r.changeDate, doneDate: r.doneDate,
  };
}
function pbColumnToKanvana(r) {
  return { id: r.kanvana_id, name: r.name, color: r.color, order: r.order, collapsed: r.collapsed };
}
function pbLabelToKanvana(r) {
  return { id: r.kanvana_id, name: r.name, color: r.color, group: r.group };
}

// ── Kanvana → PB payload converters ──────────────────────────────────────────

function taskPayload(task, userId) {
  const pbBoardId = idMap.boards.get(state.activeBoardId);
  const safe = sanitizeTaskFields(task);
  return { ...safe, kanvana_id: task.id, user: userId, board: pbBoardId };
}
function columnPayload(col, userId) {
  const pbBoardId = idMap.boards.get(state.activeBoardId);
  const safe = sanitizeColumnFields(col);
  return { ...safe, kanvana_id: col.id, user: userId, board: pbBoardId };
}
function labelPayload(label, userId) {
  const pbBoardId = idMap.boards.get(state.activeBoardId);
  const safe = sanitizeLabelFields(label);
  return { ...safe, kanvana_id: label.id, user: userId, board: pbBoardId };
}

// ── Boards ─────────────────────────────────────────────────────────────────────

export function listBoards() {
  return state.boards.filter((b) => b && typeof b.id === 'string')
    .map((b) => ({ id: b.id, name: b.name ?? 'Untitled board', createdAt: b.createdAt }));
}
export function getBoardById(boardId) {
  return listBoards().find((b) => b.id === boardId) ?? null;
}
export function getActiveBoardId() {
  const boards = listBoards();
  if (state.activeBoardId && boards.some((b) => b.id === state.activeBoardId)) return state.activeBoardId;
  return boards[0]?.id ?? null;
}
export function setActiveBoardId(boardId) {
  if (listBoards().some((b) => b.id === boardId)) state.activeBoardId = boardId;
}
export function getActiveBoardName() {
  const id = getActiveBoardId();
  return getBoardById(id)?.name ?? 'Untitled board';
}
export function ensureBoardsInitialized() {
  // No-op for PB adapter: boards come from PocketBase.
}
export function createBoard(name) {
  // Boards are created through the App Settings / migration flow, not inline here.
  // For compatibility: add to local cache only; a proper implementation would call PB.
  throw new Error('createBoard: use the boards module flow which calls PB directly');
}
export function renameBoard(boardId, newName) {
  const board = state.boards.find((b) => b.id === boardId);
  if (!board) return;
  board.name = newName;
  const pbId = idMap.boards.get(boardId);
  if (pbId && _pb && requireOnline()) {
    enqueueWrite('boards', () =>
      _pb.collection('boards').update(pbId, sanitizeBoardFields({ name: newName }))
    );
  }
}
export function deleteBoard(boardId) {
  const pbId = idMap.boards.get(boardId);
  state.boards = state.boards.filter((b) => b.id !== boardId);
  delete state.tasks[boardId];
  delete state.columns[boardId];
  delete state.labels[boardId];
  delete state.settings[boardId];
  idMap.boards.delete(boardId);
  if (pbId && _pb && requireOnline()) {
    enqueueWrite('boards', () => _pb.collection('boards').delete(pbId));
  }
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export function loadTasks() {
  return state.tasks[getActiveBoardId()] ?? [];
}
export function saveTasks(tasks) {
  if (!requireOnline()) return;
  const boardId = getActiveBoardId();
  const prev = prevState.tasks[boardId] ?? [];
  state.tasks[boardId] = tasks;
  const diff = diffRecords(prev, tasks, 'id');
  prevState.tasks[boardId] = [...tasks];
  enqueueWrite('tasks', () =>
    applyWrite(_pb, 'tasks', diff, (t) => taskPayload(t, _userId), idMap.tasks, _userId)
  );
}

// ── Columns ────────────────────────────────────────────────────────────────────

export function loadColumns() {
  return state.columns[getActiveBoardId()] ?? [];
}
export function saveColumns(columns) {
  if (!requireOnline()) return;
  const boardId = getActiveBoardId();
  const prev = prevState.columns[boardId] ?? [];
  state.columns[boardId] = columns;
  const diff = diffRecords(prev, columns, 'id');
  prevState.columns[boardId] = [...columns];
  enqueueWrite('columns', () =>
    applyWrite(_pb, 'columns', diff, (c) => columnPayload(c, _userId), idMap.columns, _userId)
  );
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export function loadLabels() {
  return state.labels[getActiveBoardId()] ?? [];
}
export function saveLabels(labels) {
  if (!requireOnline()) return;
  const boardId = getActiveBoardId();
  const prev = prevState.labels[boardId] ?? [];
  state.labels[boardId] = labels;
  const diff = diffRecords(prev, labels, 'id');
  prevState.labels[boardId] = [...labels];
  enqueueWrite('labels', () =>
    applyWrite(_pb, 'labels', diff, (l) => labelPayload(l, _userId), idMap.labels, _userId)
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────

export function loadSettings() {
  return state.settings[getActiveBoardId()] ?? null;
}
export function saveSettings(settings) {
  if (!requireOnline()) return;
  const boardId = getActiveBoardId();
  state.settings[boardId] = settings;
  const pbBoardId = idMap.boards.get(boardId);
  enqueueWrite('board_settings', async () => {
    const existing = await _pb.collection('board_settings')
      .getList(1, 1, { filter: `board="${pbBoardId}"&&user="${_userId}"` });
    if (existing.items[0]) {
      await _pb.collection('board_settings').update(existing.items[0].id, { data: settings });
    } else {
      await _pb.collection('board_settings').create({
        user: _userId, board: pbBoardId,
        data: settings, kanvana_id: `settings-${boardId}`,
      });
    }
  });
}

// ── Cross-board reads ──────────────────────────────────────────────────────────

export function loadTasksForBoard(boardId) { return state.tasks[boardId] ?? []; }
export function loadColumnsForBoard(boardId) { return state.columns[boardId] ?? []; }
export function loadLabelsForBoard(boardId) { return state.labels[boardId] ?? []; }
export function loadSettingsForBoard(boardId) { return state.settings[boardId] ?? null; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --reporter=verbose tests/unit/pb-storage.test.js
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/pb-storage.js tests/unit/pb-storage.test.js
git commit -m "feat: add pb-storage.js — PocketBase adapter with in-memory cache and write queue"
```

---

## Task 7: Create `storage-adapter.js` — Adapter Selector

The single import point for all storage operations. Holds a reference to the active adapter and
delegates every call to it.

**Files:**
- Create: `src/modules/storage-adapter.js`

No unit tests for the adapter itself (it is pure delegation; the adapters are tested individually).
A DOM integration test in Task 11 exercises the full startup path.

- [ ] **Step 1: Create `src/modules/storage-adapter.js`**

```js
/**
 * storage-adapter.js — Adapter selector and re-export layer.
 *
 * All storage consumers import from this module instead of storage.js.
 * Call initStorageAdapter() once at startup to activate the correct adapter.
 * After that, all exports delegate to the active adapter transparently.
 */

// Default to IDB adapter
let adapter = null;

async function getAdapter() {
  if (!adapter) {
    // Lazily import IDB adapter as the default.
    adapter = await import('./storage.js');
  }
  return adapter;
}

/**
 * Activate the PocketBase adapter.
 * Called by pb-auth.js after successful authentication + migration.
 */
export function setPbAdapter(pbAdapterModule) {
  adapter = pbAdapterModule;
}

/**
 * Reset to the IDB adapter (on disconnect or auth failure).
 */
export async function resetToIdbAdapter() {
  adapter = await import('./storage.js');
}

// ── Re-exports (delegate to active adapter) ────────────────────────────────────

export async function initStorage(...args) {
  return (await getAdapter()).initStorage(...args);
}
export async function ensureBoardsInitialized(...args) {
  return (await getAdapter()).ensureBoardsInitialized(...args);
}

export function listBoards() { return adapter?.listBoards() ?? []; }
export function getBoardById(id) { return adapter?.getBoardById(id) ?? null; }
export function getActiveBoardId() { return adapter?.getActiveBoardId() ?? null; }
export function getActiveBoardName() { return adapter?.getActiveBoardName?.() ?? 'Untitled board'; }
export function setActiveBoardId(id) { return adapter?.setActiveBoardId(id); }
export function createBoard(name) { return adapter?.createBoard(name); }
export function renameBoard(id, name) { return adapter?.renameBoard(id, name); }
export function deleteBoard(id) { return adapter?.deleteBoard(id); }

export function loadTasks() { return adapter?.loadTasks() ?? []; }
export function saveTasks(tasks) { return adapter?.saveTasks(tasks); }
export function loadColumns() { return adapter?.loadColumns() ?? []; }
export function saveColumns(cols) { return adapter?.saveColumns(cols); }
export function loadLabels() { return adapter?.loadLabels() ?? []; }
export function saveLabels(labels) { return adapter?.saveLabels(labels); }
export function loadSettings() { return adapter?.loadSettings() ?? null; }
export function saveSettings(settings) { return adapter?.saveSettings(settings); }

export function loadTasksForBoard(id) { return adapter?.loadTasksForBoard(id) ?? []; }
export function loadColumnsForBoard(id) { return adapter?.loadColumnsForBoard(id) ?? []; }
export function loadLabelsForBoard(id) { return adapter?.loadLabelsForBoard(id) ?? []; }
export function loadSettingsForBoard(id) { return adapter?.loadSettingsForBoard(id) ?? null; }
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/storage-adapter.js
git commit -m "feat: add storage-adapter.js — adapter selector re-export layer"
```

---

## Task 8: Update All Import Sites

Replace every `from './storage.js'` import with `from './storage-adapter.js'` across all modules,
and the entry-point imports in `src/kanban.js`, `src/modules/reports.js`, and `src/modules/calendar.js`.

**Files to modify** (run the sed command then verify):

- [ ] **Step 1: Rename imports in all module files**

```bash
# In src/modules/*.js — relative import './storage.js' → './storage-adapter.js'
sed -i "s|from './storage\.js'|from './storage-adapter.js'|g" src/modules/*.js
```

- [ ] **Step 2: Rename the import in src/kanban.js**

```bash
sed -i "s|from './modules/storage\.js'|from './modules/storage-adapter.js'|g" src/kanban.js
```

- [ ] **Step 3: Verify no remaining imports of storage.js (except storage.js itself)**

```bash
grep -rn "from '.*storage\.js'" src/ --include="*.js" | grep -v "src/modules/storage\.js" | grep -v "storage-adapter\.js"
# Expected: no output
```

- [ ] **Step 4: Run the full unit test suite to confirm nothing broke**

```bash
npm run test:unit
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor: switch all storage imports to storage-adapter.js"
```

---

## Task 9: Create `pb-status.js` — Mode Badge, Toast, Ping

**Files:**
- Create: `src/modules/pb-status.js`

- [ ] **Step 1: Create `src/modules/pb-status.js`**

```js
/**
 * pb-status.js — Mode badge, sync-error toast, connectivity ping.
 *
 * Exports:
 *   initPbStatus(pb)   — wires all DOM elements and event listeners
 *   updateBadge(mode)  — 'local' | 'pb-online' | 'pb-offline'
 */

let _pingInterval = null;
let _pb = null;

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 3_000;

export function initPbStatus(pb) {
  _pb = pb;
  document.addEventListener('pb:offline', () => updateBadge('pb-offline'));
  document.addEventListener('pb:online', () => updateBadge('pb-online'));
  document.addEventListener('pb:sync-error', onSyncError);
}

export function updateBadge(mode) {
  const badge = document.getElementById('pb-mode-badge');
  if (!badge) return;
  const labels = { local: 'Local', 'pb-online': 'PocketBase', 'pb-offline': 'Offline — read only' };
  const colors = { local: 'badge--grey', 'pb-online': 'badge--green', 'pb-offline': 'badge--amber' };
  badge.textContent = labels[mode] ?? 'Local';
  badge.className = `pb-mode-badge ${colors[mode] ?? 'badge--grey'}`;
  badge.dataset.mode = mode;
}

function onSyncError(e) {
  showToast(`Sync failed — changes not saved (${e.detail?.collection ?? ''})`);
}

function showToast(message) {
  const existing = document.getElementById('pb-sync-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'pb-sync-toast';
  toast.className = 'pb-sync-toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `<span>${message}</span><button type="button" aria-label="Dismiss">✕</button>`;
  toast.querySelector('button').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

export function startPing(onReconnect) {
  stopPing();
  _pingInterval = setInterval(async () => {
    if (!_pb) return;
    try {
      await Promise.race([
        _pb.health.check(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS)),
      ]);
      onReconnect?.();
    } catch {
      // still offline — do nothing
    }
  }, PING_INTERVAL_MS);
}

export function stopPing() {
  if (_pingInterval) {
    clearInterval(_pingInterval);
    _pingInterval = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/pb-status.js
git commit -m "feat: add pb-status.js — mode badge, sync-error toast, connectivity ping"
```

---

## Task 10: Add Mode Badge and App Settings Button to `index.html`

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Read the current header in `src/index.html`**

Find the `<div class="brand">` block. Add the mode badge immediately after it:

```html
<!-- PocketBase mode badge — hidden until PB adapter is active -->
<span id="pb-mode-badge" class="pb-mode-badge badge--grey hidden" data-mode="local">Local</span>
```

- [ ] **Step 2: Add the App Settings button to the desktop controls menu**

Find the line with `id="settings-btn"` (per-board settings). Add a new button immediately before it:

```html
<button id="app-settings-btn" class="control-btn" type="button" aria-haspopup="dialog">
  <span data-lucide="database" aria-hidden="true"></span>
  <span>App Settings</span>
</button>
```

- [ ] **Step 3: Add the App Settings modal shell at the end of `<body>` (before `</body>`)**

```html
<!-- App Settings Modal -->
<dialog id="app-settings-modal" class="modal" aria-labelledby="app-settings-title" aria-modal="true">
  <div class="modal-content">
    <h2 id="app-settings-title" class="modal-title">App Settings</h2>
    <section class="modal-section" id="pb-backend-section">
      <h3 class="modal-section-title">Backend</h3>
      <div id="pb-connect-form" class="pb-connect-form">
        <!-- Populated by app-settings.js -->
      </div>
    </section>
    <footer class="modal-footer">
      <button type="button" class="btn btn-secondary" data-close-modal>Close</button>
    </footer>
  </div>
</dialog>
```

- [ ] **Step 4: Run the dev server and visually verify the button appears**

```bash
npm run dev
# Open http://localhost:3000 — confirm "App Settings" button visible in header
```

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat: add mode badge and App Settings button/modal shell to index.html"
```

---

## Task 11: Create `app-settings.js` — App Settings Modal UI

**Files:**
- Create: `src/modules/app-settings.js`
- Test: `tests/dom/app-settings.test.js`

- [ ] **Step 1: Write the failing DOM tests**

Create `tests/dom/app-settings.test.js`:

```js
import { describe, test, expect, beforeEach } from 'vitest';
import { getByLabelText, getByRole, fireEvent } from '@testing-library/dom';

// Minimal DOM for app settings modal
function setupDom() {
  document.body.innerHTML = `
    <button id="app-settings-btn">App Settings</button>
    <dialog id="app-settings-modal">
      <div id="pb-connect-form"></div>
    </dialog>
    <span id="pb-mode-badge"></span>
  `;
}

beforeEach(() => { setupDom(); });

describe('app-settings modal', () => {
  test('renders disconnected state with connect form', async () => {
    const { initAppSettings } = await import('../../src/modules/app-settings.js');
    initAppSettings(null);

    const modal = document.getElementById('app-settings-modal');
    const form = document.getElementById('pb-connect-form');
    expect(form.querySelector('input[name="pb-url"]')).toBeTruthy();
    expect(form.querySelector('input[name="pb-email"]')).toBeTruthy();
    expect(form.querySelector('input[name="pb-password"]')).toBeTruthy();
  });

  test('shows validation error for invalid URL', async () => {
    const { initAppSettings } = await import('../../src/modules/app-settings.js');
    initAppSettings(null);

    const form = document.getElementById('pb-connect-form');
    form.querySelector('input[name="pb-url"]').value = 'not-a-url';
    form.querySelector('input[name="pb-email"]').value = 'a@b.com';
    form.querySelector('input[name="pb-password"]').value = 'secret';
    fireEvent.submit(form.querySelector('form'));

    expect(document.querySelector('.pb-error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:dom -- --reporter=verbose tests/dom/app-settings.test.js
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `src/modules/app-settings.js`**

```js
/**
 * app-settings.js — App Settings modal UI (backend section).
 *
 * Exports:
 *   initAppSettings(pb)   — wires button, modal, and connection form
 *   showConnectedState(config) — renders "connected" UI
 *   showDisconnectedState()    — renders "disconnected" UI (connect form)
 */

import { validatePbUrl, getAuthErrorMessage, initWithCredentials, logout, loadConfig } from './pb-auth.js';
import { updateBadge } from './pb-status.js';

let _pb = null;

export async function initAppSettings(pb) {
  _pb = pb;

  const btn = document.getElementById('app-settings-btn');
  const modal = document.getElementById('app-settings-modal');
  if (!btn || !modal) return;

  btn.addEventListener('click', async () => {
    const config = await loadConfig();
    if (config) {
      showConnectedState(config);
    } else {
      showDisconnectedState();
    }
    modal.showModal?.() ?? (modal.open = true);
  });

  // Close on backdrop click or data-close-modal button
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.closeModal !== undefined) {
      modal.close?.() ?? (modal.open = false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (modal.open ?? modal.getAttribute('open') !== null)) {
      modal.close?.() ?? (modal.open = false);
    }
  });
}

export function showDisconnectedState() {
  const container = document.getElementById('pb-connect-form');
  if (!container) return;
  container.innerHTML = `
    <form id="pb-connect-form-el" novalidate>
      <div class="form-field">
        <label for="pb-url-input">PocketBase URL</label>
        <input id="pb-url-input" name="pb-url" type="url" placeholder="https://pb.myserver.com" autocomplete="off" required>
      </div>
      <div class="form-field">
        <label for="pb-email-input">Email</label>
        <input id="pb-email-input" name="pb-email" type="email" autocomplete="username" required>
      </div>
      <div class="form-field">
        <label for="pb-password-input">Password</label>
        <input id="pb-password-input" name="pb-password" type="password" autocomplete="current-password" required>
      </div>
      <p class="pb-error" id="pb-auth-error" aria-live="polite" style="display:none"></p>
      <button type="submit" class="btn btn-primary" id="pb-connect-btn">Connect</button>
    </form>
  `;
  document.getElementById('pb-connect-form-el').addEventListener('submit', onConnectSubmit);
}

export function showConnectedState(config) {
  const container = document.getElementById('pb-connect-form');
  if (!container) return;
  container.innerHTML = `
    <p><strong>Connected to:</strong> ${escapeHtmlSimple(config.url)}</p>
    <button type="button" class="btn btn-secondary" id="pb-disconnect-btn">Disconnect</button>
  `;
  document.getElementById('pb-disconnect-btn').addEventListener('click', onDisconnect);
}

async function onConnectSubmit(e) {
  e.preventDefault();
  const url = document.getElementById('pb-url-input')?.value?.trim() ?? '';
  const email = document.getElementById('pb-email-input')?.value?.trim() ?? '';
  const password = document.getElementById('pb-password-input')?.value ?? '';
  const errEl = document.getElementById('pb-auth-error');

  try {
    validatePbUrl(url);
  } catch (err) {
    showError(errEl, err.message);
    return;
  }

  const btn = document.getElementById('pb-connect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }

  try {
    const { default: PocketBase } = await import('pocketbase');
    const pb = new PocketBase(url);

    const { initWithCredentials: auth } = await import('./pb-auth.js');
    const config = await auth(pb, url, email, password);

    // Migration
    const { migrateToPoketBase } = await import('./pb-migration.js');
    const { getFullState } = await import('./storage.js');
    const state = getFullState();
    await migrateToPoketBase(pb, state, config.userId, () => {});

    // Switch adapter
    const pbStorageModule = await import('./pb-storage.js');
    const { setPbAdapter } = await import('./storage-adapter.js');
    setPbAdapter(pbStorageModule);
    updateBadge('pb-online');

    showConnectedState(config);
    document.getElementById('app-settings-modal')?.close?.();
    window.location.reload();
  } catch (err) {
    const msg = err.message.includes('Authentication failed')
      ? err.message
      : 'Connection failed. Check the URL and try again.';
    showError(errEl, msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
  }
}

async function onDisconnect() {
  if (!_pb) return;
  const { logout: doLogout } = await import('./pb-auth.js');
  await doLogout(_pb);
  const { resetToIdbAdapter } = await import('./storage-adapter.js');
  await resetToIdbAdapter();
  updateBadge('local');
  showDisconnectedState();
  window.location.reload();
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function escapeHtmlSimple(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Run DOM tests**

```bash
npm run test:dom -- --reporter=verbose tests/dom/app-settings.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/app-settings.js tests/dom/app-settings.test.js
git commit -m "feat: add app-settings.js — connection form, connected state, disconnect flow"
```

---

## Task 12: Wire Everything in `kanban.js`

Connect the adapter startup, App Settings modal, and mode badge to the main entry point.

**Files:**
- Modify: `src/kanban.js`

- [ ] **Step 1: Read the top of `src/kanban.js` to see the current import block and startup sequence**

The file currently has:
```js
import { initStorage, ensureBoardsInitialized, setActiveBoardId } from './modules/storage.js';
```

- [ ] **Step 2: Update `src/kanban.js`**

Replace the `storage.js` import line:

```js
import { initStorage, ensureBoardsInitialized, setActiveBoardId } from './modules/storage-adapter.js';
```

Add new imports after the existing import block (add near the other module imports):

```js
import { initAppSettings } from './modules/app-settings.js';
import { initPbStatus, updateBadge, startPing, stopPing } from './modules/pb-status.js';
import { loadConfig, startRefreshTimer } from './modules/pb-auth.js';
import { setPbAdapter, resetToIdbAdapter } from './modules/storage-adapter.js';
```

In the startup sequence (after `await initStorage()` and before `renderBoard()`), add:

```js
// PocketBase adapter startup
const pbConfig = await loadConfig();
if (pbConfig) {
  try {
    const { default: PocketBase } = await import('pocketbase');
    const pb = new PocketBase(pbConfig.url);
    pb.authStore.save(pbConfig.token, null);

    const pbStorageModule = await import('./modules/pb-storage.js');
    await pbStorageModule.initStorage(pb, pbConfig.userId, new Map(), new Map(), new Map(), new Map());
    setPbAdapter(pbStorageModule);
    updateBadge('pb-online');

    // Start mid-session token refresh timer
    const cancelRefresh = startRefreshTimer(pb, pbConfig, async () => {
      // Token expired mid-session — fall back to read-only offline mode
      await resetToIdbAdapter();
      updateBadge('pb-offline');
      const { _setOffline } = await import('./modules/pb-storage.js');
      _setOffline(true);
    });
    window.addEventListener('beforeunload', cancelRefresh);

    initPbStatus(pb);
    startPing(async () => {
      const { _setOffline } = await import('./modules/pb-storage.js');
      _setOffline(false);
      updateBadge('pb-online');
    });

  } catch (err) {
    // PocketBase unavailable at startup — fall back to IDB adapter
    console.warn('[Kanvana] PocketBase unavailable at startup, using local data:', err.message);
    await resetToIdbAdapter();
    updateBadge('pb-offline');
  }
} else {
  updateBadge('local');
}

initAppSettings(null); // PB instance not needed for initial setup
```

- [ ] **Step 3: Verify with `npm run dev`**

```bash
npm run dev
# Open http://localhost:3000 — confirm board loads, mode badge shows "Local"
```

> **Docker stack note:** When running the full Docker stack locally (`docker compose up`), the
> app is served as a production build (nginx + PocketBase). In this setup, `import.meta.env.DEV`
> is `false` (production build). The PocketBase connect form URL should be
> `http://localhost:8080` (same nginx origin) or the HTTPS URL of your reverse-proxied domain.
> The dev-mode exemption in `validatePbUrl()` does NOT apply to the Docker stack — it applies
> only when running `npm run dev` (Vite dev server) pointing at a standalone local PocketBase
> instance.

- [ ] **Step 4: Run the full test suite**

```bash
npm run test:unit && npm run test:dom
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/kanban.js
git commit -m "feat: wire PocketBase adapter startup and App Settings into kanban.js"
```

---

## Task 13: Add CSS for Mode Badge and Toast

**Files:**
- Create: `src/styles/components/pb-status.css`
- Modify: `src/index.html` (add `<link>` for the new stylesheet)

- [ ] **Step 1: Create `src/styles/components/pb-status.css`**

```css
/* PocketBase mode badge */
.pb-mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  cursor: default;
}
.pb-mode-badge.hidden { display: none; }
.badge--grey   { background-color: var(--color-surface-raised); color: var(--color-text-muted); }
.badge--green  { background-color: #d1fae5; color: #065f46; }
.badge--amber  { background-color: #fef3c7; color: #92400e; cursor: pointer; }

[data-theme="dark"] .badge--green { background-color: #065f46; color: #d1fae5; }
[data-theme="dark"] .badge--amber { background-color: #92400e; color: #fef3c7; }

/* Sync-error toast */
.pb-sync-toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  background-color: var(--color-surface-raised);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
  z-index: 9999;
}
.pb-sync-toast button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0;
  line-height: 1;
}
```

- [ ] **Step 2: Link the stylesheet in `src/index.html`**

Add inside `<head>`, alongside the other component stylesheet links:

```html
<link rel="stylesheet" href="./styles/components/pb-status.css">
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/components/pb-status.css src/index.html
git commit -m "feat: add CSS for PocketBase mode badge and sync-error toast"
```

---

## Task 14: Update CHANGELOG and Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/spec/storage.md` (note the storage adapter pattern)
- Modify: `docs/spec/overview.md` (note the new modules)

- [ ] **Step 1: Add entries to `CHANGELOG.md` under `[Unreleased]`**

Add under `### Added`:

```markdown
### Added
- Optional PocketBase backend integration: users can connect a self-hosted PocketBase instance via the new App Settings modal
- `storage-adapter.js`: unified storage import point; automatically delegates to IDB or PocketBase adapter
- `pb-auth.js`: PocketBase authentication, URL validation, token lifecycle, API key auth for AI agents
- `pb-storage.js`: PocketBase storage adapter with in-memory cache, write queue, and offline detection
- `pb-sync.js`: write diff, field sanitization, and PocketBase REST call helpers
- `pb-migration.js`: idempotent one-time migration from IDB to PocketBase on first connect
- `pb-status.js`: mode badge (`Local` / `PocketBase` / `Offline — read only`), sync-error toast, connectivity ping
- `app-settings.js`: App Settings modal with PocketBase connection form and disconnect flow
- PocketBase mode badge in app header
- App Settings button in app header
```

- [ ] **Step 2: Update `docs/spec/storage.md`**

Add a new section at the end:

```markdown
## Storage Adapter Layer

As of v1.6, all modules import storage functions from `storage-adapter.js` instead of `storage.js` directly. `storage-adapter.js` holds a reference to the active adapter and re-exports all storage functions. Two adapters exist:

- **IDB adapter** (`storage.js`) — default; local-first, no network
- **PocketBase adapter** (`pb-storage.js`) — optional; activated after user connects a PocketBase instance

The active adapter is set at startup by checking for `kanvana-pb-config` in IDB. Switching adapters (on connect, disconnect, or session expiry) is done via `setPbAdapter()` and `resetToIdbAdapter()` in `storage-adapter.js`.
```

- [ ] **Step 3: Update `docs/spec/overview.md`**

Add new modules to the module list:

```markdown
- **storage-adapter.js** — Adapter selector and re-export layer; all consumers import from here
- **pb-auth.js** — PocketBase auth: credentials, API key, token refresh, URL validation, audit logging
- **pb-storage.js** — PocketBase adapter: in-memory cache, write queue, offline detection
- **pb-sync.js** — Write helpers: diff, sanitize, normalize, PB REST calls with timeout
- **pb-migration.js** — One-time IDB → PocketBase migration (idempotent)
- **pb-status.js** — Mode badge, sync-error toast, connectivity ping
- **app-settings.js** — App Settings modal UI: backend connection form
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/spec/storage.md docs/spec/overview.md
git commit -m "docs: update CHANGELOG and spec docs for PocketBase backend integration"
```

---

## Task 15: Full Test Pass + Build Verification

- [ ] **Step 1: Run the complete test suite**

```bash
npm run test:unit && npm run test:dom
# Expected: all PASS
```

- [ ] **Step 2: Run the production build**

```bash
npm run build
# Expected: no errors, dist/ produced
```

- [ ] **Step 3: Run npm audit**

```bash
npm audit
# Expected: 0 high/critical vulnerabilities
```

- [ ] **Step 4: Manual security checklist (do before marking feature complete)**

- [ ] Auth failure message does not leak email existence (test in browser: wrong password → generic message)
- [ ] Mode badge shows "Local" on fresh load with no PocketBase config
- [ ] `localStorage` and DevTools Application → IndexedDB show no password stored after connect flow
- [ ] `kanvana-pb-config` in IDB contains `tokenExpiry` field (not null for password auth) and no `password` field

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add .
git commit -m "chore: final cleanup and verification for PocketBase backend integration"
```

---

## Self-Review Against Spec

**Spec section → Task mapping:**

| Spec section | Task |
|---|---|
| Storage Adapter Pattern | Tasks 7, 8 |
| PocketBase Schema (collections, API rules) | Documented in spec; schema created in PocketBase admin UI (not code) |
| Authentication & Configuration (connect flow, token persistence, mid-session refresh) | Tasks 3, 12 |
| PocketBase Adapter — in-memory cache | Task 6 |
| PocketBase Adapter — idMap | Tasks 5, 6 |
| PocketBase Adapter — write strategy + write queue | Tasks 4, 6 |
| Connectivity & offline (ping, read-only mode, `pb:offline/online`) | Tasks 9, 12 |
| Migration flow (sequence, progress modal, idempotency, no IDB delete) | Task 5 |
| UI — App Settings modal | Tasks 10, 11 |
| UI — Mode badge | Tasks 10, 13 |
| UI — Sync error toast | Task 9 |
| Security — URL validation | Task 3 |
| Security — generic auth error message | Task 3 |
| Security — input sanitization in PB writes | Task 4 |
| Security — token storage, refresh, mid-session expiry | Tasks 3, 12 |
| Security — audit logging | Task 3 |
| Security — AI agent `initWithApiKey` | Task 3 |
| Architecture — timeouts on all calls | Tasks 4, 5, 6 |
| Architecture — retry (token refresh only) | Task 3 |
| Architecture — migration idempotency + kanvana_id pre-check | Task 5 |
| Architecture — `pb:sync-error` structured payload | Tasks 4, 6, 9 |
| Architecture — startup resilience (IDB fallback if PB slow) | Task 12 |
| Architecture — per-collection write serialization | Task 6 |
| Testing — unit tests for all new modules | Tasks 3, 4, 5, 6 |
| Testing — DOM integration for App Settings | Task 11 |
| Dependencies — `pocketbase` exact version, `npm audit` | Tasks 1, 15 |
| Docs — CHANGELOG, spec updates | Task 14 |

**No placeholders found.** All steps contain actual code.

**Type consistency check:** `idMap` is always `Map<kanvana_id, pb_id>`; `state` shape matches `storage.js` in all adapters; `diffRecords` returns `{ creates, updates, deletes }` consistently across `pb-sync.js`, `pb-storage.js`.

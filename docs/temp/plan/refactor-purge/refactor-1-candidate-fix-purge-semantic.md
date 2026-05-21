# Plan: Fix Purge Semantic Gap (Candidate 1)

## Context

The soft-delete feature was completed on branch `#0002-perm-del-purge`. A correctness gap exists in the Settings UI purge button: it calls `purgeDeleted(board.id)` in a loop, which only cleans local IDB. It never touches PocketBase.

The PRD (`docs/system/prd/PRD-tasks-soft-delete.md`) specifies:
> If online: PocketBase records are hard-deleted immediately.
> If offline: Task IDs are added to the pending hard-deletes queue.

Neither step happens today. If a user purges while offline and autosync is off, those PocketBase records with `deleted: true` are never cleaned up.

The fix introduces `runPurge(boards)` in `sync.js` — a single function that owns the full purge semantic — and replaces the loop in `settings.js` with a call to it.

**Findings doc:** `docs/system/findings/findings-testing-soft-delete.md` (Candidate 1)

---

## Files to Change

| File | Change |
|---|---|
| `client/tests/unit/sync.test.js` | Add `addPendingHardDelete` to mock; add `runPurge` import; add 4 new unit tests |
| `client/src/modules/sync.js` | Add `addPendingHardDelete` to storage import; implement and export `runPurge()` |
| `client/src/modules/settings.js` | Replace `purgeDeleted` import/loop with `runPurge` from `sync.js` |
| `client/tests/dom/settings-ui.test.js` | Mock `sync.js`; replace one IDB-assertion test with `runPurge` call assertion |

**Not changing:** `storage.js` (purgeDeleted stays correct for local-only cleanup), `storage.test.js`.

---

## Private helpers available inside sync.js (no export needed)

- `loadSyncMap()` — line 86
- `saveSyncMap(map)` — line 98
- `getPbId(syncMap, entityType, localId)` — line 102
- `isAuthenticated()` — line 40 (already exported, usable internally)
- `pb` — module-level PocketBase instance
- `addPendingHardDelete` — must be added to the storage import (not yet imported)

---

## Step 1 — Extend sync.test.js mocks and imports (red setup)

**File:** `client/tests/unit/sync.test.js`

1. Add `addPendingHardDelete: vi.fn()` to the `vi.mock('../../src/modules/storage.js', ...)` factory object.
2. Add `addPendingHardDelete` to the named import block from `storage.js`.
3. Add `runPurge` to the named import from `sync.js`.

---

## Step 2 — Add 4 failing unit tests for runPurge (red phase)

**File:** `client/tests/unit/sync.test.js`

Add a `describe('runPurge', () => { ... })` block after the existing `pushBoardFull` suite. Each test sets up `mockAuthStore` and the storage mocks, then calls `await runPurge([{ id: 'board-1' }])`.

### Test 2a — Online: hard-deletes tasks with a known PocketBase ID
```
Setup: mockAuthStore.token = 'tok', .record = { id: 'u1' }, .isValid = true
Setup: localStorage syncMap = { tasks: { 'local-t1': 'pb-t1' } }
Setup: loadDeletedTasksForBoard.mockReturnValue([{ id: 'local-t1' }])
Assert: mockCollection.delete called with 'pb-t1'
Assert: purgeDeleted called with 'board-1'
```

### Test 2b — Online: silently skips tasks with no PocketBase ID
```
Setup: isAuthenticated = true
Setup: syncMap has no entry for 'ghost-task'
Setup: loadDeletedTasksForBoard returns [{ id: 'ghost-task' }]
Assert: mockCollection.delete NOT called
Assert: purgeDeleted called with 'board-1'
```

### Test 2c — Offline: queues each task in pendingHardDeletes
```
Setup: mockAuthStore.token = null (isAuthenticated = false)
Setup: loadDeletedTasksForBoard returns [{ id: 'task-a' }, { id: 'task-b' }]
Assert: addPendingHardDelete called with { localTaskId: 'task-a', boardId: 'board-1' }
Assert: addPendingHardDelete called with { localTaskId: 'task-b', boardId: 'board-1' }
Assert: mockCollection.delete NOT called
Assert: purgeDeleted called with 'board-1'
```

### Test 2d — Always: purgeDeleted called for every board
```
Setup: isAuthenticated = false
Setup: loadDeletedTasksForBoard returns []
Act: await runPurge([{ id: 'board-1' }, { id: 'board-2' }])
Assert: purgeDeleted called with 'board-1'
Assert: purgeDeleted called with 'board-2'
Assert: purgeDeleted call count === 2
```

---

## Step 3 — Implement runPurge in sync.js (green phase)

**File:** `client/src/modules/sync.js`

### 3a — Add `addPendingHardDelete` to the storage import block (lines 2–23)

```js
import {
  // ...existing imports...
  addPendingHardDelete,   // ← add this line
  purgeDeleted,
  // ...rest...
} from './storage.js';
```

### 3b — Add and export `runPurge` after pushBoardFull (after line ~350, before pullAllBoards)

```js
export async function runPurge(boards) {
  const online = isAuthenticated();
  const syncMap = online ? loadSyncMap() : null;
  let syncMapDirty = false;

  for (const board of boards) {
    const boardId = board.id;
    const deletedTasks = loadDeletedTasksForBoard(boardId);

    if (online) {
      for (const task of deletedTasks) {
        const pbId = getPbId(syncMap, 'tasks', task.id);
        if (pbId) {
          try { await pb.collection('tasks').delete(pbId); } catch { /* 404 ok */ }
          delete syncMap.tasks[task.id];
          syncMapDirty = true;
        }
      }
    } else {
      for (const task of deletedTasks) {
        addPendingHardDelete({ localTaskId: task.id, boardId });
      }
    }

    purgeDeleted(boardId);
  }

  if (online && syncMapDirty) saveSyncMap(syncMap);
}
```

Pattern mirrors the existing hard-delete block in `pushBoardFull` (lines 327–346). No new private helpers are needed — all used symbols are already module-scope in `sync.js`.

---

## Step 4 — Update settings.js

**File:** `client/src/modules/settings.js`

### 4a — Update imports (line 1)

Before:
```js
import { loadGlobalSettings, loadSettings, saveGlobalSettings, saveSettings, listBoards, loadDeletedTasksForBoard, purgeDeleted } from './storage.js';
```

After:
```js
import { loadGlobalSettings, loadSettings, saveGlobalSettings, saveSettings, listBoards, loadDeletedTasksForBoard } from './storage.js';
import { runPurge } from './sync.js';
```

No circular dep: `settings.js → sync.js → storage.js`. Same topology as `authsync.js → sync.js`.

### 4b — Replace purge button handler body (lines 192–195)

Before:
```js
for (const board of boards) {
  purgeDeleted(board.id);
}
```

After:
```js
await runPurge(boards);
```

The `confirmDialog`, count check, and DOM updates around it are unchanged.

---

## Step 5 — Update settings-ui.test.js

**File:** `client/tests/dom/settings-ui.test.js`

### 5a — Add hoisted mock for sync.js (after the existing `vi.hoisted` block, before imports)

```js
const { runPurge } = vi.hoisted(() => ({
  runPurge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/sync.js', () => ({
  runPurge,
}));
```

`vi.mock` calls are hoisted by Vitest before module evaluation, so this intercepts `settings.js`'s `import { runPurge } from './sync.js'` before the module is loaded.

### 5b — Reset runPurge in beforeEach

Add `runPurge.mockReset(); runPurge.mockResolvedValue(undefined);` to the `beforeEach` block (alongside the existing `confirmDialog.mockReset()`).

### 5c — Replace "confirming purge removes all soft-deleted tasks" test (lines 226–241)

This test asserted on real IDB side-effects from `purgeDeleted()`. Now that `runPurge` is mocked, it cannot assert on IDB. Replace with:

```js
test('confirming purge calls runPurge with the boards list', async () => {
  const boardId = getActiveBoardId();
  saveTasksForBoard(boardId, [
    { id: 't1', deleted: true, title: 'A', column: 'todo', labels: [] },
    { id: 't2', deleted: false, title: 'B', column: 'todo', labels: [] },
  ]);
  confirmDialog.mockResolvedValue(true);
  mountSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(document.getElementById('settings-purge-btn'));

  await waitFor(() => {
    expect(runPurge).toHaveBeenCalledOnce();
    expect(runPurge).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: boardId })])
    );
  });
});
```

All other purge DOM tests remain valid:
- "cancelling purge" test: cancel returns before `runPurge` is reached, so mocked IDB state is still untouched ✓
- "purge button disables and shows zero count" test: `runPurge` mock resolves immediately, DOM mutations still run ✓

---

## Verification

```bash
cd client

# Red phase — should see 4 failing runPurge tests
npm run test:unit -- --reporter=verbose tests/unit/sync.test.js

# After Step 3 — green
npm run test:unit -- --reporter=verbose tests/unit/sync.test.js

# After Step 5 — DOM tests green
npm run test:dom -- --reporter=verbose tests/dom/settings-ui.test.js

# Full suite — zero regressions
npm test
```

Expected final counts:
- Unit: 289/289 (285 existing + 4 new runPurge tests)
- DOM: 77/78 (same pre-existing authsync failure, unrelated)

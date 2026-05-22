# Plan: Fix Purge Semantic Gap (refreshed 2026-05-21)

## Status

Supersedes `refactor-1-candidate-fix-purge-semantic.md`. As of 2026-05-21 a source audit confirmed **none** of that plan's steps were executed — `runPurge` does not exist anywhere under `client/`, `settings.js` still loops `purgeDeleted`, `sync.js` does not import `addPendingHardDelete`, and neither test file was touched. This doc carries the same work forward with verified line references.

All supporting infrastructure the plan depends on exists and is unchanged:
- `storage.js`: `addPendingHardDelete` (line 898), `loadDeletedTasksForBoard` (955), `purgeDeleted` (970).
- `sync.js`: `isAuthenticated` (40), `loadSyncMap` (86), `saveSyncMap` (98), `getPbId` (102), `pushBoardFull` hard-delete block (327-346), module-level `pb`.

## Context

The soft-delete feature (branch `#0002-perm-del-purge`) has a correctness gap: the Settings purge button calls `purgeDeleted(board.id)` in a loop, which only cleans local IDB and never touches PocketBase.

The PRD (`docs/system/prd/PRD-tasks-soft-delete.md`) specifies:
> If online: PocketBase records are hard-deleted immediately.
> If offline: Task IDs are added to the pending hard-deletes queue.

Neither happens today. A user who purges while offline (autosync off) leaves PocketBase records with `deleted: true` permanently orphaned.

Fix: introduce `runPurge(boards)` in `sync.js` — one function owning the full purge semantic — and replace the loop in `settings.js`.

**Findings doc:** `docs/system/findings/findings-testing-soft-delete.md` (Candidate 1)

## Files to Change

| File | Change |
|---|---|
| `client/tests/unit/sync.test.js` | Add `addPendingHardDelete` to storage mock + named import; add `runPurge` import; add 4 unit tests |
| `client/src/modules/sync.js` | Import `addPendingHardDelete`; implement + export `runPurge()` |
| `client/src/modules/settings.js` | Drop `purgeDeleted` import/loop; call `runPurge` from `sync.js` |
| `client/tests/dom/settings-ui.test.js` | Mock `sync.js`; replace the IDB-assertion purge test with a `runPurge` call assertion |

**Not changing:** `storage.js` (`purgeDeleted` stays correct for local-only cleanup), `storage.test.js`.

## Available inside sync.js (no new helpers needed)

- `isAuthenticated()` — sync.js:40 (exported, usable internally)
- `loadSyncMap()` — sync.js:86
- `saveSyncMap(map)` — sync.js:98
- `getPbId(syncMap, entityType, localId)` — sync.js:102
- `pb` — module-level PocketBase instance
- `loadDeletedTasksForBoard`, `purgeDeleted` — already imported from `storage.js`
- `addPendingHardDelete` — storage.js:898, **must be added to the import block**

Pattern reference: existing hard-delete block in `pushBoardFull`, sync.js:327-346.

## Step 1 — sync.test.js mocks & imports (red setup)

File: `client/tests/unit/sync.test.js`
1. Add `addPendingHardDelete: vi.fn(),` to the `vi.mock('../../src/modules/storage.js', ...)` factory (near line 43, beside `purgeDeleted`).
2. Add `addPendingHardDelete` to the named import block from `storage.js` (starts line 65).
3. Add `runPurge` to the named import from `sync.js` (lines 55-63).

## Step 2 — 4 failing unit tests for runPurge (red)

File: `client/tests/unit/sync.test.js` — add `describe('runPurge', ...)` after the `pushBoardFull` suite. Each test sets up `mockAuthStore` + storage mocks, then `await runPurge([{ id: 'board-1' }])`.

**2a — Online: hard-deletes tasks with a known PB id**
- `mockAuthStore.token='tok'`, `.record={id:'u1'}`, `.isValid=true`
- localStorage syncMap = `{ tasks: { 'local-t1': 'pb-t1' } }`
- `loadDeletedTasksForBoard.mockReturnValue([{ id: 'local-t1' }])`
- Assert `mockCollection.delete` called with `'pb-t1'`; `purgeDeleted` called with `'board-1'`.

**2b — Online: silently skips tasks with no PB id**
- authenticated; syncMap has no entry for `ghost-task`
- `loadDeletedTasksForBoard` returns `[{ id: 'ghost-task' }]`
- Assert `mockCollection.delete` NOT called; `purgeDeleted` called with `'board-1'`.

**2c — Offline: queues each task in pendingHardDeletes**
- `mockAuthStore.token=null` (→ `isAuthenticated()` false)
- `loadDeletedTasksForBoard` returns `[{ id: 'task-a' }, { id: 'task-b' }]`
- Assert `addPendingHardDelete` called with `{ localTaskId: 'task-a', boardId: 'board-1' }` and `{ localTaskId: 'task-b', boardId: 'board-1' }`; `mockCollection.delete` NOT called; `purgeDeleted` called with `'board-1'`.

**2d — Always: purgeDeleted called for every board**
- offline; `loadDeletedTasksForBoard` returns `[]`
- `await runPurge([{ id: 'board-1' }, { id: 'board-2' }])`
- Assert `purgeDeleted` called with `'board-1'` and `'board-2'`; call count === 2.

## Step 3 — Implement runPurge in sync.js (green)

File: `client/src/modules/sync.js`

**3a** — Add `addPendingHardDelete,` to the `storage.js` import block.

**3b** — Add + export `runPurge` after `pushBoardFull` (after line 350, before `pullAllBoards`):

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

    await purgeDeleted(boardId);
  }

  if (online && syncMapDirty) saveSyncMap(syncMap);
}
```

Mirrors the `pushBoardFull` hard-delete block (sync.js:327-346); `await purgeDeleted` matches sync.js:348.

## Step 4 — Update settings.js

File: `client/src/modules/settings.js`

**4a — imports (line 1).** Drop `purgeDeleted`, add a `sync.js` import:
```js
import { loadGlobalSettings, loadSettings, saveGlobalSettings, saveSettings, listBoards, loadDeletedTasksForBoard } from './storage.js';
import { runPurge } from './sync.js';
```
No circular dep: `settings.js → sync.js → storage.js` (same topology as `authsync.js → sync.js`).

**4b — purge handler body (lines 192-194).** Replace:
```js
for (const board of boards) {
  purgeDeleted(board.id);
}
```
with:
```js
await runPurge(boards);
```
`confirmDialog`, count check and DOM updates around it are unchanged.

## Step 5 — Update settings-ui.test.js

File: `client/tests/dom/settings-ui.test.js`

**5a** — Add a hoisted mock for `sync.js` (after the existing `vi.hoisted`/`vi.mock` for `dialog.js`, lines 7-15):
```js
const { runPurge } = vi.hoisted(() => ({
  runPurge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/modules/sync.js', () => ({ runPurge }));
```

**5b** — In `beforeEach`, add `runPurge.mockReset(); runPurge.mockResolvedValue(undefined);` beside the existing `confirmDialog` reset.

**5c** — Replace the test "confirming purge removes all soft-deleted tasks from all boards" (lines 226-241). With `runPurge` mocked it can no longer assert IDB side-effects; assert the call instead:
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
Other purge DOM tests stay valid: "cancelling purge" returns before `runPurge`; "purge button disables and shows zero count" still works since the `runPurge` mock resolves immediately.

## Verification

```bash
cd client
# Red: 4 failing runPurge tests
npm run test:unit -- --reporter=verbose tests/unit/sync.test.js
# After Step 3: green
npm run test:unit -- --reporter=verbose tests/unit/sync.test.js
# After Step 5: DOM green
npm run test:dom -- --reporter=verbose tests/dom/settings-ui.test.js
# Full suite: zero new regressions
npm test
```
Expect: 4 new runPurge unit tests pass; `settings-ui.test.js` purge tests pass; no new failures vs. the pre-change baseline. Re-verify counts against the current suite — the candidate-1 figure of 285→289 unit tests may have drifted.

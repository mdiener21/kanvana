# Product Requirement Document (PRD): Task Deletion Rework

---

## 1. Problem Statement

Users clicking the delete button on a task expect the record to be permanently removed. Instead, the current implementation silently retains every deleted task in local storage with a `deleted: true` flag and only hard-deletes it from PocketBase at the next sync.

There is no user-visible way to permanently remove tasks without understanding sync internals, and no user-controlled recovery path for accidental deletions.

---

## 2. Solution

Make permanent delete the default: when a user confirms deletion, the task is immediately and irreversibly removed from local storage and queued for hard-deletion from PocketBase.

Users who want a recovery safety net can opt in to **soft-delete mode** via a new global Settings toggle. When soft-delete is active, deleted tasks are hidden everywhere but retained until the user explicitly runs a **Purge** operation that wipes all soft-deleted tasks across all boards.

---

## 3. User Stories

### General Deletion & Formats

* **Accidental Click Protection:** As a board user, I want a confirmation dialog before any task is deleted, so that I don't lose work from accidental clicks.
* **Permanent Delete Notice:** As a board user in permanent-delete mode (the default), I want the confirmation to clearly state the action is irreversible, so that I understand the consequence before confirming.
* **Immediate UI Feedback:** As a board user in permanent-delete mode, I want the task to disappear from the board immediately after I confirm, so that the UI reflects the action without delay.
* **Activity Logging:** As a board user in permanent-delete mode, I want the deletion to be recorded in the board activity log, so that I can see what was deleted and when.

### Soft-Delete Mode

* **Soft-Delete Notice:** As a board user in soft-delete mode (enabled in settings), I want the confirmation dialog to tell me the task will be soft deleted and hidden and how to permanently remove it, so that I understand the soft-delete behaviour before confirming.
* **Workspace Cleanliness:** As a board user in soft-delete mode, I want deleted tasks not to be included in any and all board views, column counts, reports, and calendar, so that my workspace stays clean.
* **Deletion Durability:** As a board user in soft-delete mode, I want soft-deleted tasks to stay retained — and stay counted for purge — even after I add, edit, move, or reorder other tasks, so that nothing is silently lost before I explicitly purge. Concretely: if I soft-delete 5 tasks and then continue working on the board, the Settings purge count must still read 5.
* **Global Configuration:** As a kanvana user, I want to enable soft-delete from Settings on a global level for all boards, so that I can control deletion flow.

### Purging Mechanics

* **Purge Insights:** As a board user, I want to see a Purge button in Settings that shows how many soft-deleted tasks exist across all boards, so that I know what will be permanently removed before I act.
* **Disabled Purge State:** As a board user, I want the Purge button to be disabled when no soft-deleted tasks exist, so that it is clear there is nothing to purge.
* **Persistence of Purge Access:** As a board user, I want the Purge button to remain accessible even after I turn off the soft-delete toggle, so that I can delete tasks that were soft-deleted while the toggle was on.
* **Purge Confirmation:** As a board user, I want a confirmation dialog before purging that states the exact count of tasks and that all boards will be affected, so that I understand the full scope before confirming.

### Offline Resilience & Syncing

* **Offline Deletion:** As a board user working offline, I want to be able to delete tasks permanently even without an internet connection, so that my local workspace stays clean regardless of connectivity.
* **Automatic Reconnect Sync:** As a board user working offline, I want permanently deleted tasks to be removed from PocketBase automatically on my next reconnect, so that I don't have to manually trigger a sync after coming back online.
* **Offline Purging:** As a board user working offline, I want to be able to run Purge even without an internet connection, so that I can clean up my local storage immediately and let PocketBase catch up when I reconnect.
* **Multi-Device State Sync:** As a board user on multiple devices, I want soft-deleted tasks to sync as hidden (not hard-deleted) to PocketBase while soft-delete mode is active, so that other devices also see the task as deleted.

### UX & Settings Polish

* **Visual Settings Hierarchy:** As a kanvana user, I want the Settings panel to clearly separate global (app-wide) settings from board-specific settings, so that I know which settings affect all boards and which affect only the current board.
* **Clear Labeling:** As a board user, I want the soft-delete toggle to be clearly labelled as an app-wide setting, so that I understand it applies to all boards, not just the current one.

---

## 4. Implementation Decisions

### Two Deletion Modes

* **Permanent delete (default):** On confirmation, the task is immediately purged from IndexedDB across all in-memory and persisted state. A board-level `task.deleted` audit event is written before the purge. The task's own `activityLog` is destroyed with it (accepted loss — soft-delete exists for users who need history). The task ID is added to a global pending hard-deletes queue for PocketBase cleanup.
* **Soft-delete (opt-in):** On confirmation, `task.deleted` is set to `true` and the task is persisted. The task is filtered out of all normal queries (`loadTasks()`) but retained in storage. A board-level `task.deleted` audit event is written. The task is upserted to PocketBase with `deleted: true` during the next sync push.

### Confirmation Dialog Messages

> **Permanent mode:**
> "Delete this task? This cannot be undone."

> **Soft-delete mode:**
> "You have soft-delete active, this will set the task as deleted and will not count or show in any location, to permanently delete you must click purge in the settings."

### Global Settings Layer

A new IDB key (`kanvana:settings:global`) holds cross-board app settings, accessed via `loadGlobalSettings()` / `saveGlobalSettings()`. This is separate from the existing per-board settings store. `softDeleteEnabled` (default `false`) is the first global setting. The Settings UI must visually distinguish board settings from global/app settings.

### Pending Hard-Deletes Queue

A global IDB key (`pendingHardDeletes`) holds an array of `{ localTaskId, boardId }` entries. Permanent deletions append to this queue. The sync push reads the queue, resolves each `localTaskId` to a PocketBase record ID via the `syncMap`, hard-deletes from PocketBase, then clears the entry. Entries with no PocketBase ID (task created offline, never synced) are silently dropped.

### Sync Branching

`pushBoardFull()` branches on `softDeleteEnabled`:

* **Soft-delete on:** Tasks with `deleted: true` are upserted to PocketBase (not hard-deleted during push). Hard-delete happens only when purge runs.
* **Soft-delete off:** Pending hard-deletes queue is processed; entries are hard-deleted from PocketBase and cleared.

### Purge Execution

1. All soft-deleted tasks are immediately removed from IDB across all boards.
2. **If online:** PocketBase records are hard-deleted immediately.
3. **If offline:** Task IDs are added to the pending hard-deletes queue; hard-delete runs on next sync after reconnect.

### Schema Addition

`createPendingHardDelete({ localTaskId, boardId })` factory added to `schema.js`. *(Already committed).*

### Soft-Delete Scope

Soft-delete mode applies to tasks only. Columns and labels continue to use the existing implementation-level deleted flag (not user-facing).

### Soft-Deleted Task Retention

`loadTasks()` returns live tasks only (soft-deleted tasks filtered out). Any task-mutation function that reads the live set and writes it back must NOT overwrite the board's soft-deleted tasks. The persistence path `saveLiveTasks()` re-merges the board's current soft-deleted tasks before writing, so `addTask`, `updateTask`, drag-drop reorder, and move-to-top all preserve the soft-deleted set. Soft-deleted tasks are removed only by an explicit purge. The Settings purge count therefore always reflects the true total of soft-deleted tasks across all boards.

---

## 5. Testing Decisions

All modules use TDD (red-green-refactor). Tests assert external behaviour only — never implementation details.

### Unit Tests (`Vitest`)

* **`storage.js`:**
* `loadGlobalSettings` returns defaults when key absent.
* `saveGlobalSettings` round-trips correctly.
* `addPendingHardDelete` appends entries.
* `clearPendingHardDeleteEntry` removes by `localTaskId`.
* `purgeDeleted` removes only tasks (columns and labels untouched).


* **`tasks.js`:**
* *Permanent path:* Task absent from `loadTasks()` and `loadDeletedTasksForBoard()` after delete, board event written, pending queue entry added.
* *Soft path:* Task absent from `loadTasks()` but present in `loadDeletedTasksForBoard()`, board event written, no queue entry added.


* **`settings.js`:**
* `softDeleteEnabled` defaults to `false`.
* Toggle persists across load.
* Global settings do not bleed into per-board settings store.



### DOM Integration Tests (`Vitest` + `@testing-library/dom`)

* **`task-card.js`:** Confirmation message matches active mode; cancel aborts deletion; confirm triggers delete + `DATA_CHANGED` event.
* **`settings-ui.js`:** Purge button disabled at zero soft-deleted tasks; enabled with correct count; confirmation dialog shown before purge; purge removes tasks across all boards; button disabled again after successful purge.

### API Mock Tests (`MSW` + `Vitest`)

* **`sync.js`:**
* *Soft-delete on:* Deleted tasks are upserted with `deleted: true`, not hard-deleted during push.
* *Soft-delete off:* Pending queue entries trigger hard-delete API calls; entries with no PocketBase ID are cleared without a network call; queue is empty after successful push.



*Prior art references:* `client/tests/unit/storage.test.js`, `client/tests/dom/`, `client/tests/mocks/`.

---

## 6. Out of Scope

* Soft-delete for columns and labels (implementation-level only, not user-facing).
* A "trash" or "recently deleted" view showing soft-deleted tasks.
* Per-board soft-delete configuration (global only, per ADR-0003).
* Bulk delete or multi-select delete.
* Undo/redo for permanent deletes.
* Admin-only purge controls (single-user app for now).

---

## 7. Further Notes

* **ADR-0002** records the decision to default to permanent delete and the pending hard-deletes queue approach.
* **ADR-0003** records the decision to introduce a global settings layer separate from per-board settings.
* The global settings UI split (board settings vs. app settings) is a prerequisite for this feature and creates a foundation for future cross-board preferences.

### Reference Documents

| Document Type | Path |
| --- | --- |
| **Full Decision Tree** | `docs/system/plan/draft/rework-soft-delete.md` |
| **Module and Test Table** | `docs/system/plan/draft/rework-soft-delete-modules.md` |
| **Specification** | `docs/system/spec/tasks.md` — *Task Deletion section* |

---

## 8. Completion Summary

**Status: COMPLETE** — All six implementation slices delivered and committed on branch `#0002-perm-del-purge`.

| Issue | Title | Status | Commit |
|---|---|---|---|
| 001 | Global settings storage layer | Done (pre-existing) | — |
| 002 | Permanent delete purge path and confirmation | Done (pre-existing) | — |
| 003 | Pending hard-deletes queue | Done (pre-existing) | — |
| 004 | Soft-delete mode toggle in Settings UI | Done (pre-existing) | — |
| 005 | Sync branching on soft-delete mode | **Implemented** | `79971bc` |
| 006 | Purge button in Settings | **Implemented** | `b0a2d97` |

### Issue 005 — Sync branching

`pushBoardFull()` now reads `softDeleteEnabled` from global settings and branches:
- **ON:** soft-deleted tasks are upserted to PocketBase with `deleted: true`; pending hard-deletes queue is not drained during push.
- **OFF:** `deletedTasks` are hard-deleted from PocketBase; pending queue is drained (unchanged behavior).

4 new unit tests in `client/tests/unit/sync.test.js`.

### Issue 006 — Purge button

- Purge button + count span added to the App settings section (`index.html`).
- `settings.js` counts soft-deleted tasks across all boards on modal open; button is disabled at zero.
- Confirmation dialog states exact count and "across all boards" scope.
- On confirm: `purgeDeleted()` called for every board; button count resets to 0 and disables.
- 7 new DOM tests in `client/tests/dom/settings-ui.test.js`.

### Test results at completion

- Unit tests: **285/285**
- DOM tests: **77/78** (1 pre-existing `authsync` failure unrelated to this work)

### Post-completion fix — soft-deleted task retention (2026-05-21)

A correctness gap was found after completion: `addTask`, `updateTask`, `updateTaskPositionsFromDrop`, and `moveTaskToTopInColumn` saved the live-task set directly via `saveTasks()`, which overwrote the board's task list and silently destroyed any soft-deleted tasks. After soft-deleting tasks, any subsequent add/edit/move/drag wiped them from storage and dropped the Settings purge count below the true total.

Fix: added `saveLiveTasks()` to `storage.js`, which re-merges the board's soft-deleted tasks before persisting; the four mutators now route through it. `deleteTask` and `columns.js` already preserved soft-deleted tasks and were unchanged. Covered by 4 new unit tests in `tasks.test.js` and 1 DOM regression test in `settings-ui.test.js`. Expected behavior is documented in §3 (*Deletion Durability*) and §4 (*Soft-Deleted Task Retention*).

### Post-completion fix — sync push purged soft-deleted tasks (2026-05-21)

A second correctness gap: `pushBoardFull()` called `purgeDeleted(boardId)` unconditionally at the end of every push. In soft-delete mode this hard-removed the soft-deleted tasks from local storage on every sync — directly contradicting §4 *Sync Branching* ("hard-delete happens only when purge runs"). After any autosync cycle the Settings purge count dropped to 0 even though PocketBase still held the records.

Fix: `purgeDeleted(boardId, opts)` now takes optional `{ tasks, columns, labels }` flags (all default `true`). `pushBoardFull()` calls `purgeDeleted(boardId, { tasks: !softDeleteEnabled })` — column/label tombstones are still cleaned (they were hard-deleted from PocketBase during the push), but soft-deleted tasks are kept until an explicit purge. `runPurge()` still calls `purgeDeleted(boardId)` with no flags, so the explicit Purge removes everything. Covered by new unit tests in `sync.test.js` and `tasks.test.js`.
# Rework Soft-Delete — Module & Change Table

All modules require TDD (red-green-refactor). See test layer guidance below.

## Modules to modify

| Module | Change summary |
|---|---|
| `storage.js` | Add `loadGlobalSettings()` / `saveGlobalSettings()` for new `kanvana:settings:global` IDB key. Add pending hard-deletes queue CRUD: `getPendingHardDeletes()`, `addPendingHardDelete({ localTaskId, boardId })`, `clearPendingHardDeleteEntry(localTaskId)`. Update `purgeDeleted()` to operate on tasks only (columns and labels are unaffected). |
| `tasks.js` | Branch `deleteTask()` on `softDeleteEnabled` global setting. **Permanent path:** immediately purge task from IDB, write board-level `task.deleted` audit event, call `addPendingHardDelete`. **Soft path:** set `deleted: true` and persist (existing behaviour). |
| `task-card.js` | Update delete button confirmation dialog to read `softDeleteEnabled` and display the mode-aware message. Permanent mode: "Delete this task? This cannot be undone." Soft-delete mode: "You have soft-delete active, this will set the task as deleted and will not count or show in any location, to permanently delete you must click purge in the settings." |
| `settings.js` | Add `softDeleteEnabled: false` default to global settings. Wire `loadGlobalSettings()` / `saveGlobalSettings()` storage calls. |
| `settings-ui.js` | Add **"Soft-delete tasks"** toggle (reads/writes `softDeleteEnabled` global setting). Add **"Purge deleted tasks"** button: disabled when zero soft-deleted tasks exist across all boards; shows count; confirmation dialog states all-boards scope before executing. Purge flow: immediate local purge → if online, immediate PocketBase hard-delete; if offline, queue for next sync. |
| `sync.js` | Branch `pushBoardFull()` on `softDeleteEnabled`. **Soft-delete on:** upsert tasks with `deleted: true` to PocketBase (no hard-delete during push). **Soft-delete off:** read `getPendingHardDeletes()`, resolve each `localTaskId` → PocketBase ID via syncMap, hard-delete from PocketBase, call `clearPendingHardDeleteEntry`. Drop entries with no PocketBase ID silently (task was never synced). |

## Already modified

| Module | Change |
|---|---|
| `schema.js` | `createPendingHardDelete({ localTaskId, boardId })` factory added |
| `docs/system/spec/tasks.md` | Task Deletion section added |
| `docs/adr/0002-permanent-delete-default-soft-delete-opt-in.md` | New ADR |
| `docs/adr/0003-global-settings-layer.md` | New ADR |
| `CONTEXT.md` | `task.deleted` field, invariants, storage keys, Settings entity, boundary rule all updated |

## Test coverage required (TDD — all modules)

| Module | Test layer | Key scenarios |
|---|---|---|
| `storage.js` | Unit | `loadGlobalSettings` returns defaults when key absent; `saveGlobalSettings` persists and reloads; `addPendingHardDelete` appends; `clearPendingHardDeleteEntry` removes by localTaskId; `purgeDeleted` removes only tasks (not columns/labels) |
| `tasks.js` | Unit | Permanent delete: task absent from storage after call, board event written, pending queue entry added; Soft delete: task present with `deleted: true`, board event written, no queue entry |
| `task-card.js` | DOM | Confirmation message matches mode; cancel aborts deletion; confirm triggers delete + DATA_CHANGED event |
| `settings.js` | Unit | `softDeleteEnabled` defaults to false; toggle persists; global settings do not bleed into board settings |
| `settings-ui.js` | DOM | Purge button disabled at zero soft-deleted tasks; enabled with correct count; confirmation dialog shown before purge; purge clears tasks across all boards |
| `sync.js` | Unit (with MSW mocks) | Soft-delete on: deleted tasks upserted not hard-deleted; Soft-delete off: pending queue entries trigger hard-delete calls; missing PocketBase ID entries silently cleared |

## Key invariants to assert in tests

- `deleteTask` in permanent mode: task is gone from `loadTasks()` and from `loadDeletedTasksForBoard()`.
- `deleteTask` in soft-delete mode: task absent from `loadTasks()` but present in `loadDeletedTasksForBoard()`.
- Purge: after execution, `loadDeletedTasksForBoard()` returns `[]` across all boards.
- Pending queue: after successful PocketBase hard-delete, entry is removed from queue.
- Pending queue: entry with no syncMap PocketBase ID is removed without network call.

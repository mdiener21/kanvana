# 002 — Permanent delete: purge path and confirmation dialog

**Type:** AFK
**Blocked by:** 001

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Change the default task deletion behaviour from soft-delete (`deleted: true`) to immediate permanent purge. When `softDeleteEnabled` is `false` (the default), clicking delete and confirming a task removes it immediately and irreversibly from local storage — it disappears from both the live task list and the soft-deleted task list. A board-level `task.deleted` audit event is written before the purge. The task's own `activityLog` is destroyed with it.

The task-card confirmation dialog is updated to be mode-aware. In permanent-delete mode it shows:

> "Delete this task? This cannot be undone."

The `DATA_CHANGED` event is emitted on success so the board re-renders immediately.

## Acceptance criteria

- [ ] After confirming deletion in permanent mode, the task is absent from `loadTasks()` for the board
- [ ] After confirming deletion in permanent mode, the task is also absent from `loadDeletedTasksForBoard()` (fully purged, not just flagged)
- [ ] A board-level `task.deleted` event with correct `taskId`, `taskTitle`, `column`, and `columnName` is written to the board event log before the task is removed
- [ ] The confirmation dialog shows "Delete this task? This cannot be undone." when `softDeleteEnabled` is `false`
- [ ] Cancelling the confirmation dialog leaves the task untouched
- [ ] The `DATA_CHANGED` event is emitted after a confirmed permanent deletion, triggering a board re-render
- [ ] Unit tests cover: task absent from live and deleted lists after purge; board event written with correct payload
- [ ] DOM tests cover: correct confirmation message in permanent mode; cancel aborts; confirm triggers `DATA_CHANGED`

## Blocked by

- 001 (global settings layer — needed to read `softDeleteEnabled`)

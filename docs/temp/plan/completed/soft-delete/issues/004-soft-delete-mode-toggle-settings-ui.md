# 004 — Soft-delete mode toggle in Settings UI

**Type:** AFK
**Blocked by:** 001, 002

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Expose the `softDeleteEnabled` global setting in the Settings panel as a toggle labelled **"Soft-delete tasks"**. The Settings UI must visually distinguish **App settings** (global, cross-board) from **Board settings** (per-board) so users understand which settings travel with a board and which are device-wide.

When `softDeleteEnabled` is toggled on, `deleteTask()` sets `deleted: true` on the task and persists it (soft-delete path) instead of purging. The task is hidden from all views. The task-card confirmation dialog switches to the soft-delete message:

> "You have soft-delete active, this will set the task as deleted and will not count or show in any location, to permanently delete you must click purge in the settings."

Toggling soft-delete off does not auto-purge existing soft-deleted tasks — they remain hidden until the user explicitly purges them.

## Acceptance criteria

- [ ] The Settings panel has a clearly labelled "App settings" section containing the soft-delete toggle, visually separate from board-specific settings
- [ ] Toggling "Soft-delete tasks" on persists `softDeleteEnabled: true` to global settings and takes effect immediately (no page reload required)
- [ ] With soft-delete on, confirming task deletion sets `task.deleted = true`; the task is absent from `loadTasks()` but present in `loadDeletedTasksForBoard()`
- [ ] With soft-delete on, the confirmation dialog shows the soft-delete mode message
- [ ] With soft-delete off (default), the confirmation dialog shows "Delete this task? This cannot be undone."
- [ ] Toggling soft-delete off leaves existing soft-deleted tasks untouched
- [ ] DOM tests cover: toggle reflects persisted state on settings open; toggling on switches confirmation message; toggling off switches message back; soft-deleted task remains in `loadDeletedTasksForBoard()` after toggle-off

## Blocked by

- 001 (global settings storage layer)
- 002 (permanent delete path — soft-delete and permanent paths must both be wired before the toggle is meaningful)

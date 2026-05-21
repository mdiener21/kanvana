# 006 — Purge button in Settings

**Type:** AFK
**Blocked by:** 004, 005

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Add a **"Purge deleted tasks"** button to the App settings section of the Settings panel. The button shows the total count of soft-deleted tasks across all boards. It is disabled (grayed out) when that count is zero, and enabled whenever soft-deleted tasks exist — even if the soft-delete toggle is currently off (to allow cleanup of leftover tasks).

Clicking the enabled button shows a confirmation dialog:

> "Permanently delete all N soft-deleted tasks across all boards? This cannot be undone."

On confirmation, purge runs in two phases:

1. **Immediate local purge:** all tasks with `deleted: true` are removed from IDB across every board.
2. **PocketBase hard-delete:** if online, PocketBase records are hard-deleted immediately. If offline, the task IDs are added to the pending hard-deletes queue and the hard-delete runs on the next sync after reconnect.

After a successful purge the button count updates to zero and the button disables.

## Acceptance criteria

- [ ] The Purge button displays the correct count of soft-deleted tasks across all boards
- [ ] The Purge button is disabled when count is zero
- [ ] The Purge button is enabled when soft-deleted tasks exist, regardless of whether `softDeleteEnabled` is currently on
- [ ] The confirmation dialog states the exact count and "across all boards" scope
- [ ] Cancelling the confirmation dialog leaves all soft-deleted tasks untouched
- [ ] After confirming, `loadDeletedTasksForBoard()` returns `[]` for every board
- [ ] After confirming while online, PocketBase hard-delete requests are sent for all purged tasks
- [ ] After confirming while offline, purged task IDs are added to the pending hard-deletes queue; the queue is drained on the next sync
- [ ] The Purge button disables (count = 0) immediately after a successful purge
- [ ] DOM tests cover: button count accuracy; disabled state at zero; confirmation dialog shown; cancel aborts; confirm clears all boards; button re-disables after purge
- [ ] MSW tests cover: online purge fires hard-delete for each task; offline purge populates queue; queue drains on next sync

## Blocked by

- 004 (soft-delete mode toggle — purge button lives in the same App settings section)
- 005 (sync branching — purge uses the pending queue path for offline hard-deletes)

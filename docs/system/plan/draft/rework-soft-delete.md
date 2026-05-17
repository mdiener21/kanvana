# Rework Soft-Delete — Decision Tree

Decisions made via design review session (2026-05-17). This document captures every branch of the
task-deletion redesign before implementation begins. See the resulting spec in
`docs/system/spec/tasks.md` (Task Deletion section).

---

## Core model

Two modes, switchable in Settings:

| Mode | Trigger | Local storage | Audit log | PocketBase |
|---|---|---|---|---|
| **Permanent delete** (default) | Click delete → confirm | Immediately purged from IndexedDB | Board-level `task.deleted` event | Added to pending hard-deletes queue; hard-deleted on next sync |
| **Soft-delete** (opt-in) | Click delete → confirm | `deleted: true`; task filtered from all views | Board-level `task.deleted` event | Upserted with `deleted: true`; hard-deleted only when purge runs |

---

## Decision log

### D1 — What does "permanent delete" mean at click time?
**Decision:** Immediately purge the task from IndexedDB (no `deleted: true` intermediate state).
Write the board-level audit event before purging. Add the task ID to the global pending
hard-deletes queue so the sync can hard-delete the PocketBase record.

**Rejected:** Set `deleted: true` then auto-purge in the same call — functionally equivalent but
adds unnecessary indirection.

---

### D2 — Confirmation dialog wording
**Decision:** Two distinct messages depending on active mode.

Permanent delete (default):
> "Delete this task? This cannot be undone."

Soft-delete mode active:
> "You have soft-delete active, this will set the task as deleted and will not count or show in
> any location, to permanently delete you must click purge in the settings."

**Rejected:** Single generic message regardless of mode — too vague, hides the consequence
difference.

**Rejected:** Skip confirmation in soft-delete mode because it is reversible — confirmation is
always shown; a footgun is still a footgun.

---

### D3 — Soft-delete scope (tasks vs. columns and labels)
**Decision:** Soft-delete applies to **tasks only**. Columns and labels continue to use the
existing soft-delete mechanism (which is implementation-only; it is not user-facing).

---

### D4 — Purge scope and confirmation
**Decision:** Purge operates across **all boards** (not just the active board). The confirmation
dialog shows the total count of soft-deleted tasks across all boards and explicitly states the
all-boards scope.

Example confirmation:
> "Permanently delete all 14 soft-deleted tasks across all boards? This cannot be undone."

---

### D5 — Purge button availability
**Decision:** The Purge button in Settings is:
- **Disabled** (grayed out) when zero soft-deleted tasks exist across all boards.
- **Enabled** whenever soft-deleted tasks exist, regardless of whether the soft-delete toggle is
  currently on.

Rationale: a user may turn off soft-delete but still have tasks left over from when it was on.
The purge button must remain accessible to clean those up.

---

### D6 — Toggling soft-delete off with existing soft-deleted tasks
**Decision:** Existing soft-deleted tasks are **not auto-purged** when the toggle is turned off.
They stay hidden and soft-deleted. The purge button remains accessible. Future deletions become
permanent.

**Rejected:** Auto-purge on toggle-off — too destructive; the user should make that call
explicitly via the Purge button.

---

### D7 — Audit log on permanent delete
**Decision:** Only the board-level `task.deleted` event is preserved. The task's own
`activityLog` array is destroyed with the task. This loss is accepted.

Rationale: the board event records what/when/who. Full per-task history is what soft-delete is
for. Preserving history on permanent delete would require significant extra complexity.

---

### D8 — PocketBase sync branching
**Decision:** The sync module must branch on the soft-delete setting:

- **Soft-delete off (permanent):** Task is purged locally before sync runs. The pending
  hard-deletes queue (`{ localTaskId, boardId }[]`) carries the IDs. Sync looks up each entry
  in the syncMap, hard-deletes from PocketBase, then clears the queue entry. If no PocketBase ID
  exists (task was created offline and never synced), the queue entry is silently cleared.

- **Soft-delete on:** Task is upserted to PocketBase with `deleted: true` (no hard-delete during
  the regular sync push). Hard-delete happens only when purge runs.

PocketBase already has the `deleted` boolean field on the tasks collection (migration
`1746100005_add_tasks_missing_fields.js`). No backend schema change required.

---

### D9 — Purge execution and offline behaviour
**Decision:** Purge is a two-phase operation:

1. **Phase 1 (always, immediate):** Remove all soft-deleted tasks from local IndexedDB across all
   boards.
2. **Phase 2 (conditional):**
   - If **online:** Immediately hard-delete from PocketBase.
   - If **offline:** Add all purged task IDs to the pending hard-deletes queue. On first
     reconnect, the sync fires and processes the queue.

---

### D10 — Pending hard-deletes queue structure
**Decision:** Global storage key (not per-board). Shape: `Array<{ localTaskId: string, boardId: string }>`.
The sync resolves `localTaskId` → PocketBase ID via syncMap at sync time. Entries with no
matching PocketBase ID (task never synced) are silently dropped.

---

## Files to change

| File | Change |
|---|---|
| `docs/system/spec/tasks.md` | Add **Task Deletion** section |
| `client/src/modules/schema.js` | Add `createPendingHardDelete` factory |
| `client/src/modules/tasks.js` | Branch on soft-delete setting; implement permanent purge path |
| `client/src/modules/storage.js` | Add pending hard-deletes queue CRUD; update `purgeDeleted` for tasks-only |
| `client/src/modules/settings.js` | Add `softDeleteEnabled` setting (default `false`) |
| `client/src/modules/sync.js` | Branch sync push on soft-delete mode; process pending hard-deletes queue |
| `client/src/modules/task-card.js` | Update confirmation dialog to use mode-aware message |
| `client/src/modules/settings-ui.js` | Add soft-delete toggle and Purge button with count and confirmation |

# Permanent delete as default; soft-delete as opt-in setting

> **Status: superseded by ADR-0004**
> `softDeleteEnabled` toggle and `pendingHardDeletes` queue removed in issue #111.
> Under event sourcing (ADR-0004), task deletion emits a `task.deleted` domain event
> (D1 hard tombstone); the reducer handles propagation. No soft-delete mode exists.

Task deletion defaults to immediate, irreversible removal from local storage. Soft-delete
(`deleted: true`, retained until purge) is an opt-in mode controlled by a global setting.
This is the reverse of the previous behaviour where every deletion was a soft-delete.

The change was driven by user expectation: most users clicking "delete" expect the record to
be gone, not silently retained in a hidden state. Soft-delete adds value for users who want
recovery or an audit trail, but that should be an explicit opt-in, not an invisible default.

## Considered Options

**Soft-delete always (previous behaviour)** — every deletion sets `deleted: true`; purge happens
at sync time. Rejected because tasks accumulate invisibly in IDB with no user-visible way to
permanently remove them without understanding the sync internals.

**Permanent delete always** — no soft-delete mode at all. Rejected because some users want the
safety net of a recoverable delete and a deliberate purge step.

**Permanent delete as default, soft-delete opt-in (chosen)** — matches common UX conventions
(trash/bin is an opt-in workflow, not a default) and keeps the simple path simple.

## Consequences

- **Pending hard-deletes queue:** Permanent deletes happen before sync runs. A global
  `pendingHardDeletes` queue (`{ localTaskId, boardId }[]`) bridges the gap. Sync resolves each
  entry via the syncMap and hard-deletes the PocketBase record, then clears the entry. Entries
  with no PocketBase ID (task was created offline, never synced) are silently dropped.

- **Sync branching:** `pushBoardFull` must branch on the global `softDeleteEnabled` setting.
  Soft-delete on → upsert tasks with `deleted: true` to PocketBase (no hard-delete during push).
  Soft-delete off → process `pendingHardDeletes` queue and hard-delete from PocketBase.

- **Purge is cross-board:** The purge operation in Settings hard-deletes all soft-deleted tasks
  across all boards from both IDB and PocketBase (immediately if online; via queue if offline).

- **Audit log:** Permanent deletion writes only a board-level `task.deleted` event. The task's
  own `activityLog` is destroyed with it. This loss is accepted — use soft-delete if history
  must be preserved.

- **Soft-delete applies to tasks only.** Columns and labels continue to use the existing
  implementation-level soft-delete (not user-facing).

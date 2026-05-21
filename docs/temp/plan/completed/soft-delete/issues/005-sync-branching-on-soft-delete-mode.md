# 005 — Sync branching on soft-delete mode

**Type:** AFK
**Blocked by:** 003, 004

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Make `pushBoardFull()` aware of the soft-delete mode setting. Currently it hard-deletes any task with `deleted: true` from PocketBase and then purges it locally. This must now branch on `softDeleteEnabled`:

**Soft-delete on:** Tasks with `deleted: true` are upserted to PocketBase (keeping the record alive with `deleted: true` so other devices see the task as hidden). They are **not** hard-deleted from PocketBase during a normal push. Hard-deletion happens only when the user explicitly runs Purge (slice 006).

**Soft-delete off (default):** The pending hard-deletes queue (from slice 003) is processed: each queued entry is resolved to a PocketBase record ID and hard-deleted. This is the path for tasks deleted while offline — on first reconnect the sync fires and drains the queue.

This slice also covers the offline-then-reconnect scenario: tasks permanently deleted while offline have their IDs in the pending queue. When the device comes back online and sync runs, the queue is drained and PocketBase records are removed.

## Acceptance criteria

- [ ] With soft-delete on: a task with `deleted: true` is upserted to PocketBase during push (not hard-deleted); the PocketBase record exists after push with `deleted = true`
- [ ] With soft-delete on: no hard-delete API calls are made for soft-deleted tasks during a normal sync push
- [ ] With soft-delete off: entries in the pending hard-deletes queue are hard-deleted from PocketBase during push
- [ ] With soft-delete off: after the push completes, the pending queue is empty
- [ ] With soft-delete off: a queued entry whose `localTaskId` has no PocketBase ID (never synced) is dropped without a network call
- [ ] Tasks permanently deleted while offline are hard-deleted from PocketBase on the next sync after reconnect (queue drains on push)
- [ ] MSW sync tests cover: soft-delete-on upsert path; soft-delete-off queue drain path; no-PB-ID silent drop; post-push queue state

## Blocked by

- 003 (pending hard-deletes queue)
- 004 (soft-delete mode toggle — the branch condition reads `softDeleteEnabled`)

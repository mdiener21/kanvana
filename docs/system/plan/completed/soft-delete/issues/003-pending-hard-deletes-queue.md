# 003 — Pending hard-deletes queue

**Type:** AFK
**Blocked by:** 002

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Bridge the gap between immediate local purge (slice 002) and PocketBase hard-deletion. When a task is permanently deleted locally, the local record is gone before sync runs — so a queue is needed to carry the intent to PocketBase.

Introduce a global `pendingHardDeletes` IDB key holding an array of `{ localTaskId, boardId }` entries (shape from `createPendingHardDelete` in `schema.js`, which is already added). The permanent-delete path appends to this queue immediately after purging.

The sync push processes the queue: for each entry, resolve `localTaskId` to a PocketBase record ID via the syncMap, send the hard-delete request to PocketBase, then remove the entry from the queue. If an entry has no PocketBase ID (task was created offline and never synced), drop it silently — there is nothing to delete remotely.

This slice only covers the online sync path. The offline/reconnect path is handled in slice 005 (sync branching).

## Acceptance criteria

- [ ] Permanently deleting a task appends a `{ localTaskId, boardId }` entry to the pending hard-deletes queue
- [ ] `getPendingHardDeletes()` returns all queued entries; `addPendingHardDelete()` appends one; `clearPendingHardDeleteEntry(localTaskId)` removes by `localTaskId`
- [ ] Sync push reads the queue and sends a PocketBase hard-delete request for each entry that has a known PocketBase ID in the syncMap
- [ ] After a successful PocketBase hard-delete, the entry is removed from the queue
- [ ] An entry whose `localTaskId` has no matching PocketBase ID is removed from the queue without any network call
- [ ] The queue is empty after a successful full sync push
- [ ] Unit tests cover: queue append, remove, and empty-state behaviour; no PocketBase ID entry is silently dropped
- [ ] MSW sync tests cover: hard-delete API call fired for queued entry; no call fired for unsynced entry; queue cleared after push

## Blocked by

- 002 (permanent delete purge path — the queue is only populated by the permanent-delete code path)

# Architecture Findings: PocketBase Sync & Soft-Delete Testing

> Source: `/improve-codebase-architecture` review, 2026-05-17  
> Scope: Soft-delete implementation from `PRD-tasks-soft-delete.md` — sync branching, purge mechanics, offline resilience, and test coverage.

---

## Context

The soft-delete feature was recently completed (branch `#0002-perm-del-purge`). All six implementation slices are committed. Unit tests pass 285/285; DOM tests 77/78 (one pre-existing `authsync` failure unrelated to this work).

This review focuses on whether the sync and offline→online paths are correctly designed and covered by tests that verify actual behaviour against PocketBase — not just that the right mocks were called.

---

## Candidate 1 — `purgeDeleted()` has a misleading interface

**Files:** `client/src/modules/storage.js`, `client/src/modules/settings.js`, `client/src/modules/sync.js` (line 348)

**Problem:**

`purgeDeleted(boardId)` is called in two contexts with different actual semantics:

- From `pushBoardFull()` line 348 — cleans local IDB *after* PocketBase hard-deletes have already been issued in that same push run. Correct.
- From the settings UI "Purge" button — also calls `purgeDeleted()`, but **only cleans local IDB**. No PocketBase hard-deletes are issued. Cleanup of PocketBase records relies silently on `pushBoardFull()` being triggered later by autosync.

This is a shallow module with a deceptive interface. Callers must know that PocketBase cleanup is a side effect of sync, not of purge. If the user purges while offline with autosync disabled, those records are silently lost from PocketBase permanently — a data integrity gap.

**Solution:**

A deep `Purge` module (or a `runPurge(boardIds)` function in `settings.js`) that owns the complete purge semantic:
1. Clean local IDB.
2. If online: hard-delete from PocketBase immediately.
3. If offline: add task IDs to `pendingHardDeletes` queue; PocketBase cleanup deferred to next sync.

Both callers (settings UI and `pushBoardFull`) invoke the same operation.

**Benefits:**
- **Locality:** "What does purge mean end-to-end" has one answer in one place.
- **Leverage:** Settings purge correctly handles the offline case rather than silently depending on autosync.
- **Testability:** The purge operation becomes testable as a unit — "purge while offline queues hard-deletes" is a verifiable assertion.

---

## Candidate 2 — Pending hard-deletes queue has no owned seam

**Files:** `client/src/modules/storage.js` (queue read/write), `client/src/modules/tasks.js` (enqueue on delete), `client/src/modules/sync.js` (drain during push)

**Problem:**

The queue's purpose is to bridge "task hard-deleted locally while offline" → "PocketBase eventually gets the delete." Its logic is scattered across three modules:

| Responsibility | Module |
|---|---|
| Queue read/write | `storage.js` — `getPendingHardDeletes()`, `addPendingHardDelete()`, `clearPendingHardDeleteEntry()` |
| Enqueue on delete | `tasks.js` — `deleteTask()` |
| Drain queue | `sync.js` — buried inside `pushBoardFull()` lines 327–346 |
| Skip drain when soft-delete on | `sync.js` — also inside `pushBoardFull()`, reading `softDeleteEnabled` fresh each call |

The queue's invariant — *"every entry here is a task deleted locally whose PocketBase record has not yet been hard-deleted"* — is not stated anywhere. Correctness depends on three modules agreeing on a contract that is never declared.

The **deletion test** confirms this is load-bearing: deleting the queue concept causes complexity to reappear at all three call sites.

**Solution:**

A `HardDeleteQueue` module (could live as a named section in `storage.js` or as a thin dedicated file) exposing:
- `enqueue(localTaskId, boardId)` — replaces `addPendingHardDelete()`
- `drain({ syncMap, pb, softDeleteEnabled })` — owns both "process entries" and "skip when soft-delete is on"
- `count()` — observable state for UI

`tasks.js` and `sync.js` call into it without knowing how it works.

**Benefits:**
- **Locality:** Queue invariant is stated once; bugs in queue processing have one location.
- **Leverage:** A single test of `drain()` covers the offline→online path without needing to exercise all of `pushBoardFull()`.

---

## Candidate 3 — Offline→online cycle is untested end-to-end (critical gap)

**Files:** `client/tests/unit/sync.test.js`, `client/tests/mocks/`

**Problem:**

The unit tests for `sync.js` mock everything: PocketBase is stubbed, IDB is reset via `_resetIdbForTesting()`, and `loadGlobalSettings()` returns a stub. Tests assert that the right mock was called with the right arguments. This is correct for unit tests but cannot verify the PRD's offline resilience stories.

**These scenarios have no test:**

| PRD User Story | Test Status |
|---|---|
| Delete while offline → reconnect → PocketBase record hard-deleted | **Missing** |
| Soft-delete while offline → reconnect → PocketBase upserted with `deleted: true` | **Missing** |
| Soft-delete → run purge from settings → PocketBase hard-delete fires | **Missing** |
| Task created offline, deleted before first sync → queue entry silently cleared | Unit test exists (mock-only) |
| Toggle soft-delete OFF with queued entries → queue drained on next push | **Missing** |

The current sync unit tests verify implementation wiring, not end-to-end behaviour. A regression in the `pendingHardDeletes` queue that prevents IDs from being resolved would not be caught — the mock would succeed regardless.

**Solution:**

MSW-based integration tests at the `client/tests/` layer that wire storage + sync + queue together with a real MSW server (same mechanism as existing DOM tests) but without mocking at the module level. Each test should:

1. Set up real IDB state (create task, set syncMap entry).
2. Simulate offline condition (no network or autosync disabled).
3. Delete the task (or run purge).
4. Trigger `pushBoardFull()`.
5. Assert against MSW request log: the correct PocketBase `DELETE` (or `PATCH` with `deleted: true`) was issued with the correct PocketBase record ID.

**Benefits:**
- **Leverage:** One integration test suite covers the PRD's offline resilience user stories.
- **Locality:** When these tests fail, the failure is in the actual sync path, not in a mock configuration.

---

## Candidate 4 — `pushBoardFull()` is too wide

**Files:** `client/src/modules/sync.js` (lines 284–350+)

**Problem:**

`pushBoardFull()` does five distinct things in sequence:
1. Upsert all live entities (columns, labels, tasks, relationships, events).
2. Branch on `softDeleteEnabled`.
3. Either upsert soft-deleted tasks (soft-delete ON) or hard-delete them (soft-delete OFF).
4. Drain the `pendingHardDeletes` queue.
5. Call `purgeDeleted()`.

Every one of these behaviors is invisible at the call site. The function's interface (`pushBoardFull(boardId)`) is simple, but understanding it requires reading ~350 lines. The soft-delete branching logic and queue drain are buried inside the orchestration, making them impossible to test independently.

**Solution:**

Extract each step into a named private function called from `pushBoardFull()`:
- `syncDeletedTasks(boardId, syncMap, softDeleteEnabled)` — handles the soft/hard branch for deleted tasks
- `drainPendingQueue(syncMap)` — processes `pendingHardDeletes` queue entries

These do not need to be separate files; named functions within `sync.js` are sufficient. `pushBoardFull()` becomes a readable orchestrator that names each step.

**Benefits:**
- **Locality:** A bug in queue draining is findable without reading the entire push function.
- **Leverage:** Each step can be unit-tested independently. The soft-delete upsert path and the hard-delete drain path become separate, named test targets.

---

## Recommended Exploration Order

| Priority | Candidate | Rationale |
|---|---|---|
| 1st | **Candidate 3** (integration tests) | Most direct answer to the stated goal; surfaces whether candidates 1 and 2 are real gaps |
| 2nd | **Candidate 1** (purge semantics) | Data integrity risk — offline purge silently skips PocketBase cleanup |
| 3rd | **Candidate 2** (queue seam) | Structural improvement; makes integration tests in candidate 3 easier to write |
| 4th | **Candidate 4** (pushBoardFull width) | Quality improvement; not a correctness risk |

---

## Current Test Coverage Snapshot

| Layer | Tool | Count | Soft-Delete Coverage |
|---|---|---|---|
| Unit | Vitest | 285/285 | Happy-path sync branching, queue enqueue/clear |
| DOM integration | Vitest + @testing-library/dom | 77/78 | Purge button UI, toggle behavior |
| API mock | MSW + Vitest | Wired but shallow | No end-to-end offline→online tests |
| E2E | Playwright | Exists | Not reviewed for soft-delete coverage |

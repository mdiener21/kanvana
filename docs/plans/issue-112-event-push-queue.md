# Issue #112 — PB schema migration + event push queue (no SSE)

## Context

Part of the event-sourced sync rollout (PRD `docs/temp/prd/PRD-event-sourced-sync.md`).
This slice wires locally-emitted domain events **outbound** to PocketBase. SSE subscription +
catch-up pull are the next issue (#114). Built on #107 (HLC + IDB v2), #108 (reducer/emitter),
#109 (snapshots).

Decisions (confirmed):
- **Split scope:** push core + backend migration land here; snapshot upload pre-flight (AC-009)
  and PB-side event GC (AC-010) are a follow-up.
- **Module-singleton API** for the queue, matching `autosync.js` / `snapshot.js` style, with
  `_*ForTesting` hooks. Tests use real PocketBase over MSW + fake-indexeddb (no fake timers —
  they deadlock fake-indexeddb; timing is shrunk via a test hook instead).

## What was built

**Backend** — `backend/pb_migrations/1746100010_event_sourced_schema.js`
- `events`: add `hlc` (json), `scope` (text), `entity_id` (text); `board` → optional;
  `details` → `payload`; drop `task` relation; `updateRule = null` (immutable). [AC-001]
- New `snapshots` collection: `owner`, `board_id` (nullable), `hlc` (json), `payload` (file),
  `local_id`; immutable updates, deletes allowed for GC/arbitration. [AC-002]
- Legacy `tasks`/`columns`/`labels`/`task_relationships`: create/update/delete rules → `null`,
  list/view kept. [AC-003]
- Not runnable in the JS suite — verify by running PocketBase against the migration.

**Client**
- `idb-store.js`: `getUnsyncedEvents()` (full scan + filter; boolean isn't a valid IDB index
  key), `markEventSynced(id)`.
- `event-sourcing/sync-queue.js`: `initSyncQueue()` wires `EVENT_EMITTED`→debounced drain,
  `online`→immediate drain, `auth-changed`→resume. Drains `synced=false` in HLC order, cap 5
  concurrent, marks synced on success. Tiered retry: network backoff `5s,30s,2m,5m…`(cap 5m),
  auth-failure pause, permanent 4xx ~1h. Never rolls back (R-A). `requestKey: null` opts each
  push out of PocketBase auto-cancellation.
- `kanban.js`: `initSyncQueue()` called at startup after auth/autosync init.

## Tests — `client/tests/dom/event-sourcing/sync-queue.test.js` (8, all green)

AC-004 debounce push→synced · AC-005 concurrency cap ≤5 + drain-all · AC-005 HLC-order
(sequential) · AC-008 no-rollback · AC-006 online resume · AC-007 auth pause/resume ·
AC-011 backoff-tier progression · AC-011 permanent-4xx ~1h.

> Note: the issue named `tests/mocks/event-sourcing/...`, but no vitest config globs
> `tests/mocks/**`. The runnable home is `tests/dom/event-sourcing/` (jsdom + MSW +
> fake-indexeddb). Server insertion order is irrelevant to correctness — the reducer re-sorts
> by HLC on replay and the PB event store has no inter-event FKs — so strict network arrival
> order is asserted only under sequential (cap-1) draining.

## Verification

- `cd client && npm test` (unit 280 / dom 59 / e2e 39) green.
- Backend: run PocketBase with the new migration; inspect `events`/`snapshots` schema and
  confirm legacy-collection writes are rejected while reads still succeed (AC-001..003).

## Deferred to follow-up
- AC-009 snapshot upload pre-flight + arbitration sweep.
- AC-010 PB-side event GC (`hlc <= snapshot.hlc`) after durable snapshot.
- SSE subscription + catch-up pull (#114).

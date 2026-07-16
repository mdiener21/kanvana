# Event-Sourced Multi-Device Sync — Architectural Plan

## Context

Kanvana is local-first with IndexedDB as the per-device source of truth. The current sync (PR #89) is whole-record last-write-wins (LWW) push/pull against PocketBase — unsafe for multi-device because non-overlapping field edits on the same task silently clobber each other, and unsynced offline edits are at risk whenever the other device pushes a stale state back.

**Primary use case driving this change:** a single user moves between mobile and laptop. Changes made on one device must appear on the other quickly and without data loss. Concurrent same-task editing is rare; "stale-state-overwrite when the just-opened device pushes" is the dominant failure today.

**Approach selected (after grill-with-docs session, 2026-05-25):** pure event sourcing. Every state mutation becomes an immutable event. The event log is the absolute source of truth; the live tasks/columns/labels view is a *projection* maintained by a reducer. Sync = replicate the event log between devices via PocketBase. Convergence is guaranteed because every replica applies the same events in the same Hybrid Logical Clock order.

Multi-user is out of scope for v1 but the architecture must not require a rewrite to support it.

The user-facing audit/activity-log feature is **dropped from v1** to minimize scope and complexity. The event log itself retains all information needed to reconstruct activity timelines later.

---

## Locked architectural decisions

### Foundations

1. **One unified concept of "event"** — extend the existing `client/src/modules/events.js` (today a 35-line EventTarget bus) and the existing PocketBase `events` collection. No new vocabulary; no parallel naming.
2. **Event type names use `dotted.snake_case`** — `task.created`, `task.updated`, `label.added_to_task`. Consistent with existing catalog.
3. **Pure event sourcing (Option A)** — the event log is the absolute, definitive source of truth. The IDB `kanbanBoard:{boardId}:tasks` / `:columns` / `:labels` keys become **read-model cache** maintained exclusively by the reducer. They are never mutated by feature modules directly. On boot: load latest snapshot → replay events since → render.
4. **Offline-only-forever is a first-class mode** — a user who never logs in must have full functionality. All reducer + snapshot logic runs client-side; PocketBase is optional fan-out.
5. **Hybrid Logical Clock (HLC) for total event ordering** — every event carries `hlc: { wallTime, counter, nodeId }`. All replicas sort by HLC. `hlc` is canonical for ordering; `at` (ISO timestamp) is retained for display only. Wall-clock-skew tolerant.
6. **HLC node ID** — generated once on first boot via `crypto.randomUUID()`, persisted at IDB key `kanvana:hlc:node`, never rotated.

### Event model

7. **Granularity: G1-refined** — coarse types with lean field payloads. `task.updated { fields: { title: "new" } }` carries only the changed fields. Multi-device convergence is preserved (concurrent updates to different fields each emit single-field events; both apply). Catalog stays small.
8. **Collection-op events stay as named events** because they carry per-item semantics: `subtask.added/removed/toggled/text_changed`, `relationship.added/removed`, `label.added_to_task/removed_from_task`.
9. **Catalog (~24 event types):**
   - Task: `task.created`, `task.updated`, `task.moved`, `task.deleted`
   - Subtask: `subtask.added`, `subtask.removed`, `subtask.toggled`, `subtask.text_changed`
   - Relationship: `relationship.added`, `relationship.removed`
   - Label-on-task: `label.added_to_task`, `label.removed_from_task`
   - Label entity: `label.created`, `label.updated`, `label.deleted`
   - Column: `column.created`, `column.updated`, `column.deleted`, `column.reordered`
   - Board: `board.created`, `board.updated`, `board.deleted`
   - Settings: `settings.updated` (per-board) and `settings.updated` with `scope: 'global'`
10. **Event envelope:**
    ```json
    {
      "id": "<uuid>",
      "type": "task.updated",
      "hlc": { "wallTime": 1748000000000, "counter": 0, "nodeId": "<uuid>" },
      "at": "2026-05-25T10:00:00Z",
      "actor": { "type": "human", "id": null },
      "scope": "board",
      "board_id": "<uuid>",
      "entity_id": "<uuid>",
      "payload": { "fields": { "title": "new" } }
    }
    ```
    PB `events` collection gains: `hlc` (JSON), `scope` (`'board' | 'global'`), `entity_id` (string, generalizes today's `task` relation), `board_id` made nullable for global-scoped events.
11. **Scope discrimination** — events are either `scope: 'board'` (carry `board_id`) or `scope: 'global'` (no board ref; for cross-device user-level settings).
12. **Pure-UI state is per-device, NOT synced** — collapsed columns, view toggles, theme, etc. Stays in separate IDB keys. Never enters the event stream.
13. **Global settings ARE synced** as `scope: 'global'` events. Pre-login global-setting changes stay local-only with `actor: { type: "human", id: null }`; on first successful login, all unsynced local events (board and global) flush to PB tagged with the now-known user.

### Reducer & projection

14. **Reducer is the sole writer of the read-model cache.** Feature modules emit events; they never mutate `tasks[]` / `columns[]` / `labels[]` directly. Reducer reads event, updates in-memory state, schedules IDB persist, emits `BOARD_CHANGED` / `DATA_CHANGED` for render.
15. **Idempotent by event UUID** — applying the same event twice is a no-op. Essential for replay safety and for SSE echo handling (PB broadcasts a device's own push back to it).
16. **`columnHistory[]` survives** as the sole reducer-maintained projection on the task row. `task.moved` events append to it. Reports (`reports.js` CFD, lead-time) keep reading it directly — **no report code changes**.
17. **Activity log feature dropped entirely from v1.** Removed: embedded `task.activityLog[]`, board event log (`events:{boardId}` IDB key, `activity.html` page, `activity-log.js`, `activity-log-ui.js`, the collapsible section in the task modal. **ADR-0001 is retired** (its dual-log rationale no longer applies). The event stream retains all info needed to reconstruct activity timelines if/when the feature returns.

### Delete semantics

18. **D1 — hard tombstone, post-delete edits dropped from projection.** `task.deleted` writes a tombstone marker. Later events referencing that task ID are still in the log but skipped during replay (the projection never resurrects the task).
19. **`softDeleteEnabled` retired; `pendingHardDeletes` queue removed; ADR-0002 superseded.** Both were workarounds for whole-record LWW that no longer apply under event sourcing.
20. **No undo, no trash UI** — delete is immediate and final from the user's POV. **Confirm dialog is the only safety net** (already in `dialog.js`). Recovery only via DB forensics during the window before snapshot GC.

### Ordering

21. **O-A — integer order, whole-column overwrite.** `task.moved` payload carries the full column ordering. Concurrent reorders: highest HLC wins. Lost-reorder is the accepted edge case for v1; same-column-reorder collisions are rare for single-user multi-device.

### Snapshots

22. **Snapshot trigger: T3 hybrid** — whichever comes first: **500 events since last snapshot** OR **14 days elapsed**. Thresholds are tunable.
23. **Snapshot computation: W1 client-side, race-on-write** — any device may snapshot; highest HLC wins; losers discarded post-upload. Backend stays a dumb row store. Mitigations:
    - **Jittered trigger** (random 0-60s delay when threshold crosses) to reduce simultaneous races
    - **Pre-flight check**: read server's latest snapshot HLC before computing; skip if already covered
    - **Arbitration**: client-side post-upload sweep deletes losing snapshots per board
24. **Snapshot scope** — per-board snapshots, plus a separate global-settings snapshot for the `scope: 'global'` stream.
25. **Snapshot payload** — full projected state at a given HLC, serialized as **gzipped JSON in a PB file field** (not a JSON column). Keeps the `snapshots` collection lean and handles large boards.
26. **Snapshot collection schema** — new PB collection `snapshots` with: `board_id` (nullable for global), `hlc` (JSON), `payload` (file), `owner`.
27. **GC: R2 — events older than the latest snapshot are deleted** (in both IDB and PB) once the snapshot is durably written and acknowledged.

### Migration

28. **M-B — snapshot-as-v0** — on first boot of the new version, existing IDB state becomes the v0 snapshot. No event backfill. The "past" is folded into the snapshot; the event log starts from migration time forward.
29. **Server-mediated migration flow:**
    1. Detect first-run-after-upgrade.
    2. Force a full pull from PB using the **existing** pre-migration sync code (works once more). If offline, abort with "go online first" prompt.
    3. Snapshot the freshly-pulled IDB state.
    4. Push the v0 snapshot to PB.
    5. Subsequent devices on upgrade: detect existing v0 snapshot in PB → hydrate from it → skip local snapshot.
    6. Offline-only-forever devices: skip pull step, snapshot local state, no race.
30. **Legacy PB collections (`tasks`, `columns`, `labels`, `task_relationships`) kept read-only through migration**, dropped in a follow-up backend migration after a ~30-day quiet period.
31. **`kanbanSyncMap` localStorage key removed post-migration** — local UUIDs are the only identity; events are upserts keyed by event UUID; no PB-side ID translation needed.

### Sync transport

32. **T-A — PocketBase SSE realtime subscriptions** for live push, plus **catch-up pull** on launch and after each reconnect.
    - On auth/login: subscribe to `events` collection filtered by owner (one subscription, not per-board).
    - Realtime apply: every received event passes through the same reducer as local events. Idempotent by UUID handles echo + duplicates for free.
    - Catch-up: on launch and reconnect, `events.list({ filter: 'hlc > lastSeenHlc' })` → replay → set `lastSeenHlc`.
33. **`lastSeenHlc` persisted in IDB** at key `kanvana:sync:lastSeenHlc` (per board, plus one for global scope).
34. **Per-device subscription is the user-owner filter only** for v1. Multi-user shared boards later expands the filter expression.

### Sync rejection & queue behavior

35. **R-A — never rollback.** Local events are immutable. If PB rejects, log is unchanged; retry with backoff. Local state remains correct because the event was already applied locally and is the source of truth.
36. **Per-event push with 500ms debounce** to batch rapid typing. Small in-flight cap (5 parallel requests). Pattern mirrors existing `autosync.js` 700ms debounce.
37. **Retry schedule (three-tier):**
    - Network failure: immediate retry on browser `online` event, then exponential backoff (5s, 30s, 5min, …).
    - Auth failure: pause sync queue, surface "log in again" UI, resume on `auth-changed`.
    - Permanent 4xx with no auth fix: log error, surface to user, very slow retry (~1h) in case it's transient.
38. **`synced: boolean` flag on every event row in IDB.** Sync worker queries `events where synced=false ORDER BY hlc ASC` and pushes in order. Order matters because of causal dependencies (`task.updated` requires prior `task.created`).
39. **Sync state UI indicator** in header: `Live ●` / `Syncing… (N)` / `⚠ N unsynced` / `Offline`. Single component, reuses existing auth/sync state plumbing.

---

## Critical files / modules to touch

This is a structural change. The PRD will enumerate precisely; this plan flags the surface.

**New code:**
- `client/src/modules/hlc.js` — HLC class (~50 LoC): generate, persist, advance on local event, observe on remote event.
- `client/src/modules/reducer.js` — single dispatcher: switch on `event.type`, mutate read-model cache, schedule IDB persist, emit `BOARD_CHANGED`/`DATA_CHANGED`.
- `client/src/modules/snapshot.js` — compute, upload, hydrate, GC; jittered trigger; pre-flight check; arbitration sweep.
- `client/src/modules/migration.js` — first-run-after-upgrade detection, full-pull + snapshot-v0 + push, legacy IDB cleanup.

**Extended:**
- `client/src/modules/events.js` — extend the existing 35-line EventTarget bus with: event-emission helpers (`emitTaskUpdated(taskId, fields)` etc.), the catalog enum, event-envelope builder, IDB persistence of the event log, sync worker hooks.
- `client/src/modules/sync.js`, `autosync.js` — replace whole-board push with event-queue drain. Add SSE subscribe + catch-up pull. Add `synced` flag handling. Add retry tiers + sync-state event emission.
- `client/src/modules/storage.js`, `idb-store.js` — add `events` and `snapshots` IDB stores. Migrate read-model functions to be reducer-managed. Add `lastSeenHlc` and `hlc:node` keys. Drop `pendingHardDeletes` queue.
- `client/src/modules/tasks.js`, `columns.js`, `labels.js`, `boards.js`, `settings.js` — feature modules stop mutating state directly. Every mutation becomes `emit*Event(...)` which writes to the event log and triggers reducer.
- `backend/pb_migrations/` — new migration: extend `events` collection (add `hlc`, `scope`, `entity_id`, make `board` nullable, generalize relations), add `snapshots` collection. Legacy collections marked read-only via API rule for the migration window.

**Removed:**
- `client/src/modules/activity-log.js`, `activity-log-ui.js`
- `client/src/activity.html` and its supporting page modules
- `task.activityLog[]` field from task projection
- `events:{boardId}` IDB key (board event log)
- `softDeleteEnabled` setting and all guards on it
- `pendingHardDeletes` IDB key and processing code
- `kanbanSyncMap` localStorage key (after migration)

**Updated documentation:**
- `CONTEXT.md` — §3 storage layer, §4 cloud sync, §5 event bus, §9 audit trail (delete or rewrite the audit-trail section), §8 architecture boundaries
- ADR-0001 retired (audit trail rationale obsolete)
- ADR-0002 superseded (soft-delete retired)
- New ADR — "Event-sourced sync with HLC ordering" capturing the architecture
- New ADR — "PocketBase as dumb event store; client-side snapshots and reducers"

---

## What this plan deliberately does NOT cover

Belongs in the follow-up PRD or specific ADRs, not the architectural plan:

- Exact HLC math, drift bounds, NTP sanity-check policy
- Reducer code structure (switch vs. handler map; pure functions vs. class)
- Sync queue concurrency limits, exact backoff curves
- PB API rule expressions for `events` and `snapshots` (owner-only for v1)
- IDB schema version bump path and migration code structure
- Backend Go cron job *(not needed under W1 — server stays dumb)*
- Test corpus design for divergence + reconvergence scenarios
- UI copy for sync-state indicator and "go online first" migration prompt
- Performance characterization of bootstrap-without-snapshot
- Multi-user/shared-board evolution (out of v1 scope; the foundation supports it without rewrite)

---

## Verification approach

When implementation begins (separately from this plan), success criteria are:

1. **Unit (Vitest)** — new suite under `client/tests/unit/event-sourcing/`:
   - Reducer correctness per event type (apply + replay idempotency)
   - HLC ordering: cross-device event interleaving produces deterministic projections
   - Delete-vs-edit race: D1 tombstone behavior
   - Snapshot round-trip: project → snapshot → hydrate → equal projection
2. **DOM integration (Vitest)** — feature modules emit events; reducer updates state; render triggers fire.
3. **API mocking (MSW)** — push/pull/SSE catch-up against a mock PB.
4. **E2E (Playwright)** — two browser contexts on a shared PB account: go offline on one, edit, come back online, assert the other context converges within a few seconds without manual intervention.
5. **Manual** — laptop + phone against staging PB. Mobile push → laptop sees within ~1s without focusing the tab. Offline-only-forever still functions with no PB connection.

---

## Next steps after this plan is approved

1. **Write the PRD** at `docs/temp/prd/PRD-event-sourced-sync.md` covering the items in "What this plan deliberately does NOT cover".
2. **Write the new ADRs** capturing the event-sourcing decision and the dumb-store backend decision; retire ADR-0001 and supersede ADR-0002.
3. **Break the PRD into vertical-slice issues** (via the `to-issues` skill).
4. **Update `CONTEXT.md`** to reflect the new domain model — events are the source of truth, projections are derived, audit log is removed.

The 39 locked decisions in this document are the contract. Implementation choices that conflict with any of them should come back to this plan for revision before proceeding.

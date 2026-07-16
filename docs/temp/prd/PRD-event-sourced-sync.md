# Product Requirement Document (PRD): Event-Sourced Multi-Device Sync

> Source plan: `../plans/2026-05-25-event-driven.md` (grill-with-docs session, 2026-05-25).
> Supersedes the LWW push/pull architecture defined in `PRD-online-mode-pocketbase-sync.md` and shipped as PR #89.

---

## 1. Problem Statement

Kanvana's current cloud sync (PR #89) is whole-record last-write-wins (LWW) push/pull against PocketBase. This is safe for a single device but unsafe for the product's primary multi-device workflow:

> A user moves between mobile and laptop. They edit a task on the phone in the morning. They open the laptop later — the change must appear without manual sync, and without any silent data loss.

Under whole-record LWW, two known failure modes break this:

- **Stale-state-overwrite.** Laptop opens with cached IDB state from before the phone's push. The user edits a different field on the laptop and pushes — overwriting the phone's earlier change.
- **Non-overlapping field collision.** Phone edits `title`; laptop edits `description`; whichever device pushes last overwrites the other's field, silently.

This PRD specifies the replacement: **pure event sourcing with Hybrid Logical Clock (HLC) ordering**, replicated through PocketBase as a dumb event store.

---

## 2. Scope

In scope:

- Replace the entity-row sync model with an event log as the absolute source of truth.
- Add HLC-based total event ordering across replicas.
- Add PocketBase realtime SSE subscriptions for live multi-device push.
- Add client-side snapshots with race-on-write reconciliation.
- Migrate existing installations via snapshot-as-v0.
- Retire `softDeleteEnabled`, `pendingHardDeletes`, and the activity-log feature.

Not in scope (v1):

- Multi-user shared boards (the foundation supports it; no UI or API changes here).
- Real-time collaborative text editing on `description`/`title` fields (Yjs-style co-editing).
- Server-side projection or business rules — PocketBase stays a dumb row store.
- A user-facing activity-log UI — dropped from v1. The event log retains all data needed to add it back later without schema change.
- Granular access-control lists.

---

## 3. Goals & Non-Goals

### Goals

1. **Multi-device convergence.** A user on mobile and laptop sees the same board state, with no lost field-level edits across non-overlapping mutations.
2. **"Immediately available" UX.** A change pushed from mobile appears on a logged-in, open laptop within ~1 second, without user action.
3. **Offline-only-forever stays first-class.** A user who never logs in must have full functionality. Every feature works without PocketBase.
4. **No rewrite for future multi-user.** The architecture extends to shared boards by widening API filter expressions, not by re-doing the sync layer.
5. **Easiest implementation possible** consistent with the above. (Working preference: [[simplicity-over-architectural-purity]].)

### Non-Goals

1. Preserving the activity-log UI in v1.
2. Preserving every concurrent-reorder intent (`O-A` accepts last-HLC-wins on column reorder collisions).
3. Server-side merge logic, projection logic, or business rules.
4. Snapshot retention as a recoverable user-facing trash.

---

## 4. Locked Architectural Decisions

The 39 decisions below are the contract for implementation. Any deviation must be approved against this PRD before proceeding.

### 4.1 Foundations

1. **One unified concept of "event."** Extend the existing `client/src/modules/events.js` (today a 35-line `EventTarget` bus) and the existing PocketBase `events` collection. No new vocabulary; no parallel naming.
2. **Event type names use `dotted.snake_case`** — `task.created`, `task.updated`, `label.added_to_task`. Consistent with existing catalog.
3. **Pure event sourcing (Option A).** The event log is the absolute, definitive source of truth. The IDB `kanbanBoard:{boardId}:tasks` / `:columns` / `:labels` keys become **read-model cache** maintained exclusively by the reducer. They are never mutated by feature modules directly. On boot: load latest snapshot → replay events since → render.
4. **Offline-only-forever is a first-class mode.** A user who never logs in must have full functionality. All reducer + snapshot logic runs client-side; PocketBase is optional fan-out.
5. **Hybrid Logical Clock (HLC) for total event ordering.** Every event carries `hlc: { wallTime, counter, nodeId }`. All replicas sort by HLC. `hlc` is canonical for ordering; `at` (ISO timestamp) is retained for display only. Wall-clock-skew tolerant.
6. **HLC node ID** generated once on first boot via `crypto.randomUUID()`, persisted at IDB key `kanvana:hlc:node`, never rotated.

### 4.2 Event Model

7. **Granularity: G1-refined.** Coarse types with lean field payloads. `task.updated { fields: { title: "new" } }` carries only the changed fields. Multi-device convergence is preserved (concurrent updates to different fields each emit single-field events; both apply).
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
11. **Scope discrimination.** Events are either `scope: 'board'` (carry `board_id`) or `scope: 'global'` (no board ref; for cross-device user-level settings).
12. **Pure-UI state is per-device, NOT synced.** Collapsed columns, view toggles, theme. Stays in separate IDB keys. Never enters the event stream.
13. **Global settings ARE synced** as `scope: 'global'` events. Pre-login global-setting changes stay local-only with `actor: { type: "human", id: null }`; on first successful login, all unsynced local events (board and global) flush to PB tagged with the now-known user.
**Board scaffolding & default-board convergence** (implementation of the above for #114):

- **Board creation emits scaffold events, not just `board.created`.** A new board's starter columns and labels are part of its initial state, so `createBoard()` emits `board.created` followed by one `column.created` per starter column and one `label.created` per starter label (each with the column's/label's `entity_id`). Without this, a board replayed on another device would arrive column-less.
- **The default ("first-run") board has a well-known stable id and deterministic scaffold ids.** Id `00000000-0000-4000-8000-000000000001`; its columns/labels use fixed UUIDs (`…010/011/012` for columns, `…020`–`…024` for labels). A stable board id alone is insufficient: with random column/label ids, two devices' independently-bootstrapped default boards merge to 6 columns / duplicated labels. Matching `entity_id`s let the reducer dedup (`applyColumnCreated`/`applyLabelCreated` are idempotent by `entity_id`) so the default board converges to 3 columns / 5 labels across devices.
- **Default-board demo tasks are local-only — NOT event-sourced.** They are first-run flavour with random ids that would duplicate on cross-device merge. User-created tasks emit `task.created` as normal; only the seeded demo tasks are excluded from the event stream.

### 4.3 Reducer & Projection

14. **Reducer is the sole writer of the read-model cache.** Feature modules emit events; they never mutate `tasks[]` / `columns[]` / `labels[]` directly. Reducer reads event, updates in-memory state, schedules IDB persist, emits `BOARD_CHANGED` / `DATA_CHANGED` for render.
15. **Idempotent by event UUID.** Applying the same event twice is a no-op. Essential for replay safety and for SSE echo handling (PB broadcasts a device's own push back to it).
16. **`columnHistory[]` survives** as the sole reducer-maintained projection on the task row. `task.moved` events append to it. Reports (`reports.js` CFD, lead-time) keep reading it directly — **no report code changes**.
17. **Activity log feature dropped entirely from v1.** Removed: embedded `task.activityLog[]`, board event log (`events:{boardId}` IDB key), `activity.html` page, `activity-log.js`, `activity-log-ui.js`, the collapsible section in the task modal. **ADR-0001 is retired** (its dual-log rationale no longer applies). The event stream retains all info needed to reconstruct activity timelines if/when the feature returns.

### 4.4 Delete Semantics

18. **D1 — hard tombstone, post-delete edits dropped from projection.** `task.deleted` writes a tombstone marker. Later events referencing that task ID are still in the log but skipped during replay (the projection never resurrects the task).
19. **`softDeleteEnabled` retired; `pendingHardDeletes` queue removed; ADR-0002 superseded.** Both were workarounds for whole-record LWW that no longer apply under event sourcing.
20. **No undo, no trash UI.** Delete is immediate and final from the user's POV. **Confirm dialog is the only safety net** (already in `dialog.js`). Recovery only via DB forensics during the window before snapshot GC.

### 4.5 Ordering

21. **O-A — integer order, whole-column overwrite.** `task.moved` payload carries the full column ordering. Concurrent reorders: highest HLC wins. Lost-reorder is the accepted edge case for v1; same-column-reorder collisions are rare for single-user multi-device.

### 4.6 Snapshots

22. **Snapshot trigger: T3 hybrid** — whichever comes first: **500 events since last snapshot** OR **14 days elapsed**. Thresholds are tunable.
23. **Snapshot computation: W1 client-side, race-on-write.** Any device may snapshot; highest HLC wins; losers discarded post-upload. Backend stays a dumb row store. Mitigations:
    - **Jittered trigger** (random 0–60s delay when threshold crosses) to reduce simultaneous races
    - **Pre-flight check**: read server's latest snapshot HLC before computing; skip if already covered
    - **Arbitration**: client-side post-upload sweep deletes losing snapshots per board
24. **Snapshot scope** — per-board snapshots, plus a separate global-settings snapshot for the `scope: 'global'` stream.
25. **Snapshot payload** — full projected state at a given HLC, serialized as **gzipped JSON in a PB file field** (not a JSON column). Keeps the `snapshots` collection lean and handles large boards.
26. **Snapshot collection schema** — new PB collection `snapshots` with: `board_id` (nullable for global), `hlc` (JSON), `payload` (file), `owner`.
27. **GC: R2 — events older than the latest snapshot are deleted** (in both IDB and PB) once the snapshot is durably written and acknowledged.

### 4.7 Migration

28. **M-B — snapshot-as-v0.** On first boot of the new version, existing IDB state becomes the v0 snapshot. No event backfill. The "past" is folded into the snapshot; the event log starts from migration time forward.
29. **Server-mediated migration flow:**
    1. Detect first-run-after-upgrade.
    2. Force a full pull from PB using the **existing** pre-migration sync code (works once more). If offline, abort with "go online first" prompt.
    3. Snapshot the freshly-pulled IDB state.
    4. Push the v0 snapshot to PB.
    5. Subsequent devices on upgrade: detect existing v0 snapshot in PB → hydrate from it → skip local snapshot.
    6. Offline-only-forever devices: skip pull step, snapshot local state, no race.
30. **Legacy PB collections (`tasks`, `columns`, `labels`, `task_relationships`) kept read-only through migration**, dropped in a follow-up backend migration after a ~30-day quiet period.
31. **`kanbanSyncMap` localStorage key removed post-migration.** Local UUIDs are the only identity; events are upserts keyed by event UUID; no PB-side ID translation needed.

### 4.8 Sync Transport

32. **T-A — PocketBase SSE realtime subscriptions** for live push, plus **catch-up pull** on launch and after each reconnect.
    - On auth/login: subscribe to `events` collection filtered by owner (one subscription, not per-board).
    - Realtime apply: every received event passes through the same reducer as local events. Idempotent by UUID handles echo + duplicates for free.
    - Catch-up: on launch and reconnect, `events.list({ filter: 'hlc > lastSeenHlc' })` → replay → set `lastSeenHlc`.
33. **`lastSeenHlc` persisted in IDB** at key `kanvana:sync:lastSeenHlc` (per board, plus one for global scope).
34. **Per-device subscription is the user-owner filter only** for v1. Multi-user shared boards later expands the filter expression.

### 4.9 Sync Rejection & Queue Behavior

35. **R-A — never rollback.** Local events are immutable. If PB rejects, log is unchanged; retry with backoff. Local state remains correct because the event was already applied locally and is the source of truth.
36. **Per-event push with 500ms debounce** to batch rapid typing. Small in-flight cap (5 parallel requests). Pattern mirrors existing `autosync.js` 700ms debounce.
37. **Retry schedule (three-tier):**
    - Network failure: immediate retry on browser `online` event, then exponential backoff (5s, 30s, 5min, …).
    - Auth failure: pause sync queue, surface "log in again" UI, resume on `auth-changed`.
    - Permanent 4xx with no auth fix: log error, surface to user, very slow retry (~1h) in case it's transient.
38. **`synced: boolean` flag on every event row in IDB.** Sync worker queries `events where synced=false ORDER BY hlc ASC` and pushes in order. Order matters because of causal dependencies (`task.updated` requires prior `task.created`).
39. **Sync state UI indicator** in header: `Live ●` / `Syncing… (N)` / `⚠ N unsynced` / `Offline`. Single component, reuses existing auth/sync state plumbing.

---

## 5. Implementation-Level Specifications

These items were deferred from the architectural plan to the PRD.

### 5.1 Hybrid Logical Clock (HLC) — math & drift handling

**Update rule on local event emission** (Kulkarni et al. 2014, simplified):

```
on emitLocal():
  pt = Date.now()
  if pt > hlc.wallTime:
    hlc.wallTime = pt
    hlc.counter = 0
  else:
    hlc.counter += 1
  return { wallTime: hlc.wallTime, counter: hlc.counter, nodeId: hlc.nodeId }
```

**Update rule on remote event observation:**

```
on observeRemote(remoteHlc):
  pt = Date.now()
  newWall = max(pt, hlc.wallTime, remoteHlc.wallTime)
  if newWall == hlc.wallTime == remoteHlc.wallTime:
    hlc.counter = max(hlc.counter, remoteHlc.counter) + 1
  else if newWall == hlc.wallTime:
    hlc.counter += 1
  else if newWall == remoteHlc.wallTime:
    hlc.counter = remoteHlc.counter + 1
  else:
    hlc.counter = 0
  hlc.wallTime = newWall
```

**Drift bound.** If `Date.now() - hlc.wallTime > MAX_DRIFT_MS` (default `60_000` ms), log a warning and accept the local wall time. We do NOT block; sync still works but ordering may surprise the user. A future enhancement could expose a "device clock is wrong" UI banner.

**No NTP integration** in v1. Device clock is trusted. Browsers without accurate clocks (rare) may produce surprising ordering, accepted risk.

**Counter overflow.** `counter` is a 32-bit integer; resets when `wallTime` advances by ≥ 1 ms. Effective ceiling is far above any plausible event rate.

**Sort comparator:**

```js
function compareHlc(a, b) {
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}
```

### 5.2 Reducer Code Structure

**Handler map**, not a giant switch:

```js
// client/src/modules/reducer.js
const handlers = {
  'task.created': applyTaskCreated,
  'task.updated': applyTaskUpdated,
  'task.moved': applyTaskMoved,
  'task.deleted': applyTaskDeleted,
  // …~24 entries total
};

export function applyEvent(state, event) {
  if (state.appliedEventIds.has(event.id)) return state;  // idempotency guard
  const handler = handlers[event.type];
  if (!handler) {
    console.warn(`Unknown event type: ${event.type}`); // forward-compat: skip
    return state;
  }
  const nextState = handler(state, event);
  nextState.appliedEventIds.add(event.id);
  return nextState;
}
```

**Pure functions, returns next state.** Reducer mutations to in-memory state are encapsulated; `schedulePersist()` + event-bus `emit(DATA_CHANGED)` happen in the outer dispatcher, not in handlers.

**Tombstone tracking:** the state carries a `Set<taskId>` of deleted task IDs. `applyTaskUpdated`, `applyTaskMoved`, etc., skip if the task ID is tombstoned. `applyTaskCreated` for an already-tombstoned ID is a no-op (D1 semantics).

### 5.3 Sync Queue Concurrency & Backoff

**Per-event push, in-flight cap of 5.** A simple semaphore. Events drain from `events where synced=false ORDER BY hlc ASC` in chunks of 5.

**Debounce:** 500ms after the last local event before draining starts (collects rapid typing into one batch of network round-trips).

**Backoff (network errors):** `5s, 30s, 2min, 5min, 5min, …` capped at 5 minutes. Reset on success. Browser `online` event triggers immediate drain attempt regardless of backoff timer.

**Backoff (auth errors):** pause completely; resume only on `auth-changed` event.

**Backoff (permanent 4xx):** retry every 1 hour. Log to console. Surface in the sync indicator as `⚠ N unsynced`.

### 5.4 PocketBase API Rules

Owner-only access for v1. Anchored on the existing `owner = @request.auth.id` pattern from current collections.

**`events` collection:**

```
List/View:   @request.auth.id != "" && owner = @request.auth.id
Create:      @request.auth.id != "" && owner = @request.auth.id
Update:      null    (events are immutable; updates forbidden)
Delete:      @request.auth.id != "" && owner = @request.auth.id  (for GC after snapshot)
```

**`snapshots` collection:**

```
List/View:   @request.auth.id != "" && owner = @request.auth.id
Create:      @request.auth.id != "" && owner = @request.auth.id
Update:      null    (snapshots are immutable; new snapshots are inserts)
Delete:      @request.auth.id != "" && owner = @request.auth.id  (arbitration sweep)
```

**Legacy collections (`tasks`, `columns`, `labels`, `task_relationships`) during migration window:**

```
List/View:   @request.auth.id != "" && owner = @request.auth.id  (unchanged — still readable)
Create:      null    (writes disabled)
Update:      null
Delete:      null
```

After the ~30-day quiet period, legacy collections are dropped entirely via a follow-up migration.

### 5.5 IDB Schema Version Bump

Current: `kanvana-db` version 1, single `kv` object store.

New: `kanvana-db` version 2, multiple stores:

| Store | Key | Notes |
|---|---|---|
| `kv` | string | Preserved for non-event state (active board ID, board list, global UI prefs) |
| `events` | event UUID | Indexed by `hlc` (composite: wallTime, counter, nodeId) and `synced` (boolean) |
| `snapshots` | board ID (or `'__global__'`) | Latest snapshot per scope; older snapshots overwritten locally |
| `read_model` | board ID + entity kind (e.g., `"<boardId>:tasks"`) | Reducer-maintained projection cache |

**Migration on first open of v2:**

1. Open as v1 read-only, copy existing keys forward.
2. The `kanvana:hlc:node` key is created if absent.
3. Existing `kanbanBoard:{id}:tasks` etc. keys are migrated to the new `read_model` store (rekey, same shape).
4. `pendingHardDeletes` and `events:{boardId}` keys are deleted.
5. `kanbanSyncMap` localStorage key is left in place until post-migration confirmation (see §4.7 #31), then cleared.

### 5.6 Test Corpus Design

**Unit suite — `client/tests/unit/event-sourcing/`:**

- `hlc.test.js` — HLC update rules, drift bound warnings, comparator transitivity.
- `reducer.test.js` — per-event-type handler correctness; idempotency (apply same event twice = no change after first apply); tombstone gating.
- `convergence.test.js` — given two devices with the same set of events in any order, projections are equal (HLC sort determinism).
- `delete-vs-edit.test.js` — D1 tombstone behavior across all entity types.
- `snapshot.test.js` — project → snapshot → hydrate → equal projection round-trip; race-on-write arbitration.

**Integration suite — `client/tests/dom/event-sourcing/`:**

- `feature-modules-emit-events.test.js` — `tasks.js`, `columns.js`, etc. emit the expected event sequence on each public mutation function.
- `render-triggers.test.js` — reducer-applied events fire `BOARD_CHANGED` / `DATA_CHANGED`; renderer responds.

**MSW suite — `client/tests/mocks/event-sourcing/`:**

- `push-pull-sse.test.js` — push-debounce-batch behavior; catch-up pull on launch; SSE event reception; retry tier transitions.

**E2E suite — `client/tests/e2e/event-sourcing/`:**

- `two-context-convergence.spec.ts` — two Playwright browser contexts on the same PB account, one goes offline + edits + comes online; assert the other context converges within 3 seconds.
- `offline-only-forever.spec.ts` — full feature parity without ever logging in.

### 5.7 UI Copy

**Sync indicator (header):**

- `Live ●` (green) — subscription active, no unsynced events
- `Syncing… (N)` (yellow) — N events draining
- `⚠ N unsynced` (orange) — events stuck, retrying
- `Offline` (gray) — no network

**Migration prompt** (shown if device is offline at migration time):

> Title: **Go online to upgrade**
> Body: Kanvana has a new sync engine that needs to connect to the sync server once to upgrade your boards. Please go online and click `Go Online` in the header. Your boards will stay safe — nothing is changed until the upgrade completes.

**Delete confirmation** (extends existing `confirmDialog`):

> Title: **Delete task?**
> Body: This will permanently delete the task. There is no undo.

### 5.8 Bootstrap-Without-Snapshot Performance

For a board that has never been snapshotted (edge case: brand-new device hitting a board that hasn't crossed a snapshot threshold yet), bootstrap = replay all events from `hlc 0`.

**Expected scale:** typical Kanvana board ~200 tasks, ~30 events per task over its lifetime = ~6000 events. Reducer processes ~10k events/sec → <1 second bootstrap. Acceptable.

**Pathological scale:** 10k-task board with full history = ~300k events → ~30 second bootstrap. Mitigation: snapshot trigger (#22) ensures this is rare; if encountered, snapshot immediately on first apply and serve from snapshot thereafter.

---

## 6. User-Facing Behavior Changes

| Today | After this PRD |
|---|---|
| Activity tab in header; click to see board events | Activity tab removed |
| Collapsible activity log in task modal | Section removed |
| Global setting: "Enable soft delete" | Setting removed |
| Delete task: immediate purge (or soft-delete if enabled) | Confirm dialog → immediate purge; no soft-delete option |
| Sync button + "Last synced HH:MM" | Sync state indicator (`Live ● / Syncing… / ⚠ unsynced / Offline`) |
| Mobile change → laptop sees on tab focus (or never if tab is open) | Mobile change → laptop sees within ~1 second automatically |
| Concurrent edit on different fields → one wins | Both survive |
| Concurrent edit on same field → one wins | One wins by HLC (same outcome; deterministic) |
| Concurrent column reorder → one wins | One wins by HLC (unchanged) |

---

## 7. Backend Schema Changes

**Extend `events` collection** (existing):

| Field | Change |
|---|---|
| `hlc` | NEW — JSON `{ wallTime: number, counter: number, nodeId: string }` |
| `scope` | NEW — string enum `'board' \| 'global'` |
| `entity_id` | NEW — string; generalizes the existing `task` relation to any entity kind |
| `board` | CHANGED — relation → optional **TEXT** holding the local board UUID. Under pure event sourcing the board ref is a client-generated UUID, never a PB `boards` record id, so a relation field would reject every board-scoped push. Holds the board UUID for `scope: 'board'`, empty for `scope: 'global'`. (Migration `1746100010` drops the relation and re-adds `board` as TEXT — PB forbids in-place type changes.) |
| `type` | UNCHANGED — string |
| `at` | UNCHANGED — datetime |
| `actor_type`, `actor_id` | UNCHANGED |
| `details` (JSON) | RENAMED → `payload` for clarity; same shape: `{ fields: {...} }` for `task.updated`, etc. |
| `local_id` | UNCHANGED — event UUID (also the dedup key) |
| `owner` | UNCHANGED — relation to users |
| `task` (relation) | REMOVED — replaced by `entity_id` string |

**New `snapshots` collection:**

| Field | Type | Notes |
|---|---|---|
| `id` | auto | PB record id |
| `local_id` | string | Snapshot UUID (client-generated) |
| `board_id` | string | Nullable for global snapshots |
| `hlc` | JSON | The HLC frontier the snapshot represents |
| `payload` | file | Gzipped JSON of projected state |
| `owner` | relation | PB user |

**Legacy collections during migration window:** `tasks`, `columns`, `labels`, `task_relationships` — read-only via API rules (§5.4). Dropped in a follow-up migration after ~30 days.

**Migration file:** `backend/pb_migrations/<timestamp>_event_sourced_schema.js` — adds new fields, creates `snapshots`, locks legacy collections.

---

## 8. Implementation Phases (Vertical Slices)

The work will be broken into independently-mergeable slices via the `to-issues` skill. Suggested ordering:

1. **HLC module + IDB schema v2** — no behavioral change yet, just foundation.
2. **Reducer + event-emission helpers** — feature modules switch from direct mutation to emit-and-reduce. App still works fully offline.
3. **Snapshot module + GC** — client-side snapshots wired into IDB.
4. **PB schema migration + event push** — events flow to PB on local mutation. Pull still uses old code.
5. **SSE catch-up pull + subscription** — full multi-device sync live.
6. **Activity-log feature removal + ADR-0001 retirement** — UI cleanup pass.
7. **`softDeleteEnabled` removal + ADR-0002 supersession + migration code.**
8. **Sync state indicator + UI copy + delete confirmation polish.**

Each phase ships independently and leaves the app usable.

---

## 9. Verification & Acceptance Criteria

### 9.1 Test gates

- All unit, DOM, MSW, and E2E suites pass on every PR (existing CI).
- New event-sourcing test suite (§5.6) added and passing.

### 9.2 Manual acceptance criteria

1. **Multi-device convergence.** On two devices logged into the same account: edit different fields of the same task on each; reconverge → both fields survive.
2. **Realtime push.** Mobile push → laptop with the board open sees the change within 3 seconds, no user action required.
3. **Offline-only-forever.** Fresh browser context, never log in: every feature works; quitting and reopening preserves all data.
4. **Migration.** Existing PR-#89 install upgrades to event-sourced version: all boards/tasks/labels intact; no data loss reported.
5. **Delete safety.** Delete a task with no other devices online; reopen on a second device; task stays deleted.
6. **Snapshot GC.** After 500+ events, snapshot fires; older events removed from IDB and PB.

### 9.3 Telemetry to capture (post-launch monitoring)

- Sync queue depth distribution (alerts if any user has > 100 unsynced events for > 1 hour).
- Snapshot computation rate per board (sanity-check the T3 thresholds).
- SSE disconnect/reconnect rate (sanity-check transport health).
- Migration completion rate (any users stuck in migration).

---

## 10. Documentation & ADR Updates

- **New ADR** — `docs/adr/0004-event-sourced-sync.md`: "Event-sourced sync with HLC ordering replaces whole-record LWW."
- **New ADR** — `docs/adr/0005-pocketbase-dumb-event-store.md`: "PocketBase stays a dumb row store; reducers and snapshots are client-side."
- **ADR-0001 retired.** Append a frontmatter note: `status: superseded by 0004; the dual-log audit-trail rationale no longer applies — both consumers (Task Activity Log, Board Event Log) are removed in v1.`
- **ADR-0002 superseded by ADR-0004.** Append a note: `softDeleteEnabled and the pendingHardDeletes queue removed. Delete becomes a hard tombstone (D1) in the event log; confirm dialog is the only safety net.`
- **`CONTEXT.md` updates:** §3 (storage layer — new IDB stores), §4 (cloud sync — events not rows), §5 (event bus — now also the event-sourcing emitter), §8 (architecture boundaries — reducer is sole writer of read-model), §9 (audit trail — entire section removed or replaced).

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration loses data when device is offline at upgrade time | Medium | High | Force pre-migration full pull (§4.7 #29); abort with prompt if offline |
| Snapshot race produces inconsistent projection | Low | Medium | Pre-flight check + jittered trigger + arbitration sweep (§4.6 #23) |
| Reducer bug corrupts projection | Medium | High | Comprehensive unit tests; replay-from-snapshot is recoverable; surface "rebuild from snapshot" as a debug action |
| HLC clock skew >60s causes confusing ordering | Low | Low | Drift warning logged; multi-device single-user is more forgiving than multi-user |
| SSE connection burns mobile battery | Low | Low | PB SDK manages connection lifecycle; browser backgrounds the tab → connection pauses |
| Activity-log removal breaks existing user workflows | Low | Low | Feature was visible but lightly used; data preserved in event stream for future restoration |
| Bootstrap time pathological on huge boards | Low | Low | Snapshot threshold (§4.6 #22) caps the replay window; performance characterized in §5.8 |
| Legacy PB collections drop premature | Low | High | 30-day quiet period; collection drop is a separate migration with operator review |

---

## 12. Open Questions (to resolve in implementation)

None blocking. All architectural forks resolved in the grill-with-docs session of 2026-05-25.

The following implementation-detail choices are owner's discretion within the constraints set by this PRD:

- Exact location and styling of the sync state indicator
- Whether to ship a debug "Rebuild from snapshot" action in v1
- Exact wording of toast/dialog copy beyond what §5.7 specifies
- Whether to add structured logging for sync events

---

## 13. References

- Plan file (source of decisions): `~/.claude/plans/vast-snacking-mountain.md`
- Predecessor PRD: `docs/temp/prd/PRD-online-mode-pocketbase-sync.md` (PR #89)
- HLC paper: Kulkarni, Demirbas, Madappa, Avva, Leone. *Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases* (2014).
- Existing ADRs: `docs/adr/0001-two-log-audit-trail.md` (to retire), `docs/adr/0002-permanent-delete-default-soft-delete-opt-in.md` (to supersede), `docs/adr/0003-global-settings-layer.md` (compatible).

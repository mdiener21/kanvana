# Event-sourced sync with HLC ordering replaces whole-record LWW

**Status: accepted** (issues #110–#115, branch `feature-event-driven`)

Supersedes [ADR-0001](0001-two-log-audit-trail.md) and [ADR-0002](0002-permanent-delete-default-soft-delete-opt-in.md).

Kanvana's multi-device sync is **pure event sourcing**. Every domain mutation is recorded as an
immutable event ordered by a Hybrid Logical Clock (HLC); the tasks, columns, and labels held in
IndexedDB are reducer-maintained **projections** rebuilt from the event stream. PocketBase is an
optional fan-out, not a dependency — offline-only-forever remains a first-class mode.

This replaces the previous whole-record last-write-wins (LWW) push/pull sync (PR #89), in which a
device pushed entire board records to PocketBase and pulled them back. The dominant failure of that
model was **stale-state-overwrite**: a just-opened device pushing its old state would clobber newer
edits made elsewhere, and non-overlapping field edits on two devices would overwrite each other.

## Considered Options

**Whole-record LWW (previous behaviour).** Push/pull full board records, last writer wins per record.
Rejected: unsafe for multi-device single-user — the primary use case is "edit on mobile, see it on
laptop immediately", and LWW silently loses edits when a stale device pushes.

**CRDT (e.g. Yjs/Automerge).** Conflict-free replicated data types give automatic merge. Rejected:
heavy dependency and conceptual overhead for an app where concurrent edits to the *same* task across
a single user's devices are rare; the real problem is ordering, not field-level merge. (See the
CRDT spike under `docs/temp/plan/crdt-explore/`.)

**Pure event sourcing with HLC ordering (chosen).** Events are the source of truth; an HLC gives a
total order across replicas without a central clock; reducers fold events into the read model. Solves
stale-overwrite (events are append-only, never overwrite) and gives a free audit stream for any future
audit UI, all with no third-party CRDT dependency.

## Decision details

- **Events are canonical; projections are derived.** `~24` event types (G1 granularity) cover task,
  column, label, board, settings, subtask, and relationship mutations. The reducer is the **sole
  writer** of the IDB read model. Feature modules emit events; they never write projections directly.
- **HLC total ordering.** Each event carries an HLC stamp (wall clock + logical counter + node id).
  The reducer re-sorts by HLC on replay, so **server insertion order is irrelevant**.
- **PocketBase as a dumb event store.** PB holds an extended `events` collection (`hlc`, `scope`,
  `entity_id`, text `board`, `payload`, immutable updates) plus a `snapshots` collection. It runs no
  business logic — no server-side projector. `events.board` is **TEXT** (a client-side local UUID,
  not a relation), so board-scoped events validate on PocketBase v0.38.1.
- **Client-side snapshots (W1).** Snapshots are computed on the client and uploaded (race-on-write);
  old events are GC'd locally and on PB after each snapshot. Chosen over a server-side projector (W3)
  for simplicity.
- **Realtime via SSE.** A PocketBase Server-Sent-Events subscription applies remote events live; a
  launch/reconnect **catch-up pull** converges a just-opened device. PB is optional — without an
  account nothing leaves the browser.
- **Delete is a hard tombstone (D1).** A `task.deleted` event is the only delete path; the reducer
  propagates it. The confirm dialog is the only safety net. This is why ADR-0002's `softDeleteEnabled`
  / `pendingHardDeletes` / purge machinery was removed.
- **Migration is snapshot-as-v0 (M-B), server-mediated.** Existing PR-#89 LWW data is captured as an
  initial snapshot rather than backfilled into individual events.

## Consequences

- **Audit-log feature dropped (v1).** The two-log audit trail (ADR-0001) is removed — both consumers
  (per-task Activity Log, Board Event page) are gone. The data it surfaced now lives implicitly in the
  event stream, available to a future audit UI without a separate write path. See the retired
  `docs/spec/audit-trail.md`.
- **Soft-delete removed (ADR-0002 superseded).** No `softDeleteEnabled` toggle, no purge flow; delete
  is permanent via tombstone event.
- **New IDB stores (v2):** `events`, `snapshots`, and reducer read-model stores, alongside the HLC's
  persisted node id.
- **Offline-first is non-negotiable.** Any change that makes a server connection mandatory is out of
  scope by design.
- **Header sync-state indicator (#115)** replaces the manual Sync button; it derives `Live` /
  `Syncing… (N)` / `⚠ N unsynced` / `Offline` from queue depth, retry/pause state, and auth/online
  status.
- **Legacy PocketBase collections** are locked read-only and scheduled for removal after a 30-day quiet
  period (issue #116).

## References

- Plan: `docs/plans/2026-05-25-event-driven.md`
- PRD: `docs/temp/prd/PRD-event-sourced-sync.md`
- Backend schema/sync spec: `docs/spec/backend-storage-pb.md`

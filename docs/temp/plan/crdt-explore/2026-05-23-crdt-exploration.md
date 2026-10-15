# CRDT Offline-First Sync — Research Spike & Recommendation

## Context

Kanvana is local-first with IndexedDB as the per-device source of truth and optional PocketBase push/pull. The current sync model (PR #89, 9 phases) is **last-write-wins (LWW) on whole records**, with integer `order` fields, optional task soft-delete (default off), and no merge logic — pulls overwrite, pushes overwrite. This works for a single device but is unsafe for the target use case: **the same user, working offline on multiple devices (e.g. laptop + phone), reconnecting and expecting nothing to be silently lost**.

CRDT-based systems would give us: no lost updates, automatic convergence, no manual conflict UI, partition tolerance, and no leader/lock coordination. This document is a **research spike** — it surveys what concurrent edits actually look like for our domain, compares three approaches, and recommends one. No implementation steps yet; the recommendation should feed a follow-up PRD/ADR.

Out of scope for this spike: multi-user/shared boards, real-time collaboration, and server-side merging logic (PocketBase stays a dumb store).

---

## What concurrent multi-device editing actually looks like in Kanvana

Given the entity model (see `CONTEXT.md`, `client/src/modules/storage.js`, `backend/pb_migrations/`), the realistic concurrent-edit scenarios for one user across two devices are:

| Scenario | Today's behavior | Risk |
|---|---|---|
| Edit `title` on A, edit `description` on B | Whichever pushes last overwrites the other field | **Lost update** — high-likelihood, high-pain |
| Drag task to new column on A, edit title on B | Whole-task LWW; one side's change vanishes | Lost update |
| Reorder column on A and B differently | Integer `order` LWW; one ordering wins, no preservation of intent | Surprise, but recoverable |
| Add label `urgent` on A, remove label `urgent` on B | Whole-record LWW on `labels[]` | Toggle race; lost update |
| Add subtask on A, add different subtask on B | `sub_tasks` JSON LWW | **One subtask silently disappears** |
| Delete task on A, edit on B (soft-delete off) | Delete wins on next sync; edit is lost without trace | Lost update + lost history |
| Append activity log entries on A and B | Already append-only by UUID — safe | None |

The dominant failure modes are: **field-level lost updates, set-membership races (labels, subtasks), and ordering collisions**. These are exactly the cases CRDTs handle, but each requires a different CRDT shape — there is no single "CRDT-ify the app" knob.

---

## Three approaches, compared

### A. Hardened LWW with HLC + fractional indexing (CRDT-adjacent, not strictly CRDT)

Keep the current schema, but:
- Replace wall-clock `updated` with a **Hybrid Logical Clock** per device — gives a total order that respects causality and survives clock skew.
- Replace whole-record LWW with **per-field LWW-Register** (each scalar field carries its own HLC). Concurrent edits to different fields both survive.
- Replace integer `order` with **fractional indexing** (e.g. `fractional-indexing` npm pkg) so concurrent reorders both apply without collisions.
- Retain tombstones for all entity types (today only tasks have them, opt-in).
- Track an **operation log** per device (append-only), sync the log, apply ops idempotently.

**Pros:** Smallest change to schema and mental model. PocketBase stays a dumb row store. Per-field LWW fixes most real-world cases. Familiar to debug.
**Cons:** Set semantics (labels, subtasks) still race unless we model them as OR-Sets — at which point we're doing CRDTs anyway. Not strictly CRDT, so no formal convergence proof, but practically equivalent for our shape.

### B. Per-entity hand-rolled CRDTs

Pick the right CRDT per field:
- Scalar fields (`title`, `description`, `priority`, `dueDate`) → **LWW-Register** with HLC.
- `labels[]` → **OR-Set** (add-wins) keyed by labelId + add-op-id.
- `sub_tasks[]` → **OR-Set or list CRDT** depending on whether order matters.
- Column/task `order` → **fractional indexing** (logically a degenerate list CRDT) or full RGA.
- Deletes → tombstones in the entity itself; never reclaim IDs.
- Operation log per device, exchanged via PocketBase.

**Pros:** Strict convergence guarantees, fine-grained correctness. Schema stays human-readable. No big dependency.
**Cons:** Significant net-new code (CRDT implementations, op-log replay, garbage collection). Every new field requires a CRDT-type decision. Easy to get subtle bugs without a test corpus.

### C. Adopt Yjs (or Automerge) wholesale

Model each board as a single **Y.Doc** (a `Y.Map` of columns, each containing a `Y.Array` of task references; tasks as `Y.Map`s). Persist with `y-indexeddb`. Sync via a custom PocketBase provider that exchanges Yjs update blobs (binary patches) as opaque rows.

**Pros:** Battle-tested CRDTs (used by Notion-likes, Figma-likes). Full multi-device convergence essentially "for free". Future-proof for real-time collab if scope ever widens. Active ecosystem; y-indexeddb already solves the local persistence story.
**Cons:** Largest rewrite — `storage.js`, `idb-store.js`, every entity module, `board-serializer.js`, and the entire sync layer touch Yjs. Querying/reporting (CFD, lead-time from `columnHistory`) needs adapters since Yjs docs aren't directly queryable like rows. Migration of existing IDB data is non-trivial. PocketBase becomes a blob store, losing the human-readable row inspection we have today. Bundle size + learning curve.

---

## Recommendation

**Go with A (Hardened LWW + HLC + fractional indexing), with OR-Set semantics layered onto `labels[]` and `sub_tasks[]`.** In other words: not a full CRDT runtime, but adopt the specific CRDT primitives that fix our actual failure modes.

Reasoning:
1. The driver is **multi-device single-user**, not real-time collab. We don't need character-level OT/CRDT on text; per-field LWW with HLC is sufficient — concurrent edits to *different* fields of the same task is the dominant case, and HLC-keyed per-field LWW solves it.
2. Yjs (option C) is overkill for single-user multi-device and would force a rewrite of the row-based storage and query model that supports our reports (CFD, lead-time, calendar, activity views). Those features lean heavily on `columnHistory` and `activityLog` being inspectable rows, not opaque CRDT blobs.
3. Option B's pure hand-rolled CRDTs add cost (full op-log + GC) without much benefit over A for our scenarios. The two genuine set fields (`labels`, `sub_tasks`) are the only places where A is insufficient — those get OR-Set treatment specifically.
4. Activity log is already CRDT-shaped (append-only with UUID dedup); reuse it as the operation log substrate where possible.
5. PocketBase stays a dumb row store with one new field per entity (`hlc` or per-field HLC map), preserving inspectability and the existing migration path.

**Things to nail down in the follow-up PRD/ADR (not in this spike):**
- HLC implementation (likely `@evan-bright/hlc` or hand-rolled — ~50 LoC).
- Fractional indexing library choice and rebalance strategy (we already have a `done` column constraint to preserve).
- Per-field-HLC storage shape — fat record vs. side table.
- Tombstone retention/GC policy across all entity types (today only `tasks` have it).
- Operation-log vs. state-based sync — likely **state-based with HLC vector** is simplest given PocketBase's REST shape.
- Migration from existing integer `order` and single `updated` timestamps.
- Test corpus: a Vitest harness that simulates two-device divergence + reconvergence, asserting no field loss.

---

## Critical files / modules a future implementation would touch

- `client/src/modules/sync.js`, `autosync.js` — replace whole-record LWW with per-field merge; introduce HLC into push/pull.
- `client/src/modules/storage.js`, `idb-store.js`, `board-serializer.js` — embed HLC + tombstones; extend schema for per-field clocks.
- `client/src/modules/tasks.js`, `columns.js`, `labels.js` — mutation helpers tick the HLC and write per-field.
- `client/src/modules/drag-drop/` (and column reorder) — switch integer rank to fractional indexing.
- `backend/pb_migrations/` — add HLC field(s) per collection; widen `order` to string for fractional indexing.
- `docs/adr/` — record the HLC + per-field LWW + OR-Set decision; supersede the LWW-on-whole-record implicit decision.

## Verification (for the future implementation, not this spike)

- New Vitest suite under `client/tests/unit/sync-crdt/` simulating: edit-different-fields, concurrent reorders, label add/remove race, subtask add/add, delete-vs-edit. Each asserts post-merge state preserves both sides where the CRDT promises it.
- E2E Playwright test driving two browser contexts against a shared PocketBase, going offline/online, asserting convergence.
- Manual: laptop + phone against a staging PocketBase, exercise the scenarios in the table above.

## Deliverable status

This file *is* the research spike. The next step (if you accept the recommendation) is a PRD under `docs/temp/prd/` and an ADR in `docs/adr/` capturing the HLC + per-field-LWW + OR-Set + fractional-indexing decision — not implementation yet.

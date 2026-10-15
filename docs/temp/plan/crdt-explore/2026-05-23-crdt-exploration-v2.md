# CRDT Offline-First Sync — Research Spike & Recommendation (Revised)

## Context

Kanvana is local-first with IndexedDB as the per-device source of truth and optional PocketBase push/pull. The current sync model (PR #89, 9 phases) is **last-write-wins (LWW) on whole records**, with integer `order` fields, optional task soft-delete (default off), and no merge logic — pulls overwrite, pushes overwrite. This works for a single device but is unsafe for the target use case: **the same user, working offline on multiple devices (e.g. laptop + phone), reconnecting and expecting nothing to be silently lost**.

CRDT-based systems would give us: no lost updates, automatic convergence, no manual conflict UI, partition tolerance, and no leader/lock coordination. This document is a **research spike** — it surveys what concurrent edits actually look like for our domain, compares three approaches, and recommends one. No implementation steps yet; the recommendation should feed a follow-up PRD/ADR.

Out of scope for this spike: multi-user/shared boards, real-time collaboration, and server-side merging logic.

---

## What concurrent multi-device editing actually looks like in Kanvana

Given the entity model, the realistic concurrent-edit scenarios for one user across two devices are:

| Scenario | Today's behavior | Risk |
|---|---|---|
| Edit `title` on A, edit `description` on B | Whichever pushes last overwrites the other field | **Lost update** — high-likelihood, high-pain |
| Drag task to new column on A, edit title on B | Whole-task LWW; one side's change vanishes | Lost update |
| Reorder column on A and B differently | Integer `order` LWW; one ordering wins, no preservation of intent | Surprise, but recoverable |
| Add label `urgent` on A, remove label `urgent` on B | Whole-record LWW on `labels[]` | Toggle race; lost update |
| Add subtask on A, add different subtask on B | `sub_tasks` JSON LWW | **One subtask silently disappears** |
| Delete task on A, edit on B (soft-delete off) | Delete wins on next sync; edit is lost without trace | Lost update + lost history |
| Append activity log entries on A and B | Already append-only by UUID — safe | None |

The dominant failure modes are: **field-level lost updates, set-membership races (labels, subtasks), and ordering collisions**. 

---

## Three approaches, compared

### A. Hardened LWW with HLC + fractional indexing (Recommended)

Keep the current schema, but:
- Replace wall-clock `updated` with a **Hybrid Logical Clock (HLC)** per device — gives a total order that respects causality and survives clock skew.
- Replace whole-record LWW with **per-field LWW-Register**. Concurrent edits to different fields both survive. Clocks are stored in a single JSON "fat column" (e.g., `_clocks`) to keep PocketBase queries fast without JOINs.
- Replace integer `order` with **fractional indexing** (e.g. Lexorank) so concurrent reorders apply safely. Client rebalancing is banned; PocketBase handles all rebalancing centrally.
- Use **LWW-Element-Sets** for arrays like `labels[]` (tracking `[LabelID, HLC, is_deleted]`) instead of heavier OR-Sets to prevent JSON payload bloat.
- Enforce **Optimistic Concurrency Control (OCC)** at the network edge to prevent simultaneous HTTP push race conditions.

**Pros:** Smallest change to schema and mental model. PocketBase stays a fast row store. Fixes all real-world single-user scenarios.
**Cons:** Requires careful boundary management (OCC) between client and server. 

### B. Per-entity hand-rolled CRDTs

Pick the right CRDT per field (LWW-Register for scalars, full OR-Sets for arrays, RGA for order).
**Pros:** Strict convergence guarantees, fine-grained correctness.
**Cons:** Significant net-new code (CRDT implementations, op-log replay, garbage collection). Every new field requires a CRDT-type decision. High risk of tombstone bloat across devices.

### C. Adopt Yjs (or Automerge) wholesale

Model each board as a single **Y.Doc**. Persist with `y-indexeddb`. Sync via a custom PocketBase provider that exchanges Yjs update blobs (binary patches) as opaque rows.
**Pros:** Battle-tested CRDTs. Full multi-device convergence essentially "for free". 
**Cons:** Largest rewrite. Destroys the row-based storage and query model that supports our reports (CFD, lead-time, calendar views). PocketBase becomes an unreadable blob store. Overkill for single-user scenarios.

---

## Recommendation

**Go with A (Hardened LWW + HLC + fractional indexing), enhanced with LWW-Element-Sets, OCC, and Fat-Record Clock Storage.** Reasoning & Architectural Guardrails:
1. **Multi-device single-user focus:** We don't need real-time character-level OT/CRDT. Per-field LWW with HLC solves the dominant case (concurrent edits to *different* fields).
2. **Preserve Analytics:** Yjs (Option C) would force a rewrite of our reporting layer. Option A keeps PocketBase a readable row store, preserving `columnHistory` and `activityLog` queries.
3. **The "Dumb Store" Race Condition Fix:** PocketBase cannot be 100% dumb during state-based sync. We must implement **Optimistic Concurrency Control (OCC)**. Clients will send their push with a `last_known_hlc`. If the server's HLC is higher, the push is rejected (409 Conflict), forcing the client to pull, merge locally, and retry. This prevents edge-case overwrites if phone and laptop come online at the exact same millisecond.
4. **Preventing Array Tombstone Bloat:** Pure OR-Sets are too heavy and require aggressive Garbage Collection. Instead, use a lighter **LWW-Element-Set** for `labels[]` and `sub_tasks[]`. Store states as `[ItemID, HLC, is_deleted]`. The highest HLC wins, keeping JSON sizes small and manageable.
5. **Centralized Fractional Rebalancing:** To prevent index collisions when devices run out of fractional string space offline, clients must NEVER initiate a list rebalance. If space runs out, clients just append an arbitrary byte. A PocketBase background hook/cron will centrally handle rebalancing and push clean indexes down to clients.
6. **Per-Field Clock Storage:** Store the per-field HLCs in a single JSON "fat column" on the entity (e.g., `_clocks: {"title": "hlc1", "description": "hlc2"}`). Do not use side-tables, as that would mandate heavy JOINs and cripple PocketBase's default list endpoints.

**Things to nail down in the follow-up PRD/ADR:**
- HLC implementation (e.g., `@evan-bright/hlc`).
- Lexorank/Fractional indexing library and the exact PocketBase server-side rebalancing hook logic.
- OCC implementation specifics in the PocketBase API rules / sync client.
- Tombstone retention policy for fully deleted tasks/columns.
- Migration scripts from existing integer `order` and standard `updated` timestamps.

---

## Critical files / modules a future implementation would touch

- `client/src/modules/sync.js`, `autosync.js` — Implement OCC push retries and per-field LWW merge logic.
- `client/src/modules/storage.js`, `idb-store.js` — Embed HLC + LWW-Element-Set logic for arrays.
- `client/src/modules/drag-drop/` — Switch integer rank to fractional indexing strings.
- `backend/pb_migrations/` — Widen `order` to string, add `_clocks` JSON column to all entities. Add OCC rejection logic (either via API rules or a Go hook).
- `docs/adr/` — Record this finalized architectural decision.

## Verification (for the future implementation)

- New Vitest suite under `client/tests/unit/sync-crdt/` simulating concurrent edits, array toggles, and the OCC retry loop.
- E2E Playwright test driving two browser contexts against a shared PocketBase, going offline/online, asserting convergence and no data loss.

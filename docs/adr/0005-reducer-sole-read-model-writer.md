# Reducer is the sole writer of the read model — remove the direct projection-write path

**Status: accepted** (branch `feature-event-driven`)

Refines [ADR-0004](0004-event-sourced-sync.md) — enforces its "the reducer is the sole writer of the
IDB read model" decision in code, which the current implementation violates.

ADR-0004 §"Decision details" states: *"The reducer is the **sole writer** of the IDB read model.
Feature modules emit events; they never write projections directly."* The shipped code does not honour
this. Local mutations follow **two** write paths into the read model; remote mutations follow **one**.

## Problem

A local mutation in a feature module does both:

1. Calls a storage `save*()` (`saveLiveTasks` / `saveColumns` / `saveLabels`), which writes the
   in-memory `state.*[boardId]` and schedules the `read_model` IDB persist directly
   (`tasks.js:145`, `columns.js:49`, `labels.js:58` → `storage.js` `scheduleReadModelPersist`).
2. Calls `scheduleDomainEvent()`, whose emitted event is folded back into the **same**
   `state.*[boardId]` and re-persisted to the **same** `read_model` keys by
   `storage.js` `projectDomainEvent()` (≈`storage.js:472-509`).

A **remote** event (SSE / launch catch-up in `event-sourcing/realtime.js`) reaches the read model
**only** through `projectDomainEvent()` — the reducer projection is its sole writer.

So a local `save*()` write and a remote event's reducer write **race the same `read_model` key with no
ordering guarantee and no reconciliation**. The HLC total order lives in the event stream, not in the
IDB persist queue; whichever async `put()` lands last wins. When a local edit and a remote event land
close together, the projection can diverge from the HLC-ordered truth. This is documented honestly in
`CONTEXT.md` §3 ("Two write paths into `state`").

## Considered Options

**Keep both paths, add reconciliation.** Retain the direct `save*()` write for instant UI/offline, but
serialise the two writers through one ordered persist queue per `(boardId, store)` and drop stale
writes by HLC. Rejected: adds a second ordering mechanism that duplicates what the reducer already
does, and leaves two writers to keep in sync forever.

**Document and defer.** Amend ADR-0004 to admit two write paths as intended, fix only if a real
divergence bug surfaces. Rejected: leaves ADR-0004's headline invariant false, keeps finding #3
(the `storage.js` god module / projection-host entanglement) unresolvable.

**Reducer becomes the genuine sole writer (chosen).** Feature modules emit events only. The direct
`save*()` read-model writes are removed. `projectDomainEvent()` is the one and only writer of the
`read_model` stores, for both local and remote events. One writer, one ordering (HLC), no race.

## Decision details

- **Feature modules emit events; they never write projections.** Remove the `save*()` read-model
  writes from the local mutation paths in `tasks.js`, `columns.js`, `labels.js`. The
  `scheduleDomainEvent()` call stays and becomes the only effect of a local mutation on the read model.
- **One writer for both origins.** Local and remote events both reach the read model exclusively via
  `projectDomainEvent()` → `applyEvent()` (the pure reducer) → `scheduleReadModelPersist()`. There is
  no longer a second, unordered writer to race.
- **Local projection must update in-memory state synchronously before render.** Today `save*()` updates
  `state.*[boardId]` synchronously so the subsequent `renderBoard()` sees the change. After this
  change, the local event's `EVENT_EMITTED` emission must drive `projectDomainEvent()` **synchronously**
  (in-memory state updated before `renderBoard()` runs); only the IDB persist stays async (as it
  already is). This preserves instant-UI / offline behaviour with no perceptible latency regression.
  `scheduleDomainEvent()` must not debounce the local projection — only the PocketBase push may debounce.
- **`saveLiveTasks` / `saveColumns` / `saveLabels` read-model writes are retired** from the live
  mutation path. The `*ForBoard` cross-board save helpers and migration/scaffold writes are out of
  scope (they are not on the event path). The boundary to enforce: no live feature-module mutation
  writes a `read_model` key except through an emitted event.

## Consequences

- **ADR-0004's "sole writer" invariant becomes true in code**, not just on paper.
- **The local/remote divergence race is eliminated** — there is exactly one writer ordered by HLC.
- **Unblocks finding #3.** With the reducer the sole writer, the projection host
  (`registerDomainEventProjection` / `projectDomainEvent`) can be extracted out of `storage.js` into a
  dedicated read-model-projector module without leaving a second writer behind. That extraction is
  tracked separately and **blocked by this change**.
- **Regression surface: render timing.** The main risk is a UI that no longer re-renders synchronously
  after a local edit. The acceptance criteria require proving synchronous in-memory projection before
  render (a DOM test) and a two-context race test (local edit + remote event on the same key converge
  to the HLC-ordered result).
- **`CONTEXT.md` §3 is updated** to describe a single write path once this lands.

## References

- ADR-0004: `docs/adr/0004-event-sourced-sync.md`
- Domain model: `CONTEXT.md` §3 ("Two write paths into `state`")
- PRD: `docs/temp/prd/PRD-event-sourced-sync.md`
- Verified code sites: `tasks.js:145-151`, `columns.js:49-55`, `labels.js:58-64`,
  `storage.js:472-509` (`projectDomainEvent`), `event-sourcing/realtime.js` (`ingest`/`catchUp`),
  `event-sourcing/reducer.js` (`applyEvent`, pure).

# Optional Backend Storage via PocketBase

Spec for optional online storage: authenticated, **event-sourced** multi-device sync, local-first by
default. Architecture decision: [ADR-0004](../adr/0004-event-sourced-sync.md). PocketBase collection
schemas: `data-models.md`.

## Goal

Let users opt into cloud sync and reach their boards from multiple devices. Local-first (IndexedDB)
remains the default and works fully offline forever — PocketBase is an **optional fan-out**, never a
dependency.

## Technical Components

- **Backend**: PocketBase binary (v0.38.1) in Docker; collection schema defined via `backend/pb_migrations/` JS migration files (baked into the image).
- **Authentication**: Email/Password (default) + OAuth2 (Google, Apple, Microsoft) via the built-in `users` collection.
- **Frontend SDK**: `pocketbase` npm package.

## Sync model: pure event sourcing

Mutations are **domain events**, not whole records. Events are the source of truth; the tasks,
columns, and labels in IndexedDB are reducer-maintained **projections**. A Hybrid Logical Clock (HLC)
gives a total order across devices. PocketBase is a dumb event store — it runs no business logic. See
ADR-0004 for the rationale; this spec documents the mechanics.

### Local emission → projection

1. A feature module calls `emitDomainEvent({ type, scope, boardId, entityId, payload, actor })`
   (`event-sourcing/emitter.js`).
2. The emitter stamps a UUID `id`, an HLC (`emitLocal()`), and `at`, then **persists the event to IDB**
   (`synced=false`) and fires the `EVENT_EMITTED` bus event.
3. The reducer (`reduceEventAndNotify`, `event-sourcing/dispatcher.js`) folds the event into the read
   model — the reducer is the **sole writer** of the projection. Feature modules never write
   projections directly.
4. `EVENT_EMITTED` also wakes the outbound queue.

`scope` is `board` (carries a `board_id`) or `global` (settings shared across boards; no board id).

### Outbound: event push queue (`event-sourcing/sync-queue.js`)

Drains IDB events where `synced=false` to the PocketBase `events` collection, then flips `synced=true`.

- **Ordering**: events are sorted by `compareHlc` before pushing.
- **Debounce**: `EVENT_EMITTED` schedules a drain after **500 ms** (rapid edits collapse).
- **Concurrency**: up to **5** in-flight creates (`MAX_IN_FLIGHT`); each `create` passes
  `requestKey: null` to opt out of PocketBase auto-cancellation (concurrent same-path creates would
  otherwise abort each other).
- **Never rolls back**: a rejected push leaves the event queued (`synced=false`) — local state is never
  reverted (R-A).
- **Three-tier retry** on failure (`classifyError`):
  | Error | Tier | Behaviour |
  |---|---|---|
  | 401 / 403 | auth | Pause the queue; resume on the next `auth-changed`. |
  | other 4xx | permanent | Retry after **1 hour**. |
  | 5xx / network | network | Exponential backoff: **5s → 30s → 120s → 300s**. |
- **Resume triggers**: the `online` window event and `auth-changed` (un-pause) force an immediate drain.
- **Status**: `getSyncStatus()` returns `{ depth, retrying, paused }` for the header indicator (#115).

### Inbound: realtime + catch-up (`event-sourcing/realtime.js`)

- **SSE subscription**: `startRealtime()` subscribes to the `events` collection filtered by
  `owner = "<id>"`; each `create` runs `applyRemoteEvent`.
- **Ingest**: a remote record is mapped to an event, `observeRemote(hlc)` advances the local clock, the
  event is **persisted as `synced=true`** (so the outbound queue never echoes it back), and
  `EVENT_EMITTED` is fired — feeding the *same* projection pipeline as local events.
- **Dedup for free**: the reducer keys on the event UUID, so SSE/catch-up overlap and self-echoes are
  idempotent no-ops.
- **Catch-up pull** (`catchUp()`, on launch / reconnect / login): fetch owner-scoped events, sort by
  HLC, skip events at or below the per-scope `lastSeenHlc` watermark, ingest the rest, then advance
  `lastSeenHlc` per scope. (PocketBase can't range-filter the JSON `hlc` field; client-side HLC
  filtering is correct because the reducer re-sorts and server order is irrelevant.)

### Hybrid Logical Clock (`event-sourcing/hlc.js`)

- A node id is generated once and persisted at `kanvana:hlc:node`.
- `emitLocal()` returns a monotonic stamp; `observeRemote(hlc)` merges a remote stamp forward.
- `compareHlc(a, b)` gives the total order used everywhere events are sorted.
- Clock drift beyond `MAX_DRIFT_MS` (60 s) is logged as a warning (multi-device single-user is
  forgiving).

### Snapshots & GC (`event-sourcing/snapshot.js`, `snapshot-sync.js`)

To bound replay and prune old events:

- **Trigger**: after `SNAPSHOT_EVENT_THRESHOLD` (**500**) events for a scope, or snapshot age past
  `SNAPSHOT_AGE_MS` (**14 days**), a snapshot is scheduled with up to `MAX_JITTER_MS` (60 s) jitter.
- **Local**: `saveSnapshot(key, state, hlc)` serializes the projection; `gcEvents(snapshotHlc)` removes
  superseded local events. On load, `hydrateFromSnapshot` replays only events after the snapshot HLC.
- **Upload** (`uploadSnapshot`): pre-flight HLC check (skip if the server already has an equal-or-higher
  snapshot), gzipped-JSON upload to the `snapshots` **file** field, an arbitration sweep that deletes
  losing snapshots per board, then server-side event GC (delete events covered by the snapshot HLC).
- **Race-on-write (W1)**: highest HLC wins; losers are discarded.

## Authentication

- The PocketBase SDK auto-persists auth to `localStorage` — no manual hydration.
- `isAuthenticated()` reads `pb.authStore.token` / `pb.authStore.record`.
- `ensureAuthenticated()` refreshes an expired token via `authRefresh()`; on failure it returns `false`
  and forces re-login.
- After registration the UI shows "Check your email to confirm your account before logging in." — no
  auto-login (PocketBase requires email confirmation before first login).
- On auth state change the `auth-changed` window event fires; the sync queue, realtime, and header UI
  all subscribe to it.

## PocketBase URL / Nginx

- Default base URL is `/` (same-origin API paths served through nginx).
- `VITE_PB_URL` overrides the base for local dev (`http://localhost:8090`) and production
  (`https://pb.kanvana.com`). These live in `client/.env.local` / `client/.env.production`; Vite's
  `envDir` is set to `client/` so they load (the Playwright configs pin `VITE_PB_URL=/` to keep the
  sandboxed browser same-origin via the `/api` proxy — see `testing.md`).
- The health probe is `<base>/api/health`. If PocketBase is unreachable, "Go Online" is disabled with a
  tooltip and a modal notes the board stays usable offline — never a hard error.

## PocketBase Schema

Access rule on every collection and operation: `owner = @request.auth.id`. No public access, no shared
boards in v1.

### Active collections

- **`events`** — the event-sourced domain-event log (immutable; no update rule). Fields:
  `owner`, `hlc` (json), `scope`, `entity_id`, `board` (**text** local UUID, not a relation),
  `event_type`, `at`, `actor_type`, `actor_id`, `payload` (json), `local_id` (dedup). Full table in
  `data-models.md`.
- **`snapshots`** — client-computed projection snapshots (immutable inserts). Fields: `owner`,
  `board_id` (text; null for global), `hlc` (json), `payload` (gzipped **file**), `local_id`.
- **`boards`** — board metadata; still writable. (Boards are referenced from events by their text local
  UUID, not by relation.)
- **`users`** — built-in auth collection.

### Legacy collections (deprecated, write-locked)

`tasks`, `columns`, `labels`, and `task_relationships` are the old whole-record LWW mirrors. The
event-sourced migration (`1746100010`) sets their `createRule`/`updateRule`/`deleteRule` to `null`
(reads kept), and they are scheduled for removal after a 30-day quiet period — **issue #116**. Do not
write to them. Their schemas remain in `data-models.md` for reference.

## UI

- "Go Online" button in the header opens the login modal (when the health probe succeeded).
- Once logged in: header shows the user-name chip + logout.
- The header **sync-state indicator** (`event-sourcing/sync-indicator.js`) replaces the old manual Sync
  button: `Live ●` / `Syncing… (N)` / `⚠ N unsynced` / `Offline` (#115).
- Feedback uses `alertDialog` from `dialog.js` — never `alert()` / `window.confirm()`.

## Module Map

| file | purpose |
|---|---|
| `src/modules/sync.js` | PocketBase SDK init (`getPb`) + auth fns (`isAuthenticated`, `loginUser`, `registerUser`, `logoutUser`, `loginWithProvider`, `ensureAuthenticated`) |
| `src/modules/authsync.js` | Auth/sync UI orchestration, login modal, backend health probe |
| `src/modules/autosync.js` | Debounced auto-push trigger for the event queue |
| `src/modules/event-sourcing/emitter.js` | `emitDomainEvent` / `scheduleDomainEvent` — stamp, persist, emit |
| `src/modules/event-sourcing/dispatcher.js` | `reduceEventAndNotify` — fold events into the projection (sole writer) |
| `src/modules/event-sourcing/hlc.js` | Hybrid Logical Clock + `compareHlc` |
| `src/modules/event-sourcing/sync-queue.js` | Outbound push queue; `getSyncStatus` |
| `src/modules/event-sourcing/realtime.js` | Inbound SSE subscription + catch-up pull; `isRealtimeActive` |
| `src/modules/event-sourcing/snapshot.js` | Snapshot scheduling, serialize, local GC, hydrate |
| `src/modules/event-sourcing/snapshot-sync.js` | Snapshot upload + server-side GC |
| `src/modules/event-sourcing/sync-indicator.js` | Header sync-state indicator (#115) |
| `backend/pb_migrations/` | Collection schema + access rules (JS migrations) |
| `backend/Dockerfile` | PocketBase binary Docker image |

## Storage Keys

| key | storage | purpose |
|---|---|---|
| IDB `events` store | IndexedDB | local event log (`synced` flag drives the outbound queue) |
| IDB `snapshots` store | IndexedDB | local projection snapshots |
| IDB projection stores | IndexedDB | reducer read model (tasks/columns/labels per board) |
| `kanvana:hlc:node` | localStorage | persisted HLC node id |
| `kanvana:sync:lastSeenHlc:<scope>` | IDB KV | per-scope catch-up watermark |
| `pocketbase_auth` | localStorage | PocketBase SDK auth (SDK-managed) |

## Docker / Deployment

- Backend: PocketBase binary built by `backend/Dockerfile`; migrations are `COPY`'d in (rebuild the
  image when adding migrations).
- Nginx proxies `/api/*` and `/_/*` → PocketBase at internal port 8090.
- `docker compose up -d` starts the nginx + PocketBase stack. The live e2e suite
  (`npm run test:e2e:live`) requires PB healthy at `:8090` — see `testing.md`.

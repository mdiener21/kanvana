# Optional Backend Storage via PocketBase

> **⚠️ Partially stale — rewrite pending.** This document still describes the **legacy whole-record
> LWW** sync (PR #89: `pushBoardFull`/`pullAllBoards`, auto-sync, conflict resolution). That model was
> replaced by **event-sourced sync** on branch `feature-event-driven` — see
> [ADR-0004](../adr/0004-event-sourced-sync.md) for the current architecture (HLC-ordered domain
> events, outbound queue, SSE realtime, snapshots) and `data-models.md` for the `events`/`snapshots`
> PocketBase schema. The auth / health-probe / login sections below remain accurate; the sync-mechanics
> sections do not. Tracked for a full rewrite.

Product spec for optional online storage: authenticated multi-device sync, local-first by default.

## Goal

Let users opt-in to cloud sync, accessing boards from multiple devices. Local-first (IDB) remains the default. PocketBase provides the backend.

## Technical Components

- **Backend**: PocketBase binary (not a Go project) in Docker, collection schema defined via `pb_migrations/` JSON files
- **Authentication**: Email/Password (default) + OAuth2 (Google, Apple, Microsoft) via PocketBase Users collection
- **Frontend SDK**: `pocketbase` npm package

## Architecture Decisions

### Storage Layer

- Local storage is IDB via `storage.js` — all sync read/write must use `storage.js` exported fns, never `localStorage` directly
- Exception: `syncMap` (`kanbanSyncMap`) stays in `localStorage` — small coordination metadata, needed synchronously, no async overhead needed
- Auto-sync reads board data via `loadColumnsForBoard(id)`, `loadTasksForBoard(id)`, `loadLabelsForBoard(id)`, `loadSettingsForBoard(id)` — never mutates `activeBoardId`
- Pull writes through `storage.js` write fns, then calls `renderBoard()`

### Deleted Records

All entity types (tasks, columns, labels, boards) get a `deleted: boolean` field.

- Some delete operations retain `deleted: true` tombstones until sync can propagate cleanup
- All read fns (`loadTasks`, `loadColumns`, etc.) filter `deleted: true` — callers never see deleted items
- Sync layer accesses deleted items via internal fns to push deletes to PocketBase
- `purgeDeleted()` hard-removes `deleted: true` records from IDB after confirmed sync cleanup

### Conflict Resolution

Explicit push/pull with user confirmation. No merge strategy in V1.

- **Push**: local → cloud, overwrites cloud
- **Pull**: cloud → local, replaces local (requires explicit confirmation dialog)
- Post-pull: preserve active board ID if it exists in pulled data, else fallback to first board

### Auto-Sync

- Triggered by `kanban-local-change` custom event emitted from every mutating `storage.js` fn
- Event detail: `{ boardId, entity }` (e.g. `{ boardId: 'abc', entity: 'task' }`)
- Auto-sync pushes only the affected board (`detail.boardId`), not all boards
- Debounced 700ms — rapid edits collapse into one push
- In-flight guard + queue: if sync running, queue one follow-up push
- Push-all is only for the manual Sync button

### Authentication

- PocketBase SDK auto-persists auth to `localStorage` — no manual hydration fn needed
- `isAuthenticated()` reads directly from `pb.authStore.token` and `pb.authStore.record`
- `ensureAuthenticated()`: if token expired, call `authRefresh()`; if refresh fails → return `false`, force re-login
- Post-register: show "Check your email to confirm your account before logging in." — no auto-login (PocketBase requires email confirmation before first login)
- Failed auth refresh always returns `false`

### PocketBase URL / Nginx

- Default URL: `/` (same-origin PocketBase API paths when served through nginx)
- `VITE_PB_URL` env var overrides default for local dev and production hosted PocketBase
- Health probe URL is `<base>/api/health`
- If PocketBase unreachable at runtime: log console warning, disable "Go Online" button with tooltip
- Never a hard build error — local-first still works without backend

### PocketBase Schema

Collections: `boards`, `columns`, `tasks`, `labels`, `task_relationships`, `events` (plus built-in `users`).

Access rules on all collections, all operations (list/view/create/update/delete):
```
owner = @request.auth.id
```

No public access. No shared boards in V1.

**boards**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| local_id | text | local UUID |
| name | text | required |
| settings | json | per-board settings blob |
| created_at | text | ISO timestamp |

**columns**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| order | number | |
| collapsed | bool | |
| role | text | `"done"` for the Done column; empty otherwise |
| deleted | bool | tombstone/deleted-record flag |

**labels**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| group | text | optional label group |
| deleted | bool | tombstone/deleted-record flag |

**tasks**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| title | text | required |
| description | text | |
| priority | text | urgent/high/medium/low/none |
| due_date | text | YYYY-MM-DD |
| column | relation → columns | |
| order | number | |
| labels | relation[] → labels | maxSelect: 999 |
| creation_date | text | ISO timestamp |
| change_date | text | ISO timestamp |
| done_date | text | ISO timestamp; only when in Done column |
| column_history | json | array of `{ column, at }` |
| sub_tasks | json | array of SubTask objects |
| swimlane_label_id | text | swim lane label UUID |
| deleted | bool | tombstone/deleted-record flag |

**task_relationships**

Stores directed relationship edges. Both directions are stored as separate records (mirrors the bidirectional JS model). `local_id` is a composite key `"${taskLocalId}::${targetTaskLocalId}"` used for sync deduplication.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| task | relation → tasks | required; cascade delete on task delete |
| target_task | relation → tasks | no cascade; orphans cleaned up on next sync push |
| relationship_type | text | prerequisite/dependent/related; required |
| local_id | text | composite dedup key |

**events**

Unified event log for both task-level `activityLog` entries and board-level `boardEvents`. `task` is absent for board-level events. `local_id` is the `ActivityLogEntry.id` UUID; entries without a `local_id` are not synced.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| task | relation → tasks | optional; no cascade — history survives task deletion |
| event_type | text | required |
| at | text | ISO timestamp; required |
| actor_type | text | human/agent/user; required |
| actor_id | text | null for human; non-empty for agent/user |
| details | json | event-specific payload |
| local_id | text | ActivityLogEntry UUID for dedup |

### Orphan Cleanup (replaces deleteOrphans fetch approach)

No full-fetch diff. Tombstones/deleted records drive remote cleanup:

1. Deleted entities have `deleted: true` in IDB
2. On push, sync sends targeted PocketBase deletes for each `deleted: true` entity
3. After confirmed PocketBase delete, `purgeDeleted()` hard-removes from IDB

Zero extra round trips per board.

## UI

- "Go Online" button in header (standalone, not in settings dropdown)
- Once logged in: collapse to user name chip + sync icon in header
- When auto-sync enabled: hide manual Sync button
- "Go Online" button disabled with tooltip if PocketBase unreachable

### Success/Error Feedback

Use `alertDialog` from `dialog.js`. No `alert()` or `window.confirm()`.

## Module Map

| file | purpose |
|---|---|
| `src/modules/sync.js` | PocketBase SDK init, auth fns, `pushBoardFull`, `pullAllBoards` |
| `src/modules/autosync.js` | `kanban-local-change` listener, debounced push, in-flight guard |
| `src/modules/authsync.js` | Auth/sync UI orchestration, login modal handlers |
| `src/styles/components/auth.css` | Auth modal + sync button styles |
| `backend/pb_migrations/` | PocketBase collection schema + access rules (JS migration files) |
| `backend/Dockerfile` | PocketBase binary Docker image |

## Storage Keys

| key | storage | purpose |
|---|---|---|
| `kanbanSyncMap` | localStorage | local_id → PocketBase ID mapping |
| `kanbanAutoSyncEnabled` | localStorage | auto-sync opt-in flag |
| `pocketbase_auth` | localStorage | PocketBase SDK auth (managed by SDK) |

## Docker / Deployment

- Backend: PocketBase binary in `backend/Dockerfile`
- Collections defined in `backend/pb_migrations/` — no manual admin UI setup
- Nginx proxies `/api/*` and `/_/*` → PocketBase at internal port 8090
- `docker compose up` starts nginx + PocketBase stack

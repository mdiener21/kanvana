# Plan: Optional Backend Storage via PocketBase

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

### Soft-Delete

All entity types (tasks, columns, labels, boards) get a `deleted: boolean` field.

- Delete operations in `storage.js` set `deleted: true` instead of splicing
- All read fns (`loadTasks`, `loadColumns`, etc.) filter `deleted: true` — callers never see deleted items
- Sync layer accesses deleted items via internal fns to push deletes to PocketBase
- `purgeDeleted()` hard-removes `deleted: true` from IDB and triggers PocketBase hard-delete in same operation
- Purge only runs after confirmed successful sync

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

- Default URL: `/api/pb` (proxied through nginx)
- `VITE_PB_URL` env var overrides default
- If PocketBase unreachable at runtime: log console warning, disable "Go Online" button with tooltip
- Never a hard build error — local-first still works without backend

### PocketBase Schema

Normalized collections: `boards`, `columns`, `tasks`, `labels` (plus built-in `users`).

Access rules on all collections, all operations (list/view/create/update/delete):
```
owner = @request.auth.id
```

No public access. No shared boards in V1.

**boards**
| field | type |
|---|---|
| owner | relation → users |
| local_id | text |
| name | text |
| settings | json |
| created_at | text |

**columns**
| field | type |
|---|---|
| owner | relation → users |
| board | relation → boards |
| local_id | text |
| name | text |
| color | text |
| order | number |
| collapsed | bool |

**labels**
| field | type |
|---|---|
| owner | relation → users |
| board | relation → boards |
| local_id | text |
| name | text |
| color | text |
| group | text |

**tasks**
| field | type |
|---|---|
| owner | relation → users |
| board | relation → boards |
| local_id | text |
| title | text |
| description | text |
| priority | text |
| due_date | text |
| column | relation → columns |
| order | number |
| labels | relation[] → labels |
| creation_date | text |
| change_date | text |
| done_date | text |
| column_history | json |

### Orphan Cleanup (replaces deleteOrphans fetch approach)

No full-fetch diff. Soft-delete drives remote cleanup:

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
| `devops/local/backend/pb_migrations/` | PocketBase collection schema + access rules |
| `devops/local/backend/Dockerfile` | PocketBase binary Docker image |

## Storage Keys

| key | storage | purpose |
|---|---|---|
| `kanbanSyncMap` | localStorage | local_id → PocketBase ID mapping |
| `kanbanAutoSyncEnabled` | localStorage | auto-sync opt-in flag |
| `pocketbase_auth` | localStorage | PocketBase SDK auth (managed by SDK) |

## Docker / Deployment

- Backend: PocketBase binary in `devops/local/backend/Dockerfile`
- Collections defined in `devops/local/backend/pb_migrations/` — no manual admin UI setup
- Nginx proxies `/api/pb/*` → PocketBase at internal port 8080
- `docker compose up` starts nginx + PocketBase stack

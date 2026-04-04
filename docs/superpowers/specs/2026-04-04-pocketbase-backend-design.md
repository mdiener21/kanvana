# PocketBase Backend Integration Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Phase 1 (local-first default + optional PocketBase backend, single-user, read-only offline)

---

## Overview

Kanvana is a local-first kanban board that stores all data in browser IndexedDB. This design adds an
optional PocketBase backend that users can explicitly enable by connecting to a self-hosted PocketBase
instance. The default local-only experience is unchanged.

### Goals

- Local-first mode remains the default; users opt in to PocketBase explicitly
- All local data migrates to PocketBase on first connect (no data loss)
- Multi-user: each user authenticates and sees only their own boards
- Writes sync immediately to PocketBase on every save
- Phase 1 offline: read-only from cache when PocketBase is unreachable
- Phase 2 (future): full offline with write queue and real-time multi-user collaboration

### Non-Goals (Phase 1)

- Board sharing or collaboration between users
- Offline write queue / conflict resolution
- Real-time subscriptions
- PocketBase-hosted file attachments

---

## Architecture

### Storage Adapter Pattern

A new module `src/modules/storage-adapter.js` acts as the single import point for all storage
operations. It holds a reference to the active adapter and re-exports the same function signatures
that `storage.js` provides today.

```
src/modules/storage-adapter.js   ← single import point for all consumers
  ├── IDB adapter  →  src/modules/storage.js         (unchanged, existing)
  └── PB adapter   →  src/modules/pb-storage.js      (new)
```

On startup, `storage-adapter.js` checks IDB for a `kanvana-pb-config` key. If present and the auth
token is valid (or successfully refreshed), it activates the PocketBase adapter. Otherwise it
activates the IDB adapter.

All existing call sites (`tasks.js`, `columns.js`, `boards.js`, `render.js`, `importexport.js`,
entry points, etc.) are updated to import from `./storage-adapter.js` instead of `./storage.js`.
No other changes are required in those modules.

### Adapter Interface Contract

Every adapter must implement the following functions with identical signatures to `storage.js`:

```js
initStorage()
ensureBoardsInitialized()

listBoards()
getBoardById(boardId)
getActiveBoardId()
setActiveBoardId(boardId)
createBoard(name)
renameBoard(boardId, newName)
deleteBoard(boardId)

loadTasks()
saveTasks(tasks)
loadColumns()
saveColumns(columns)
loadLabels()
saveLabels(labels)
loadSettings()
saveSettings(settings)

loadTasksForBoard(boardId)
loadColumnsForBoard(boardId)
loadLabelsForBoard(boardId)
loadSettingsForBoard(boardId)
```

The IDB adapter (`storage.js`) already implements all of these. No changes to its public API.

---

## PocketBase Schema

Four collections plus PocketBase's built-in `users` collection. All collections carry a `user`
relation field and API rules that enforce per-user data isolation.

### API Rules (applied to every collection)

```
list/search:  @request.auth.id != "" && user = @request.auth.id
view:         @request.auth.id != "" && user = @request.auth.id
create:       @request.auth.id != "" && @request.body.user = @request.auth.id
update:       @request.auth.id != "" && user = @request.auth.id
delete:       @request.auth.id != "" && user = @request.auth.id
```

### Collection: `boards`

| Field        | Type     | Notes                                      |
|--------------|----------|--------------------------------------------|
| id           | auto     | PocketBase record ID                       |
| user         | relation | → users (required)                         |
| name         | text     | Board display name                         |
| createdAt    | date     |                                            |
| kanvana_id   | text     | Original client-side UUID (migration key)  |

### Collection: `tasks`

| Field          | Type     | Notes                                               |
|----------------|----------|-----------------------------------------------------|
| id             | auto     |                                                     |
| user           | relation | → users                                             |
| board          | relation | → boards                                            |
| kanvana_id     | text     | Original client-side UUID                           |
| title          | text     |                                                     |
| description    | text     |                                                     |
| priority       | text     | urgent\|high\|medium\|low\|none                     |
| dueDate        | text     | YYYY-MM-DD or empty                                 |
| column         | text     | kanvana_id of the column                            |
| order          | number   |                                                     |
| labels         | json     | array of label kanvana_ids                          |
| columnHistory  | json     | `[{ column: kanvana_id, at: ISO }]`                 |
| relationships  | json     | `[{ type, targetTaskId: kanvana_id }]`              |
| subTasks       | json     | sub-task array                                      |
| creationDate   | date     |                                                     |
| changeDate     | date     |                                                     |
| doneDate       | date     | present only when task is in Done column            |

### Collection: `columns`

| Field       | Type     | Notes                         |
|-------------|----------|-------------------------------|
| id          | auto     |                               |
| user        | relation | → users                       |
| board       | relation | → boards                      |
| kanvana_id  | text     | Original client-side UUID     |
| name        | text     |                               |
| color       | text     | hex color                     |
| order       | number   |                               |
| collapsed   | bool     |                               |

### Collection: `labels`

| Field       | Type     | Notes                     |
|-------------|----------|---------------------------|
| id          | auto     |                           |
| user        | relation | → users                   |
| board       | relation | → boards                  |
| kanvana_id  | text     | Original client-side UUID |
| name        | text     | max 40 chars              |
| color       | text     | hex color                 |
| group       | text     | optional label group      |

### Collection: `board_settings`

| Field  | Type     | Notes                                                          |
|--------|----------|----------------------------------------------------------------|
| id     | auto     |                                                               |
| user   | relation | → users                                                        |
| board  | relation | → boards (unique per board per user)                           |
| data   | json     | Full settings object (matches `defaultSettings()` shape)       |

Using a single `data` JSON field for settings avoids schema churn as settings fields evolve.

---

## Authentication & Configuration

### Connection Flow

1. User opens a new top-level "App Settings" modal (global, not per-board)
2. User enters PocketBase instance URL, email, and password
3. Kanvana calls PocketBase auth endpoint via the PocketBase JS SDK
4. On success: migration flow starts (see Migration section)
5. On failure: error message shown inline, no state change

### Token Persistence

Stored in IDB under key `kanvana-pb-config`:

```js
{
  url: "https://pb.myserver.com",
  token: "<pb-auth-token>",
  userId: "<pb-user-id>",
  tokenExpiry: "ISO-date-string"
}
```

- Password is never stored
- On app startup, if `kanvana-pb-config` is present: attempt silent token refresh via PocketBase
  auth refresh endpoint
- If refresh succeeds: activate PocketBase adapter
- If refresh fails: fall back to IDB adapter, surface "Reconnect to PocketBase" prompt in header
- Logout: delete `kanvana-pb-config` from IDB, switch to IDB adapter, reload

### Disconnect

A "Disconnect" button in App Settings clears `kanvana-pb-config`, switches back to the IDB adapter,
and reloads. Local IDB data (the migration snapshot) is still present and becomes active again.

---

## PocketBase Adapter (`src/modules/pb-storage.js`)

### In-Memory Cache

The adapter maintains the same in-memory `state` shape as `storage.js`:

```js
const state = {
  boards: [],
  activeBoardId: null,
  tasks: {},     // { [boardId]: task[] }
  columns: {},   // { [boardId]: column[] }
  labels: {},    // { [boardId]: label[] }
  settings: {}   // { [boardId]: object }
}
```

`initStorage()` fetches all user data from PocketBase and populates this cache. Subsequent reads are
synchronous from cache — identical behaviour to the IDB adapter.

### ID Mapping

The adapter maintains an internal `idMap` that translates `kanvana_id` ↔ PocketBase record `id`:

```js
const idMap = {
  boards: Map<kanvana_id, pb_id>,
  tasks:  Map<kanvana_id, pb_id>,
  columns: Map<kanvana_id, pb_id>,
  labels: Map<kanvana_id, pb_id>
}
```

The rest of the app always works with `kanvana_id` values. The adapter translates to/from PocketBase
IDs internally when constructing API payloads. This preserves all existing cross-references
(`task.column`, `task.labels[]`, `task.relationships[].targetTaskId`) without changes to any
consuming module.

### Write Strategy

Every `saveTasks()`, `saveColumns()`, `saveLabels()`, `saveSettings()` call:

1. Updates the in-memory cache immediately (UI never waits for network)
2. Diffs the new state against the previous cache to determine which records to `create`, `update`,
   or `delete` on PocketBase
3. Fires async PocketBase REST calls
4. On error: logs to console, emits a `pb:sync-error` event that the UI layer listens to in order
   to show a non-blocking toast. The in-memory state remains updated; the change is not durably
   persisted until the next successful write.

**Phase 2 note:** Step 4 will instead enqueue the failed write to a durable IDB write queue,
enabling full offline sync on reconnect.

### Connectivity & Offline (Phase 1)

- Every outbound call is wrapped in a try/catch
- On network error or non-2xx PocketBase response: set `isOffline = true`, emit `pb:offline` event
- While `isOffline`:
  - All reads serve from cache (normal operation)
  - All writes are rejected; a `pb:write-blocked` event triggers the "read-only" UI notice
- A periodic ping every 30 seconds attempts a lightweight PocketBase health check
- On success: clear `isOffline`, emit `pb:online` event, UI restores write access

---

## Migration Flow

### Trigger

Fires automatically after the user successfully authenticates to PocketBase for the first time.

### Sequence

1. Read all boards from IDB in-memory state (already loaded)
2. Open migration progress modal: "Migrating your data to PocketBase…"
3. For each board (showing board name + count progress, e.g. "Board 2 of 4"):
   - `POST /api/collections/boards/records` — create board, store returned `pb_id` in `idMap`
   - Bulk-create all columns for that board
   - Bulk-create all labels for that board
   - Bulk-create all tasks for that board (all `kanvana_id` references preserved)
   - `POST /api/collections/board_settings/records` — create settings record
4. On full success:
   - Persist `kanvana-pb-config` to IDB
   - Switch active adapter to PocketBase
   - Close migration modal with "Migration complete" message
   - Reload active board from PocketBase cache
5. On error at any step:
   - Show error details in the modal
   - Offer "Retry" (re-attempt from the failed board) or "Cancel" (discard migration, stay in IDB mode)
   - IDB data is never modified or deleted

### No Destructive Action on Local Data

IDB data is never wiped. Disconnect → IDB snapshot is still there and becomes active. This makes
PocketBase opt-in and fully reversible.

---

## UI Changes

### New: App Settings Modal

A top-level modal (distinct from per-board settings) accessible from the app header. Contains a
"Backend" section:

- **Disconnected state:** "Connect to PocketBase" button → opens inline connection form (URL,
  email, password, "Connect" button)
- **Connected state:** instance URL, logged-in user email, "Disconnect" button

### Mode Badge (App Header)

A small pill badge next to the app title indicating current storage mode:

| State                        | Badge text            | Color  |
|------------------------------|-----------------------|--------|
| Local IDB (default)          | `Local`               | grey   |
| PocketBase connected + online| `PocketBase`          | green  |
| PocketBase configured + offline | `Offline — read only` | amber |

Clicking the badge in `Offline — read only` state shows a "Reconnect" prompt.

### Sync Error Toast

Non-blocking toast at the bottom of the screen when a PocketBase write fails. Shows "Sync failed —
changes not saved" with a dismiss button. Does not block the UI.

### Migration Progress Modal

Shown once during initial migration only. Displays:
- Current board name being processed
- Progress count ("Board 2 of 4")
- Success state: "Migration complete" with a close button
- Error state: error message + "Retry" and "Cancel" buttons

### No Changes to Existing UI

Board UI, task cards, columns, labels, drag-drop, reports, and calendar are entirely unchanged.
The backend is transparent to all existing screens.

---

## New Files

| File                                   | Purpose                                              |
|----------------------------------------|------------------------------------------------------|
| `src/modules/storage-adapter.js`       | Adapter selector and re-export layer                 |
| `src/modules/pb-storage.js`            | PocketBase adapter (implements adapter interface)    |
| `src/modules/pb-auth.js`               | PocketBase auth: login, logout, token refresh, config persistence |
| `src/modules/pb-migration.js`          | One-time migration: IDB → PocketBase                 |
| `src/modules/pb-sync.js`               | Write helpers: diff, create/update/delete PB records |
| `src/modules/app-settings.js`          | App Settings modal UI (backend section)              |
| `src/modules/pb-status.js`             | Mode badge, offline detection, reconnect ping, toast |

---

## Modified Files

| File                          | Change                                                              |
|-------------------------------|---------------------------------------------------------------------|
| All modules importing `storage.js` | Change import to `storage-adapter.js`                          |
| `src/kanban.js`               | Import `storage-adapter.js`; wire App Settings modal; wire mode badge |
| `src/reports.js`              | Import `storage-adapter.js`                                         |
| `src/calendar.js`             | Import `storage-adapter.js`                                         |
| `src/index.html`              | Add mode badge element; add App Settings trigger in header          |
| `package.json`                | Add `pocketbase` JS SDK dependency                                  |

---

## Phase 2 Notes

The following are explicitly out of scope for Phase 1 but the design accommodates them:

- **Offline write queue:** Replace the Phase 1 write-rejection path with an IDB-backed queue in
  `pb-sync.js`. On reconnect, drain the queue with conflict resolution.
- **Real-time collaboration:** Activate PocketBase realtime subscriptions in `pb-storage.js`.
  Subscribe to board/task/column/label collections; on incoming events, update in-memory cache and
  call `renderBoard()`.
- **Board sharing:** Add a `members` relation to the `boards` collection and relax API rules
  accordingly.

---

## Dependencies

- `pocketbase` — official PocketBase JS SDK (npm). Handles auth, REST calls, realtime, token
  management.
- No other new dependencies.

---

## Testing Strategy

- Unit tests for `pb-storage.js`: mock the PocketBase SDK, test cache population, write diffing,
  offline flag transitions
- Unit tests for `pb-migration.js`: mock IDB state + PocketBase SDK, assert correct record
  creation order and `idMap` population
- Unit tests for `pb-auth.js`: token persistence, refresh, fallback to IDB mode
- DOM integration tests for App Settings modal: connection form, connected state, disconnect
- E2E tests (Playwright): connect flow with a local PocketBase test instance (optional, may be
  deferred)

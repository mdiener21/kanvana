# Storage

## Persistence Model

All application state is persisted in browser **IndexedDB** via the `idb` wrapper library.
A single key-value object store (`kv`) holds all data. In-memory state is loaded at startup
via `initStorage()` and all subsequent reads are synchronous. Writes update in-memory state
immediately and schedule an async IDB persist (fire-and-forget).

**Why not localStorage?** localStorage has a hard 5–10 MB per-origin limit and blocks the UI
thread on large writes. IDB supports 50–80% of available disk space and writes are non-blocking.

## Initialisation

Every HTML entry point (`index.html`, `reports.html`, `calendar.html`) must call `await initStorage()` before any board rendering.
This is the only async operation in the storage layer.

```js
import { initStorage } from './modules/storage.js';
await initStorage(); // loads IDB → in-memory state
```

## IDB Schema

- **Database name**: `kanvana-db`
- **Version**: `1`
- **Object store**: `kv` (key-value, out-of-line key)

## Storage Keys

The same logical keys used previously for localStorage are now IDB keys in the `kv` store.

### Board Registry

- `kanbanBoards` — array of board metadata
- `kanbanActiveBoardId` — last active board id

### Per-Board Data

- `kanbanBoard:<boardId>:tasks`
- `kanbanBoard:<boardId>:columns`
- `kanbanBoard:<boardId>:labels`
- `kanbanBoard:<boardId>:settings`

Values are stored as native JavaScript objects (structured clone), not JSON strings.

## Operational Rules

- Call `initStorage()` once per page load before reading any board data
- All CRUD operations act on the active board (determined by `getActiveBoardId()`)
- Board data is namespaced by board id
- Board, task, column, and label model `id` values are UUIDs
- The permanent Done column is identified by `role: "done"`, not by a fixed column id
- Export operates on the active board unless the board-management UI exports a selected board
  (uses `loadTasksForBoard(id)`, `loadColumnsForBoard(id)`, etc.)
- Import creates a new board from JSON and switches to it

## Migration and Backward Compatibility

### localStorage → IDB migration (automatic, one-time)

When `initStorage()` finds an empty IDB but non-empty localStorage, it runs `migrateFromLocalStorage()`:

1. If `kanbanBoards` key exists in localStorage → multi-board migration: copies all per-board keys to IDB and deletes localStorage keys
2. If legacy single-board keys (`kanbanTasks`, `kanbanColumns`, `kanbanLabels`) exist → wraps them into a default board in IDB

After migration, localStorage is cleared of all Kanvana keys.

### Schema changes

- Persisted-shape changes must keep import/export round-trippable and preserve legacy normalization
- Legacy model ids from localStorage, IDB, templates, or imports are normalized to UUIDs, and references are rewritten during load/import
- All code must go through storage helpers (`loadTasks`, `saveTasks`, etc.) — never read IDB directly

## Settings Persistence

- Settings are per-board, stored at `kanbanBoard:<boardId>:settings`
- Swim lane row collapse and cell collapse state are arrays of keys inside settings

## Quota Monitoring

`initStorage()` calls `navigator.storage.estimate()` after load. If usage exceeds 80% of the
browser's quota, a warning is logged to the console. No hard enforcement — boards can grow
beyond the old localStorage limit.

## Testing

Unit tests use the `fake-indexeddb` npm package (dev dependency) to polyfill IDB in Node.js.
`_resetStorageForTesting()` resets the in-memory state and closes the IDB connection so each
test gets a clean slate. It is called from `resetLocalStorage()` in `tests/unit/setup.js`.

## Update Requirements

Update this file when you change:

- IDB schema or version
- Key naming conventions
- Migration logic
- Persistence scope or board scoping rules
- Persisted settings shape
- Initialisation sequence

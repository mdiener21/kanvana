# Migrate Storage: localStorage → IndexedDB

## Context

Kanvana targets multi-user / team usage. Current `localStorage` storage has three blocking problems at that scale:

1. **5–10 MB hard ceiling** — multiple boards + team data will hit this quickly
2. **Full-array rewrites** — every mutation re-serializes the whole tasks array (O(n) cost)
3. **Synchronous / blocking** — large writes stall the UI thread
4. **Not Service Worker accessible** — prevents future offline-sync and multi-device collaboration

IndexedDB solves all four and is the standard local-first foundation for apps that will eventually sync to a backend.

---

## Decision

- **Skip compression** — it only extends the storage ceiling without fixing write performance or team-sync potential
- **Migrate directly to IndexedDB** using the `idb` wrapper (~400 B gzipped)
- Keep the public API surface of `storage.js` as close as possible (just async) so callers change minimally

---

## Architecture After Migration

### Storage module: `src/modules/storage.js`

Replace `localStorage.getItem`/`setItem` calls with IDB operations via `idb`.

**IDB database name:** `kanvana-db`  
**IDB version:** `1`

**Object stores:**

| Store | Key path | Indexes |
|---|---|---|
| `boards` | `id` | — |
| `tasks` | `id` | `boardId`, `column`, `dueDate` |
| `columns` | `id` | `boardId` |
| `labels` | `id` | `boardId` |
| `settings` | `boardId` | — |
| `meta` | `key` | — (for `activeBoardId` etc.) |

**Per-record writes** replace full-array writes — `put(task)` instead of `setItem(allTasks)`.

### Async surface change

Every exported function in `storage.js` becomes `async`. Callers use `await`:

```js
// Before
const tasks = loadTasks(boardId);

// After
const tasks = await loadTasks(boardId);
```

---

## Implementation Plan

### Phase 1 — IDB foundation

1. Add `idb` as a dependency (`npm install idb`)
2. Add `openDB()` call in `storage.js` — define all object stores and indexes
3. Implement low-level helpers: `getDB()`, safe wrappers for `get`, `getAll`, `put`, `delete`, `clear`
4. Add `navigator.storage.estimate()` quota monitoring — warn at 80%

### Phase 2 — One-time migration from localStorage

5. Write `migrateFromLocalStorage(db)` in `storage.js`:
   - On `openDB` `upgrade` callback, if legacy `kanbanBoards` key exists in localStorage:
     - Read all localStorage keys
     - Write each board's tasks/columns/labels/settings into IDB
     - Delete localStorage keys after successful write
   - Runs once on first app load after upgrade

### Phase 3 — Rewrite storage API

6. Rewrite all storage functions as async per-record operations:
   - `loadBoards()`, `saveBoard()`, `deleteBoard()`
   - `loadTasks(boardId)`, `saveTask(task)`, `deleteTasks(boardId)` (and `deleteTask(id)`)
   - `loadColumns(boardId)`, `saveColumn(col)`, `deleteColumns(boardId)`
   - `loadLabels(boardId)`, `saveLabel(label)`, `deleteLabels(boardId)`
   - `loadSettings(boardId)`, `saveSettings(boardId, settings)`
   - `getActiveBoardId()`, `setActiveBoardId(id)`

### Phase 4 — Update all callers

17 modules touch storage. Each needs `await` added. Key files:

- `src/modules/tasks.js` — highest frequency writes (10+ call sites)
- `src/modules/columns.js`
- `src/modules/labels.js`
- `src/modules/render.js` — loads all 4 stores on every render (critical path)
- `src/modules/boards.js` — board lifecycle
- `src/modules/settings.js`
- `src/modules/swimlanes.js`
- `src/modules/importexport.js` — bulk read/write (needs transaction wrapping)
- `src/modules/reports.js`
- `src/modules/calendar.js`
- `src/kanban.js` — entry point wiring

### Phase 5 — Test layer updates

- `tests/unit/storage.test.js` — mock IDB via `fake-indexeddb`
- `tests/dom/` tests that currently assume synchronous storage — update to async
- Playwright E2E tests should work unchanged (real browser IDB)

### Phase 6 — Docs & spec

- Update `docs/spec/storage.md` with new schema, key names, migration notes
- Update `CHANGELOG.md` under `[Unreleased]`
- Update `CLAUDE.md` if module conventions change

---

## Critical Files to Modify

- [src/modules/storage.js](src/modules/storage.js) — full rewrite
- [src/modules/tasks.js](src/modules/tasks.js)
- [src/modules/columns.js](src/modules/columns.js)
- [src/modules/labels.js](src/modules/labels.js)
- [src/modules/render.js](src/modules/render.js)
- [src/modules/boards.js](src/modules/boards.js)
- [src/modules/settings.js](src/modules/settings.js)
- [src/modules/swimlanes.js](src/modules/swimlanes.js)
- [src/modules/importexport.js](src/modules/importexport.js)
- [src/kanban.js](src/kanban.js)
- [docs/spec/storage.md](docs/spec/storage.md)
- [CHANGELOG.md](CHANGELOG.md)

---

## Key Reuse from Existing Code

- `safeParseArray()` / `safeParseObject()` in `storage.js` — keep for import validation
- Normalization logic (`normalizeTasks`, `normalizeColumns`, etc.) — keep, still needed on load
- `IMPORT_LIMITS` in `importexport.js` — unchanged
- All domain object shapes — unchanged

---

## Risks

| Risk | Mitigation |
|---|---|
| Migration script loses data | Keep localStorage keys until migration verified; test with real data snapshots |
| Async refactor introduces race conditions | Use IDB transactions for multi-store operations (e.g., board deletion) |
| `fake-indexeddb` gaps in unit tests | Run DOM tests in a real browser environment via Vitest browser mode or Playwright |
| `idb` bundle size concern | ~400 B gzipped — negligible |

---

## Verification

1. `npm run test:unit` — all storage unit tests pass with `fake-indexeddb`
2. `npm run test:dom` — DOM integration tests pass with async storage
3. `npm run test:e2e` — full Playwright suite against real browser IDB
4. Manual: create boards/tasks, reload page, verify data persists
5. Manual: load legacy localStorage data, verify migration runs once and cleanly
6. Manual: `navigator.storage.estimate()` in DevTools — confirm quota monitoring fires at 80%

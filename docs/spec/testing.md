# Testing

## Standard Test Stack

- `Vitest` for unit tests in `tests/unit/`
- `Vitest` plus `@testing-library/dom` for DOM integration tests in `tests/dom/`
- `MSW` for mocked API behavior shared by Vitest suites in `tests/mocks/`
- `Playwright` for end-to-end, visual, and accessibility smoke tests in `tests/e2e/`

The canonical folder and naming conventions live in `docs/testing-strategy.md`.

## Test Scripts

- `npm test` - run unit, DOM, and E2E suites in sequence
- `npm run test:unit` - run unit tests only
- `npm run test:dom` - run DOM integration tests only
- `npm run test:e2e` - run Playwright (mocked suite; ignores `tests/e2e/event-sourcing/`)
- `npm run test:perf` - run the deterministic large-board Chromium performance budgets
- `npm run test:e2e:live` - run the event-sourcing convergence specs against a **live** PocketBase
- `npm run test:ui` - open Playwright UI mode
- `npm run test:debug` - run Playwright debug mode
- `npm run test:overview` - regenerate `tests/TEST-OVERVIEW.md` from test source

### Live e2e prerequisite — Docker stack must be running

`npm run test:e2e:live` talks to a **real** PocketBase. Bring the Docker stack up first, from the repo root:

```bash
docker compose up -d        # starts pocketbase (:8090) + nginx; wait for pb healthy
curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/api/health   # expect 200
```

If PocketBase is unreachable the live specs **self-skip** (they do not fail), so a green
`test:e2e:live` with PB down means *nothing ran*. Verify PB health before trusting the result.

The unit, DOM, and mocked `test:e2e` suites need **no** Docker.

> The sandboxed Playwright browser can only reach its own origin, so the live config serves
> a same-origin `/api` proxy to PB (`PB_PROXY_TARGET`) and pins `VITE_PB_URL=/`. `client/.env.local`
> (`http://localhost:8090`) is for real `npm run dev` only — it is intentionally overridden in e2e.

## IDB Unit Test Setup

Storage tests are split across two files:

- `tests/unit/storage.test.js` — synchronous unit tests for all CRUD functions (work entirely against in-memory state, no IDB interaction needed)
- `tests/unit/storage-idb.test.js` — async tests for IDB-specific paths that `storage.test.js` cannot exercise:
  - `initStorage()` loading state from a real (fake-IDB) database
  - Multi-board and legacy single-board localStorage → IDB migration
  - Cross-session persistence: write in session A, reload in session B
  - `deleteBoard` cleaning up IDB entries
  - Cross-board read helpers (`loadTasksForBoard`, `loadColumnsForBoard`, etc.)
  - Corrupt IDB resilience

### IDB test infrastructure

- `fake-indexeddb` (dev dep) polyfills `globalThis.indexedDB` in Node.js via `tests/unit/setup.js` (`import 'fake-indexeddb/auto'`).
- `beforeEach` in `storage-idb.test.js` calls `resetLocalStorage()` (which calls `_resetStorageForTesting()`) **and** `await deleteDB('kanvana-db')` to give each test a completely empty database.
- `_resetStorageForTesting()` calls `_db.close()` before nulling `_db` so `deleteDB()` is never blocked by an open connection.
- `_flushPersistsForTesting()` awaits `Promise.all([..._pendingPersists])` before cross-session assertions; avoids timing races from fire-and-forget IDB writes.

### Cross-session roundtrip pattern

```js
await initStorage();
ensureBoardsInitialized();
saveTasks([{ id: 't1', title: 'Persisted task', ... }]);
await _flushPersistsForTesting();      // wait for IDB writes to settle
const boardId = getActiveBoardId();
_resetStorageForTesting();             // drop in-memory state; IDB intact
await initStorage();                   // reload from IDB (new session)
setActiveBoardId(boardId);
expect(loadTasks().some(t => t.title === 'Persisted task')).toBe(true);
```

## Current Coverage Focus

- `tests/TEST-OVERVIEW.md` is the generated AI-readable test inventory. It lists every detected test case by file, test layer, suite path, and source line.
- The overview also includes filename-based gap heuristics for source modules and spec files without obvious named coverage. These heuristics are a fast triage aid, not a coverage guarantee.
- Board management flows
- Task creation and validation
- Task deletion flows: permanent delete confirmation removes the card and decrements the counter; cancel leaves the card and counter unchanged — `tests/e2e/task-delete.spec.ts`
- Drag-and-drop performance into Done with large fixture boards
- Done-column virtualization behavior
- Swim lane rendering, settings persistence, and lane-aware moves
- IDB storage: cross-session persistence, migration, and data integrity

## Performance Coverage

`npm run test:perf` is a dedicated serial Chromium suite, separate from the functional E2E suite. It
generates fixed synthetic 400-task and 1,000-task boards in standard and swimlane views. Each scenario
runs three cold starts and five real `page.mouse` SortableJS drops per start. It prints one
`KANVANA_PERFORMANCE` JSON record and attaches the same JSON to the Playwright result.

The harness reports fixture IndexedDB backfill and first-render startup separately from steady-state
drop latency. After the moves, it forces garbage collection through the Chromium DevTools Protocol,
then records live `.task` card count, retained DOM nodes (live plus any detached nodes still retained),
JavaScript heap, completed full/reconcile board renders, and page crash events. Fixtures contain only
fixed generated titles, IDs, dates, labels, and descriptions; no application, production, or personal
data is read.

Timing, heap, and retained-node results use the median of three repetitions. Live-card/render limits
use the largest repetition, and crash events are summed. The checked-in baseline was captured on
2026-08-29 with Playwright 1.58.2 headless Chromium on Linux. Budgets include CI variance while
remaining close enough to catch a lost virtualization boundary, duplicated render path, retained
board-sized DOM, or material interaction slowdown.

| Scenario | Fixture backfill baseline / budget (ms) | Startup baseline / budget (ms) | Drop baseline / budget (ms) | Heap baseline / budget (MB) | Retained nodes baseline / budget |
|---|---:|---:|---:|---:|---:|
| 400 standard | 16.9 / 100 | 1053.5 / 2500 | 2322.53 / 4000 | 9.52 / 18 | 17,413 / 19,200 |
| 1,000 standard | 32.4 / 200 | 1112.4 / 3000 | 4958.17 / 8000 | 9.89 / 20 | 32,953 / 36,300 |
| 400 swimlane | 15.3 / 100 | 734.4 / 2000 | 1227.46 / 2500 | 9.72 / 20 | 25,524 / 28,100 |
| 1,000 swimlane | 32.3 / 200 | 1078.8 / 3000 | 1983.11 / 4000 | 12.33 / 24 | 55,824 / 61,400 |

| Scenario | Live cards max | Startup renders max | Renders for five moves max | Crash events max |
|---|---:|---:|---:|---:|
| 400 standard | 210 | 1 | 5 | 0 |
| 1,000 standard | 450 | 1 | 5 | 0 |
| 400 swimlane | 160 | 1 | 10 | 0 |
| 1,000 swimlane | 400 | 1 | 10 | 0 |

To collect a candidate baseline without enforcing the existing thresholds:

```bash
KANVANA_PERF_CALIBRATE=1 npm run test:perf
```

Set `KANVANA_PERF_RUNS` to a positive integer for additional repetitions. Update
`tests/performance/performance-budgets.js` and this table together only after repeated runs on a stable
runner explain why a changed baseline is expected.

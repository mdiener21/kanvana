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
builds the app and serves the production bundle — the dev server's on-demand transform makes cold
startup swing several hundred percent between runs, which no stable budget survives. It generates
fixed synthetic 400-task and 1,000-task boards in standard and swimlane views, seeded straight into
IndexedDB. Each scenario runs three cold starts and five real `page.mouse` SortableJS drops per start.
It prints one `KANVANA_PERFORMANCE` JSON record and attaches the same JSON to the Playwright result.

The harness reports fixture IndexedDB backfill and first-render startup separately from steady-state
drop latency. After the moves it forces garbage collection through the Chromium DevTools Protocol,
then records live `.task` card count, live DOM nodes (walked from `document`), detached DOM nodes
(the post-GC renderer total minus the walked document — a subtree Blink still retains), JavaScript
heap, completed full/reconcile board renders, and page crash events. Fixtures contain only fixed
generated titles, IDs, dates, labels, and descriptions; no application, production, or personal data
is read.

Timing, heap, live-node, and retained-node results use the median of three repetitions. Live-card,
render, and detached-node limits use the largest repetition, and crash events are summed. The
checked-in baseline was captured on 2026-08-29 with Playwright 1.58.2 headless Chromium on Linux over
two consecutive full runs.

Structural metrics reproduced exactly across those runs (retained nodes varied by under 0.05%), so
their budgets sit just above baseline: they fail on a lost virtualization boundary, a duplicated
render path, or a board-sized DOM left detached. Wall-clock and heap metrics swing with runner load,
so those budgets are set to trip only on a material — roughly 2x — regression.

| Scenario | Fixture backfill baseline / budget (ms) | Startup baseline / budget (ms) | Drop baseline / budget (ms) | Heap baseline / budget (MB) |
|---|---:|---:|---:|---:|
| 400 standard | 43.2 / 200 | 1099.2 / 3000 | 2340.86 / 6000 | 5.96 / 14 |
| 1,000 standard | 48.0 / 250 | 1080.6 / 3200 | 5870.15 / 12000 | 7.49 / 16 |
| 400 swimlane | 20.2 / 200 | 839.2 / 2500 | 1432.20 / 3600 | 6.45 / 14 |
| 1,000 swimlane | 45.9 / 250 | 1350.5 / 3600 | 2405.22 / 6000 | 8.80 / 18 |

| Scenario | Live cards baseline / budget | Live nodes baseline / budget | Detached nodes baseline / budget | Retained nodes baseline / budget | Startup renders | Renders for five moves | Crash events |
|---|---:|---:|---:|---:|---:|---:|---:|
| 400 standard | 205 / 210 | 5,483 / 5,800 | 11,949 / 12,600 | 17,432 / 18,300 | 1 | 5 | 0 |
| 1,000 standard | 445 / 450 | 10,043 / 10,600 | 22,929 / 24,100 | 32,972 / 34,700 | 1 | 5 | 0 |
| 400 swimlane | 160 / 165 | 4,696 / 5,000 | 20,847 / 21,900 | 25,543 / 26,900 | 1 | 10 | 0 |
| 1,000 swimlane | 400 / 405 | 9,256 / 9,800 | 46,587 / 49,000 | 55,843 / 58,700 | 1 | 10 | 0 |

To collect a candidate baseline without enforcing the existing thresholds:

```bash
KANVANA_PERF_CALIBRATE=1 npm run test:perf
```

Set `KANVANA_PERF_RUNS` to a positive integer for additional repetitions. Update
`tests/performance/performance-budgets.js` and this table together only after repeated runs on a stable
runner explain why a changed baseline is expected.

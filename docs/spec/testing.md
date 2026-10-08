# Testing

## Standard Test Stack

- `Vitest` for unit tests in `tests/unit/`
- `Vitest` plus `@testing-library/dom` for DOM integration tests in `tests/dom/`
- `MSW` for mocked API behavior shared by Vitest suites in `tests/mocks/`
- `Playwright` for end-to-end, visual, and accessibility smoke tests in `tests/e2e/`

The canonical folder and naming conventions live in [`testing-strategy.md`](testing-strategy.md).

## Test Scripts

- `npm test` - run unit, DOM, and E2E suites in sequence
- `npm run test:unit` - run unit tests only
- `npm run test:dom` - run DOM integration tests only
- `npm run test:e2e` - run Playwright (mocked suite; ignores `tests/e2e/event-sourcing/`)
- `npm run test:perf` - run the deterministic large-board Chromium performance budgets
- `npm run test:perf:smoke` - run one 400-task Chromium startup check before the full performance suite
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
- Drag-and-drop correctness into Done with large fixture boards — `tests/e2e/dragdrop.spec.js`. Its loose timing assertions are smoke checks; the enforceable budgets live in `tests/performance/` (see below).
- Done-column virtualization behavior
- Swim lane rendering, settings persistence, and lane-aware moves
- IDB storage: cross-session persistence, migration, and data integrity

## Performance Coverage

`npm run test:perf` is a dedicated serial Chromium suite, separate from the functional E2E suite. It
builds the app and serves the production bundle from `dist-perf/` — the dev server's on-demand
transform makes cold startup swing several hundred percent between runs, which no stable budget
survives. It generates fixed synthetic 400-task and 1,000-task boards in standard and swimlane views.
Each steady-state scenario runs three cold starts and five real `page.mouse` SortableJS drops per start.
Separate 400-task and 1,000-task scenarios start without the migration flag and time the real
event-log backfill. Each scenario prints one `KANVANA_PERFORMANCE` JSON record and attaches the
same JSON to the Playwright result. The smoke check holds an image request open to prove that
startup timing stops at the board-render mark, before browser `load` finishes.
CI uploads `client/test-results/performance-report.json` for review after each run.

### What each metric measures

- `fixtureSeedMs` — the harness writing its own read model into IndexedDB. This is setup cost, **not**
  the app's event-backfill migration. Steady-state scenarios pre-set the backfill flag and measure
  returning-user startup. Separate migration scenarios leave the flag unset and assert that the
  expected number of synthetic events was emitted.
- `backfillMs` — time spent in the one-time `backfillEventLog()` migration on first startup.
  This measures event creation, not replay of an existing event log.
- `startupMs` — navigation start to the first completed full-board render mark. Card counts are
  checked separately, so browser `load` delays and Playwright polling do not inflate this metric.
- `taskDropLatencyMs` — measured **in-page**, from pointer-up to the last board render the drop
  triggers. Wall-clock around the gesture would be mostly CDP round trips and `expect()` poll
  granularity, which buried real app time roughly 10:1.
- `liveTaskCards` / `liveDomNodes` — `.task` cards and all nodes reachable by walking `document`.
- `detachedDomNodes` — what the post-GC renderer still counts beyond that walk: detached subtrees
  awaiting collection, but also UA shadow trees and engine internals. It is a tripwire on *growth*,
  not an absolute leak count.
- `retainedDomNodes` — the renderer total after a forced CDP `HeapProfiler.collectGarbage`.
- `startupBoardRenders` / `steadyStateBoardRenders` — completed full and reconcile renders. The app
  only emits these marks when the harness sets `globalThis.__kanvanaPerfMarks`, so production sessions
  never accumulate an unbounded mark buffer.
- `browserCrashEvents` — page crashes. A crash aborts the repetition, and the sample is still recorded
  so the budget fails on the crash rather than on whichever call threw first.

Fixtures contain only fixed generated titles, IDs, dates, labels, and descriptions; no application,
production, or personal data is read.

### Budgets

Timing, heap, live-node, and retained-node results use the median of three repetitions. Live-card,
render, and detached-node limits use the largest repetition, and crash events are summed. The
checked-in fixture-seed, drop, and heap baselines are medians from three GitHub-hosted Ubuntu runs:
[October 4 first](https://github.com/mdiener21/kanvana/actions/runs/37236682975),
[October 4 second](https://github.com/mdiener21/kanvana/actions/runs/37237978176), and
[October 5](https://github.com/mdiener21/kanvana/actions/runs/37368949961).
The structural baseline table was re-recorded on 2026-09-16 over three consecutive runs, after the
`forceFallback` drag fix cut swimlane DOM retention roughly in half (1,000 swimlane: 55,843 retained
nodes down to 30,155). The old structural limits then carried about 2x headroom, which is too loose
to catch a regression. Drop limits sit roughly 2x above the slowest CI measurement; heap limits
allow at least 50% above the highest observed use. These runs used the same drop and heap metrics as
the current harness.
CI enables these stricter drop limits with `KANVANA_PERF_BUDGET=ci`. Local `npm run test:perf` uses
the former portable drop thresholds so developers can verify behavior on slower machines.
Startup baselines were re-recorded on 2026-10-07 after changing the metric to use the board-render
mark; earlier values included browser load and Playwright polling delays. Startup budgets retain
headroom until CI calibration of the new startup metric is available.
Backfill baselines were recorded on 2026-10-07 from three cold starts after a two-start calibration
on the same Linux runner; their limits allow roughly 3x variation in migration time.

Structural metrics reproduce almost exactly across runs (standard view is bit-identical; swimlane
retained and detached nodes vary by 28, under 0.1%), so their budgets sit just above baseline: they
fail on a lost virtualization boundary, a duplicated render path, or a board-sized DOM left retained. Render counts are budgeted at exactly their baseline
on purpose — they depend on code, not on runner speed, so any extra render is a real regression.
Drop and heap budgets carry measured headroom because they move with runner load.

| Scenario | Fixture seed baseline / budget (ms) | Startup baseline / budget (ms) | Drop baseline / budget (ms) | Heap baseline / budget (MB) |
|---|---:|---:|---:|---:|
| 400 standard | 9.0 / 200 | 303.9 / 3000 | 59.4 / 150 | 6.04 / 10 |
| 1,000 standard | 18.5 / 250 | 390.5 / 4000 | 103.2 / 250 | 7.52 / 12 |
| 400 swimlane | 8.9 / 200 | 451.8 / 2500 | 95.0 / 250 | 5.40 / 9 |
| 1,000 swimlane | 18.5 / 250 | 355.8 / 3600 | 159.3 / 400 | 7.11 / 11 |

| Migration scenario | Startup baseline / budget (ms) | Backfill baseline / budget (ms) | Startup renders |
|---|---:|---:|---:|
| 400 standard | 343.3 / 3000 | 52.3 / 200 | 1 |
| 1,000 standard | 506.3 / 4000 | 127.9 / 400 | 1 |

| Scenario | Live cards baseline / budget | Live nodes baseline / budget | Detached nodes baseline / budget | Retained nodes baseline / budget | Startup renders | Renders for five moves | Crash events |
|---|---:|---:|---:|---:|---:|---:|---:|
| 400 standard | 205 / 210 | 5,513 / 5,800 | 11,832 / 12,500 | 17,345 / 18,300 | 1 | 5 | 0 |
| 1,000 standard | 445 / 450 | 10,073 / 10,600 | 22,632 / 23,800 | 32,705 / 34,400 | 1 | 5 | 0 |
| 400 swimlane | 160 / 165 | 4,726 / 5,000 | 10,069 / 10,600 | 14,795 / 15,600 | 1 | 10 | 0 |
| 1,000 swimlane | 400 / 405 | 9,286 / 9,800 | 20,869 / 22,000 | 30,155 / 31,700 | 1 | 10 | 0 |

### Known limits

- Startup and backfill baselines are local because GitHub has not yet run those revised metrics.
  Use the manual `performance-calibration.yml` workflow for three independent GitHub-runner samples
  after the workflow reaches the default branch. Its three matrix jobs each upload a JSON report.
- Swimlane view hides Done, so drops into a large Done column are exercised by the two standard
  scenarios only; the swimlane scenarios move To Do to In Progress across a populated lane instead.

To collect a candidate baseline without enforcing the existing thresholds:

```bash
KANVANA_PERF_CALIBRATE=1 npm run test:perf
```

Set `KANVANA_PERF_RUNS` to a positive integer for additional repetitions. Update
`tests/performance/performance-budgets.js` and this table together only after repeated runs on a stable
runner explain why a changed baseline is expected.

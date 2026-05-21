# Checkpoint 3 — Unit C complete (plan fully implemented)

**Plan:** `2026-05-21-fix-purge-semantic.md` — Step 5 done. **All 5 steps complete.**
**Date:** 2026-05-21

## What was done (Unit C)

- `client/tests/dom/settings-ui.test.js`
  - Added a hoisted `runPurge` mock + `vi.mock('../../src/modules/sync.js', ...)` (lines 17-23), so the DOM suite no longer loads the real `sync.js`/PocketBase module.
  - Added `runPurge.mockReset()` + `runPurge.mockResolvedValue(undefined)` to `beforeEach` (lines 71-72).
  - Replaced the test `'confirming purge removes all soft-deleted tasks from all boards'` (which asserted real IDB side-effects) with `'confirming purge calls runPurge with the boards list'` (line 236), which asserts `runPurge` was called once with the boards array.

## Verification

- DOM suite: 77/78 passed. `settings-ui.test.js` — all 10 tests green. The single failure is the known pre-existing, unrelated `authsync.test.js` health-probe test (needs a live PocketBase backend).
- Unit suite: 289/289 (from Unit A/B checkpoints; not re-run in Unit C since only a DOM test changed).

## Final state — feature complete

The purge semantic gap is closed:
- `runPurge(boards)` in `sync.js` owns the full purge: online → hard-delete PocketBase task records + prune syncMap; offline → queue via `addPendingHardDelete`; always → `purgeDeleted` per board.
- `settings.js` purge button calls `await runPurge(boards)`.
- `sync.test.js` has 4 unit tests covering `runPurge`; `settings-ui.test.js` is hermetic (mocks `sync.js`).

## Files changed across all 3 units

| File | Unit |
|---|---|
| `client/src/modules/sync.js` | A — import `addPendingHardDelete`; add+export `runPurge` |
| `client/tests/unit/sync.test.js` | A — storage mock/import additions; 4 `runPurge` tests |
| `client/src/modules/settings.js` | B — drop `purgeDeleted` loop; call `runPurge` |
| `client/tests/dom/settings-ui.test.js` | C — mock `sync.js`; replace IDB-assertion purge test |

## Not done / out of scope

- No git commit made — changes are uncommitted in the working tree.
- The pre-existing `authsync.test.js` health-probe failure is unrelated and untouched.

## Run tests (environment note)

`npm`/`node` not on PATH in default WSL shell, and the inherited PATH contains spaces. Use a clean explicit PATH:
`wsl bash -lc "export PATH=/home/mdiener/.nvm/versions/node/v24.13.1/bin:/usr/bin:/bin; cd ~/dev/kanvana/client && npm test"`

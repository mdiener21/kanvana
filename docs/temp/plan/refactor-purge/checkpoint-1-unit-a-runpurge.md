# Checkpoint 1 — Unit A complete (runPurge red→green)

**Plan:** `2026-05-21-fix-purge-semantic.md` — Steps 1, 2, 3 done.
**Date:** 2026-05-21

## What was done

- `client/src/modules/sync.js`
  - Added `addPendingHardDelete` to the `storage.js` import block (line 13).
  - Added + exported `async function runPurge(boards)` after `pushBoardFull` (lines 353-382), before `pullAllBoards`. Byte-identical to the plan's Step 3b reference. Uses `await purgeDeleted(boardId)`.
- `client/tests/unit/sync.test.js`
  - Added `addPendingHardDelete: vi.fn()` to the storage `vi.mock` factory (line 43).
  - Added `addPendingHardDelete` to the `storage.js` named import (line 76) and `runPurge` to the `sync.js` named import (line 64).
  - Added `describe('runPurge', ...)` block with 4 tests (lines 366-415): online-with-pbid, online-skip-no-pbid, offline-queues, purgeDeleted-per-board.

## Verification

- `sync.test.js`: 36 passed (32 pre-existing + 4 new).
- Full unit suite: 289 passed / 0 failed, 17 files. No regressions.
- TDD: 2a and 2c ran red first (`runPurge is not a function`; `addPendingHardDelete` 0 calls) then green. 2b/2d passed on existing code (guard-rail assertions).

## State

- `runPurge` exists and is exported but **not yet called by anything** — `settings.js` still runs the old `purgeDeleted` loop.
- `settings.js` and `settings-ui.test.js` untouched.

## Next: Unit B (plan Step 4)

Wire `settings.js` to call `runPurge`:
- Line 1: drop `purgeDeleted` from the `storage.js` import; add `import { runPurge } from './sync.js';`.
- Lines 192-194: replace the `for (const board of boards) { purgeDeleted(board.id); }` loop with `await runPurge(boards);`.
- After this, `settings-ui.test.js` will likely break (it asserts real IDB side-effects but the active board's runPurge path now hits real sync.js) — that is fixed in Unit C / Step 5, so a red DOM suite between Unit B and Unit C is expected.

## Run tests (environment note)

`npm`/`node` are not on PATH in the default WSL non-login shell. Use:
`wsl bash -lc "cd ~/dev/kanvana/client && npm run test:unit -- tests/unit/sync.test.js"`
(node bin: `/home/mdiener/.nvm/versions/node/v24.13.1/bin`).

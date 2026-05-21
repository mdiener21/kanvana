# Checkpoint 2 — Unit B complete (settings.js wired to runPurge)

**Plan:** `2026-05-21-fix-purge-semantic.md` — Step 4 done.
**Date:** 2026-05-21

## What was done

- `client/src/modules/settings.js`
  - Line 1: removed `purgeDeleted` from the `storage.js` import; added `import { runPurge } from './sync.js';` (line 2).
  - Purge button handler (line 193): replaced the `for (const board of boards) { purgeDeleted(board.id); }` loop with `await runPurge(boards);`. Handler was already `async`. Surrounding `confirmDialog`, `count === 0` early return, and DOM updates unchanged.
  - No other references to `purgeDeleted` remained in the file.

## Verification

- Unit suite: 289/289 passed.
- DOM suite: 77/78 passed. The 1 failure is the pre-existing, unrelated `authsync.test.js` "health probe disables login-btn when PocketBase is unreachable" test — depends on a live PocketBase backend, not affected by this change. This matches the plan's expected DOM count (77/78).
- Notably, `settings-ui.test.js` (10 tests) all still pass even though it imports the real `sync.js` without a mock — Step 5 is for hermeticity, not to fix a break.

## State

- The purge feature is now functionally correct end-to-end: clicking purge calls `runPurge`, which hard-deletes PocketBase records (online) / queues them (offline) and cleans local IDB.
- `settings-ui.test.js` not yet touched — still loads the real `sync.js`.

## Next: Unit C (plan Step 5)

Make `settings-ui.test.js` hermetic by mocking `sync.js`:
- Add a hoisted `runPurge` mock + `vi.mock('../../src/modules/sync.js', ...)`.
- Reset `runPurge` in `beforeEach`.
- Replace the test "confirming purge removes all soft-deleted tasks from all boards" — with `runPurge` mocked it can no longer assert IDB side-effects, so assert `runPurge` was called with the boards list instead.
- See plan Step 5 (5a/5b/5c) for exact code.

## Run tests (environment note)

`npm`/`node` not on PATH in default WSL shell. Use `wsl bash -lc "cd ~/dev/kanvana/client && npm run test:unit"` / `test:dom`. If PATH still broken, prepend `/home/mdiener/.nvm/versions/node/v24.13.1/bin`.

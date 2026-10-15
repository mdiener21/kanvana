# Finish Issue #111 — Remove softDeleteEnabled / pendingHardDeletes

## Context

The handoff (`handoff-2026-05-26-events-issue-111.md`) said issue #111's source changes were
done but 24 unit tests were failing. **Reality has moved on:** the source removal was already
committed (`f2513b3`), and the 24 failing tests have since been fixed in the (uncommitted)
working tree. Current verified state:

- `npm run test:unit` → **280 pass**
- `npm run test:dom` → **51 pass**
- Source clean of `softDelete*` / `pendingHardDelete*` / `runPurge` (only ADR historical notes remain, intended).
- E2E spec, CHANGELOG `Removed` section, ADR-0002 supersede note, ADR-0003 note all updated.

So "finishing the job" = verify E2E, commit the loose changes in two clean commits, fix one
doc-move that breaks AGENTS.md, and close #111. No red tests to drive — the TDD red→green work
is already complete; TDD here means "confirm the full suite is green before committing."

The working tree also contains **non-#111 changes** that must not pollute the #111 commit:
infra (`playwright.config.js` port, `.gitignore`, `vite.config.js` activity.html drop) and a
doc move (`docs/agents/*.md` → untracked `agents/`, identical content) that currently breaks the
`docs/agents/...` links in `AGENTS.md`.

## Decisions (confirmed with user)

- **Two commits:** A = #111 test/doc fixes; B = chore (infra + agents move).
- **Keep the agents/ move**, fix the 3 links in `AGENTS.md` (the real file; `CLAUDE.md` /
  `GEMINI.md` are symlinks to it). Generated artifacts under `docs/codebase/` and
  `graphify-out/` are left as-is.

## Steps

### 0. Copy this plan into the repo
Write this plan to `plan/finish-issue-111.md` in the repo (user request). The `plan/` folder
is freshly created. Not committed unless the user asks.

### 1. Verify E2E green
```
cd client && npm run test:e2e
```
Confirms `tests/e2e/task-delete.spec.ts` (soft-delete case removed, new dialog copy) passes with
the new playwright port config. If browsers are missing, `npx playwright install` first.
If any failure is non-obvious, read test + source together before changing anything.

### 2. Commit A — feat(#111)
Stage only #111-scope files:
- `client/tests/unit/{storage-idb,storage,sync,tasks}.test.js`
- `client/tests/dom/{settings-ui,task-card-delete}.test.js`
- `client/tests/e2e/task-delete.spec.ts`
- `client/tests/TEST-OVERVIEW.md`
- `client/src/modules/{columns,schema,storage}.js`  (comment rewording + dead `createActivityLogEntry` factory removal)
- `CHANGELOG.md`, `CONTEXT.md`
- `docs/adr/0002-permanent-delete-default-soft-delete-opt-in.md`, `docs/adr/0003-global-settings-layer.md`
- `docs/spec/{backend-storage-pb,data-models,tasks,testing}.md`

Message:
```
feat(#111): remove softDeleteEnabled and pendingHardDeletes test/doc cleanup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

### 3. Commit B — chore (infra + doc move)
- `client/playwright.config.js` (E2E_PORT 3100 + strictPort, reuseExistingServer:false)
- `client/vite.config.js` (drop `activity.html` build input)
- `.gitignore` (`dist/`, `build/`)
- `git rm docs/agents/{domain,issue-tracker,triage-labels}.md` and `git add agents/`
- Edit `AGENTS.md` lines 120 / 124 / 129: `docs/agents/<f>.md` → `agents/<f>.md` (3 links)

Message:
```
chore: e2e port config, gitignore build dirs, move agents docs to repo root

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

### 4. Close the issue
```
gh issue close 111 --comment "softDeleteEnabled toggle, pendingHardDeletes queue, and runPurge removed; tests updated (unit/dom/e2e green); ADR-0002 superseded. Committed on feature-event-driven."
```

### 5. Handoff cleanup
Delete the now-stale untracked `handoff-2026-05-26-events-issue-111.md` (it described work that's
done). Not committed — it was never tracked.

## Critical files
- `AGENTS.md` (links to fix; symlinked from CLAUDE.md/GEMINI.md)
- `client/playwright.config.js`, `client/vite.config.js`, `.gitignore`
- #111 test files under `client/tests/{unit,dom,e2e}/`

## Verification
- `cd client && npm test` (unit + dom + e2e) all green — already true for unit/dom; step 1 confirms e2e.
- `git status` after commits: working tree clean except the deleted handoff (and any
  intentionally-ignored `client/dist/`).
- `grep -rn "docs/agents/" AGENTS.md` returns nothing.
- `gh issue view 111` shows state CLOSED.

## Out of scope / not touched
- Next issues (#112 PB schema migration + push queue, #114 SSE, #115 sync indicator). #113/#116
  are `ready-for-human` — skip.
- Generated artifacts (`docs/codebase/codebase.txt`, `graphify-out/*`) still reference old paths;
  they regenerate on next graphify run.

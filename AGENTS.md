# Kanvana — Agent & Developer Guide

> `CLAUDE.md` imports this file (`@AGENTS.md`) and `GEMINI.md` is a symlink to it; edit `AGENTS.md`.

Kanvana is a local-first Kanban board that runs entirely in the browser. Every change is a domain event;
a pure reducer projects events into an in-memory read model persisted in IndexedDB (`kanvana-db`). An
optional PocketBase backend adds auth and event sync across devices.

Stack: vanilla JS ES modules, Vite, `idb`, SortableJS, Lucide, ECharts; Vitest + MSW + Playwright for
tests. Versions are in `client/package.json`.

## Read before changing code

The code is the source of truth. When a doc disagrees with the code, trust the code and fix the doc.

- **`CONTEXT.md`**: domain model and glossary. Read §8 (architecture boundaries) and §9 (event
  sourcing) before touching data flow, storage, sync or rendering.
- **`CODING_STANDARDS.md`**: how code here is written: modules, naming, state changes, DOM, tests.
- **`docs/adr/`**: read any ADR covering the area before a structural change. ADR-0004 (event-sourced
  sync) and ADR-0005 (reducer is the sole read-model writer) govern most of the client.
- **`docs/spec/`**: short reference for how features behave where the code can't say it plainly
  (rules, defaults, edge cases), for agents and users. Update a spec in a line or two when behaviour
  it describes changes; it never blocks a change. `docs/spec/testing.md` holds the perf baselines.

## Layout

```
client/src/kanban.js        entry point; index/reports/calendar/timetracking.html are the pages
client/src/modules/         feature modules; event-sourcing/ holds HLC, ingest, projector, sync
client/tests/               unit/, dom/, e2e/, pwa/, performance/, mocks/ (MSW), fixtures/
backend/                    PocketBase Dockerfile, pb_migrations/, pb_hooks/
docs/                       adr/, spec/, plans/, user/
```

## Commands

Run from `client/` (scripts in `client/package.json`):

```bash
npm run dev            # http://localhost:3000, no backend: the app runs local-only
npm run lint
npm test               # unit + dom + e2e + pwa; run before opening a PR
npm run test:unit      # or test:dom, test:e2e, test:pwa
npm run test:perf      # Chromium perf suite on the production build; CI runs it, npm test does not
npm run test:e2e:live  # multi-device sync specs against a real PocketBase (see below)
```

Commands below use bash syntax. In PowerShell, set env vars first: `$env:PB_PROXY_TARGET='http://127.0.0.1:8090'; npm run dev`.

## Local PocketBase

Run the binary directly for sync, auth and hook work. Download it from https://pocketbase.io/docs/ into
a gitignored folder at the repo root (e.g. `pocketbase_0.40.5/`; on Windows the binary is
`pocketbase.exe`), then from that folder:

```bash
./pocketbase serve --http 127.0.0.1:8090 --migrationsDir ../backend/pb_migrations --hooksDir ../backend/pb_hooks
./pocketbase superuser upsert dev@kanvana.local devpassword123   # once per pb_data; admin UI at :8090/_/
```

Data lands in `pb_data/` next to the binary; delete it for a clean database. Migrations apply on start;
restart after adding a migration or hook.

Point the app at it through the dev server's same-origin `/api` proxy (the app defaults to
`VITE_PB_URL='/'`):

```bash
PB_PROXY_TARGET=http://127.0.0.1:8090 npm run dev                  # app on :3000 syncs to local PB
PB_PROXY_TARGET=http://127.0.0.1:8090 npm run test:e2e:live        # live specs against it
```

Without `PB_PROXY_TARGET`, `test:e2e:live` builds `backend/Dockerfile` into a throwaway container on a
random port instead (needs Docker). A `client/.env.local` with an absolute `VITE_PB_URL` overrides the
`/` default for `npm run dev`.

`docker compose up` (repo root) runs the full stack instead: nginx on :80, PocketBase on :8090 with a
persistent `pb_data` volume, Adminer on :8080.

## Driving the app in a browser

Use `playwright-cli` (global: `npm i -g @playwright/cli`) to see a change working in the real app:
open the page, `snapshot` for element refs, then `click` / `fill` / `screenshot`. Use `-s=<name>`
sessions for two devices side by side when checking sync. `playwright-cli --help` lists commands.
Lasting checks belong in `client/tests/e2e/` as Playwright specs.

## GitHub

Use `gh` for issues, PRs and CI; it infers `mdiener21/kanvana` from the clone.

- Issues and PRDs: `agents/issue-tracker.md`; labels: `agents/triage-labels.md`.
- PR bodies follow `.github/pull_request_template.md`.
- CI failures: `gh pr checks <n>`, then `gh run view <run-id> --log-failed`.
- A push to `main` runs CI: lint/unit/DOM, three E2E shards and PWA + performance run as parallel jobs
  that the required `Test` check aggregates. Pages and FTP deploys need Test, Build and Semgrep; the
  Docker image needs Test and Semgrep, so a red Test ships nothing. A failing E2E shard uploads its Playwright HTML report.
- CI runs E2E on Linux Chromium. Layout assertions (truncation, overflow, box sizes) can pass on
  Windows and fail in CI because form controls render at different widths; treat the PR's CI run as the
  verdict for those.

## AI development workflow

Work moves through Matt Pocock's skills, with GitHub Issues as the tracker (`agents/issue-tracker.md`).
`.claude/skills/` ships `diagnosing-bugs`, `implement-spec`, `improve-codebase-architecture`, `tdd` and
`to-tickets`; `grill-with-docs`, `to-prd` and `code-review` come from the user-level install.

| Work | Flow |
| --- | --- |
| Feature | `/grill-with-docs` (optional, sharpens the plan) → `/to-prd` (PRD issue) → `/to-tickets` (tracer-bullet tickets with blocking edges) → `/implement-spec` |
| Small change or one ticket | `/tdd` on a branch, then a PR |
| Bug | `/diagnosing-bugs` to reproduce and find the cause → `/tdd`: a failing test first, then the fix |
| Refactor | `/improve-codebase-architecture` → `/to-tickets` → `/implement-spec` |

`/implement-spec` builds every ticket with `/tdd` on one integration branch and ends with
`/code-review`. `/to-prd`, `/to-tickets`, `/implement-spec` and `/improve-codebase-architecture` run
only when invoked by name.

## Releases

A green CI run on `main` opens an automatic patch-release PR (`automatic-release.yml`; set the
`AUTO_RELEASE_ENABLED` variable to `false` to pause it). For a minor or major release run **Actions →
Generate Release** (`release.yml`). Both use `scripts/prepare-release.mjs`, which bumps
`client/package.json`, moves `[Unreleased]` into a dated `CHANGELOG.md` section and updates the README
version badge. Merging the release PR runs `publish-release.yml`, which tags and publishes it.

## Working rules

- Keep `CHANGELOG.md` `[Unreleased]` current as you work: one user-facing line per change, saying what
  users notice, ending with the issue or PR number, e.g. `- Board: the ⋮ menu opens as a side panel
  on desktop (#344).` Internal-only changes (refactors, tests, CI) get no line.
- Events an AI agent creates through the app carry `actor: { type: 'agent', id: '<model-name>' }`
  (CONTEXT.md §9, Actor Model).
- Domain docs layout (single context: one `CONTEXT.md`, one `docs/adr/`): `agents/domain.md`.

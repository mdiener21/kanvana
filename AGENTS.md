# Kanvana — Agent & Developer Guide

> `CLAUDE.md` and `GEMINI.md` are symlinks to this file; edit `AGENTS.md`.

Kanvana is a local-first Kanban board that runs entirely in the browser. Every change is a domain event;
a pure reducer projects events into an in-memory read model persisted in IndexedDB (`kanvana-db`). An
optional PocketBase backend adds auth and event sync across devices.

Stack: vanilla JS ES modules, Vite, `idb`, SortableJS, Lucide, ECharts; Vitest + MSW + Playwright for
tests. Versions are in `client/package.json`.

## Read before changing code

- **`CONTEXT.md`**: domain model and glossary. Read §8 (architecture boundaries) and §9 (event
  sourcing) before touching data flow, storage, sync or rendering.
- **`CODING_STANDARDS.md`**: how code here is written: modules, naming, state changes, DOM, tests.
- **`docs/adr/`**: read any ADR covering the area before a structural change. ADR-0004 (event-sourced
  sync) and ADR-0005 (reducer is the sole read-model writer) govern most of the client.
- **`docs/spec/`**: feature specs; `docs/spec/testing.md` holds the perf baselines.
- **`docs/ai-workflows/`**: SOPs for a new feature, a bug fix or a refactor.

## Layout

```
client/src/kanban.js        entry point; index/reports/calendar/timetracking.html are the pages
client/src/modules/         feature modules; event-sourcing/ holds HLC, ingest, projector, sync
client/tests/               unit/, dom/, e2e/, pwa/, performance/, mocks/ (MSW), fixtures/
backend/                    PocketBase Dockerfile, pb_migrations/, pb_hooks/
docs/                       adr/, spec/, plans/, user/, ai-workflows/
```

## Commands

Run from `client/` (scripts in `client/package.json`):

```bash
npm run dev            # http://localhost:3000
npm run lint
npm test               # unit + dom + e2e + pwa; run before opening a PR
npm run test:unit      # or test:dom, test:e2e, test:pwa
npm run test:perf      # Chromium perf suite on the production build; CI runs it, npm test does not
npm run test:e2e:live  # multi-device sync against a real PocketBase; needs Docker up
```

Local PocketBase without Docker (download from https://pocketbase.io/docs/), from the folder holding
the binary:

```bash
./pocketbase serve --migrationsDir ../backend/pb_migrations --hooksDir ../backend/pb_hooks
```

## Working rules

- Keep `CHANGELOG.md` `[Unreleased]` current as you work.
- Events an AI agent creates through the app carry `actor: { type: 'agent', id: '<model-name>' }`
  (CONTEXT.md §9, Actor Model).

## Agent skills

- Issue tracker: GitHub Issues on `mdiener21/kanvana` via `gh`; see `agents/issue-tracker.md`.
- Triage labels: `agents/triage-labels.md`.
- Domain docs layout (single context: one `CONTEXT.md`, one `docs/adr/`): `agents/domain.md`.

# Kanvana — Agent & Developer Guide

> **This file is the source of truth for `CLAUDE.md` and `GEMINI.md`** (both are symlinks here).
> Edit `AGENTS.md` directly; the symlinks pick up changes automatically.

Kanvana is a local-first Kanban board that runs entirely in the browser. No server is required for
the core app. All data persists in **IndexedDB** (`kanvana-db`). An optional PocketBase backend
provides auth and cloud sync when deployed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES modules), HTML, CSS |
| Build | Vite 7 |
| Tests | Vitest (unit + DOM), Playwright (E2E), MSW (API mocks) |
| Runtime storage | IndexedDB via `idb` library |
| UI libs | Lucide icons, SortableJS, ECharts (reports) |
| Optional backend | PocketBase behind Nginx (Docker Compose) |

---

## Directory Structure

```
client/             Frontend app (the main product)
  src/
    modules/        Feature modules: board, tasks, labels, reports, drag-drop, …
    kanban.js       Entry point — initialises storage, renders board
    index.html      Main board page
    reports.html    Analytics page
    calendar.html   Calendar view
    activity.html   Board event log page
  tests/
    unit/           Vitest pure-unit tests
    dom/            Vitest + @testing-library/dom integration tests
    mocks/          MSW API mocks shared by Vitest suites
    e2e/            Playwright end-to-end tests
backend/            PocketBase Dockerfile + migrations (optional cloud sync)
cli/                Go CLI tooling
docs/
  adr/              Architecture Decision Records
  agents/           AI-agent configuration (issue tracker, labels, domain)
  spec/             Feature specifications
  superpowers/      Agent workflow docs and plans
CONTEXT.md          Domain model — read before working on any feature
CHANGELOG.md        Keep updated under [Unreleased] as you work
```

---

## Dev Commands

All commands run from `client/`:

```bash
npm run dev          # Vite dev server → http://localhost:3000
npm run build        # Production build → client/dist/
npm run preview      # Serve the production build locally
npm test             # Full suite: unit + DOM + E2E
npm run test:unit    # Vitest unit tests only
npm run test:dom     # Vitest DOM integration tests only
npm run test:e2e     # Playwright E2E tests only
```

Run the full test suite before opening a PR. CI runs all three layers.

---

## Architecture Rules

Read `CONTEXT.md` for the full domain model, entity schemas, and key workflows.
Check `docs/adr/` for recorded architectural decisions before making structural changes.

| Rule | Detail |
|---|---|
| Board is aggregate root | All CRUD is scoped to the active board via `getActiveBoardId()` |
| No cross-board mutation | Use `loadTasksForBoard(id)` / `loadColumnsForBoard(id)` — never read or write another board's state |
| State → render | Every state change must end with `renderBoard()` or an incremental sync helper |
| Circular dep guard | Use dynamic `await import('./render.js')` only for render calls; all other imports must be top-level static |
| `done` column | `id === 'done'` is permanent; never delete or reorder it past the last position |
| Entity IDs | Always `generateId()` from `utils.js` — no numeric or legacy string IDs |
| Keybindings | Register in `DEFAULT_APP_KEYBINDINGS` or `DEFAULT_EDITOR_KEYBINDINGS` — never hardcode key strings |
| Storage init | `initStorage()` is async; call it once at startup before any board operation |
| Audit trail (dual log) | Column moves write to both `columnHistory` (CFD/lead-time) **and** `activityLog` (audit). Both writes are intentional — see ADR-0001. |

---

## Coding Conventions

- Default to **no comments**. Add one only when the WHY is non-obvious: a hidden constraint, a subtle invariant, or a workaround for a specific bug.
- No docstrings or multi-line comment blocks.
- Validate only at system boundaries (user input, external APIs). Trust internal code and framework guarantees.
- Prefer editing existing files; don't add abstractions beyond what the task requires.
- AI agents must set the `actor` field on every audit event they create: `{ type: "agent", id: "<model-name>" }`.

---

## Test Layers

| Layer | Tool | Path |
|---|---|---|
| Unit | Vitest | `client/tests/unit/` |
| DOM integration | Vitest + @testing-library/dom | `client/tests/dom/` |
| API mocking | MSW | `client/tests/mocks/` |
| E2E | Playwright | `client/tests/e2e/` |

Key coverage areas: storage CRUD, UUID migration, swimlane utilities, import/export preflight,
due-date countdown, validation, normalization, subtasks.

---

## Agent Skills

### Issue tracker

Issues live in GitHub Issues (`github.com/mdiener21/kanvana`). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

Five canonical roles mapped to label strings. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context repo — one `CONTEXT.md` at the repo root, one `docs/adr/` directory.
See [`docs/agents/domain.md`](docs/agents/domain.md).

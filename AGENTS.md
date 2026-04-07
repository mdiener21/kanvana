# AGENTS.md

This file provides guidance to AI LLM Agents like Claude Code (claude.ai/code), Gemini, Codex, Github Copilot when working with code in this repository.

## Project Overview

Kanvana a local-first personal + AI Agent kanban board with no backend. `docs/specification-kanban.md` is the specification index and governance entrypoint, and `docs/spec/` contains the canonical feature and data specifications. All state lives in browser localStorage. Built with vanilla JavaScript, HTML, and CSS using Vite for bundling.

## Purpose

Kanvana is a process workflow optimized kanban board system for one person plus their AI-agent run company or companies. The current implementation target is V2 and is defined in docs/spec/specification-kanban.md.

## Read This First

Before making changes, read in this order:

The specification files include core data structures and feature behavior that must be maintained at all times.

- `docs/specification-kanban.md` - Specification index, update policy, and code-to-spec ownership map.
- `docs/spec/*.md` - Canonical feature, data, storage, workflow, and testing specifications.
- docs/spec/specification-kanban.md

## Repo Map

TODO


## Core Engineering Rules

1. Keep changes company-scoped. Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized. If you change schema/API behavior, update all impacted layers:

  - packages/db schema and exports
  - packages/shared types/constants/validators
  - server routes/services
  - ui API clients and pages
3.  Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions
4. Do not replace strategic docs wholesale unless asked. Prefer additive updates. Keep doc/SPEC.md and doc/SPEC-implementation.md aligned.
5.  Keep plan docs dated and centralized. New plan documents belong in doc/plans/ and should use YYYY-MM-DD-slug.md filenames.

## Database Change Workflow

TODO

##  Verification Before Hand-off

TODO

## API and Auth Expectations

TODO

## UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors


## Definition of Done

A change is done when all are true:

- Behavior matches docs/SPEC-implementation.md
- Typecheck, tests, and build pass
- Contracts are synced across
- Docs, Specs and Changelog updated when behavior or commands change


## Commands

```bash
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm test           # Run unit + DOM + E2E suites
npm run test:unit  # Run Vitest unit tests (tests/unit)
npm run test:dom   # Run Vitest DOM integration tests (tests/dom)
npm run test:e2e   # Run Playwright end-to-end tests (tests/e2e)
npm run test:ui    # Run Playwright tests with interactive UI
npm run test:debug # Run Playwright tests in debug mode
```

## Architecture

### Entry Points

- `src/kanban.js` - Main entry, calls `await initStorage()` first, then wires UI handlers and calls `renderBoard()`
- `src/index.html` - Main board UI
- `src/reports.html` - Separate reports page with ECharts visualizations
- `src/calendar.html` - Calendar view showing tasks by due date

**Every new page entry point must call `await initStorage()` before accessing any storage functions.**

### Module Structure (src/modules/)

- **render.js** - Centralized rendering via `renderBoard()`. After any data change, call this to refresh UI. Exports sync helpers (`syncTaskCounters`, `syncCollapsedTitles`, `syncMovedTaskDueDate`) for incremental updates.
- **storage.js** - Multi-board persistence via IndexedDB (`idb` wrapper, `kanvana-db` database, `kv` key-value store). All board data lives in in-memory `state`, loaded once by `await initStorage()` at page startup. All CRUD functions remain synchronous; IDB writes are fire-and-forget. Exports `loadTasksForBoard(id)`, `loadColumnsForBoard(id)`, `loadLabelsForBoard(id)`, `loadSettingsForBoard(id)` for cross-board reads without changing the active board.
- **tasks.js** - Task CRUD, drag-drop position updates (`updateTaskPositionsFromDrop`, `moveTaskToTopInColumn`)
- **columns.js** - Column CRUD, collapse toggle, position updates
- **boards.js** - Multi-board management, board create/switch, template system
- **dragdrop.js** - SortableJS-based drag/drop for tasks and columns. Done column has `sort: false` for performance.
- **modals.js** - Modal UX (close via Escape/backdrop). Uses DOM ids from index.html.
- **dialog.js** - `confirmDialog()` / `alertDialog()` instead of `window.confirm`
- **icons.js** - Lucide icons tree-shaking. To add an icon: import from `lucide`, add to `icons` object, call `renderIcons()` after dynamic DOM changes.
- **notifications.js** - Due date notification banner and modal
- **settings.js** - Per-board settings modal and persistence
- **labels.js** - Label management modal UI
- **dateutils.js** - Due date countdown calculations and formatting
- **calendar.js** - Calendar page rendering with ECharts
- **reports.js** - Reports page with ECharts (lead time, completions, cumulative flow)
- **accordion.js** - Reusable collapsible accordion. `createAccordionSection(title, items, expanded, renderItem)` builds a section with chevron toggle, count badge, and a body populated via the `renderItem` callback.
- **importexport.js** - Per-board JSON export/import. Must update if data shapes change.
- **theme.js** - Light/dark theme toggle and persistence
- **swimlanes.js** - Swim lane grouping logic (label, label-group, priority), grid building, lane/cell collapse, lane-aware task assignment and drag-drop moves
- **validation.js** - Form validation helpers
- **utils.js** - UUID generation and shared utilities

### Data Flow Pattern

```text
load → modify → save → renderBoard()
```

Many modules use `await import('./render.js')` to call `renderBoard()` and avoid circular imports.

### Domain Objects

**Task**: `id`, `title`, `description`, `priority` (urgent|high|medium|low|none), `dueDate` (YYYY-MM-DD), `column`, `order`, `labels[]`, `creationDate`, `changeDate`, `doneDate`, `columnHistory[]`

**Column**: `id`, `name`, `color` (hex), `order`, `collapsed`

**Label**: `id`, `name` (max 40 chars), `color` (hex), `group`

## Key Conventions

- **Technology constraints**: Vanilla JS/CSS/HTML only. No frameworks. Dependencies limited to Lucide, SortableJS, ECharts.
- **Mobile-first**: All interactions must work on small screens follow PWA principles.
- **Mandatory doc updates**: Every code change that adds, changes, or removes functionality **must** also update `CHANGELOG.md` (under `[Unreleased]`) and the relevant file in `docs/spec/` in the same work session. Update `docs/specification-kanban.md` too when the spec structure, ownership map, or process changes — never defer these to a follow-up.
- **Testing stack**: Standardize on `Vitest` for unit tests, `Vitest` + `@testing-library/dom` for DOM integration, `MSW` for mocked API behavior, and `Playwright` for end-to-end coverage.
- **Test folders**: `tests/unit/*.test.js`, `tests/dom/*.test.js`, `tests/mocks/*.js`, and `tests/e2e/*.spec.ts`.
- **Test strategy reference**: Keep the canonical test architecture and naming conventions in `docs/testing-strategy.md`.
- **Theme**: Light/dark via `document.documentElement.dataset.theme`. Persistence key: `kanban-theme`.
- **Done column**: Column with id `done` is permanent and cannot be deleted.
- **New tasks**: Inserted at top of column (order 1).
- **New columns**: Inserted before the Done column.


## Coding Style & Naming Conventions

- **Language + modules**: Use modern ES modules (`import`/`export`) with plain DOM APIs and no frontend framework. Keep side effects in entrypoints (e.g., `src/kanban.js`) and make modules in `src/modules/` export pure functions where practical.
- **JavaScript naming**:
  - Variables, functions, and module exports: `camelCase` (e.g., `renderBoard`, `loadTasks`, `syncTaskCounters`).
  - Classes and constructor-like factories: `PascalCase`.
  - Constants that are truly global or configuration-like: `UPPER_SNAKE_CASE` (used sparingly).
- **File + module naming**:
  - JavaScript files in `src/modules/`: `kebab-case.js` (e.g., `dateutils.js`, `importexport.js`).
  - Test files: `*.test.js` for unit/DOM tests, `*.spec.ts` for Playwright E2E tests (matching `tests/unit`, `tests/dom`, `tests/e2e`).
  - CSS files: `kebab-case.css` in `src/styles/` and `src/styles/components/`.
- **CSS conventions**:
  - Prefer existing design tokens and utilities in `src/styles/tokens.css` and `src/styles/utilities.css` before introducing new ad-hoc styles.
  - Use descriptive, component-oriented class names; avoid over-nesting selectors and avoid styling by element/tag whenever reasonable.
  - Respect theme implementation via `document.documentElement.dataset.theme`; do not hard-code colors—use token variables instead.
- **HTML + data attributes**:
  - Use `kebab-case` for IDs and `data-*` attributes (e.g., `data-column-id`, `data-task-id`).
  - Keep DOM structure and IDs in sync with expectations in `src/modules/modals.js`, `dragdrop.js`, and `render.js`.
- **Comments + docs**:
  - Prefer short, focused comments explaining “why” rather than “what”.
  - When adding new behavior or changing data shapes, update `docs/spec/*.md`, `docs/specification-kanban.md`, and `CHANGELOG.md` in the same work session.


## Release Process

Preferred approach: run the manual GitHub Actions workflow `Generate Release` in `.github/workflows/release.yml`.

When asked to create a release/tag for unreleased changes:

1. **Trigger workflow** — dispatch `Generate Release` on `main` with bump type (`patch|minor|major`).
2. **Build** — workflow runs `npm ci` and `npm run build`.
3. **Version + changelog update** — workflow runs `scripts/prepare-release.mjs` to bump `package.json` and move Unreleased changelog entries into `## [X.Y.Z] - YYYY-MM-DD`.
4. **Lockfile update** — workflow runs `npm install --package-lock-only`.
5. **Create release PR** — workflow commits release files on branch `release/vX.Y.Z` and opens/updates a PR into `main`.
6. **Merge release PR** — once merged, `.github/workflows/publish-release.yml` runs automatically on `main`.
7. **Tag + publish** — publish workflow creates/pushes `vX.Y.Z` and creates GitHub Release with notes extracted from `CHANGELOG.md`.

If PR creation fails in workflow, enable repository setting: `Allow GitHub Actions to create and approve pull requests`.

Fallback manual path should follow the same sequence if automation is unavailable.

### Release conventions

- **Version source of truth**: `package.json` → Vite injects as `__APP_VERSION__` → footer displays it
- **Changelog format**: Keep a Changelog. Sections: `### Added/Changed/Removed (version)`
- **Commit message**: `Bump version to vX.Y.Z and update changelog`
- **Tag**: Annotated `vX.Y.Z` with brief comma-separated summary
- **Release automation**: `.github/workflows/release.yml` + `.github/workflows/publish-release.yml` + `scripts/prepare-release.mjs` + `scripts/extract-release-notes.mjs`
- **Docs to update on feature changes**: `CHANGELOG.md`, relevant `docs/spec/*.md` files, `docs/specification-kanban.md` (when spec governance changes), `CLAUDE.md` (if module structure changes)

## Vite Configuration

- Root: `src/`
- Output: `dist/`
- Base path: `./` (relative, for static hosting)
- Three entry points: index.html, reports.html, and calendar.html

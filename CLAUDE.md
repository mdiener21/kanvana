# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local-first personal kanban board with no backend. `docs/specification-kanban.md` is the specification index and governance entrypoint, and `docs/spec/` contains the canonical feature and data specifications. All state lives in browser localStorage. Built with vanilla JavaScript, HTML, and CSS using Vite for bundling.

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

## Specification

The specification files include core data structures and feature behavior that must be maintained at all times.

- `docs/specification-kanban.md` - Specification index, update policy, and code-to-spec ownership map.
- `docs/spec/*.md` - Canonical feature, data, storage, workflow, and testing specifications.

## Architecture

### Entry Points

- `src/kanban.js` - Main entry, wires UI handlers and calls `renderBoard()`
- `src/index.html` - Main board UI
- `src/reports.html` - Separate reports page with ECharts visualizations
- `src/calendar.html` - Calendar view showing tasks by due date

### Module Structure (src/modules/)

- **render.js** - Centralized rendering via `renderBoard()`. After any data change, call this to refresh UI. Exports sync helpers (`syncTaskCounters`, `syncCollapsedTitles`, `syncMovedTaskDueDate`) for incremental updates.
- **storage.js** - Multi-board localStorage persistence. Keys: `kanbanBoards`, `kanbanActiveBoardId`, `kanbanBoard:<boardId>:columns|tasks|labels|settings`
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
- **Mobile-first**: All interactions must work on small screens.
- **Mandatory doc updates**: Every code change that adds, changes, or removes functionality **must** also update `CHANGELOG.md` (under `[Unreleased]`) and the relevant file in `docs/spec/` in the same work session. Update `docs/specification-kanban.md` too when the spec structure, ownership map, or process changes — never defer these to a follow-up.
- **Testing stack**: Standardize on `Vitest` for unit tests, `Vitest` + `@testing-library/dom` for DOM integration, `MSW` for mocked API behavior, and `Playwright` for end-to-end coverage.
- **Test folders**: `tests/unit/*.test.js`, `tests/dom/*.test.js`, `tests/mocks/*.js`, and `tests/e2e/*.spec.ts`.
- **Test strategy reference**: Keep the canonical test architecture and naming conventions in `docs/testing-strategy.md`.
- **Theme**: Light/dark via `document.documentElement.dataset.theme`. Persistence key: `kanban-theme`.
- **Done column**: Column with id `done` is permanent and cannot be deleted.
- **New tasks**: Inserted at top of column (order 1).
- **New columns**: Inserted before the Done column.

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

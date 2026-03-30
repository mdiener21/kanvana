# Copilot instructions (kanvana)

## Big picture
- This is a **local-first, no-backend** kanban app: all state lives in **browser `localStorage`** and the UI is plain DOM.
- Build tooling is **Vite** with **`src/` as the Vite root** and output to `dist/`.
  - Edit source files in `src/` (do **not** hand-edit `dist/`).
- Specification entrypoint is `docs/specification-kanban.md`, and canonical feature/data specs live in `docs/spec/` (**always keep the relevant spec files updated** as features change).
- Changelog is in `CHANGELOG.md` (**always update** the **[Unreleased]** section following **Keep a Changelog** whenever behavior/UI/data changes).

## Dev workflows
- Dev server: `npm run dev` (Vite opens `http://localhost:3000`).
- Production build: `npm run build` (writes `dist/`).
- Preview build: `npm run preview`.
- When deploying under a sub-path, adjust `base` in `vite.config.js`.

## Architecture / data flow

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
- **validation.js** - Form validation helpers
- **utils.js** - UUID generation and shared utilities

### Data Flow Pattern
Mutations generally follow: **load → modify → save → `renderBoard()`**.
- Many modules call `renderBoard()` via `await import('./render.js')` to avoid tight coupling/circular imports.
- Import/Export is **per-board scoped**:
  - Export saves the **active board** only.
  - Import creates a **new board** from the JSON and switches to it.
  - If you change any persisted shape (board/tasks/columns/labels), you MUST update `importexport.js` normalization/back-compat so exports still round-trip and imports still accept legacy fields.

## Persistence model (critical)
- Multi-board storage is in `src/modules/storage.js`.
  - Boards list key: `kanbanBoards`; active board key: `kanbanActiveBoardId`.
  - Per-board keys are `kanbanBoard:${boardId}:columns|tasks|labels|settings`.
  - Always go through `ensureBoardsInitialized()` / `loadColumns()` / `loadTasks()` / `loadLabels()` rather than reading localStorage directly.
  - Legacy migration exists for single-board keys (`kanbanColumns`, `kanbanTasks`, `kanbanLabels`). Keep backward-compat fields like `task.text` and `task['due-date']` supported where relevant.

## Domain objects (what code expects)
- **Task**: `id`, `title` (legacy: `text`), `description`, `priority` (`urgent|high|medium|low|none`), `dueDate` (`YYYY-MM-DD`), `column`, `order`, `labels[]`, `creationDate`, `changeDate`, `doneDate`, `columnHistory[]`
- **Column**: `id`, `name`, `color` (hex), `order`, `collapsed`
- **Label**: `id`, `name` (max 40 chars), `color` (hex), `group`

## UI conventions
- Mobile first design: the board interactions must all be mobile friendly drag and drop moves and design is for small screens first.
- Modal UX is centralized in `src/modules/modals.js`:
  - Uses modal DOM ids from `src/index.html` and closes via **Escape** and backdrop clicks.
  - Use `confirmDialog()` / `alertDialog()` from `src/modules/dialog.js` for confirmations instead of `window.confirm`.
- Drag/drop is in `src/modules/dragdrop.js`:
  - Task reordering updates `task.order` via DOM order (`updateTaskPositions()` in `tasks.js`).
  - Column reordering updates `column.order` from DOM order (`updateColumnPositions()` in `columns.js`).

## Style system
- Styling is in `src/styles/` with multiple CSS files (base.css, index.css, layout.css, responsive.css, tokens.css, utilities.css, plus components/ subfolder)
- Light/dark theme via `document.documentElement.dataset.theme`
- Theme persistence key: `kanban-theme` (see `src/modules/theme.js`)

## Release Process

Preferred approach: run the manual GitHub Actions workflow `Generate Release` (`.github/workflows/release.yml`).

When asked to generate a release:

1. **Trigger workflow** — run workflow dispatch on `main` with bump type (`patch|minor|major`).
2. **Build** — workflow runs `npm ci` and `npm run build`.
3. **Version bump** — workflow runs `scripts/prepare-release.mjs` to bump `package.json` version and promote `CHANGELOG.md` Unreleased entries into a new versioned section.
4. **Lockfile update** — workflow runs `npm install --package-lock-only` so `package-lock.json` matches the new version.
5. **Create release PR** — workflow commits release files on branch `release/vX.Y.Z` and opens/updates a PR into `main`.
6. **Merge release PR** — once merged, workflow `.github/workflows/publish-release.yml` runs automatically on `main`.
7. **Tag + publish** — publish workflow creates tag `vX.Y.Z` and publishes GitHub Release notes from `CHANGELOG.md`.

If PR creation fails in workflow, enable repository setting: `Allow GitHub Actions to create and approve pull requests`.

If workflow automation is unavailable, fall back to the manual process above using the same sequence.

### Release conventions

- **Version source of truth**: `package.json` → Vite injects as `__APP_VERSION__` → footer displays it
- **Changelog format**: Keep a Changelog. Sections: `### Added/Changed/Removed (version)`
- **Commit message**: `Bump version to vX.Y.Z and update changelog`
- **Tag**: Annotated `vX.Y.Z` with brief comma-separated summary
- **Release automation**: `.github/workflows/release.yml` + `.github/workflows/publish-release.yml` + `scripts/prepare-release.mjs` + `scripts/extract-release-notes.mjs`
- **Docs to update on feature changes**: `CHANGELOG.md`, relevant `docs/spec/*.md` files, `docs/specification-kanban.md` (when spec governance changes), `CLAUDE.md`, `.github/copilot-instructions.md` (if module structure changes)

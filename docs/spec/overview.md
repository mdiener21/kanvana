# Specification Overview

## Product Scope

Kanvana is a local-first kanban application with an optional PocketBase-powered backend for multi-device sync. All application state lives in the browser and can be exported to or imported from JSON files.

## Specification Index

All canonical specs live under `docs/system/spec/`. Start here when adding, changing, or reviewing any feature.

### Core Architecture

| Spec | Purpose |
|---|---|
| `docs/system/spec/data-models.md` | Canonical shapes for board, task, column, label, subtask, relationship, activity log entry, and all PocketBase collection schemas |
| `docs/system/spec/storage.md` | IDB persistence model, in-memory state pattern, storage key layout, migration logic |
| `docs/system/spec/backend-storage-pb.md` | PocketBase sync architecture: auth, auto-sync, conflict resolution, module map, collection schemas |

### Features

| Spec | Purpose |
|---|---|
| `docs/system/spec/board-ui.md` | Main board layout, column/card rendering, drag-drop, mobile behavior |
| `docs/system/spec/tasks.md` | Task CRUD, priority, due date, card display rules |
| `docs/system/spec/columns.md` | Column CRUD, Done column invariants, ordering, collapse |
| `docs/system/spec/labels.md` | Label management, groups, color constraints |
| `docs/system/spec/settings.md` | Per-board settings fields and persistence |
| `docs/system/spec/relationships.md` | Task relationship types, bidirectional sync rules |
| `docs/system/spec/sub-tasks.md` | Sub-task model, checklist behavior, ordering |
| `docs/system/spec/swimlanes.md` | Swim lane grouping modes, collapse state, lane-aware drag-drop |
| `docs/system/spec/audit-trail.md` | Two-log audit trail design: task `activityLog` + board `boardEvents`, event type catalogue |
| `docs/system/spec/notifications.md` | Due-date notification banner and modal behavior |
| `docs/system/spec/import-export.md` | Board JSON export/import format and ID-remapping rules |
| `docs/system/spec/sync.md` | Sync backend Pocketbase data to from local storage |


### Reporting

| Spec | Purpose |
|---|---|
| `docs/system/spec/reports.md` | Reports page: lead time, completions, cumulative flow (ECharts) |
| `docs/system/spec/calendar.md` | Calendar view: task-by-due-date rendering (ECharts) |

### Testing

| Spec | Purpose |
|---|---|
| `docs/system/spec/testing-strategy.md` | Canonical test stack, folder layout, naming conventions, layer goals |
| `docs/system/spec/testing.md` | Test scripts, IDB unit test setup, fixture conventions |

### Governance

| Resource | Purpose |
|---|---|
| `docs/specification-kanban.md` | Spec index, update policy, code-to-spec ownership map — read first before any change |
| `docs/adr/` | Architecture decision records — one file per significant architectural decision |

## Technology Rules and Principles

- Only vanilla CSS, JavaScript, and HTML
- Minimal to no dependencies:
  - `lucide` for tree-shaken icons via `src/modules/icons.js`
  - `sortablejs` for task and column drag and drop
  - `echarts` for reports and calendar visualizations only
- Storage: browser **IndexedDB** via the `idb` wrapper (migrated from localStorage)
- Data persistence: JSON import/export to local disk
- No server, no frameworks
- Build tooling: Vite with ES modules
- Frontend package root: `client/` (`npm install`, `npm run dev`, and `npm run build` run from there)
- Reports bundling keeps ECharts and ZRender in dedicated vendor chunks (`vendor-echarts`, `vendor-zrender`)
- Production Docker builds use the repository root `Dockerfile`, build the frontend from `client/`, and publish the `prod` target as an nginx static image
- Docker Compose development mounts `client/` as the frontend package root and runs Vite with browser auto-open disabled (`--open false`) to avoid desktop-launch calls inside containers

## Entry Points

- `src/kanban.js` / `src/index.html` - main board UI, wires handlers, calls `renderBoard()`
- `src/reports.html` - reports page (ECharts)
- `src/calendar.html` - calendar page (ECharts)
- `src/activity.html` - board activity log page
- `src/impressum.html` - impressum/imprint page

**Every entry point must call `await initStorage()` before accessing any storage functions.**

## Module Map

- `src/modules/schema.js` - canonical factory functions for all domain objects (`createTask`, `createColumn`, `createLabel`, `createBoard`, `createSubTask`, `createRelationship`, `createActivityLogEntry`)
- `src/modules/render.js` - centralized board rendering and incremental sync helpers (`renderBoard`, `syncTaskCounters`, `syncCollapsedTitles`)
- `src/modules/idb-store.js` - IDB singleton, key helpers (`keyFor`, `getBoardEventsKey`), `schedulePersist`, `scheduleDelete`
- `src/modules/board-serializer.js` - board import ID-remapping (`normalizeBoardModelIds`)
- `src/modules/storage.js` - in-memory state, all CRUD helpers (`load*`/`save*`), `initStorage()`, migration, default data
- `src/modules/tasks.js` - task CRUD and drop-position updates
- `src/modules/columns.js` - column CRUD, collapse, ordering, sorting
- `src/modules/boards.js` - board management and templates
- `src/modules/dragdrop.js` - SortableJS-based task/column drag and drop
- `src/modules/modals.js` - modal open/close wiring and Escape/backdrop behavior
- `src/modules/dialog.js` - confirm and alert dialog helpers
- `src/modules/icons.js` - Lucide icon registration and `renderIcons()`
- `src/modules/notifications.js` - due-date banner and modal
- `src/modules/settings.js` - per-board settings modal and persistence
- `src/modules/labels.js` - label management UI
- `src/modules/dateutils.js` - countdown and date formatting helpers
- `src/modules/calendar.js` - calendar page rendering
- `src/modules/reports.js` - reports page rendering
- `src/modules/accordion.js` - reusable collapsible accordion component
- `src/modules/importexport.js` - board JSON export/import normalization
- `src/modules/theme.js` - theme toggle and persistence
- `src/modules/swimlanes.js` - swim lane grouping, collapse, assignment, and lane-aware moves
- `src/modules/swimlane-renderer.js` - swim lane DOM rendering helpers
- `src/modules/validation.js` - form validation helpers
- `src/modules/utils.js` - UUID generation and shared utilities
- `src/modules/normalize.js` - data normalization: priority, color (`isHexColor`, `defaultColumnColor`), dates, relationships, sub-tasks, activity log, string keys
- `src/modules/security.js` - HTML escaping (`escapeHtml`) and byte formatting utilities
- `src/modules/dom.js` - minimal DOM construction helper (`el()` factory)
- `src/modules/events.js` - lightweight event bus replacing circular dynamic imports
- `src/modules/constants.js` - domain constants (priorities, column IDs, defaults)
- `src/modules/task-card.js` - task card DOM element builder
- `src/modules/task-modal.js` - task edit/create modal logic
- `src/modules/column-element.js` - column DOM element builder
- `src/modules/column-modal.js` - column edit/create modal logic
- `src/modules/boards-modal.js` - manage boards modal logic
- `src/modules/labels-modal.js` - label management modal UI
- `src/modules/impressum.js` - impressum/imprint page logic
- `src/modules/activity-log.js` - activity event factory (`createActivityEvent`), `appendTaskActivity`, board event helpers
- `src/modules/activity-log-ui.js` - activity event formatting (`formatActivityEvent`) and accordion rendering for the activity page
- `src/modules/activity.js` - activity page entry: initialises storage, renders the board activity log
- `src/modules/sync.js` - PocketBase SDK init, auth functions, `pushBoardFull`, `pullAllBoards`
- `src/modules/autosync.js` - `kanban-local-change` event listener, debounced auto-push, in-flight guard
- `src/modules/authsync.js` - auth/sync UI orchestration, login modal handlers

## Data Flow

Mutations generally follow:

```text
load -> modify -> save -> renderBoard()
```

Many modules call `renderBoard()` through the `events.js` bus or dynamic imports to avoid circular dependencies.

## Rendering and UI Foundations

- `renderBoard()` clears and rebuilds the board from persisted state
- Columns are sorted by `column.order`
- Tasks are sorted within each column by `task.order`
- Lucide icons are re-rendered after dynamic DOM updates
- Labels are preloaded into a `Map` during render to avoid repeated label reads

## CSS Architecture

Styles are organized under `src/styles/` with `src/styles/index.css` importing files in cascade order:

- `tokens.css` - theme variables
- `base.css` - element resets
- `utilities.css` - utility classes
- `layout.css` - shell layout
- `responsive.css` - media-query overrides
- `components/buttons.css`
- `components/icons.css`
- `components/column.css`
- `components/card.css`
- `components/forms.css`
- `components/modals.css`
- `components/accordion.css`
- `components/labels.css`
- `components/notifications.css`
- `components/dragdrop.css`
- `components/reports.css`
- `components/auth.css` - auth modal and sync button styles
- `components/impressum.css` - impressum page styles

The app uses CSS custom properties and `html[data-theme]` for theming.

## Icons

- Icons are imported and registered only through `src/modules/icons.js`
- After adding dynamic markup with `data-lucide`, call `renderIcons()`

## Default Data

- Default columns: `To Do`, `In Progress`, `Done`
- Default labels: `Urgent`, `Feature`, `Task`
- Default sample board includes 6 sample tasks

## Footer and Help

- Footer reminds users that data lives in the browser and should be exported
- The canonical help copy lives in `docs/user/help-how-to.md`

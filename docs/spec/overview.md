# Specification Overview

## Product Scope

Kanvana is a Kanban Board, a local-first kanban application with no backend. All application state lives in the browser and can be exported to or imported from JSON files.

## Technology Rules and Principles

- Only vanilla CSS, JavaScript, and HTML
- Minimal dependencies:
  - `lucide` for tree-shaken icons via `src/modules/icons.js`
  - `sortablejs` for task and column drag and drop
  - `echarts` for reports and calendar visualizations only
- Storage: browser **IndexedDB** via the `idb` wrapper (migrated from localStorage)
- Data persistence: JSON import/export to local disk
- No server, no frameworks
- Build tooling: Vite with ES modules
- Reports bundling keeps ECharts and ZRender in dedicated vendor chunks (`vendor-echarts`, `vendor-zrender`)

## Entry Points

- `src/kanban.js` - main board entry, wires UI handlers and calls `renderBoard()`
- `src/index.html` - main board UI
- `src/reports.html` - reports page
- `src/calendar.html` - calendar page

## Module Map

- `src/modules/render.js` - centralized board rendering and incremental sync helpers
- `src/modules/storage.js` - multi-board IndexedDB persistence with in-memory state
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
- `src/modules/normalize.js` - data normalization, priority/color/relationship validation
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

## Data Flow

Mutations generally follow:

```text
load -> modify -> save -> renderBoard()
```

Many modules call `renderBoard()` through dynamic imports to avoid circular dependencies.

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
- The canonical help copy lives in `docs/help-how-to.md`

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added (unreleased)

### Chnaged (unreleased)

### Removed (unreleased)

### Added (1.2.2)

- Quick-access swim lane toggle in the board controls menu for enabling/disabling swim lanes without opening Settings.
- Drag-and-drop swim lane ordering in Settings modal — reorder lanes for any grouping mode, persisted per board.

### Changed (1.2.2)

- Swimlane row collapse button now shows only the chevron icon by default; the bordered box appears only on hover.
- Removed colored left-border accent from swimlane row headers.
- Import preflight review now checks JSON schema and file size before saving any board data, then asks for confirmation with a summary of imported counts and warnings.
- Added a built-in AI Agent Ops starter board template with beginner-friendly columns, pre-labeled starter tasks, and grouped Agent/Workstream/Artifact labels for managing 2-5 parallel agents.

### Changed (1.2.2)

- Reports now escape user-controlled tooltip content, swimlane action buttons no longer rely on HTML injection for icons, and the app pages send a stricter Content Security Policy.
- The main README now highlights the AI Agent Ops starter template near the top to better attract agent-building users to the project.

### Removed (1.2.2)

## [1.2.1] - 2026-03-22

### Added (1.2.1)

- Documented and standardized the project test architecture around `Vitest`, `@testing-library/dom`, `MSW`, and `Playwright`, including a dedicated testing strategy reference and folder naming convention.
- Added a split canonical specification set under `docs/spec/`, with `docs/specification-kanban.md` now acting as the spec index, governance entrypoint, and code-to-spec ownership map.
- Added a pull request template and a CI spec-sync check that requires spec and changelog updates when files under `src/` change.

### Fixed (1.2.1)

- Swimlane columns now expand to fill available window width, matching the non-swimlane board layout behavior.

### Changed (1.2.1)

- `npm test` now runs the full unit, DOM integration, and Playwright end-to-end suites in sequence.
- Added dedicated `npm run test:dom` and `npm run test:e2e` scripts for the standardized split between DOM integration and browser journey coverage.
- Added initial DOM and MSW scaffold files with passing example tests to establish the new `tests/dom/` and `tests/mocks/` workflow.
- Contributor guidance in `CLAUDE.md`, `.github/copilot-instructions.md`, and `docs/readme.md` now points to the new split specification structure instead of a single monolithic spec file.

### Removed (1.2.1)

## [1.2.0] - 2026-03-21

### Added (1.2.0)

- Toggleable swim lane board view with label, label-group, and priority grouping, sticky lane headers, `No Group` fallback lane, and persisted per-board settings
- Swim lane-aware drag and drop that updates persisted lane assignment and allows moves across lanes, columns, or both in one gesture
- Swim lane test coverage: pure logic unit tests plus Playwright integration tests for toggle/rendering, drag-drop movement, and settings persistence
- Accordion-style swim lane collapse/expand controls with persisted per-board collapsed lane state
- Label-group swim lane configuration now lets the user pick a specific label group so each label value in that group renders as its own swim lane row
- Per-cell collapse/expand toggles in swim lane view allowing individual swimlane-column cells to be collapsed independently of row and column collapse
- Add-task button in each swim lane cell that creates a task in the target column and automatically assigns the correct label or priority based on the swimlane

### Fixed (1.2.0)

- Swim lane task cards now display the same column accent colors (left color bar, hover tint, border color) as standard column view
- Collapsed workflow columns in swim lane view now accept drag-and-drop with visual hover feedback (dashed outline), matching standard column view behavior

### Changed (1.2.0)

- Swim lane row headers now render as a full-width bar above the row of column cells instead of a sidebar column, with `sticky; left: 0` positioning so the header stays pinned to the left viewport edge during horizontal scrolling
- Collapsed workflow column headers in swim lane view now show only the collapse/expand toggle, hiding the title, task counter, and add-task button
- Removed the "Swim Lane" corner cell from the swim lane grid header
- Board rendering now supports a swim lane grid mode while keeping the existing column-only layout unchanged when the feature is off
- Board import/export now preserves swim lane settings and explicit task lane assignments
- Swim lane controls moved out of the board toolbar into the Settings modal
- Expanded swim lane rows now hide done-column cards by default to keep lanes compact while preserving Done as a drag-and-drop target
- Swim lane workflow headers now stay visible during vertical scrolling, and column collapse continues to work while swim lanes are enabled
- In priority-grouped swim lanes, dragging a task between lanes now updates the task priority to match the target lane
- Collapsed swim lane rows now render as a single compact bar spanning all columns, showing chevron, lane name, active count, and done count in one horizontal line
- Swim lane row toggle button moved to the left of the lane name for consistent expand/collapse control placement
- Mobile swim lane layout switched from CSS grid to flex so lane headers (36px vertical strip) stay sticky-visible on the left edge while swiping through 85vw snap-scrolling columns

### Removed (1.2.0)

## [1.1.4] - 2026-02-19

### Added (1.1.4)

### Changed (1.1.4)

- Release automation switched to PR-first flow: `Generate Release` now opens/updates a release PR, and `Publish Release` publishes tag + GitHub Release automatically after merge to `main`

### Removed (1.1.4)

## [1.1.3] - 2026-02-19

### Added (1.1.3)

- Same-day completions report section: KPIs (this week, last week, avg per week) and a 12-week bar sparkline showing tasks created and completed on the same day

### Changed (1.1.3)

- Tasks in the Done column no longer show overdue/urgency countdown styling; due date is displayed without countdown text in neutral styling. Updates immediately on drag-drop.
- Column color picker now displays hex color code alongside the color selector, matching the label editor UX
- Added a quick-access Notifications bell beside the menu button while keeping Notifications in the controls dropdown; both buttons now show the same live notification count badge and open the same modal
- Improved drag-drop performance for Done column: disabled internal sorting of done (tasks always placed at top of done) and eliminated redundant localStorage reads during drop operations
- Added a manual GitHub Actions release pipeline (`Generate Release`) that runs build, bumps version/changelog, pushes commit and tag, and publishes a GitHub Release with changelog notes

### Removed (1.1.3)

## [1.1.2] - 2026-02-14

### Added (1.1.2)

- Create Board modal now includes a Template dropdown to create a new board from a built-in template (or start blank)

### Changed (1.1.2)

- Task edit modal redesigned with 2-column layout on desktop
  - Left column: title, description, priority, due date, column selector
  - Right column: labels section
  - Modal width increased to 850px on desktop for better space utilization
  - Remains single-column on mobile devices for optimal touch interaction
- Active labels in task modal now wrap to multiple lines instead of horizontal scrolling when many labels are selected
- Manage Boards modal now closes immediately after clicking "Open" on a board

### Removed (1.1.2)

## [1.1.0] - 2026-02-14

The jump to 1.1.0 reflects a substantial release with many new features, quality-of-life improvements, and stronger end-to-end test coverage.

### Added (2026-02-14)

- Due date countdown timer showing time remaining in task footer
  - Countdown displays beside due date in format "Due MM/DD/YYYY (countdown)"
  - Shows months and days for periods ≥ 30 days (e.g., "2 months 5 days", "1 month")
  - Shows only days for periods < 30 days (e.g., "5 days", "tomorrow", "today")
  - Three-tier color coding for quick visual prioritization (configurable in Settings):
    - Red: within urgent threshold (default: < 3 days to due)
    - Amber: within warning threshold (default: 3-10 days to due)
    - Default: beyond warning threshold (default: > 10 days to due)
  - Overdue tasks show "overdue by X days" or "overdue by X months Y days"
- Countdown color threshold settings in Settings modal
  - Urgent threshold: customize when countdown shows red (default: 3 days)
  - Warning threshold: customize when countdown shows amber (default: 10 days)
  - Per-board configuration allows different workflows for different boards
- Shared date utility module (`dateutils.js`) for consistent countdown calculations across features

### Changed (2026-02-14)

- Dragging tasks onto collapsed columns now highlights the column with a dashed outline and drops the task at the top of that column
- Task drag now auto-scrolls within tall columns so tasks can be dropped beyond the visible viewport
- Mobile task drag now auto-scrolls the column as you drag toward the top or bottom edge

### Removed (2026-02-14)


## [1.0.13] - 2026-02-10

### Added (1.0.13)

- Calendar page (`calendar.html`) showing a one-month due-date calendar with per-day counts and a clickable list of tasks due on the selected date (each task link opens the task on the board); linked from the main menu

### Changed (1.0.13)

- Task description textarea in task modal now supports vertical resizing (user can drag to expand height while width stays fixed)
- Reports page layout updated so each section has more space; on mobile, sections are swipeable like columns
- Reports lead time chart now shows Completed as blue bars, with Avg lead time and Trend as lines
- Calendar now highlights overdue due-date counts and overdue tasks in red
- Reports and Calendar pages now honor the saved theme (including dark mode)

### Removed (1.0.13)

## [1.0.12] - 2026-02-09

### Added (1.0.12)

- Playwright E2E test suite (`npm test`) covering boards, task creation/validation, and drag/drop performance scenarios.

### Changed (1.0.12)

- Drag/drop now prefers native HTML5 drag-and-drop on non-touch pointers (keeps SortableJS fallback for touch/coarse pointers) to improve first-drag reliability on desktop and compatibility with Playwright automation.
- Modals now keep the action buttons (Cancel/Save/Close) sticky at the bottom while the modal content scrolls, preventing the actions from flowing off-screen.
- Task priority now supports `urgent` (above high) and `none` (below low), and the default priority is now `none`.

### Removed (1.0.12)

## [1.0.11] - 2026-02-06

### Added (1.0.11)

- **Performance optimization**: Incremental task drop updates avoid full board re-render, dramatically improving drag-drop speed into columns with 100+ tasks
- **Done column virtualization**: Initially renders 50 tasks with "Show more" button to load additional batches, enabling smooth performance with 300+ completed tasks
- **Test infrastructure**: Playwright E2E tests with performance fixtures (300+ tasks) to ensure drag-drop completes in <1 second
- Test scripts: `npm test`, `npm run test:ui`, `npm run test:debug`
- Test fixture generator: `tests/fixtures/generate-fixture.js` creates performance test boards with 300+ tasks
- "Show more" button styling for virtualized task lists in Done column
- Task title now clamps to a single line with ellipsis on cards

### Changed (1.0.11)

- Drag-drop now uses `updateTaskPositionsFromDrop()` for targeted updates instead of full `renderBoard()`, reducing post-drop work from O(n*m) to O(affected columns only)
- Task `columnHistory` only updates when task changes columns (not for reorders within same column), reducing unnecessary data writes
- Label loading optimized: pre-loads labels into Map once per render instead of repeated `loadLabels()` calls per task
- Task counters and collapsed column titles sync incrementally after drop without DOM rebuild
- Notifications refresh only when tasks move between columns (not on reorder)
- `createTaskElement()` now accepts pre-loaded labels map as optional parameter for performance
- Task card layout: due date and age render together in the footer bottom row
- Reports bundle size reduced by switching ECharts to modular imports (only required charts/components)

### Removed (1.0.11)

## [1.0.10] - 2026-02-06

### Changed (1.0.10)

- Refactored monolithic `design.css` (2,285 lines) into a modular CSS architecture under `src/styles/` with 16 focused files organized by concern (tokens, base, layout, utilities, responsive, and 10 component files)
- Manage Labels modal now uses an accordion to group labels; first group expanded by default, others collapsed
- Extracted reusable accordion component (`src/modules/accordion.js`, `src/styles/components/accordion.css`) with generic `createAccordionSection(title, items, expanded, renderItem)` API
- Board-level task search now also matches label group names (e.g., searching "People" shows all tasks with labels in the People group)

## [1.0.9] - 2026-02-06

### Added (1.0.9)

- Label groups: labels can now have an optional group field for organizational grouping (e.g. People, Activities)
- Manage Labels modal displays labels organized by group with uppercase section headers
- Task modal label picker shows labels organized by group
- Label create/edit modal includes a group input with autocomplete suggestions from existing groups
- Label search now matches against group names in both Manage Labels and task label picker

## [1.0.8] - 2026-02-06

### Added (1.0.8)

- Label create/edit modal now shows an editable hex color code field next to the color picker, kept in bidirectional sync
- Hex color input validation prevents saving labels with invalid color codes

## [1.0.7] - 2026-02-01

### Added (1.0.7)

- Label search in task editor now shows a full-width "No label found 'X' - Create label" button when no matches are found, allowing users to quickly create a new label with the search term as the pre-filled name
- Form validation for task title and column name fields: both fields are now required and display a red error state with explanatory message when submitted empty
- Validation module (`src/modules/validation.js`) for reusable form field validation functions

### Changed (1.0.7)

### Removed (1.0.7)

## [1.0.6] - 2026-01-31

### Added (1.0.6)

- Reports dashboard: Cumulative Flow Diagram (CFD) stacked area chart showing task count by column over time.
- Task edit modal now includes a small X close button in the top-right.

### Changed (1.0.6)

- Tasks now track `columnHistory` to support cumulative flow reporting.
- Reports page layout redesigned as a fixed dashboard grid with reports-specific styles (no page scrolling).
- Collapsed columns now display the task count in the header (e.g., "To Do (5)")
- Notifications upcoming window (days) is now configurable per board in Settings (default: 3)
- Theme toggle now shows the sun icon when dark mode is active
- Notification banner on desktop now fills a single row with as many tasks as fit before showing a “more” indicator
- Notification banner now refits its task count when the window is resized
- update bump version automagically

### Removed (1.0.6)

## [1.0.5] - 2026-01-25

### Added (1.0.5)

- Column menu now includes a "Sort" option to sort tasks by due date (earliest first) or priority (high to low)
- Notification banner showing tasks due within 2 days or overdue, positioned below the header
- Notifications modal accessible via bell icon in the board menu, listing all urgent tasks
- Notification badge on bell icon showing count of tasks needing attention
- Notification banner close (X) button to hide the banner
- Notifications modal toggle to show/hide the notification banner

### Changed (1.0.5)

- Age is now shown as an example `1y 6M 40d` not simply only `5d`
- Fix: correct column order calculation when adding a new column so that done remains in last order
- Notification banner layout/scroll behavior refined for desktop and mobile

## [1.0.4] - 2026-01-17

### Added (1.0.4)

- Footer now shows the app version
- Reports dashboard now includes weekly lead time (creation → done) bar chart with a trend line
- Reports dashboard now includes weekly completion KPIs and a completed-per-week sparkline

## [1.0.3] - 2026-01-17

### Added (1.0.3)

- Tasks now track `doneDate` when moved into the Done column

### Changed (1.0.3)

- The Done column is now permanent and cannot be deleted

## [1.0.2] - 2026-01-17

### Added (1.0.2)

- Manage Boards modal now includes an "Add Board" button (opens the Create New Board modal)
- Manage Boards modal now includes an inline export button per board (download icon)
- Manage Boards modal now includes an "Import Board" button
- Reports page (reports.html) with an ECharts calendar heatmap of daily updates for the active board (last 365 days)
- Settings toggles to show/hide task priority and show/hide task due date
- Task modal label picker now includes a + button to open Manage Labels and return to the open task
- Edit Task modal now includes an "Open in full page" button (fullscreen icon)
- Manage Labels modal now includes a search field to filter labels
- Columns can now be collapsed into a ~20px bar via a new toggle button (left of the drag handle)

### Changed (1.0.2)

- Creating a board while the Manage Boards modal is open immediately refreshes the boards list to show the new active board
- Board creation entry point moved from the controls dropdown into Manage Boards
- New tasks are inserted at the top of the column (instead of appended to the bottom)
- Export function now includes the board name and replaces any spaces with _ (underscore)
- Label names are now limited to 40 characters (UI prevents longer input and shows an alert)
- Creating/editing a label now warns on duplicate names (case-insensitive, e.g. "Important" vs "important")

### Removed (1.0.2)

- Page refresh/leave warning (`beforeunload`) prompt
- "New Board" button from the controls dropdown menu

## [1.0.0] - 2026-01-11

First public release. No backend. No tracking. No cloud, fully local in your own browser, no-server-required personal kanban board with localStorage persistence. Backup with a single click Export to JSON.

### Added (1.0.0)

- Settings modal (toggle age/updated timestamp, select locale; included in export/import)

## [0.0.1] - 2026-01-05

### Added (0.0.1)

- v0.1 first commits
- dark and light theme
- AI agent guidance via `.github/copilot-instructions.md`
- Board-level task search filter (matches label name, task title, or description)
- Show/expand all tasks when >12 tasks in a column

### Changed (0.0.1)

- build process to use Vite
- create ECMA Script Modules
- security try check for import and export json configurations and data
- Limit task card description text to ~2 lines (prevents overly tall cards)
- On mobile, keep the task modal label list height-capped with a scrollbar (instead of expanding to full height)
- Board-level task search also matches task priority text (low/medium/high)
- Task model now includes `changeDate`, updated on task save (edit, move)
- Task cards display `changeDate` as localized date+time and computed age (e.g. `0d`, `3d`, `2M`)
- Import/export JSON now includes `boardName` and import applies it to the active board
- Import now creates a new board (no overwrite)
- Default task priority is now `low` (configurable per board in Settings)

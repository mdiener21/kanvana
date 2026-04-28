# Swimlane Coverage Gap Assessment and Expansion Plan

## Application Overview

Assess current automated coverage after swim lane rollout and define the highest-value missing regression tests for the personal kanban app. Assume a fresh browser-localStorage state for every scenario, then use deterministic fixtures when a scenario requires labels, due dates, multiple boards, or swim lane data.

## Test Scenarios

### 1. Core board regressions missing from current suite

**Seed:** `tests/e2e/seed.spec.ts`

#### 1.1. Search filters tasks across title, description, label, and label group and clears cleanly

**File:** `tests/e2e/search-filter.spec.ts`

**Steps:**
  1. Open the main board with a fixture that contains tasks matching the same search term in different fields: title, description, label name, and label group.
    - expect: All seeded tasks are visible before filtering.
    - expect: The board renders the normal column layout without swim lanes enabled.
  2. Enter a term that matches only a task title.
    - expect: Only the matching task remains visible.
    - expect: Column counters and empty states reflect the filtered view without changing persisted task data.
  3. Repeat with terms that match description text, label name, and label group name.
    - expect: Each query returns the correct matching tasks regardless of which field matched.
    - expect: Matching is case-insensitive.
  4. Clear the search input.
    - expect: All tasks reappear in their original columns and order.
    - expect: No data in localStorage is mutated by filtering.

#### 1.2. Edit task updates board state, metadata, and modal controls correctly

**File:** `tests/e2e/task-editing.spec.ts`

**Steps:**
  1. Open an existing task from the board.
    - expect: The Edit Task modal opens with current title, description, priority, due date, column, and labels prefilled.
    - expect: The modal exposes both the close button and the full-page toggle.
  2. Change the title, description, priority, due date, destination column, and selected labels, then save.
    - expect: The modal closes.
    - expect: The task re-renders in the selected column with the new metadata visible on the card.
  3. Re-open the same task.
    - expect: All edited values persist.
    - expect: The task change timestamp is updated and shown when the related setting is enabled.

#### 1.3. Delete task requires confirmation and updates counters in all affected views

**File:** `tests/e2e/task-deletion.spec.ts`

**Steps:**
  1. Seed at least one active task and one done task, then trigger task deletion from a card action.
    - expect: A confirmation dialog appears before deletion is committed.
    - expect: The dialog clearly identifies the destructive action.
  2. Cancel the deletion.
    - expect: The task remains visible and counters stay unchanged.
  3. Trigger deletion again and confirm it.
    - expect: The task is removed from the board.
    - expect: The source column counter decrements immediately.
    - expect: Reloading the page does not restore the deleted task.

#### 1.4. Column create, edit, sort, collapse, and delete flows remain stable

**File:** `tests/e2e/column-management.spec.ts`

**Steps:**
  1. Create a new column from the controls menu.
    - expect: The new column appears before Done.
    - expect: Its default state is expanded and ready to accept tasks.
  2. Edit the new column name and color from the column menu.
    - expect: The updated name and accent color appear in the UI.
    - expect: The changes persist after reload.
  3. Seed multiple tasks with mixed due dates and priorities into the column, then run both sort options from the column menu.
    - expect: Sort by due date places earlier due dates first and undated tasks last.
    - expect: Sort by priority reorders tasks into the expected priority order.
  4. Collapse and expand the column, then delete the custom column.
    - expect: The collapsed rail remains usable and expandable.
    - expect: Deleting the column removes it after confirmation.
    - expect: The permanent Done column still cannot be deleted.

#### 1.5. Label management and inline label creation work from both the board and task modal

**File:** `tests/e2e/labels-management.spec.ts`

**Steps:**
  1. Open Manage Labels and create labels with and without a group, then search for them in the modal.
    - expect: New labels appear in the correct accordion section.
    - expect: Search filters labels by both label name and group.
  2. Open a task modal, filter available labels, and use the inline add-label action to create a new label without losing in-progress task edits.
    - expect: The add-label flow returns to the task modal with prior edits preserved.
    - expect: The new label is immediately selectable and visible on save.
  3. Delete a label that is assigned to tasks.
    - expect: A confirmation is shown.
    - expect: The label is removed from the management view and from every affected task card.

#### 1.6. Settings, due-date notifications, and display toggles persist per board

**File:** `tests/e2e/settings-notifications.spec.ts`

**Steps:**
  1. Seed tasks with due dates inside and outside the configured urgent and warning thresholds, then open Settings.
    - expect: Current settings values are loaded into the modal.
    - expect: Notification and countdown controls are editable.
  2. Change locale, default priority, due-date visibility, age visibility, updated-time visibility, and countdown thresholds, then save or close the modal as required by the UX.
    - expect: Task cards immediately reflect the changed display settings.
    - expect: Date formatting follows the selected locale.
    - expect: Threshold coloring updates for due-date countdowns.
  3. Open the Notifications entry point from both the bell button and the menu.
    - expect: Both entry points open the same notifications experience.
    - expect: Only tasks inside the configured notification window are listed.
  4. Reload the board.
    - expect: The changed settings persist for the active board.
    - expect: Newly created tasks use the configured default priority.

#### 1.7. Export and import round-trip the active board without leaking data across boards

**File:** `tests/e2e/import-export.spec.ts`

**Steps:**
  1. Create a non-default board with custom columns, tasks, labels, and swim lane-related settings.
    - expect: The new board becomes active and displays the seeded content.
  2. Export the active board to JSON.
    - expect: A single-board export file is downloaded.
    - expect: The export contains the active board data shape needed for round-tripping.
  3. Import the exported file back into the app.
    - expect: Import creates a new board and switches to it.
    - expect: Columns, tasks, labels, and settings match the exported board.
  4. Switch between the source board, imported board, and an unrelated board.
    - expect: Board data stays isolated.
    - expect: No unrelated board is modified by export or import.

### 2. Swim lane regression expansion

**Seed:** `tests/e2e/seed.spec.ts`

#### 2.1. Changing swim lane grouping live rebuilds rows without losing tasks

**File:** `tests/e2e/swimlanes-group-switching.spec.ts`

**Steps:**
  1. Seed tasks and labels that support label, label-group, and priority grouping, then enable swim lanes.
    - expect: Rows appear for the default grouping mode.
    - expect: Done cells remain visible as drop targets while done cards stay hidden in expanded lanes.
  2. Switch grouping from label to label-group and choose a concrete label group, then switch to priority.
    - expect: The lane headers rebuild immediately for each mode without a page reload.
    - expect: Tasks always appear in the correct lane-column cell after each mode change.
  3. Disable swim lanes after switching modes several times.
    - expect: The board returns to the flat column layout with no task loss or order corruption.

#### 2.2. Cell-level collapse and persistence work independently from row and column collapse

**File:** `tests/e2e/swimlanes-cell-collapse.spec.ts`

**Steps:**
  1. Enable swim lanes on a board that has multiple populated cells in the same row and column grid.
    - expect: Cell collapse buttons are shown for eligible non-Done cells.
    - expect: Rows and columns start expanded.
  2. Collapse one swim lane cell only.
    - expect: Only that cell hides its task list and shows a compact task count summary.
    - expect: Neighboring cells in the same row remain visible.
  3. Collapse the containing row and then re-expand it, and separately collapse the workflow column and re-expand it.
    - expect: Row collapse and column collapse take precedence while active.
    - expect: The original cell-collapsed state is restored when higher-level collapse is removed.
  4. Reload the page.
    - expect: The per-cell collapse state persists for the active board.

#### 2.3. Adding a task from a swim lane cell prepopulates the correct lane metadata

**File:** `tests/e2e/swimlanes-add-task.spec.ts`

**Steps:**
  1. Enable swim lanes in label mode and click the add-task button inside a specific swim lane cell.
    - expect: The Add Task modal opens with the clicked workflow column pre-selected.
    - expect: The lane label for that row is pre-selected in the task form.
  2. Save the task and verify its placement.
    - expect: The task appears in the same swim lane row and selected workflow column.
    - expect: Persisted task labels or explicit lane assignment match the row that was used to create it.
  3. Repeat in priority mode.
    - expect: The task priority defaults to the selected lane priority.
    - expect: The task renders in the expected priority lane after save.

#### 2.4. Swim lane drag-drop still works with collapsed workflow columns and No Group targets

**File:** `tests/e2e/swimlanes-collapsed-dropzones.spec.ts`

**Steps:**
  1. Enable swim lanes and collapse one workflow column that will be used as a drag target.
    - expect: The column collapses across all swim lane rows but remains visibly droppable.
  2. Drag a task from an expanded lane into the collapsed column within the same lane.
    - expect: The move succeeds and persists the new workflow column.
    - expect: The task can be restored by expanding the column again.
  3. Drag another task into the No Group lane and then into Done.
    - expect: The explicit No Group assignment persists.
    - expect: Dragging into Done succeeds even though done cards stay hidden in expanded rows.

#### 2.5. Swim lane settings and collapsed state are isolated per board

**File:** `tests/e2e/swimlanes-board-isolation.spec.ts`

**Steps:**
  1. Create two boards with different label sets and enable swim lanes only on the first board.
    - expect: Board one renders swim lanes with its chosen grouping mode.
    - expect: Board two remains in normal column layout.
  2. Collapse a lane and a cell on board one, then switch to board two and configure a different swim lane mode there.
    - expect: Each board stores its own swim lane settings and collapse state.
    - expect: Changing settings on one board does not mutate the other board.
  3. Reload and switch between the boards again.
    - expect: Each board restores its own prior swim lane configuration correctly.

#### 2.6. Search filtering remains correct while swim lanes are enabled

**File:** `tests/e2e/swimlanes-search.spec.ts`

**Steps:**
  1. Enable swim lanes on a board with tasks across several lanes and columns.
    - expect: Multiple lane rows are visible before filtering.
  2. Search for a term that matches tasks in only one lane and one column.
    - expect: Only the matching tasks remain visible.
    - expect: Empty lanes or cells do not display stale task cards.
  3. Clear the search and then search for a term that matches a label group.
    - expect: The board repopulates correctly when cleared.
    - expect: Label-group matches still work while swim lanes are active.

### 3. Secondary pages and navigation coverage

**Seed:** `tests/e2e/seed.spec.ts`

#### 3.1. Reports page controls update KPIs and charts for the active board

**File:** `tests/e2e/reports-page.spec.ts`

**Steps:**
  1. Open the Reports page from the board menu using a fixture with completed tasks across multiple dates and columns.
    - expect: The page loads for the active board and shows completion, same-day, lead-time, cumulative-flow, and daily-updates sections.
  2. Change chart controls such as completion granularity, same-day granularity, cumulative-flow range, and Include Done.
    - expect: KPIs and chart summaries update without errors.
    - expect: The active-board indicator remains correct.
  3. Use the page navigation to return to the board.
    - expect: Navigation returns to the same active board context.

#### 3.2. Calendar page shows due-date tasks and month navigation correctly

**File:** `tests/e2e/calendar-page.spec.ts`

**Steps:**
  1. Open the Calendar page from the board menu using a fixture with tasks due in different months.
    - expect: The current month grid renders.
    - expect: The selected date panel shows the correct task count for the selected day.
  2. Select a day with due tasks, then navigate to the previous and next months.
    - expect: The due-task list updates to the selected day.
    - expect: Month navigation updates the grid and keeps controls usable.
  3. Return to the board.
    - expect: The app navigates back to the active board without losing state.

#### 3.3. Help modal remains reachable from the main board controls

**File:** `tests/e2e/help-modal.spec.ts`

**Steps:**
  1. Open the main menu and launch the Help experience.
    - expect: The help modal or page opens successfully.
    - expect: Core help content is readable and dismissible.
  2. Close Help and continue working on the board.
    - expect: Focus returns to the board controls.
    - expect: No board state is lost by opening Help.

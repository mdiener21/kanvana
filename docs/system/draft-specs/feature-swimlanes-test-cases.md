# Test Cases — Swim Lanes for Kanban App

Note: this is a test-planning artifact. Canonical shipped behavior now lives in `docs/spec/swimlanes.md`, `docs/spec/settings.md`, and related files linked from `docs/specification-kanban.md`.

Plan:

1. Define the highest-value test areas for swim lanes.
2. Write concrete test cases the AI can implement.
3. Prioritize behavior that can break board usability: toggle, grouping, rendering, drag/drop, persistence.

### Test Suite 1: Swim Lane Toggle

**TC-SL-001 — Open swim lane settings modal**

* **Given** the board is displayed in normal column-only mode
* **When** the user opens swim lane settings
* **Then** a dedicated swim lane settings modal should appear
* **And** it should contain the swim lane toggle and grouping controls
* **And** no page reload should occur

**TC-SL-002 — Enable swim lanes from modal**

* **Given** the board is displayed in normal column-only mode
* **And** the swim lane settings modal is open
* **When** the user turns on the swim lane toggle
* **Then** the board should render tasks grouped into swim lane rows
* **And** the existing columns should remain visible
* **And** no page reload should occur

**TC-SL-003 — Disable swim lanes from modal**

* **Given** swim lanes are enabled
* **And** the swim lane settings modal is open
* **When** the user turns off the swim lane toggle
* **Then** the board should return to the standard column-only layout
* **And** all tasks should still appear in their correct columns
* **And** no tasks should be lost

**TC-SL-004 — Toggle preserves task data**

* **Given** a board with tasks already displayed
* **When** the user enables swim lanes and then disables them
* **Then** task ids, titles, column assignments, and metadata must remain unchanged

**TC-SL-005 — Toggle state persists**

* **Given** the user enabled swim lanes
* **When** the app is reloaded
* **Then** swim lanes should still be enabled from persisted settings

**TC-SL-006 — Modal can close without applying unrelated changes**

* **Given** the swim lane settings modal is open
* **When** the user closes the modal without changing swim lane controls
* **Then** the board should remain in its prior swim lane state

---

### Test Suite 2: Swim Lane Grouping Logic

**TC-SL-007 — Group tasks by selected attribute**

* **Given** swim lanes are enabled and grouping is set to `priority`
* **When** the board is rendered
* **Then** tasks should be placed into lanes matching their priority value

**TC-SL-007B — Group tasks by values inside the selected label group**

* **Given** swim lanes are enabled and grouping is set to `label-group`
* **And** the user selected the label group `Teams`
* **When** the board is rendered
* **Then** each label in `Teams` should render as its own swim lane row
* **And** tasks should appear under the row for their matching label value within `Teams`

**TC-SL-007A — Priority lanes render in workflow order**

* **Given** swim lanes are enabled and grouping is set to `priority`
* **When** the board is rendered
* **Then** lane order should remain `Urgent`, `High`, `Medium`, `Low`, `None`

**TC-SL-008 — Tasks without grouping attribute go to default lane**

* **Given** swim lanes are enabled
* **And** some tasks do not have the selected grouping attribute
* **When** the board is rendered
* **Then** those tasks should appear in the `No Group` lane

**TC-SL-009 — Empty swim lanes are handled correctly**

* **Given** swim lanes are enabled
* **And** grouping is set to a specific label group
* **When** one label in the selected group has no tasks
* **Then** the empty swim lane row for that label should still render
* **And** should not break layout

**TC-SL-010 — Lane headers render correct labels**

* **Given** swim lanes are enabled
* **When** tasks are grouped by an attribute
* **Then** each lane header should display the correct attribute value

**TC-SL-011 — Grouping switch updates lanes from modal**

* **Given** swim lanes are enabled and grouped by `label`
* **And** the swim lane settings modal is open
* **When** the user changes grouping to `priority`
* **Then** the board should immediately regroup tasks by priority
* **And** no page reload should occur

**TC-SL-011A — Selecting a concrete label group updates rows from modal**

* **Given** swim lanes are enabled and grouping is set to `label-group`
* **When** the user selects a different label group in the swim lane settings modal
* **Then** the board should immediately rebuild rows so each row matches a label value from the newly selected group
* **And** no page reload should occur

**TC-SL-012 — Grouping selection persists**

* **Given** the user selected a grouping type
* **When** the app reloads
* **Then** the same grouping type should be restored from persisted settings

**TC-SL-012A — Selected label group persists**

* **Given** the user selected grouping type `label-group` and chose a specific label group
* **When** the app reloads
* **Then** the same label group selection should be restored from persisted settings

---

### Test Suite 3: Rendering and Layout

**TC-SL-013 — Board renders as row × column grid**

* **Given** swim lanes are enabled
* **When** the board is rendered
* **Then** each swim lane should contain one cell per workflow column
* **And** tasks should appear only in the correct lane-column cell

**TC-SL-014 — Column headers remain unchanged**

* **Given** swim lanes are enabled
* **When** the board is rendered
* **Then** existing column names and ordering should remain unchanged

**TC-SL-014A — Column headers stay visible during vertical scroll**

* **Given** swim lanes are enabled
* **And** the board content is tall enough to scroll vertically
* **When** the user scrolls down through the swim lane grid
* **Then** the workflow column headers should remain visible at the top of the board

**TC-SL-014B — Column collapse works in swim lane mode**

* **Given** swim lanes are enabled
* **When** the user collapses a workflow column from the swim lane header row
* **Then** that column should collapse consistently across every swim lane row
* **And** the header should remain visible so the column can be expanded again

**TC-SL-014C — Expanding a collapsed swim lane column restores its contents**

* **Given** a workflow column is collapsed while swim lanes are enabled
* **When** the user expands that column again
* **Then** the visible cells in that column should be restored across every swim lane row

**TC-SL-015 — Large number of tasks renders correctly**

* **Given** swim lanes are enabled
* **And** a lane contains many completed tasks in the `Done` column
* **When** the board is rendered
* **Then** the UI should remain usable
* **And** the expanded swim lane should not grow excessively because done items are excluded from the visible lane body

**TC-SL-015A — Done column remains available as a drop target**

* **Given** swim lanes are enabled
* **When** the board is rendered with done items excluded from expanded lane content
* **Then** the `Done` column should still render as a valid drop zone for task moves

**TC-SL-015B — Swim lane can collapse and expand**

* **Given** swim lanes are enabled
* **When** the user activates the collapse control on a swim lane header
* **Then** the swim lane body should be hidden while the header remains visible
* **When** the user activates the control again
* **Then** the swim lane body should be restored without a page reload

**TC-SL-016 — Default board rendering unchanged when swim lanes off**

* **Given** the current app behavior without swim lanes
* **When** swim lanes are disabled
* **Then** the rendered DOM/layout should match expected standard board behavior

---

### Test Suite 4: Drag and Drop

**TC-SL-015 — Move task between columns in same swim lane**

* **Given** swim lanes are enabled
* **And** a task is in lane `Project A`, column `To Do`
* **When** the task is dragged to `In Progress` within the same lane
* **Then** the task column should update to `In Progress`
* **And** the lane assignment should remain `Project A`

**TC-SL-016 — Move task between swim lanes in same column**

* **Given** swim lanes are enabled
* **And** a task is in lane `Project A`, column `To Do`
* **When** the task is dragged to lane `Project B` in the same column
* **Then** the grouping attribute should update to `Project B`
* **And** the column should remain `To Do`

**TC-SL-017 — Move task between swim lanes and columns at once**

* **Given** swim lanes are enabled
* **And** a task is in lane `Project A`, column `To Do`
* **When** the task is dragged to lane `Project B`, column `Done`
* **Then** both the lane grouping attribute and column status should update correctly

**TC-SL-017B — Move task between priority lanes**

* **Given** swim lanes are enabled and grouped by `priority`
* **And** a task is in lane `Medium`, column `To Do`
* **When** the task is dragged to lane `High` in the same column
* **Then** the task priority should update to `high`
* **And** the column should remain `To Do`

**TC-SL-017A — Move active task into Done when done items are hidden**

* **Given** swim lanes are enabled
* **And** done items are excluded from the visible expanded swim lane body
* **When** the user drags a task from an active column into `Done`
* **Then** the move should succeed
* **And** the task should persist with column status `Done`

**TC-SL-018 — Drag task into No Group lane**

* **Given** swim lanes are enabled
* **When** a task is moved into the `No Group` lane
* **Then** the grouping attribute should be removed or set to empty according to the data model

**TC-SL-019 — Invalid drag target is rejected**

* **Given** swim lanes are enabled
* **When** the user drops a task outside a valid lane-column drop zone
* **Then** the task should return to its original position
* **And** task data should remain unchanged

---

### Test Suite 5: Persistence and State Management

**TC-SL-020 — Persist swim lane enabled state**

* **Given** the user enables swim lanes
* **When** board settings are saved
* **Then** the persisted state should contain `swimLanesEnabled = true`

**TC-SL-021 — Persist swim lane grouping type**

* **Given** the user selects grouping type `priority`
* **When** board settings are saved
* **Then** the persisted state should contain `swimLaneGroupBy = priority`

**TC-SL-021A — Persist selected label group**

* **Given** the user selects grouping type `label-group` and chooses `Teams`
* **When** board settings are saved
* **Then** the persisted state should contain `swimLaneLabelGroup = Teams`

**TC-SL-022 — Persist task after swim lane move**

* **Given** a task is moved to a different swim lane
* **When** the task is saved
* **Then** the stored task record should contain the updated grouping attribute value

**TC-SL-023 — Restore board state from storage**

* **Given** swim lane settings and tasks already exist in storage
* **When** the app initializes
* **Then** the board should restore the correct toggle state, grouping type, task columns, and swim lane placement

**TC-SL-023A — Restore swim lane collapsed state**

* **Given** one or more swim lanes were collapsed and that UI state is persisted
* **When** the app initializes
* **Then** the same swim lanes should restore in their collapsed state

---

### Test Suite 6: Core Utility / Logic Functions

These are the most important function-level tests the AI should create.

**TC-SL-024 — `getSwimLaneValue(task, groupBy)` returns correct value**

* Test with valid attribute present
* Test with missing attribute
* Test with empty string
* Expected result should fall back to `No Group` mapping when needed for label-based grouping and to `None` for priority grouping

**TC-SL-025 — `groupTasksBySwimLane(tasks, groupBy)` groups tasks correctly**

* Input tasks with mixed values
* Verify output structure contains all expected lanes
* Verify tasks are assigned to correct groups
* Verify `label-group` mode creates one lane per label in the selected label group even when some lanes are empty

**TC-SL-026 — `buildBoardGrid(columns, swimLanes, tasks)` places tasks in correct cells**

* Verify each task ends up in the exact row/column position
* Verify empty cells exist where no tasks are present

**TC-SL-027 — `toggleSwimLanes(enabled)` updates UI state**

* Verify enabled state updates internal app state
* Verify correct board renderer is called
* Verify no task mutation occurs

**TC-SL-027A — `getVisibleTasksForLane(...)` excludes done items from expanded lane content**

* Verify tasks in non-done columns remain visible
* Verify tasks in the `Done` column are excluded from expanded swim lane content
* Verify hidden done items do not prevent the `Done` drop zone from rendering

**TC-SL-028 — `moveTask(taskId, targetColumnId, targetLaneValue)` updates task correctly**

* Verify column-only move
* Verify lane-only move
* Verify both together
* Verify moving within a selected label-group lane replaces only labels that belong to the chosen label group
* Verify moving within priority grouping updates `task.priority`
* Verify persistence trigger occurs if applicable

**TC-SL-029 — `saveBoardSettings(settings)` persists swim lane config**

* Verify enabled flag is saved
* Verify grouping type is saved
* Verify selected label group is saved when `label-group` mode is active
* Verify existing unrelated settings are not overwritten

**TC-SL-029A — `saveBoardSettings(settings)` persists collapsed lane state when supported**

* Verify collapsed lane ids or equivalent state is saved
* Verify unrelated settings are preserved

**TC-SL-030 — `loadBoardSettings()` handles missing or invalid data safely**

* Missing storage should return defaults
* Invalid JSON should not crash
* Unknown grouping type should fall back to default

---

### Test Suite 7: Edge Cases

**TC-SL-031 — Duplicate lane names handled consistently**

* **Given** multiple tasks resolve to the same grouping display value
* **When** lanes are created
* **Then** only one lane should be rendered for that value

**TC-SL-032 — Case sensitivity behavior is consistent**

* **Given** tasks with grouping values `Project A` and `project a`
* **When** grouped
* **Then** behavior should match product rule
* **And** test should assert either merged or separate lanes explicitly

**TC-SL-033 — Special characters in lane names render safely**

* **Given** grouping values contain `&`, `<`, `>`, quotes, or unicode
* **When** rendered
* **Then** headers should display safely without breaking DOM or HTML

**TC-SL-034 — Task deletion updates swim lane rendering**

* **Given** swim lanes are enabled
* **When** the last task in a lane is deleted
* **Then** the lane should update correctly according to UI rules

**TC-SL-035 — Task creation while swim lanes enabled**

* **Given** swim lanes are enabled
* **When** a new task is created with a grouping attribute
* **Then** it should appear immediately in the correct lane and column

**TC-SL-036 — Task edit updates swim lane placement**

* **Given** swim lanes are enabled
* **When** a task’s grouping attribute is edited
* **Then** the task should move to the correct lane immediately

---

## Priority Order for the AI

### Must-have tests

* TC-SL-001 to TC-SL-006
* TC-SL-015 to TC-SL-019
* TC-SL-020 to TC-SL-030

### Nice-to-have tests

* TC-SL-007 to TC-SL-014
* TC-SL-031 to TC-SL-036

## Recommended test file structure

```text
tests/
  swimlanes/
    swimlanes-toggle.test.js
    swimlanes-grouping.test.js
    swimlanes-rendering.test.js
    swimlanes-dnd.test.js
    swimlanes-persistence.test.js
    swimlanes-utils.test.js
    swimlanes-edgecases.test.js
```

## Best instruction to give the AI

Use these test cases to generate:

* unit tests for pure logic functions
* integration tests for board rendering and toggle behavior
* drag/drop tests for task movement
* persistence tests for local storage / settings store

If you want, I can next turn this into a **developer-ready QA checklist plus Jest/Vitest test skeletons** for a vanilla JS kanban app.

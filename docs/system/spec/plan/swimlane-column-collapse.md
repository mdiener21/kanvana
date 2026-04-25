Swimlane Cell Collapse/Expand Feature
Note: this is an implementation planning artifact. Canonical shipped behavior and persisted-state rules now live in `docs/spec/swimlanes.md` and `docs/spec/settings.md`.

Context
In swimlane mode, users can collapse entire rows (swimlanes) or entire columns, but cannot collapse individual cells (the intersection of a swimlane and column). This feature adds a per-cell toggle so users can collapse tasks within a specific swimlane-column cell independently.

Implementation Plan
1. Storage — src/modules/storage.js
Add swimLaneCellCollapsedKeys: [] to defaultSettings() (after line 220)
Add normalizeSwimLaneCellCollapsedKeys(value) — same pattern as normalizeSwimLaneCollapsedKeys (after line 251)
Add normalization call and field to normalizeSettings() (lines 548-563)
Keys are composite strings: {laneKey}::{columnId} (the :: delimiter doesn't appear in lane keys or column IDs).

2. Swimlane Logic — src/modules/swimlanes.js
Add three new exports mirroring the row-collapse pattern:

makeCellCollapseKey(laneKey, columnId) — returns ${laneKey}::${columnId}
isSwimLaneCellCollapsed(laneKey, columnId, settings) — checks if composite key exists in settings.swimLaneCellCollapsedKeys
toggleSwimLaneCellCollapsed(laneKey, columnId) — loads settings, toggles key in/out of array, saves settings
3. Rendering — src/modules/render.js
createSwimlaneCell (line 746):

Accept cell-collapsed state (computed by caller or derive from settings)
For normal cells (not done column, not column-collapsed): add a small toggle button at the top of the cell
chevron-right when collapsed, chevron-down when expanded
Click handler: toggleSwimLaneCellCollapsed(lane.key, column.id) then renderBoard()
aria-expanded and aria-label for accessibility
When cell is collapsed: add is-cell-collapsed class, show summary ("N tasks"), hide task list via CSS
renderSwimlaneBoard (line 878):

Compute cell-collapsed state alongside existing row/column collapse:
const cellCollapsed = isSwimLaneCellCollapsed(lane.key, column.id, settings);
const visibleTasksInCell = collapsed ? []
  : column?.collapsed === true ? tasksInCell
  : cellCollapsed ? []
  : getVisibleTasksForLane(tasksInCell, column.id);
Pass cellCollapsed to createSwimlaneCell
4. Styles — src/styles/components/column.css
Add after existing swimlane cell styles:

.swimlane-cell-header — flex container for toggle + summary
.swimlane-cell-toggle — small (24×24px) button, matching row-toggle styling but smaller
.swimlane-cell.is-cell-collapsed .swimlane-tasks — display: none
.swimlane-cell.is-cell-collapsed — reduced min-height
Hide toggle in done-column cells and column-collapsed cells
5. Documentation Updates
CHANGELOG.md — Add entry under [Unreleased] > Added
docs/spec/swimlanes.md — Document new cell-collapse feature in swim lane behavior
docs/spec/settings.md — Document persisted `swimLaneCellCollapsedKeys` settings state
Files to Modify
File	Change
src/modules/storage.js	Add swimLaneCellCollapsedKeys default + normalizer
src/modules/swimlanes.js	Add makeCellCollapseKey, isSwimLaneCellCollapsed, toggleSwimLaneCellCollapsed
src/modules/render.js	Add toggle button in createSwimlaneCell, update visibility logic in renderSwimlaneBoard
src/styles/components/column.css	Cell-collapse toggle and collapsed-state styles
CHANGELOG.md	Unreleased entry
docs/spec/swimlanes.md	Feature documentation
docs/spec/settings.md	Persisted settings documentation
Edge Cases
Done column / collapsed column cells: No toggle shown (existing behavior handles these)
Row collapsed: Cell hidden entirely — toggle is irrelevant
Empty cells: Show toggle; when collapsed, display "Empty"
Switching group-by: Old cell keys become orphaned but harmless (won't match)
Import/export: Settings object serialized automatically, includes new field
Verification
npm run dev — open board with swimlanes enabled
Verify toggle button appears in each non-done, non-collapsed-column cell
Click toggle → tasks hide, summary shows count, chevron rotates
Refresh page → collapsed state persists
Test alongside row collapse and column collapse (both take precedence)
Test all three group-by modes (label, label-group, priority)
npm run build — verify no build errors

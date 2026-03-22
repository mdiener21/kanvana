# Swim Lanes

## Overview

- Swim lanes are a per-board presentation mode
- A quick-access toggle in the board controls menu allows enabling/disabling swim lanes directly, without opening the Settings modal
- The full swim lane configuration (grouping mode, label group selection) remains in Settings
- The board becomes a grid of swim lane rows by workflow columns
- Swim lanes can be toggled on and off without a page reload

## Grouping Modes

- `label` - lane assignment uses `task.swimlaneLabelId` when present, otherwise the first task label
- `label-group` - the user selects one label group, then each label value in that group becomes a lane
- `priority` - lane assignment uses task priority with stable order `Urgent`, `High`, `Medium`, `Low`, `None`
- Tasks with no matching lane value are shown in `No Group`

## Lane Assignment Rules

- Dragging between swim lanes persists the new lane assignment immediately
- In `label` mode, dropping into a label lane also prepends that label to `task.labels` if needed
- Dropping into `No Group` stores an explicit empty-string lane assignment
- In `label-group` mode, lane moves replace labels only within the selected group and preserve labels from other groups
- In `priority` mode, lane moves update `task.priority`

## Layout Behavior

- Workflow column headers remain visible while scrolling vertically through the swim lane grid
- Each lane renders a full-width header above its row of cells
- Lane headers stay sticky on the left during horizontal scrolling
- Each lane row contains one cell per workflow column

## Done-Column Behavior

- Expanded swim lane rows hide task cards already in the Done column to keep lanes compact
- The Done cell remains an active drop target and shows compact helper text instead of the hidden cards
- Dragging into Done still persists the move and inserts the task at the top of the flattened Done order

## Collapse and Expand Controls

- Each swim lane row has an accordion-style collapse control
- Collapsed rows keep the lane header visible and show lane name plus active and done task counts
- Workflow columns remain collapsible while swim lanes are enabled
- Individual swim lane cells can be collapsed independently through a small chevron toggle
- Cell collapse state is persisted with composite keys in settings
- Row collapse and column collapse take precedence over cell collapse

## Add Task from Swim Lane Cells

- Each non-Done, non-column-collapsed swim lane cell has a plus button
- Adding from a swim lane cell preselects the target column
- In label and label-group modes, the lane label is preselected
- In priority mode, the lane priority is preselected

## Mobile Behavior

- Swim lane rows switch from CSS grid to flex layout on mobile
- Lane headers remain sticky on the left edge while columns use snap-scrolling
- Expanded lane headers show lane names vertically to preserve column width
- Collapsed rows revert to a horizontal full-width bar

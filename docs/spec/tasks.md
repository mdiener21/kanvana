# Tasks

## Create and Edit

- Tasks are created from a column header plus button or from a swim lane cell plus button
- Task form fields: title, description, priority, due date, column, labels
- Title is required and validates inline with red error styling
- Edit mode opens with existing task values prefilled
- The edit modal includes a fullscreen action on larger screens and a dedicated close button

## Placement and Ordering

- New tasks are inserted at the top of the selected column with `order = 1`
- Standard drag and drop can move tasks between columns
- In swim lane mode, a single drag can change both column and lane
- Storage keeps task ordering flattened per column even while swim lanes are enabled

## Card Display

- Task cards show title, optional description, labels, priority badge, delete button, and optional footer metadata
- Clicking anywhere on a task card opens the edit modal, except the delete button which triggers deletion
- Drag-and-drop is distinguished from clicks by pointer movement threshold
- Titles are clamped to one line and descriptions to a short preview
- Footer content is controlled by settings and can include change date, due date, countdown, and task age

## Due Dates and Age

- `changeDate` is formatted with the selected locale using `toLocaleString(locale)`
- Due dates are displayed as `Due MM/DD/YYYY (countdown)` when countdowns are enabled
- Countdown text shows days for short ranges and months plus days for longer ranges
- Overdue tasks display `overdue by ...`
- Urgency coloring uses configurable red and amber thresholds from settings
- Tasks in the Done column show due dates without countdown text or urgency coloring
- Task age is derived from `creationDate` and displayed as years, months, and days as applicable

## Labels in Task Modal

- Selected labels are shown as colored pills with remove buttons
- Available labels can be filtered through a search field
- The first matching label is automatically highlighted; Arrow Up/Down moves the highlight through filtered results
- Pressing Enter toggles the highlighted label (adds or removes) and clears the search field
- When no label matches the search, a "Create label" button appears auto-highlighted and keyboard-navigable
- Pressing Enter on the create-label button opens the Add Label modal with the search text pre-filled
- After creating a label from the task modal, the new label is auto-selected and the search field is cleared
- The label search field can open the Add Label modal without losing in-progress task edits

## Relationships in Task Modal

- The task edit modal includes a Relationships fieldset below the Labels fieldset
- Users select a relationship type (Prerequisite, Dependent, Related) and search for a task by short ID (e.g. `#ae2ry`) or title text
- Adding a relationship automatically creates the inverse on the target task; removing one removes the inverse
- Active relationships are shown as compact badges displaying type and short ID; clicking the short ID opens that task
- Already-linked tasks appear in search results with their current type shown; selecting replaces the type on both sides

## Relationships on Task Cards

- Cards with one or more relationships show a `git-branch` icon followed by `relationships (N)`
- The indicator is right-aligned and placed below the labels section, above the footer
- Cards with no relationships show no indicator

## Sub-tasks on Task Cards

- Cards with one or more sub-tasks show a donut circle and `completed/total Done` label inline in the footer row
- The donut stroke is blue by default and turns green when all sub-tasks are completed
- Cards with no sub-tasks show no indicator
- See [sub-tasks.md](sub-tasks.md) for full sub-task specification

## Task List Size Controls

- Columns with more than 12 tasks show a scrollbar and optional "Show all tasks (N)" control
- Expanded task lists use up to `80vh`

## Update Requirements

Update this file when you change:

- task fields or validation
- task card layout or footer rules
- task ordering or drag behavior
- task modal fields or inline label UX
- relationship UI behavior or card indicator
- sub-task card indicator layout (full sub-task spec lives in [sub-tasks.md](sub-tasks.md))

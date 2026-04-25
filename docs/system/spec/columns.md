# Columns

## Column CRUD

- Columns are created through a modal with required name and color fields
- Missing names show inline validation with red styling and an error message
- New columns are inserted before the permanent `done` column
- Columns can be edited through the header menu
- Columns can be deleted through the header menu, with confirmation when tasks exist

## Ordering and Collapse

- Columns are reordered by drag handle
- Each column has a persisted `order`
- Columns can be collapsed into a narrow rail with persisted state
- Collapsed headers show the column name and task count in standard board view
- Collapsed columns still accept drops and place dropped tasks at the top

## Sorting

- Column menu offers sorting by due date or by priority
- Due-date sorting places earliest due dates first and tasks without due dates last
- Priority sorting orders higher priorities first
- Sorting is persistent because it rewrites each task's `order`

## Column Header Actions

- Plus icon creates a task in the current column
- Ellipsis menu contains edit, sort, and delete actions

## Color Behavior

- Each column has a user-selected hex color
- Column accent styling is reused by task cards in that column

## Done Column Rules

- The column with id `done` is permanent and cannot be deleted
- Done-column sorting via drag reordering is disabled for performance
- Dropping into Done always inserts tasks at the top

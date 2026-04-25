# Calendar

## Calendar Page

- Entry point: `src/calendar.html`
- Operates on the active board
- Shows a one-month calendar based on `task.dueDate`

## Day Cells

- Each day cell shows the number of tasks due on that date
- If any listed task is overdue and not in Done, the count badge is shown in red

## Task List Behavior

- Clicking a day shows the list of tasks due on that date
- Overdue tasks in the list are styled in red
- Task links open the task edit modal on the board and return the user to `index.html`

## Navigation

- The page is accessible from the main board menu as `View Calendar`

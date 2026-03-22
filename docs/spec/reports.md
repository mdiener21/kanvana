# Reports

## Reports Page

- Entry point: `src/reports.html`
- Reports operate on the active board
- Reports use a dedicated layout rather than the main board shell
- Dashboard sections are full-width and become swipeable sections on mobile

## Daily Updates Heatmap

- Shows the last 365 days
- Each day value counts tasks whose `changeDate` falls on that date

## Lead Time and Completion

- Weekly lead time for completed tasks uses `creationDate` to `doneDate`
- Displays average lead time in days plus a 4-week moving-average trend line
- Displays completed-task counts per week as blue bars
- Includes KPIs for completed this week, completed last week, and average lead time over the last 12 weeks
- Includes a small completion sparkline for the last 12 weeks

## Same-Day Completions

- Counts tasks whose `creationDate` and `doneDate` share the same `YYYY-MM-DD`
- Includes KPIs for this week, last week, and average per week over 12 weeks
- Includes a total-count badge and an amber bar sparkline

## Cumulative Flow Diagram

- Uses daily buckets on the x-axis and task counts on the y-axis
- Series are ordered by workflow order and colored by column
- Uses `task.columnHistory` to reconstruct which column a task occupied on each day
- Legacy tasks without history are seeded from the earliest known timestamp and their current column
- Report tooltips must treat imported board data as untrusted and escape any user-controlled labels before rendering tooltip HTML

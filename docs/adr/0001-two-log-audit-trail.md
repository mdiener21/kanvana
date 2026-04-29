# Two-log audit trail: task-embedded + board-scoped

The audit trail is split into two separate logs rather than one unified event stream. The **Task Activity Log** is embedded on each task object (`activityLog[]`) and records everything that happened to that task. The **Board Event Log** is a separate board-scoped store (`events:{boardId}`) and records column lifecycle events and task deletions.

The split exists because task deletion is destructive and permanent — when a task is deleted its embedded log is lost with it. Column lifecycle events (created, renamed, deleted, reordered) and `task.deleted` entries must survive in a store that is not tied to any single task. A single unified log stored on the board would have worked, but it would require all task-level reads to scan a shared list rather than reading directly from the task object.

## Considered Options

**Single board-level event log** — all events (task field changes and column events) go into one store. Simpler model, survives all deletions. Rejected because task-level history reads become linear scans across the full board event stream rather than direct reads from the task.

**No separate board log** — embed everything on the task; accept that column events and deleted-task records are unrecoverable. Rejected because "column X was deleted with 4 tasks" is information worth preserving even after the tasks are gone.

## Consequences

- Column moves write to both `columnHistory` (for CFD/lead-time reports) and `activityLog` (for audit). This redundancy is intentional; `columnHistory` is not replaced.
- Deleting a task permanently destroys its `activityLog`. The Board Event Log records only `{ taskId, taskTitle, column, columnName }` at deletion time — no history survives.

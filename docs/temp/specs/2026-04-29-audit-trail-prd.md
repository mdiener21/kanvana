# PRD: Audit Trail — Task Activity Log + Board Event Log

> Ready to submit as a GitHub issue on mdiener21/personal-kanban

---


##  Context 
  - CONTEXT.md — Section 8 fully documents the audit trail domain model
  - docs/adr/0001-two-log-audit-trail.md — records the two-log architectural decision and its trade-offs
  - docs/superpowers/specs/2026-04-29-audit-trail-prd.md — this PRD full PRD ready to submit as a GitHub issue

## Problem Statement

When tasks move through the board, get edited by AI agents, or are deleted along with their column, there is no record of what happened, who did it, or when. Users cannot answer: "why is this task in its current state?" or "what did an AI agent change overnight?" The existing `columnHistory` field captures column transitions for reporting, but it has no actor, no field-level changes, and nothing survives task deletion.

## Solution

Add a two-log audit trail to Kanvana:

1. **Task Activity Log** — an embedded event array on each task that records every meaningful change to that task (field edits, column moves, label/relationship changes). Visible as a collapsible log list at the bottom of the task edit modal.

2. **Board Event Log** — a separate board-scoped event store that records column lifecycle events (created, renamed, deleted, reordered) and task deletions. Visible on a dedicated Board Activity page alongside Reports and Calendar.

Every event carries a timestamp and an actor identity, making the trail useful now for human users and extensible for future multi-user and AI-agent scenarios.

## User Stories

1. As a user, I want to open a task and see a chronological list of everything that happened to it, so that I can understand how it reached its current state without relying on memory.
2. As a user, I want to see who or what made each change (human, AI agent, or future collaborator), so that I can distinguish my own edits from automated changes.
3. As a user, I want to see the exact before and after values when a field changes (e.g. priority changed from high to medium), so that I know what the task looked like before the edit.
4. As a user, I want to see when a task was created and in which column it started, so that I have a complete picture from day one.
5. As a user, I want to see every column move a task made in order, so that I can trace its workflow journey.
6. As a user, I want to see when labels were added or removed from a task, so that I can understand how its categorization evolved.
7. As a user, I want to see when a due date was set, changed, or cleared, so that I can track how deadlines shifted.
8. As a user, I want to know when a task's description was edited (without seeing the full text diff), so that I am aware a change happened without bloating storage.
9. As a user, I want to see when relationships were added or removed between tasks, so that I can understand how dependency structure changed over time.
10. As a user, I want the activity log to be collapsed by default in the task modal, so that it does not clutter the edit form for everyday use.
11. As a user, I want to expand the activity log in the task modal with a single click, so that I can review history quickly without leaving the task.
12. As a user, I want to see the most recent activity at the top of the log list, so that I can immediately see the latest changes.
13. As a user, I want to view a board-level activity page that shows all column lifecycle events in reverse chronological order, so that I can understand how the board structure itself has evolved.
14. As a user, I want the board activity page to show when a column was deleted and how many tasks were destroyed with it, so that I have a record of destructive operations.
15. As a user, I want the board activity page to show when a column was created, renamed, or reordered, so that I have a full structural history of the board.
16. As a user, I want to see task deletion events on the board activity page, including the task title and column it was in, so that I know what was removed even though the task itself is gone.
17. As an AI agent, I want to identify myself by name when writing events, so that the human user can distinguish my changes from their own.
18. As an AI agent, I want every event I create to carry my actor identity (`{ type: "agent", id: "claude-opus" }`), so that the audit trail is attributable without ambiguity.
19. As a user, I want the activity log to be included in board JSON exports, so that my full history is preserved when I back up or transfer the board.
20. As a user, I want the activity log to be restored when I import a board JSON, so that I do not lose history on import.
21. As a user, I want the board event log to be included in board JSON exports and restored on import, so that board structural history survives backup cycles.
22. As a user, I want the activity log to grow without any cap, so that I never lose old history due to a rolling-window purge.
23. As a user opening an existing board (before this feature shipped), I want to see a clean empty activity log rather than errors or broken state, so that the feature degrades gracefully on older data.
24. As a future multi-user collaborator, I want each event to carry a user ID, so that when online sync is added the audit trail already supports per-user attribution.

## Implementation Decisions

### Two-log architecture
Events are split into two separate stores with different lifetimes:
- **Task Activity Log** (`activityLog[]` on each task in IndexedDB) — survives as long as the task exists; permanently lost when the task is deleted.
- **Board Event Log** (separate IDB key per board, `events:{boardId}`) — survives task and column deletion; the only record of destructive operations.

`columnHistory` is retained unchanged for CFD and lead-time reports. Column moves write to both `columnHistory` and `activityLog`. No consolidation.

### Event envelope
Every event — in both logs — uses the same shape:
```
{
  type: string,
  at: ISO datetime,
  actor: { type: "human" | "agent" | "user", id: string | null },
  details: { ... }
}
```

### Actor model
- `{ type: "human", id: null }` — current single-user UI interactions
- `{ type: "agent", id: "<agent-name>" }` — AI agent identifies itself by passing its actor at the call site
- `{ type: "user", id: "<uuid>" }` — reserved for future multi-user online mode

Actors are set by the caller. The system never infers actor identity.

### Task Activity Log event types and details payloads
- `task.created` → `{ column, columnName }`
- `task.title_changed` → `{ from, to }`
- `task.description_changed` → `{ changed: true }` (flag only — no content stored)
- `task.priority_changed` → `{ from, to }`
- `task.due_date_changed` → `{ from, to }`
- `task.column_moved` → `{ from, to }` (column IDs)
- `task.label_added` → `{ labelId, labelName }`
- `task.label_removed` → `{ labelId, labelName }`
- `task.relationship_added` → `{ targetTaskId, targetTaskTitle, type }`
- `task.relationship_removed` → `{ targetTaskId, targetTaskTitle, type }`

### Board Event Log event types and details payloads
- `column.created` → `{ columnId, columnName }`
- `column.renamed` → `{ columnId, from, to }`
- `column.deleted` → `{ columnName, tasksDestroyed: number }`
- `column.reordered` → `{ columnId, columnName }`
- `task.deleted` → `{ taskId, taskTitle, column, columnName }`

### New module: `activity-log.js`
Deep module. Pure functions only, no DOM. Responsibilities:
- Construct valid event objects from caller-supplied arguments
- Append task events to a task's `activityLog` array
- Load, append, and save board events to `events:{boardId}`

This module is the single point of truth for event construction. All other modules import from it; no module builds event objects inline.

### New module: `activity-log-ui.js`
Renders the log list. Responsibilities:
- Format each event type into a human-readable single-line string
- Build the collapsible "Activity" section DOM for the task edit modal
- Build the board activity page list

### Storage
- `activityLog` defaults to `[]` on all tasks. `loadTasks()` normalizes the field on every read so existing boards are unaffected.
- Board events stored under `events:{boardId}` in the existing `kv` IDB object store.
- Both are included in board JSON export/import. `normalizeActivityLog()` is applied on import to drop malformed entries.

### UI placement
- Task Activity Log: collapsible section at the bottom of the task edit modal. Collapsed by default. Most recent event first.
- Board Event Log: new `activity.html` page (new Vite entry point), navigable from the same nav as Reports and Calendar.

### Retention
Unbounded. Both logs grow indefinitely. No purge or cap.

## Testing Decisions

Good tests verify external behavior, not implementation details. They call the public interface of a module and assert on what comes out — they do not inspect internal state or mock collaborators unless at a true system boundary.

### `activity-log.js` — unit tests (Vitest)
The core of the feature. Test that:
- Each event type produces the correct envelope shape (type, at, actor, details)
- Actor shapes are validated and stored correctly
- `task.description_changed` stores only `{ changed: true }`, never content
- `task.created` stores only `{ column, columnName }`, no other fields
- Appending to an empty `activityLog` initializes the array correctly
- Board events are written to and read from the correct IDB key

Prior art: `client/tests/unit/tasks.test.js`, `client/tests/unit/storage-idb.test.js`

### `normalize.js` additions — unit tests (Vitest)
Test that `normalizeActivityLog()`:
- Drops entries missing `type` or `at`
- Preserves valid entries unchanged
- Returns `[]` for non-array input

Prior art: `client/tests/unit/normalization.test.js`

### `activity-log-ui.js` — DOM integration tests (Vitest + @testing-library/dom)
Test that:
- The collapsible section renders collapsed by default
- Expanding shows the event list
- Each event type renders a readable string (smoke test one per type)
- An empty log renders a "no activity yet" state, not an error

Prior art: `client/tests/dom/`

### Import/export — unit tests (Vitest)
Test that:
- `activityLog` round-trips through export → import without data loss
- Board events round-trip correctly
- `normalizeActivityLog()` is applied on import and drops bad entries

Prior art: `client/tests/unit/importexport.test.js`

## Out of Scope

- Graph or node-edge visualization of the audit trail (log list only)
- Sub-task events (`subtask.added`, `subtask.completed`, `subtask.deleted`) — treated as implementation detail
- Task position changes within a column (`task.order_changed`) — positional noise with no business meaning
- Full description diff / before-after text for description changes
- Real-time sync of audit events to a server or other clients
- Multi-user online mode (actor model supports it structurally, but the online layer itself is out of scope)
- Purge, archival, or retention management UI
- Search or filter within the activity log

## Further Notes

The `columnHistory` field on tasks is intentionally kept alongside the new `activityLog`. It is purpose-built for CFD and lead-time report calculations and should not be replaced. Column moves write to both. This redundancy is recorded in `docs/adr/0001-two-log-audit-trail.md`.

The actor identity for all current UI-driven operations is `{ type: "human", id: null }`. AI agents integrating with Kanvana are responsible for passing their own actor object to every write operation; the system does not infer or inject actor identity automatically.


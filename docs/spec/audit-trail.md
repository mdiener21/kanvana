# Audit Trail

## Feature Summary

Audit trail uses a two-log design:

1. **Task Activity Log** — an `activityLog` array embedded directly on each task object, holding per-task mutation events.
2. **Board Event Store** — a separate IDB key (`events:{boardId}`) holding board-level events: column mutations, task deletions, and column moves.

All events are created via `createActivityEvent()` in `activity-log.js`. Never construct event objects inline.

## Task Activity Log

Stored at `task.activityLog: ActivityEvent[]`. Defaults to `[]` when absent.

Events stored here (task-scoped):
- `task.created`
- `task.title_changed`
- `task.description_changed`
- `task.priority_changed`
- `task.due_date_changed`
- `task.label_added`
- `task.label_removed`
- `task.relationship_added`
- `task.relationship_removed`

### ActivityEvent Shape

```javascript
{
  type: "task.created" | "task.title_changed" | ...,
  at: "YYYY-MM-DDTHH:MM:SS.mmmZ",   // ISO 8601
  details: object,                    // type-specific; description events store only { changed: true }
  actor: { type: "human" | "agent", id: string | null }
}
```

## Board Event Store

**IDB key**: `events:{boardId}` in the `kv` store of `kanvana-db`.

Events stored here (board-scoped):
- `task.column_moved` — cross-column moves
- `task.deleted` — task deletion (also emitted by column deletion for each task in that column)
- `column.created`
- `column.renamed`
- `column.deleted`
- `column.reordered`

`deleteBoard()` removes the `events:{boardId}` key to prevent orphaned IDB entries.

Storage helpers: `loadBoardEvents()`, `saveBoardEvents()`, `appendBoardEvent()`, `getBoardEventsKey()` in `storage.js`.

## Actor Model

Every event carries an `actor` field:

```javascript
actor: { type: "human" | "agent", id: string }
```

`DEFAULT_HUMAN_ACTOR` exported from `activity-log.js`:

```javascript
{ type: "human", id: null }
```

All UI-driven mutations use `DEFAULT_HUMAN_ACTOR`. Agent-driven mutations supply their own actor with `type: "agent"` and a non-empty string `id`. The `type: "user"` value is reserved for future use.

## Event Construction

Always use `createActivityEvent(type, details, actor, at?)` from `activity-log.js`. The function:
- Records an ISO 8601 `at` timestamp (defaults to `new Date().toISOString()`)
- Validates `actor` via `isValidActor()`: human actors must have `id: null`; agent/user actors must have a non-empty string `id`
- Throws if actor is invalid

Convenience helpers:
- `appendTaskActivity(task, event)` — returns a new task object with `event` appended to `task.activityLog`; caller must save
- `appendBoardEvent(boardId, event)` — appends to the board event store and saves immediately (`storage.js`)

## UI

### Task Modal Activity Accordion

`createTaskActivitySection(task)` in `activity-log-ui.js` returns a collapsible accordion DOM element:
- Collapsed by default
- Events displayed newest-first
- Human-readable strings produced by `formatActivityEvent(event)`
- Rendered at the bottom of the right column in `showEditModal()`; reset on `hideModal()`

### Board Activity Page

`activity.html` + `activity.js` — a standalone page listing all board-level events newest-first.
- Accessible via the Activity nav button in the board header
- Shows an empty-state message when no events exist
- Calls `await initStorage()` before accessing any storage functions

## Export / Import

Both `task.activityLog` per task and the board event store (`events:{boardId}`) are included in the board JSON export. On import, structurally invalid entries in either log are dropped silently. Valid entries round-trip without modification.

## Normalization

`normalizeActivityLog(log)` in `normalize.js` strips entries that fail structural validation. An entry is kept only when all of the following hold:
- `type` is a non-empty string
- `at` is a non-empty string that parses as a valid date
- `actor` is a valid actor object (human: `{ type: "human", id: null }`; agent/user: non-empty string `id`)
- `details` is a plain object (not an array)

Called by `loadTasks()` on load to ensure `activityLog` is always a clean array.

## Update Requirements

Update this file when:
- New event types are added or removed
- The `ActivityEvent` shape changes
- Actor model rules change
- Board event store key format changes
- UI entry points for audit trail change

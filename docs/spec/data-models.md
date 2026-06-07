# Data Models

## Board Model

```javascript
{
  id: "uuid",
  name: "Board Name",
  createdAt: "YYYY-MM-DDTHH:MM:SSZ"
}
```

## Task Model

```javascript
{
  id: "uuid",
  title: "task title",
  description: "optional longer description",
  priority: "urgent" | "high" | "medium" | "low" | "none",
  dueDate: "YYYY-MM-DD" | "",
  column: "column-uuid",
  order: number,
  labels: ["label-uuid-1", "label-uuid-2"],
  swimlaneLabelId: "label-uuid" | "",
  creationDate: "YYYY-MM-DDTHH:MM:SSZ",
  changeDate: "YYYY-MM-DDTHH:MM:SSZ",
  doneDate: "YYYY-MM-DDTHH:MM:SSZ",
  columnHistory: [
    { column: "column-uuid", at: "YYYY-MM-DDTHH:MM:SSZ" }
  ],
  relationships: [
    { type: "prerequisite" | "dependent" | "related", targetTaskId: "uuid" }
  ],
  subTasks: [
    { id: "uuid", title: "subtask title", completed: boolean, order: number }
  ],
  activityLog: [
    {
      id: "uuid",
      type: "task.created" | "task.title_changed" | ...,
      at: "YYYY-MM-DDTHH:MM:SS.mmmZ",
      details: object,
      actor: { type: "human", id: null } | { type: "agent" | "user", id: "string" }
    }
  ],
  deleted: boolean
}
```

### Task Field Notes

- `priority` uses the stable order `urgent`, `high`, `medium`, `low`, `none`
- `dueDate` is stored as `YYYY-MM-DD`
- `changeDate` updates on task save and on column changes
- `doneDate` exists only while the task is in the Done column
- `columnHistory` is appended when a task changes columns and powers cumulative-flow reporting
- `swimlaneLabelId` preserves explicit swim lane assignment metadata
- `subTasks` defaults to `[]`; each entry is a SubTask — see SubTask Model below
- `relationships` defaults to `[]`; each entry stores a `type` (`prerequisite`, `dependent`, or `related`) and the UUID `targetTaskId` of the linked task; both sides of a relationship are always stored (bidirectional)
- `activityLog` defaults to `[]`; each entry is an `ActivityLogEntry` — see `docs/system/spec/audit-trail.md` for full shape and event type catalogue; `normalizeActivityLog()` strips structurally invalid entries on load; the `id` field is required for sync deduplication; entries without an `id` are local-only
- `deleted` marks internal tombstones/deleted records; normal read functions filter `deleted: true`

## Column Model

```javascript
{
  id: "uuid",
  name: "Column Name",
  color: "#hexcolor",
  role: "done" | "",
  collapsed: boolean,
  order: number,
  deleted: boolean
}
```

### Column Notes

- `collapsed` defaults to `false`
- All column IDs are UUIDs
- The column with `role: "done"` is permanent and cannot be deleted
- Legacy imported or migrated column id `done` is remapped to a UUID-backed column with `role: "done"`
- `deleted` marks internal tombstones/deleted records

## Label Model

```javascript
{
  id: "uuid",
  name: "Label Name",
  color: "#hexcolor",
  group: "Group Name",
  deleted: boolean
}
```

### Label Notes

- `name` has a maximum length of 40 characters
- All label IDs are UUIDs
- `group` is optional and defaults to an empty string
- Label groups are strings, not separate persisted entities
- `deleted` marks internal tombstones/deleted records

## SubTask Model

SubTasks are stored inline in the `subTasks` array on the parent task. They are not independent board entities.

```javascript
{
  id: "uuid",
  title: "subtask title",
  completed: boolean,
  order: number
}
```

## Relationship Model

Relationships are stored inline in the `relationships` array on each task. Both sides of every relationship are always stored (bidirectional).

```javascript
{
  type: "prerequisite" | "dependent" | "related",
  targetTaskId: "uuid"
}
```

## ActivityLogEntry Model

ActivityLogEntries are stored inline in the `activityLog` array on a task, and separately as board-level events. See `docs/system/spec/audit-trail.md` for the full event type catalogue.

```javascript
{
  id: "uuid",
  type: "task.created" | "task.title_changed" | ...,
  at: "YYYY-MM-DDTHH:MM:SS.mmmZ",
  actor: { type: "human", id: null } | { type: "agent" | "user", id: "string" },
  details: object
}
```

- `id` is required for sync deduplication; entries created before this field was introduced are local-only

## Settings Model

Board settings are stored per board and include UI visibility, due-date thresholds, locale, default priority, and swim lane state.

Key persisted fields include:

- `showPriority`
- `showDueDate`
- `showAge`
- `showChangeDate`
- `notificationsDaysAhead`
- `dueDateUrgentThreshold`
- `dueDateWarningThreshold`
- `locale`
- `defaultTaskPriority`
- `swimLanesEnabled`
- `swimLaneGroupBy`
- `swimLaneLabelGroup`
- `swimLaneCollapsedKeys`
- `swimLaneCellCollapsedKeys`

## PocketBase Collections

When cloud sync is enabled, local models are mirrored to PocketBase. All collections share `owner` (relation → users) and `local_id` (text) fields. Access rules on all operations: `owner = @request.auth.id`.

**boards**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| local_id | text | local UUID |
| name | text | required |
| settings | json | per-board settings blob |
| created_at | text | ISO timestamp |

**columns**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| order | number | |
| collapsed | bool | |
| role | text | `"done"` for the Done column; empty otherwise |
| deleted | bool | tombstone/deleted-record flag |

**labels**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| name | text | required |
| color | text | hex color |
| group | text | optional label group |
| deleted | bool | tombstone/deleted-record flag |

**tasks**
| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| local_id | text | local UUID |
| title | text | required |
| description | text | |
| priority | text | urgent/high/medium/low/none |
| due_date | text | YYYY-MM-DD |
| column | relation → columns | |
| order | number | |
| labels | relation[] → labels | maxSelect: 999 |
| creation_date | text | ISO timestamp |
| change_date | text | ISO timestamp |
| done_date | text | ISO timestamp; only when in Done column |
| column_history | json | array of `{ column, at }` |
| sub_tasks | json | array of SubTask objects |
| swimlane_label_id | text | swim lane label UUID |
| deleted | bool | tombstone/deleted-record flag |

**task_relationships**

Stores directed relationship edges. Both directions are stored as separate records (mirrors the bidirectional JS model). `local_id` is a composite key `"${taskLocalId}::${targetTaskLocalId}"` used for sync deduplication.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| task | relation → tasks | required; cascade delete |
| target_task | relation → tasks | no cascade; cleaned up on next sync push |
| relationship_type | text | prerequisite/dependent/related; required |
| local_id | text | composite dedup key |

**events**

Unified event log for both task-level `activityLog` entries and board-level `boardEvents`. `task` is absent for board-level events. `local_id` is the `ActivityLogEntry.id` UUID; entries without a `local_id` are not synced.

| field | type | notes |
|---|---|---|
| owner | relation → users | required |
| board | relation → boards | required; cascade delete |
| task | relation → tasks | optional; no cascade — history survives task deletion |
| event_type | text | required |
| at | text | ISO timestamp; required |
| actor_type | text | human/agent/user; required |
| actor_id | text | null for human; non-empty for agent/user |
| details | json | event-specific payload |
| local_id | text | ActivityLogEntry UUID for dedup |

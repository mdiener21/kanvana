# Kanvana — Domain Model Context

> Hand-maintained source of truth. Update this file when entity schemas, workflows, or architecture
> boundaries change. Do not regenerate from graphify output.

---

## 1. Core Domain Entities

All canonical factory functions live in `client/src/modules/schema.js`. Every new entity must be
constructed through those factories so all fields are always present.

### Task

The primary work unit. Every task belongs to exactly one column and one board.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Unique per board |
| `title` | string | Required |
| `description` | string | Supports linkified URLs |
| `priority` | `urgent\|high\|medium\|low\|none` | Drives swimlane grouping; default `none` |
| `dueDate` | `YYYY-MM-DD` | Drives calendar + notifications |
| `column` | Column.id | Current column |
| `order` | number | Position within column |
| `labels` | Label.id[] | Many-to-many |
| `creationDate` | ISO datetime | Set on create |
| `changeDate` | ISO datetime | Updated on every mutation |
| `doneDate` | ISO datetime | Set when moved to Done column |
| `columnHistory` | `{column: id, at: ISO datetime}[]` | Ordered log for lead-time/CFD reports |
| `relationships` | Relationship[] | Task-to-task links (prerequisite/dependent/related) |
| `subTasks` | SubTask[] | Nested checklist items |
| `activityLog` | ActivityLogEntry[] | Per-task audit trail |
| `swimlaneLabelId` | string | Pinned swimlane label assignment |
| `deleted` | boolean | Soft-delete flag for PocketBase sync |

**Invariants**
- New tasks insert at order=1 (top of column).
- `doneDate` is set only when the task enters the Done column.
- `columnHistory` must be appended, never rewritten.
- `deleted: true` means soft-deleted; excluded from all normal queries but retained in IDB for sync.

---

### Column

An ordered stage in the workflow.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | Max 40 chars |
| `color` | hex | Display accent; default `#3b82f6` |
| `order` | number | Position on board |
| `collapsed` | boolean | Collapse toggle |
| `role` | `'done'\|''` | `'done'` marks the permanent terminal column |
| `deleted` | boolean | Soft-delete flag for PocketBase sync |

**Invariants**
- The Done column (`role === 'done'`) cannot be deleted or reordered past the last position.
- `isDoneColumn(col)` in `constants.js` is the canonical check — `role === 'done' || id === 'done'`.
- New columns insert before the Done column.
- Column name must be validated before save (`validateColumnName`).

---

### Label

A tag applied to tasks. Labels can be grouped.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | Max 40 chars |
| `color` | hex | |
| `group` | string | Optional grouping for swimlanes |
| `deleted` | boolean | Soft-delete flag for PocketBase sync |

**Invariants**
- Label groups drive the `label-group` swimlane dimension.
- Deleting a label removes it from all task `labels[]` arrays (or soft-deletes it for sync).

---

### Board

A self-contained workspace with its own tasks, columns, labels, and settings.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | |
| `createdAt` | ISO datetime | Set on create |

**Invariants**
- All CRUD operations are scoped to the active board (`getActiveBoardId()`).
- `ensureBoardsInitialized()` must run before any board operation.
- On switch, state is flushed and reloaded from IDB for the new board.

---

### SubTask

A checklist item embedded in a parent task.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `title` | string | |
| `completed` | boolean | |
| `order` | number | |

SubTasks are not independent entities — they live in `task.subTasks[]` and are not synced separately.

---

### Relationship

A directional link between two tasks.

| Field | Type | Notes |
|---|---|---|
| `type` | `prerequisite\|dependent\|related` | |
| `targetTaskId` | UUID | The other task |

Stored in `task.relationships[]` locally; synced to the `task_relationships` PocketBase collection.
Adding a relationship always creates the inverse entry on the target task.

---

### ActivityLogEntry

An event recorded on a task or board.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Required for sync deduplication; absent on pre-sync legacy entries |
| `type` | string | e.g. `task.priority_changed` |
| `at` | ISO datetime | |
| `actor` | `{type, id}` | See actor model below |
| `details` | object | Before/after payload; event-specific |

`actor.type` is one of `human | agent | user`. AI agents must pass `{ type: "agent", id: "<model-name>" }`.

---

### Settings

Per-board configuration (swimlane mode, sort preferences, etc.).
Persisted under the board's IDB key via `loadSettingsForBoard()` / `saveSettingsForBoard()`.

---

## 2. Aggregate Roots and Boundaries

```
Board ──< Column ──< Task ──< SubTask
                 │        └─< Relationship (→ other Task)
                 │        └─< ActivityLogEntry
                 └─< Label (shared across board)
       └─< Settings (1:1)
       └─< BoardEvents[] (board-scoped audit log)
```

- **Board** is the aggregate root. No cross-board references exist.
- **Task** references Labels by ID; labels are not embedded.
- **SubTask** and **Relationship** are embedded inside Task (not top-level entities).

---

## 3. Storage Layer

All state is local-first, stored in **IndexedDB** (`kanvana-db`, version 1, single `kv` object store).

The storage layer is split into three modules:

| Module | Responsibility |
|---|---|
| `idb-store.js` | IDB connection singleton, key helpers, fire-and-forget `schedulePersist()` / `scheduleDelete()` |
| `board-serializer.js` | Board import normalizer — remaps non-UUID IDs, coerces fields on import or IDB migration |
| `storage.js` | In-memory state + all public CRUD functions. Imports from both above. |

**Key scheme** (all keys live in the single `kv` object store):

| Key | Content |
|---|---|
| `kanbanBoards` | Board list array |
| `kanbanActiveBoardId` | Active board ID string |
| `kanbanBoard:{boardId}:tasks` | Task array for board |
| `kanbanBoard:{boardId}:columns` | Column array for board |
| `kanbanBoard:{boardId}:labels` | Label array for board |
| `kanbanBoard:{boardId}:settings` | Settings object for board |
| `events:{boardId}` | Board event log array |

**Pattern:** `initStorage()` (async, called once at startup) → synchronous CRUD functions read/write
in-memory `state` → fire-and-forget IDB writes via `schedulePersist()` → `renderBoard()`.

**Key public functions:**

| Function | Role |
|---|---|
| `initStorage()` | Async bootstrap — opens IDB, loads all state into memory |
| `getActiveBoardId()` | Active board selector |
| `ensureBoardsInitialized()` | Guard called before any board operation |
| `loadTasksForBoard(id)` | Read task state for a board |
| `loadColumnsForBoard(id)` | Read column state for a board |
| `loadLabelsForBoard(id)` | Read label state for a board |
| `loadSettingsForBoard(id)` | Read settings for a board |
| `loadBoardEvents(id)` | Read board event log |
| `saveTasks()` / `saveTasksForBoard(id, tasks)` | Persist task array |
| `listBoards()` | All board metadata |
| `keyFor(boardId, kind)` | IDB key builder |

---

## 4. Cloud Sync Layer (PocketBase)

An optional PocketBase backend provides auth and cloud sync. The local IDB layer is unchanged
whether sync is enabled or not.

| Module | Responsibility |
|---|---|
| `sync.js` | PocketBase SDK instance, auth functions, `pushBoardFull()`, `pullAllBoards()` |
| `authsync.js` | Auth UI — login modal, OAuth2 (Google/Apple/Microsoft), logout, manual sync button |
| `autosync.js` | Debounced auto-sync on `kanban-local-change` window events (700ms debounce) |

**Sync map:** A localStorage key (`kanbanSyncMap`) maps local UUIDs → PocketBase record IDs for
boards, columns, labels, tasks, task_relationships, and events. Used for upsert decisions.

**Push flow:** `pushBoardFull(boardId)` serializes the entire board (columns, tasks, labels,
settings, events, soft-deleted records) and upserts each record to PocketBase.

**Auth:** Email/password or OAuth2. `isAuthenticated()` / `ensureAuthenticated()` guard all sync
operations. `auth-changed` custom window event fires on auth state change.

**Auto-sync:** Enabled/disabled via `isAutoSyncEnabled()` (stored in localStorage). When enabled,
any `kanban-local-change` event triggers a debounced `pushBoardFull()` per board.

---

## 5. Event Bus

`client/src/modules/events.js` — a lightweight `EventTarget`-based bus that replaced the
`await import('./render.js')` circular-dependency workaround.

| Export | Purpose |
|---|---|
| `on(event, handler)` | Subscribe |
| `off(event, handler)` | Unsubscribe |
| `emit(event, detail)` | Publish |
| `BOARD_CHANGED` | `'board:changed'` — board-level structure changed |
| `DATA_CHANGED` | `'data:changed'` — any data mutation |

---

## 6. Feature Modules

| Module | Responsibility |
|---|---|
| `kanban.js` | Entry point — initialises storage, renders board |
| `boards.js` | Board lifecycle: create, rename, switch, template apply |
| `boards-modal.js` | Board selector / management modal |
| `columns.js` | Column CRUD |
| `column-element.js` | Column DOM element factory |
| `column-modal.js` | Column edit modal |
| `tasks.js` | Task CRUD |
| `task-card.js` | Task card DOM element factory |
| `task-modal.js` | Task edit modal (labels, subtasks, relationships, activity log) |
| `labels.js` | Label CRUD |
| `labels-modal.js` | Label management modal |
| `render.js` | `renderBoard()` and incremental sync helpers |
| `swimlanes.js` | Swimlane grouping logic (`groupTasksBySwimLane`, etc.) |
| `swimlane-renderer.js` | Swimlane board DOM builder |
| `dragdrop.js` | SortableJS initialization/teardown; swimlane-aware drop handling |
| `importexport.js` | Board JSON export/import with preflight validation |
| `reports.js` | ECharts: lead time, daily completions, cumulative flow diagram |
| `calendar.js` | Monthly calendar view; groups tasks by `dueDate` |
| `activity.js` | Board event log page |
| `activity-log.js` | Task activity log helpers |
| `activity-log-ui.js` | Task activity log UI (collapsible section in task modal) |
| `notifications.js` | Due-date notification banner/modal |
| `dateutils.js` | Date calculation utilities (`calculateDaysUntilDue`, `formatCountdown`) |
| `modals.js` | Modal coordination and shared modal state |
| `dialog.js` | `alertDialog` / `confirmDialog` helpers |
| `validation.js` | Field validators (column name, task, etc.) |
| `normalize.js` | Data normalization helpers (priority, hex color, relationships, etc.) |
| `settings.js` | Per-board settings load/save |
| `security.js` | Input sanitization |
| `theme.js` | Light/dark theme toggle |
| `icons.js` | Lucide icon hydration |
| `accordion.js` | Accordion UI component |
| `dom.js` | Shared DOM helpers |
| `utils.js` | `generateUUID()` and other pure utilities |
| `constants.js` | Domain constants: priorities, column roles, keybindings |
| `impressum.js` | Impressum/legal page |

---

## 7. Key Workflows

### Board Render Flow
```
initStorage() → ensureBoardsInitialized() → renderBoard()
  → renderSwimlaneBoard() [if swimlane mode]
  → groupTasksBySwimLane → buildBoardGrid → applySwimLaneAssignment
```

### Task Due Date Rendering
```
calculateDaysUntilDue → formatCountdown → getCountdownClassName
  → createTaskElement → getNotificationTasks
```

### Column Management
```
createColumnElement → initializeColumnModalHandlers
  → addColumn | updateColumn | deleteColumn
  → emit(BOARD_CHANGED) → renderBoard()
```

### Import Preflight Flow
```
inspectImportPayload → buildImportConfirmationMessage → importTasks
  → normalizeBoardModelIds (board-serializer) → legacy ID remapping if needed
```

### Sync Flow
```
[local change] → emit('kanban-local-change') → autosync debounce
  → ensureAuthenticated() → pushBoardFull(boardId)
  → upsertRecord per entity → saveSyncMap()
```

---

## 8. Architecture Boundaries

| Boundary | Rule |
|---|---|
| Cross-board data | Use `loadTasksForBoard(id)` / `loadColumnsForBoard(id)` — never read or write another board's state |
| Rendering | All state changes must end with `renderBoard()` or an incremental sync helper |
| Circular deps | Use `events.js` bus for render triggers; do not use `await import('./render.js')` outside of initialization |
| Done column | Use `isDoneColumn(col)` from `constants.js` — checks both `role === 'done'` and legacy `id === 'done'` |
| UUID | All entity IDs use `generateUUID()` from `utils.js`; no numeric or legacy string IDs post-migration |
| Keybindings | Never hardcode key strings; register in `DEFAULT_APP_KEYBINDINGS` in `constants.js` |
| Entity factories | Always use `createTask()`, `createColumn()`, etc. from `schema.js` — never construct entities ad-hoc |
| Soft deletes | Set `deleted: true` on entities intended for removal; purge only after PocketBase sync confirms deletion |

---

## 9. Audit Trail

Two separate audit concepts with different scopes and lifetimes. Recorded in ADR-0001.

### Task Activity Log

Embedded array on each Task (`activityLog[]`). Records every meaningful change to that individual
task. Permanently lost when the task is deleted.

- Answers: "what happened to this task?"
- Shown in the task edit modal (collapsible section at bottom).

**Event types:** `task.created` · `task.title_changed` · `task.description_changed` ·
`task.priority_changed` · `task.due_date_changed` · `task.column_moved` · `task.label_added` ·
`task.label_removed` · `task.relationship_added` · `task.relationship_removed`

### Board Event Log

Board-scoped list stored independently from tasks (`events:{boardId}` IDB key). Survives task and
column deletion. The only place column lifecycle events are recorded.

- Answers: "what happened on this board?"
- Shown on the Activity page (`activity.html`).

**Event types:** `column.created` · `column.renamed` · `column.deleted` (includes task count
destroyed) · `column.reordered` · `task.deleted`

### Actor Model

Every event carries `actor: { type: string, id: string | null }`.

| Value | Meaning |
|---|---|
| `{ type: "human", id: null }` | Current single-user (no identity) |
| `{ type: "agent", id: "claude-sonnet-4-6" }` | AI agent — identifies itself by model name |
| `{ type: "user", id: "<uuid>" }` | Future multi-user online mode |

AI agents are responsible for setting their own actor identity.

### Event Envelope

```json
{
  "id": "<uuid>",
  "type": "task.priority_changed",
  "at": "<ISO datetime>",
  "actor": { "type": "human", "id": null },
  "details": { "from": "high", "to": "medium" }
}
```

`details` always carries before/after values for field changes.

**`columnHistory` relationship:** Kept as-is for CFD/lead-time reports. `activityLog` is additive —
column moves write to both. No consolidation. (See ADR-0001.)

---

## 10. Test Architecture

| Layer | Tool | Location |
|---|---|---|
| Unit | Vitest | `client/tests/unit/*.test.js` |
| DOM integration | Vitest + @testing-library/dom | `client/tests/dom/*.test.js` |
| API mocking | MSW | `client/tests/mocks/*.js` |
| E2E | Playwright | `client/tests/e2e/*.spec.ts` |

Key coverage areas: storage CRUD, UUID migration, swimlane utilities, import/export preflight,
due-date countdown, validation, normalization, subtasks, sync/autosync, activity log.

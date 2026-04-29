# Kanvana — Domain Model Context

> Generated 2026-04-29 from `graphify-out/GRAPH_REPORT.md` (860 nodes · 1387 edges · 54 communities).

---

## 1. Core Domain Entities

### Task
The primary work unit. Every task belongs to exactly one column and one board.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Unique per board |
| `title` | string | Required |
| `description` | string | Supports linkified URLs |
| `priority` | `urgent\|high\|medium\|low\|none` | Drives swimlane grouping |
| `dueDate` | `YYYY-MM-DD` | Drives calendar + notifications |
| `column` | Column.id | Current column |
| `order` | number | Position within column |
| `labels[]` | Label.id[] | Many-to-many |
| `creationDate` | ISO datetime | Set on create |
| `changeDate` | ISO datetime | Updated on every mutation |
| `doneDate` | ISO datetime | Set when moved to Done column |
| `columnHistory[]` | Column.id[] | Ordered log for lead-time reports |
| `subtasks[]` | SubTask[] | Nested checklist items |

**Invariants**
- New tasks insert at order=1 (top of column).
- `doneDate` is only set when task enters the `done` column.
- `columnHistory` must be appended, never rewritten.

---

### Column
An ordered stage in the workflow.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `done` is the permanent terminal column |
| `name` | string | Max 40 chars |
| `color` | hex | Display accent |
| `order` | number | Position on board |
| `collapsed` | boolean | Collapse toggle |

**Invariants**
- The `done` column cannot be deleted or reordered past the last position.
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

**Invariants**
- Label groups drive the `label-group` swimlane dimension.
- Deleting a label removes it from all task `labels[]` arrays.

---

### Board
A self-contained workspace with its own tasks, columns, labels, and settings.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string | |
| `template` | string | Optional template origin |

**Invariants**
- All CRUD operations are scoped to the active board (`getActiveBoardId()`).
- `ensureBoardsInitialized()` must run before any board operation.
- On switch, state is flushed and reloaded from IDB for the new board.

---

### Settings
Per-board configuration (swimlane mode, sort preferences, etc.).

Persisted under the board's IDB key via `loadSettings()` / `saveSettings()`.

---

## 2. Aggregate Roots and Boundaries

```
Board ──< Column ──< Task ──< SubTask
                 └─< Label (shared across board)
       └─< Settings (1:1)
```

- **Board** is the aggregate root. No cross-board references exist.
- **Task** references Labels by ID; labels are not embedded.
- **SubTask** is embedded inside Task (not a top-level entity).

---

## 3. Storage Layer

All state is local-first, stored in **IndexedDB** (`kanvana-db`).

| Store / Key | Content |
|---|---|
| `kv` object store | All board data as key-value pairs |
| `tasks:{boardId}` | Task array |
| `columns:{boardId}` | Column array |
| `labels:{boardId}` | Label array |
| `settings:{boardId}` | Settings object |
| `boards` | Board list |

**Key functions (god nodes — highest betweenness centrality)**

| Function | Edges | Role |
|---|---|---|
| `loadTasks()` | 28 | Read task state for active board |
| `ensureBoardsInitialized()` | 25 | Bootstrap guard; called before any board op |
| `loadColumns()` | 21 | Read column state |
| `loadLabels()` | 21 | Read label state |
| `loadSettings()` | 19 | Read board settings |
| `getActiveBoardId()` | 17 | Active board selector |
| `keyFor()` | 14 | IDB key builder |
| `listBoards()` | 14 | All board metadata |
| `saveTasks()` | 14 | Persist task array (fire-and-forget IDB write) |
| `main()` | 14 | Entry point; initializes page |

**Pattern:** `initStorage()` (async, called once at startup) → synchronous CRUD functions → fire-and-forget IDB writes → `renderBoard()`.

---

## 4. Feature Modules and Communities

### Board Data Management (Community 0 — 78 nodes)
Central hub. Covers board lifecycle: create, rename, switch, template apply, column/task CRUD, and the `renderBoard()` refresh cycle.

Key symbols: `applyBoardTemplate`, `refreshBoardsModalList`, `addColumn`, `main`.

### Due Date Dragging (Community 1 — 60 nodes)
Due date calculation, countdown display, drag-drop interactions, and dialog UX. Bridges task card rendering with user interaction.

Key symbols: `calculateDaysUntilDue`, `formatCountdown`, `getCountdownClassName`, `initDragDrop`.

### Import / Export Security (Community 3 — 36 nodes)
Board JSON export and import with preflight validation, version compatibility checks, and legacy ID remapping.

Key symbols: `exportBoard`, `importTasks`, `inspectImportPayload`, `buildImportConfirmationMessage`.

### Label & Task Modals (Community 5 — 29 nodes)
Modal coordination between task editing and label management. Accordion UI for label grouping.

Key symbols: `showLabelModal`, `renderLabelsList`, `groupLabels`, `createAccordionSection`.

### Swimlane Rendering (Community 6 — 34 nodes)
Groups tasks into swimlane rows by label, label-group, or priority. Builds the board grid. Manages per-cell collapse state.

Key symbols: `renderSwimlaneBoard`, `buildBoardGrid`, `groupTasksBySwimLane`, `applySwimLaneAssignment`.

### Icons / Notifications / Theme (Community 7 — 24 nodes)
Lucide icon hydration, due-date notification banner/modal, and light/dark theme toggle.

Key symbols: `renderIcons`, `initializeNotifications`, `renderNotificationBanner`.

### Board Settings Modals (Community 8 — 22 nodes)
Per-board settings UI, template selector, board selector refresh.

Key symbols: `initializeBoardsUI`, `getBuiltInBoardTemplates`, `refreshBrandText`.

### Reports & Analytics (Community 9 — 29 nodes)
ECharts-based charts: lead time, daily completions, cumulative flow diagram.

Key symbols: `buildLeadTimeOption`, `computeCompletions`, `computeCumulativeFlow`, `buildCfdOption`.

### Drag & Drop Runtime (Community 11 — 12 nodes)
SortableJS initialization and teardown for task and column drag-drop. Swimlane-aware drop handling.

Key symbols: `initDragDrop`, `initTaskSortables`, `destroySortables`, `isSwimlaneViewEnabled`.

### Calendar View (Community 13 — 10 nodes)
Monthly calendar rendering. Groups tasks by `dueDate`; marks overdue and done tasks.

Key symbols: `groupTasksByDueDateForMonth`, `isTaskDone`, `isTaskOverdue`, `formatMonthKey`.

### PocketBase Backend (Communities 21–22)
Optional backend plan: PocketBase as auth + sync layer behind Nginx proxy. Storage adapter pattern allows IDB ↔ PocketBase swap without changing feature modules.

Key symbols: `PocketBase Storage Adapter`, `IDB to PocketBase Migration`, `Docker Compose Stack`.

---

## 5. Key Workflows (Hyperedges)

### Task Due Date Rendering Flow
```
calculateDaysUntilDue → formatCountdown → getCountdownClassName
  → createTaskElement → syncMovedTaskDueDate → getNotificationTasks
```

### Swimlane Board Flow
```
renderBoard → renderSwimlaneBoard → groupTasksBySwimLane
  → buildBoardGrid → applySwimLaneAssignment → updateTaskPositionsFromDrop
```

### Modal Label–Task Coordination
```
initializeModalHandlers → initializeLabelsModalHandlers → showLabelModal
  → updateTaskLabelsSelection → addLabel
```

### Column Management Flow
```
createColumnElement → initializeColumnModalHandlers
  → addColumn | updateColumn | deleteColumn
```

### Import Preflight Flow
```
inspectImportPayload → buildImportConfirmationMessage → importTasks
  → (legacy ID remapping if needed)
```

### Swimlane Cell Collapse
```
makeCellCollapseKey → isSwimLaneCellCollapsed
  → toggleSwimLaneCellCollapsed → swimLaneCellCollapsedKeys
```

---

## 6. Architecture Boundaries

| Boundary | Rule |
|---|---|
| Cross-board data | Use `loadTasksForBoard(id)` / `loadColumnsForBoard(id)` — never mutate another board's state |
| Rendering | All state changes must end with `renderBoard()` or an incremental sync helper |
| Circular deps | Use dynamic `await import('./render.js')` only for render calls; all other imports must be top-level static |
| Done column | `id === 'done'` is permanent; sort is disabled for performance |
| UUID | All entity IDs use `generateId()` from `utils.js`; no numeric or legacy string IDs post-migration |
| Keybindings | Never hardcode key strings; register in `DEFAULT_APP_KEYBINDINGS` or `DEFAULT_EDITOR_KEYBINDINGS` |

---

## 7. Test Architecture

| Layer | Tool | Location |
|---|---|---|
| Unit | Vitest | `client/tests/unit/*.test.js` |
| DOM integration | Vitest + @testing-library/dom | `client/tests/dom/*.test.js` |
| API mocking | MSW | `client/tests/mocks/*.js` |
| E2E | Playwright | `client/tests/e2e/*.spec.ts` |

Key coverage areas: storage CRUD, UUID migration, swimlane utilities, import/export preflight, due-date countdown, validation, normalization, subtasks.

---

## 8. Audit Trail

Two separate audit concepts with different scopes and lifetimes.

### Task Activity Log
An embedded array on each Task. Records every meaningful change to that individual task. Lost permanently when the task is deleted (tasks have no external recovery path).

- Stored as `activityLog[]` on the task object in IndexedDB.
- Answers: "what happened to this task?"

### Board Event Log
A separate, board-scoped list of timestamped events stored independently from tasks. Survives task and column deletion. The only place where column lifecycle events (added, renamed, deleted, reordered) are recorded.

- Stored as a separate IDB key per board (e.g. `events:{boardId}`).
- Answers: "what happened on this board?"

**Task Activity Log event types:**
`task.created` · `task.title_changed` · `task.description_changed` · `task.priority_changed` · `task.due_date_changed` · `task.column_moved` · `task.label_added` · `task.label_removed` · `task.relationship_added` · `task.relationship_removed`

**Board Event Log event types:**
`column.created` · `column.renamed` · `column.deleted` (includes task count destroyed) · `column.reordered` · `task.deleted`

Excluded by design: sub-task events (implementation detail) and `task.order_changed` within a column (positional noise).

**Actor model:**
Every event carries an `actor` field. Shape: `{ type: "human" | "agent" | "user", id: string | null }`.
- `{ type: "human", id: null }` — current single-user (no identity yet)
- `{ type: "agent", id: "claude-opus" }` — AI agent identifies itself by name
- `{ type: "user", id: "<uuid>" }` — future multi-user online mode

Actors are set by the caller; the system never infers them. AI agents are responsible for passing their own identity.

**Event envelope (all events):**
```
{
  type: string,           // e.g. "task.priority_changed"
  at: ISO datetime,
  actor: { type, id },
  details: { ... }        // before/after payload, event-specific
}
```
`details` always carries before/after values for field changes. Examples:
- `task.priority_changed`: `{ from: "high", to: "medium" }`
- `task.column_moved`: `{ from: "col-uuid-1", to: "col-uuid-2" }`
- `task.label_added`: `{ labelId: "uuid", labelName: "Feature" }`
- `task.description_changed`: `{ changed: true }` — flag only, no content stored
- `task.created`: `{ column: "col-uuid", columnName: "In Progress" }` — column only; initial field values are on the task itself
- `column.deleted`: `{ columnName: "Review", tasksDestroyed: 4 }`
- `task.deleted` (Board Event Log only): `{ taskId, taskTitle, column, columnName }` — minimal; the task's activityLog is permanently lost at deletion

**Visualization:** Log list only. No graph view.

**Where each log lives in the UI:**
- Task Activity Log → collapsible section at the bottom of the task edit modal (Option A)
- Board Event Log → separate page alongside `reports.html` (Option C)

**Retention:** Unbounded. Both logs grow indefinitely. Included in board JSON export/import.

**`columnHistory` relationship:** Kept as-is for reports (lead time, CFD). `activityLog` is additive — column moves write to both. No consolidation.

---

## 9. Known Gaps (from graph analysis)

- 167 nodes have ≤1 connection — likely undocumented or under-specified components.
- Communities `Impressum Encoding`, `Boards Modal Tests`, `Event Bus Tests`, `Storage Test Reset` are thin clusters (≤3 nodes) that may need more coverage or consolidation.
- 19 inferred edges on `loadTasks()` need verification — model-reasoned connections may not reflect actual call sites.
- `modals.js` and `render.js` are flagged as god modules in architecture review; candidate for incremental decomposition.

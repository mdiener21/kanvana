# Kanvana — Domain Model Context

> Hand-maintained source of truth. Update this file when entity schemas, workflows, or architecture
> boundaries change. Do not regenerate from graphify output.

---

## 1. Core Domain Entities

All canonical factory functions live in `client/src/modules/schema.js`. Every new entity must be
constructed through those factories so all fields are always present.


---

## 2. Aggregate Roots and Boundaries

```
Board ──< Column ──< Task ──< SubTask
                 │        └─< Relationship (→ other Task)
                 └─< Label (shared across board)
       └─< Settings (1:1)
```

- **Board** is the aggregate root. No cross-board references exist.
- **Task** references Labels by ID; labels are not embedded.
- **SubTask** and **Relationship** are embedded inside Task (not top-level entities).
- Every mutation is also recorded as an immutable **domain event** in the event store — the basis of
  sync and replay (see §9, and [ADR-0004](docs/adr/0004-event-sourced-sync.md)). The old inline task
  `activityLog` and board `BoardEvents` audit logs were removed in issue #110.

---

## 3. Storage Layer

All state is local-first, stored in **IndexedDB** (`kanvana-db`, **version 2**). Event sourcing (#112)
added three object stores alongside the original `kv`:

| Object store | Content |
|---|---|
| `kv` | Coordination + small values: board list, active board, global settings, HLC node id, catch-up watermarks |
| `read_model` | Per-board projections (tasks / columns / labels / settings), keyed `{boardId}:{kind}` — what the UI renders |
| `events` | The domain-event log, keyed by event `id`; the `synced` flag drives the outbound queue |
| `snapshots` | Local projection snapshots that bound replay and event GC |

The storage layer is split into three modules:

| Module | Responsibility |
|---|---|
| `idb-store.js` | IDB connection singleton, key helpers, fire-and-forget `schedulePersist()` / `scheduleReadModelPersist()` / `scheduleDelete()`, plus event helpers (`persistEvent`, `getUnsyncedEvents`, `markEventSynced`) |
| `board-serializer.js` | Board import normalizer — remaps non-UUID IDs, coerces fields on import or IDB migration |
| `storage.js` | In-memory `state` + all public CRUD functions. Imports from both above. Owns `state`/schedulers; wires them into the read-model projector. |
| `event-sourcing/read-model-projector.js` | `createReadModelProjector()` — the read-model projection host, extracted from `storage.js` ([#119](docs/adr/0005-reducer-sole-read-model-writer.md)). Subscribes to `EVENT_EMITTED` and folds domain events into the injected `state` via the pure reducer (the sole writer). |

**Main `kv` keys:**

| Key | Content |
|---|---|
| `kanbanBoards` | Board list array |
| `kanbanActiveBoardId` | Active board ID string |
| `kanvana:settings:global` | Global (cross-board) settings object |
| `kanvana:hlc:node` | Persisted Hybrid Logical Clock node id |
| `kanvana:sync:lastSeenHlc:{scope}` | Per-scope catch-up watermark |

**Pattern:** `initStorage()` (async, called once at startup) → synchronous CRUD functions read/write
in-memory `state` → fire-and-forget IDB writes via `scheduleReadModelPersist()` → `renderBoard()`.

**Single write path into the read model** ([ADR-0005](docs/adr/0005-reducer-sole-read-model-writer.md)):
a local mutation in `tasks.js`/`columns.js`/`labels.js` emits domain events and does **not** write the
read model directly. The read-model projector (`read-model-projector.js`, the reducer projection) is
the sole writer of `state`/`read_model`, for **both** local and remote (SSE/catch-up) events. Local events are emitted
**synchronously** by `scheduleDomainEvent()`, so the in-memory projection is updated before the
mutation returns / `renderBoard()` runs (instant UI); only the IDB event persist and the PocketBase
push are async. Each mutation's events are self-complete — they encode every read-model effect
(relationship inverses on target tasks, sibling reordering, derived `doneDate`, swimlane reassignment)
so the projection reproduces the change from events alone. Deletes are hard removals via `task.deleted`
(no read-model tombstone).

**Key public functions:**

| Function | Role |
|---|---|
| `initStorage()` | Async bootstrap — opens IDB, loads all state into memory |
| `getActiveBoardId()` | Active board selector |
| `ensureBoardsInitialized()` | Guard called before any board operation |
| `loadTasksForBoard(id)` | Read task state for a board |
| `loadColumnsForBoard(id)` | Read column state for a board |
| `loadLabelsForBoard(id)` | Read label state for a board |
| `loadSettingsForBoard(id)` | Read board-scoped settings |
| `loadGlobalSettings()` / `saveGlobalSettings()` | Read/write cross-board app settings |
| `saveTasks()` / `saveTasksForBoard(id, tasks)` | Persist task array |
| `listBoards()` | All board metadata |
| `keyFor(boardId, kind)` | IDB key builder |

---

## 4. Cloud Sync Layer (PocketBase) — event-sourced

An optional PocketBase backend provides auth and cloud sync. The local IDB layer works fully offline
whether sync is enabled or not — PocketBase is an optional fan-out. Sync is **event-sourced**: devices
exchange domain events (not whole records), ordered by a Hybrid Logical Clock. Full mechanics live in
`docs/spec/backend-storage-pb.md`; the decision in [ADR-0004](docs/adr/0004-event-sourced-sync.md).

**Online Mode:** User-facing name for the optional authenticated PocketBase path — the `Go Online`
header button, backend health probe, login/register/OAuth. Once signed in, sync is automatic (no
manual push/pull); the header **sync-state indicator** shows `Live` / `Syncing… (N)` / `⚠ N unsynced`
/ `Offline`.

| Module | Responsibility |
|---|---|
| `sync.js` | PocketBase SDK instance + auth functions (`isAuthenticated`, `ensureAuthenticated`, `loginUser`, `registerUser`, `logoutUser`, `loginWithProvider`) |
| `authsync.js` | Auth UI — login modal, OAuth2 (Google/Apple/Microsoft), logout, backend health probe |
| `event-sourcing/sync-queue.js` | **Outbound** — drains unsynced events to the PB `events` collection in HLC order (debounce, in-flight cap, three-tier retry, no rollback); `getSyncStatus()` |
| `event-sourcing/realtime.js` | **Inbound** — SSE subscription + launch/reconnect catch-up pull; remote events feed the same projection pipeline (deduped by id) |
| `event-sourcing/hlc.js` | Hybrid Logical Clock — `emitLocal()`, `observeRemote()`, `compareHlc()` |
| `event-sourcing/snapshot.js`, `snapshot-sync.js` | Client snapshots + upload + event GC |
| `event-sourcing/sync-indicator.js` | Header sync-state indicator (#115) |

**Auth:** Email/password or OAuth2. `isAuthenticated()` / `ensureAuthenticated()` guard all sync
operations. The `auth-changed` window event fires on auth state change; the queue, realtime, and UI
all subscribe.

> **⚠️ Legacy LWW path (deprecated, being removed).** `sync.js` still exports `pushBoardFull()` /
> `pullAllBoards()` (whole-record last-write-wins, PR #89) and `autosync.js` still calls
> `pushBoardFull()` on `kanban-local-change`. These target the legacy per-entity PocketBase collections,
> which are now **write-locked** (migration `1746100010`) — so this path is effectively defunct.
> `pullAllBoards()` has no remaining callers. Slated for removal with the legacy collections (issue
> #116). Do not extend it; new sync work goes through the event stream.

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
| `DATA_CHANGED` | `'data:changed'` — projection changed (a domain event was applied); UI re-render trigger |
| `EVENT_EMITTED` | `'event:emitted'` — a domain event was persisted (local or remote); wakes the outbound queue and the reducer |

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
| `task-modal.js` | Task edit modal (labels, subtasks, relationships) |
| `labels.js` | Label CRUD |
| `labels-modal.js` | Label management modal |
| `render.js` | `renderBoard()` and incremental sync helpers |
| `swimlanes.js` | Swimlane grouping logic (`groupTasksBySwimLane`, etc.) |
| `swimlane-renderer.js` | Swimlane board DOM builder |
| `dragdrop.js` | SortableJS initialization/teardown; swimlane-aware drop handling |
| `importexport.js` | Board JSON export/import with preflight validation |
| `reports.js` | ECharts: lead time, daily completions, cumulative flow diagram |
| `calendar.js` | Monthly calendar view; groups tasks by `dueDate` |
| `reducer.js` | Pure event reducer — `applyEvent(state, event)` folds a domain event into projection state |
| `event-sourcing/emitter.js` | `emitDomainEvent()` / `scheduleDomainEvent()` — stamp (UUID + HLC), persist, emit `EVENT_EMITTED` |
| `event-sourcing/dispatcher.js` | `reduceEventAndNotify()` — runs the reducer and signals re-render |
| `event-sourcing/{hlc,sync-queue,realtime,snapshot,snapshot-sync,sync-indicator}.js` | Sync layer — see §4 |
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

### Sync Flow (event-sourced)
```
[local mutation] → scheduleDomainEvent() (stamp UUID + sync HLC)
                 → emit(EVENT_EMITTED)  [synchronous]
   │             → persistEvent (synced=false)  [async, fire-and-forget]
   ├─ reducer: read-model-projector folds event into state (sole writer) → emit(DATA_CHANGED) → renderBoard()
   └─ outbound: sync-queue drains unsynced events to PB `events` (HLC order)

[remote event] → realtime.js SSE / catchUp() → persist (synced=true) → emit(EVENT_EMITTED)
              → reducer projects into state → renderBoard()
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
| Domain events | Every entity mutation must emit a domain event via `scheduleDomainEvent()` (`event-sourcing/emitter.js`) so it syncs and replays — never mutate state silently. Event types are the `*.created`/`*.updated`/`*.deleted`/`*.moved` family handled by `reducer.js`. |
| Task deletion | Task delete is permanent: emit `task.deleted`, remove from the active task list, and let sync propagate deletion through the domain-event stream/tombstone model. ADR-0002's soft-delete mode was superseded by ADR-0004 and removed in issue #111. |

---

## 9. Event Sourcing

Mutations are recorded as immutable **domain events** — the source of truth for sync and replay. The
read model (§3) is a projection the reducer folds events into. Decision: [ADR-0004](docs/adr/0004-event-sourced-sync.md);
mechanics: `docs/spec/backend-storage-pb.md`.

> The previous two-log audit trail (inline task `activityLog` + board `BoardEvents`, an Activity page,
> ADR-0001) was **removed in issue #110**. Its history now lives implicitly in the event stream,
> available to a future audit UI without a separate write path.

### Ordering — Hybrid Logical Clock

Each event carries an HLC stamp (`hlc`). `compareHlc()` gives a total order across devices; the reducer
re-sorts by HLC on replay, so server insertion order is irrelevant. Node id persisted at
`kanvana:hlc:node`; drift past 60 s is logged.

### Event Envelope

```json
{
  "id": "<uuid>",
  "type": "task.priority_changed",
  "hlc": { /* HLC stamp */ },
  "at": "<ISO datetime>",
  "scope": "board",
  "board_id": "<board uuid | null for global>",
  "entity_id": "<id of the affected entity>",
  "actor": { "type": "human", "id": null },
  "payload": { "from": "high", "to": "medium" }
}
```

`payload` (formerly `details`) carries the event data; for field changes, before/after values. Locally,
events are persisted to the `events` IDB store with a `synced` flag; on PocketBase they live in the
`events` collection (`payload`/`board`-text/`hlc`/`scope`/`entity_id`).

### Actor Model

Every event carries `actor: { type: string, id: string | null }`.

| Value | Meaning |
|---|---|
| `{ type: "human", id: null }` | Current single-user (no identity) |
| `{ type: "agent", id: "claude-sonnet-4-6" }` | AI agent — identifies itself by model name |
| `{ type: "user", id: "<uuid>" }` | Future multi-user online mode |

AI agents are responsible for setting their own actor identity.

**`columnHistory` relationship:** Kept as-is on the task for CFD/lead-time reports — independent of the
event stream.

---

## 10. Test Architecture

| Layer | Tool | Location |
|---|---|---|
| Unit | Vitest | `client/tests/unit/*.test.js` |
| DOM integration | Vitest + @testing-library/dom | `client/tests/dom/*.test.js` |
| API mocking | MSW | `client/tests/mocks/*.js` |
| E2E | Playwright | `client/tests/e2e/*.spec.ts` |

Key coverage areas: storage CRUD, UUID migration, swimlane utilities, import/export preflight,
due-date countdown, validation, normalization, subtasks, and the event-sourcing layer (HLC, reducer,
outbound queue, realtime/catch-up, snapshots, sync indicator). Live multi-device convergence is covered
by `tests/e2e/event-sourcing/` against a real PocketBase (`npm run test:e2e:live`; needs Docker up).

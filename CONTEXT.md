# Kanvana — Domain Model Context

> Hand-maintained source of truth. Update this file when entity schemas, workflows, or architecture
> boundaries change. Do not regenerate from graphify output.

---

## 1. Core Domain Entities

All canonical factory functions live in `client/src/modules/schema.js`. Every new entity must be
constructed through those factories so all fields are always present.

### Glossary

**WIP limit** — the maximum number of Tasks a Column is *intended* to hold, stored as `wipLimit` on
the Column. `0` means unlimited (the default; built-in templates ship unlimited). A WIP limit is
**advisory, never enforced**: nothing blocks adding, dragging, importing, or syncing a Task into a
Column that is at or over its limit. It is a pull-system signal — reaching the limit means *stop
starting, start finishing* — surfaced only as a visual state on the board.

> **Why advisory and not a hard block.** Under event-sourced sync ([ADR-0004](docs/adr/0004-event-sourced-sync.md))
> a remote `task.created` / `task.moved` event arriving over SSE cannot be rejected without breaking
> convergence. Two devices offline can each add the 5th Task to a limit-5 Column and legitimately
> converge at 6. A limit enforced only on the local device would be a guarantee the sync model
> cannot keep, so it is not offered as one.

**At limit / over limit** — the two breach states. *At limit* is `taskCount === wipLimit`; *over
limit* is `taskCount > wipLimit`. A Column's count is measured **board-wide across all swimlanes**,
not per lane×column cell — a WIP limit constrains system capacity, not each lane's. The **Done**
Column is exempt: it is terminal and unbounded, and limiting it would block finishing work.

### Time Tracking glossary

Time Tracking is a **standalone, user-wide** area. It has no relationship to Boards, Columns or
Tasks — a Time Entry never references a Task, and a Project is not a Board.

**Customer** — a party work is done for. Identified by name only.

**Project** — a named unit of work belonging to exactly one Customer. A Customer has many Projects.
Not to be confused with a Board.

**Time Entry** — one span of tracked work: a start and an end, booked to exactly one Project, with
an optional free-text description. Its Customer is always the Project's Customer — never set
independently. A Time Entry is always **complete** — it has both a start and an end; there is no
running timer. It may cross midnight, and entries may overlap.

**Duration** — end minus start of a Time Entry. Derived, never stored independently.

**Archived** — a Customer or Project hidden from selection for new Time Entries but still shown in
lists, filters and reports. A Customer or Project that is referenced (by Projects or Time Entries)
can only be archived, never deleted; deletion is allowed only once nothing references it. When a
delete from one device races a new reference from another, the item survives **archived**: an
in-use delete archives instead, and a reference arriving after the delete restores the deleted item
(from the tombstone the projection keeps) as archived — the same result in any arrival order.

**Attribution** — a Time Entry's whole Duration counts toward the day and month of its **start**,
in the user's timezone. Entries are never split at midnight or month boundaries.

**Time Tracking settings** live in the global settings layer (`globalSettings.timeTracking`, synced
via `settings.updated` with `global` scope). Only values the user explicitly chose are stored; an
unset timezone resolves to each device's browser timezone.

**Last-used project** — the project of the last saved or duplicated Time Entry, pre-filled in the
entry bar ahead of the default project. It is **per-device** state in `localStorage`
(`kanvana:timetracking:lastUsedProjectId`), deliberately outside the IDB read model and the synced
global settings: it is a local convenience, not domain data, and never emits an event.

**Remembered report period** — the period kind (`week`, `month` or `year`) last picked in the
Reports Week | Month | Year switch. Like the last-used project it is **per-device** state in
`localStorage` (`kanvana:timetracking:reportPeriodKind`), outside the IDB read model and the synced
settings, and never emits an event. Only the switch writes it; opening this week from the "This
week" badge does not. An unknown or missing value falls back to `month`.

**Weekly hours** — the user's contractual hours per week; an optional Time Tracking setting
(`weeklyHours`, a number > 0, decimals allowed, no maximum). Unset means off: no Target or Balance
anywhere. The current value applies to every period; there is no history of earlier values.

**Workdays** — the weekdays the Weekly hours are spread over; a Time Tracking setting (`workdays`,
ISO weekday numbers 1 = Monday … 7 = Sunday, at least one). Default Monday to Friday. Like Weekly
hours, the current value applies to every period. Time logged on a non-workday still counts as
logged; it just adds no Target.

**Target** — the Duration a period should contain: Weekly hours ÷ number of Workdays × counted
workdays. Counted days run from the later of the period start and the day of the first-ever Time
Entry, up to the earlier of the period end and today (inclusive), in the Time Tracking timezone; of
those, only Workdays add Target. There are no holidays or absences. A finished week's Target is
exactly the Weekly hours (40h over Mon–Fri: 8h each weekday, a Monday so far is 8h, the weekend
adds nothing); the current period gets a "so far" Target. Future periods and periods entirely
before the first Time Entry have no Target. Weeks start Monday.

**Balance** — logged Duration minus Target for one period, shown with an explicit sign (`+` surplus,
`−` deficit). No Target means no Balance. "Overtime" is deliberately not used.

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
| `read_model` | Per-board projections (tasks / columns / labels / settings), keyed `{boardId}:{kind}` — what the UI renders. Also the board's event-log memory: `{boardId}:taskTombstones` (task delete records) and `{boardId}:appliedEventIds` (applied event ids not yet held by a snapshot). `deleteBoard()` removes all of a board's keys, these two included |
| `events` | The domain-event log, keyed by event `id`; the `synced` flag drives the outbound queue |
| `snapshots` | Local projection snapshots that bound replay and event GC |

The storage layer is split into three modules:

| Module | Responsibility |
|---|---|
| `idb-store.js` | IDB connection singleton, key helpers, fire-and-forget `schedulePersist()` / `scheduleReadModelPersist()` / `scheduleDelete()`, event helpers (`persistEvent`, `getUnsyncedEvents`, `markEventSynced`), and the Data Owner record (`getDataOwner`, `claimDataOwner`, `replaceLocalData`) |
| `board-serializer.js` | Board import normalizer — remaps non-UUID IDs, coerces fields on import or IDB migration |
| `storage.js` | In-memory `state` + all public CRUD functions. Imports from both above. Owns `state`/schedulers; wires them into the read-model projector. |
| `event-sourcing/read-model-projector.js` | `createReadModelProjector()` — the read-model projection host, extracted from `storage.js` ([#119](docs/adr/0005-reducer-sole-read-model-writer.md)). Connects to the ingest interface on `register()` and folds each ingested domain event into the injected `state` via the pure reducer (the sole writer). |

**Main `kv` keys:**

| Key | Content |
|---|---|
| `kanbanBoards` | Board list array |
| `kanbanActiveBoardId` | Active board ID string |
| `kanvana:settings:global` | Global (cross-board) settings object |
| `kanvana:hlc:node` | Persisted Hybrid Logical Clock node id |
| `kanvana:timetracking` | Time-tracking projection (`customers` / `projects` / `timeEntries`, plus `tombstones` of deleted customers / projects) |
| `kanvana:sync:lastSeenHlc:{scope}` | Per-scope catch-up watermark (`{boardId}`, `__global__` or `__timetracking__`) |
| `kanvana:dataOwner` | Id of the account local data belongs to (§4 Data Owner); absent until the first sign-in |
| `kanvana:sync:firstPullPending` | Set by a wipe, cleared when the leader tab's first pull finishes: the new owner's data has not been pulled yet |

**Pattern:** `initStorage()` (async, called once at startup) → synchronous CRUD functions read/write
in-memory `state` → fire-and-forget IDB writes via `scheduleReadModelPersist()` → `renderBoard()`.

**Single write path into the read model** ([ADR-0005](docs/adr/0005-reducer-sole-read-model-writer.md)):
a local mutation in `tasks.js`/`columns.js`/`labels.js` emits domain events and does **not** write the
read model directly. The read-model projector (`read-model-projector.js`, the reducer projection) is
the sole writer of `state`/`read_model`, for **both** local and remote (SSE/catch-up) events, and the only way an event
reaches it is `ingestEvent()` (`event-sourcing/ingest.js`). Local events are ingested
**synchronously** by `scheduleDomainEvent()`, so the in-memory projection is updated before the
mutation returns / `renderBoard()` runs (instant UI); only the IDB event persist and the PocketBase
push are async. Each mutation's events are self-complete — they encode every read-model effect
(relationship inverses on target tasks, sibling reordering, derived `doneDate`, swimlane reassignment)
so the projection reproduces the change from events alone. Deletes are hard removals via `task.deleted`.

**Selective persistence** (#141): the reducer shares every slice an event leaves alone, so the same reference
means nothing to store. The projector writes only the slices whose reference changed (`tasks`, `columns`, `labels`,
`settings`, `taskTombstones`, the board list), plus the event memory: `appliedEventIds` and the newest applied HLC stay
durable for every event (#178). An event that changes no slice (a reducer no-op, such as a duplicate `*.created`)
stores that memory only, emits no `DATA_CHANGED` and still counts towards the next snapshot. A catch-up batch tracks
the same slices and writes each once when it ends. A rebuild replaces every list, so it stores the whole board.

**Delete records and applied ids** (#178): the event log's memory of "deleted" and
"already applied" is durable, so it survives a reload and a snapshot adoption.

| Memory | Where it lives |
|---|---|
| Board task delete records | `read_model` `{boardId}:taskTombstones`, and the board snapshot's `taskTombstones`. Adopting a snapshot adds its delete records to the board's (deletes are permanent). A `task.created` / `task.updated` / `task.moved` for a deleted task is a no-op, in any arrival order. |
| Board applied event ids | The board's latest snapshot's `appliedEventIds`, plus the live set `read_model` `{boardId}:appliedEventIds`. Each board event is projected from state seeded with both, so a snapshot taken from it holds them all; once saved, the ids it holds are pruned from the live set (no unbounded growth of the live set). |
| Any scope, remote origin | `ingestEvent()` skips a remote event whose id is already in the `events` store (SSE echo, catch-up overlap). Events GC'd from the store are covered by a snapshot (see above), and ingest drops an event at or below its key's snapshot HLC (§9 Ordering). |
| Time-tracking delete records | Inside the `kanvana:timetracking` slot (`tombstones`), as before. |

`initStorage()` loads the board memory into `state` (`taskTombstones`, `appliedEventIds`, and the latest
snapshot's ids as `snapshotAppliedIds`), so local projection stays synchronous (ADR-0005).

**Several tabs** (#222): each tab holds its own in-memory `state` and writes its copy of a board out on
every projection, so no tab may trust another's stored `read_model`. A tab that hears of events another tab
stored re-reads those events from the `events` store and folds them through the projector by the usual
rules (§9 Ordering), a rebuild for a late one included. An edit made on a stale copy therefore costs nothing:
the event it missed arrives, every tab converges in HLC order and writes the complete board out. See §4 Sync leader.

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
| `sync.js` | PocketBase SDK instance (`getPb`) + auth only (`isAuthenticated`, `ensureAuthenticated`, `getUser`, `loginUser`, `registerUser`, `logoutUser`, `loginWithProvider`, `refreshAuth`, `initAuthRefresh`) |
| `authsync.js` | Auth UI — login modal, OAuth2 (Google/Apple/Microsoft), logout, backend health probe |
| `event-sourcing/sync-session.js` | **Lifecycle** — the one state machine for sync (`signed-out` → `catching-up` → `live` ⇄ `offline`, plus `paused` ⇄ `paused-offline`). The only sync module that listens to `auth-changed`, `online` and `offline`; it starts and stops the queue, realtime and snapshot upload. `initSyncSession()`, `getSyncSessionState()`; `createSyncSession({ network, beforeSignIn })` takes the network side and a check run on each new sign-in |
| `event-sourcing/data-owner.js` | **Account check** — `checkDataOwner(userId)`, the session's `beforeSignIn`: applies the Data Owner policy and coordinates tabs during a switch. `createNetworkSettlingFirstPull()` wraps the leader's network side to finish the first pull after a wipe |
| `event-sourcing/sync-leader.js` | **Sync leader** (#222) — elects one tab with a Web Lock and links the tabs with a BroadcastChannel. `initSyncLeader()` resolves to the leader-gated network side the tab's session runs on |
| `event-sourcing/sync-queue.js` | **Outbound** — drains unsynced events to the PB `events` collection in HLC order (debounce, in-flight cap, three-tier retry, no rollback), stamped with the Data Owner, and pushes nothing when the signed-in account is not the Data Owner. Runs only between `startSyncQueue({ onAuthRejected })` and `stopSyncQueue()`; `drainSyncQueue()`, `getSyncStatus()` |
| `event-sourcing/ingest.js` | **Ingest interface** — `ingestEvent(event, { origin, receivedAt })`, the single entry point of the event log for local and remote events (catch-up uses `ingestRemoteBatch(items)`, which validates and sorts once, applies each board's in-order events to one copy of the board as one list (#238) and saves each touched board's read model once when the batch ends (#237), and returns the events not stored before): validate, observe the remote HLC (remote only), project, `DATA_CHANGED`, `EVENT_EMITTED`, persist (`synced` = origin is `remote`) |
| `event-sourcing/realtime.js` | **Inbound** — SSE subscription (`startRealtime({ onConnect })`, `stopRealtime()`) + catch-up pull (`catchUp()`), run by the session; a stop also ends a pull in flight; remote events go through `ingestEvent(…, { origin: 'remote' })` (deduped by id) |
| `event-sourcing/hlc.js` | Hybrid Logical Clock — `emitLocal()`, `observeRemote()`, `compareHlc()` |
| `event-sourcing/snapshot.js`, `snapshot-sync.js` | Client snapshots + upload + event GC. Snapshots are always taken locally; upload runs only between `startSnapshotSync()` and `stopSnapshotSync()`, and only as the Data Owner |
| `event-sourcing/sync-indicator.js` | Header sync-state indicator (#115), rendered from the session state and queue depth |

**Sync leader** (#222) — of all tabs of an origin, the holder of the Web Lock `kanvana:sync-leader` runs the
session's network side: queue, realtime, catch-up and snapshot upload. Every other tab is a **follower**: it runs
its own session on a network side that does nothing, so it still follows auth (PocketBase's auth store reaches
every tab) and `online` / `offline` itself and is ready to take over. Taking the lock depends on nothing about
the user, so it runs apart from `beforeSignIn`.

| Between tabs (BroadcastChannel `kanvana:sync`) | What happens |
|---|---|
| `events-stored` | Sent only once the event is in the `events` store. Every other tab folds it (§3 Several tabs) and, if local, the leader schedules a drain |
| `snapshot-adopted` | Others rebuild the key, dropping the same entities; only the adopting tab knows what the snapshot replaced |
| `board-settings-written` | Others re-read settings no event carries (swimlanes), which they would otherwise overwrite with their copy |
| `snapshot-saved` | A snapshot saved in a follower is uploaded by the leader, never from the follower |
| `status`, `status-request` | The leader's session state and retry status, which exist only in its memory, on every change and when a tab opens. `getSyncSessionState()` and `getSyncStatus()` report them in a follower, so every indicator shows the same text; a follower's own `signed-out`, `offline` or `paused-offline` wins. A paused leader pauses the followers' sessions too |

**Handover.** The browser releases the lock when the tab dies; the next tab in the lock's queue folds any stored
event it missed, then `takeOverSyncSession()` does what its state calls for: from `live` or `catching-up`, one
catch-up and then draining; while `signed-out`, `offline` or `paused-offline`, nothing until that changes; while `paused`, realtime and
one catch-up, with queue and upload stopped until fresh credentials. A tab being frozen or entering the
back/forward cache stops its network side and leaves the lock or its queue, because a frozen holder would block every
other tab; on resuming it claims the lock again and reads the events it missed. A tab opening as a follower reads
missed events too, covering any stored while it loaded.

With no Web Locks or no BroadcastChannel a tab is its own leader (each subscribes and pushes; the server dedupes,
#217). With a BroadcastChannel alone, tabs still share edits. Known limit: if a tab dies between storing an event and
announcing it, and another tab then writes its board out, a reload reads a read model without that event until a tab
opening as follower, a takeover or a rebuild folds it; the event itself is safe in the store.

**Data Owner** — the account the browser's local data belongs to. One browser holds one local database
with at most one Data Owner. Data created offline has none until the first sign-in claims it. A different
account signing in wipes local data, after a prompt if unsynced events would be lost, and becomes the Data
Owner. Events are only ever pushed under the Data Owner. Sign-out keeps local data visible and usable
offline, keeps the Data Owner, and clears the token locally without revoking it on the server
([ADR-0006](docs/adr/0006-data-owner-account-policy.md)).

How a switch works (`data-owner.js`, run on each new sign-in, with no network, also at an offline launch):

- **Wipe.** `replaceLocalData()` clears every object store and writes the new owner in **one transaction**,
  so an interruption leaves the old owner with all its data, or the new owner with none. A later boot with
  the old owner still recorded runs the check again. The page then reloads, which is what resets the
  in-memory state, caches and watermarks.
- **What survives a wipe.** The HLC node id (it identifies the browser) and localStorage display
  preferences: theme, the notification banner flag, the report period. Everything else goes, including
  global settings, watermarks and the last-used time-tracking project.
- **Prompt.** `confirmDialog` with `destructive: true`, so Cancel has focus. A wipe refuses when more events
  are unsynced than the user agreed to lose, and the prompt asks again with the new number.
- **Other tabs.** The auth store is in localStorage, so every tab's session sees the sign-in. A Web Lock lets
  one tab settle the switch while the others wait, signed-out; a hidden tab does not prompt until it is
  looked at. The tab that wiped tells the others to reload over a `BroadcastChannel`.
- **Default board.** The page seeds the stable default board before it knows what the new account holds. That
  seed has no demo tasks and emits no events, and its events go out only if the leader's first finished pull
  shows the account has never had this board, so nothing newer than the account's own history lands on the
  stable ids. `kanvana:sync:firstPullPending` marks that pull as still to come; a failed pull leaves it set.

- **A tab that missed the wipe.** The notice takes time to arrive, so it is not what protects the new owner's
  data. A wipe bumps `kanvana:dataGeneration` in its transaction, each tab pins the generation when it opens the
  database, and every write of account data checks it inside its own transaction: `writeIfDataCurrent()` reads the
  generation, and a write batch (§9 Durability), which commits before a read could return, adds the marker
  `kanvana:dataReplaced:<pinned generation>`. A wipe leaves that marker behind, so the add is refused and the batch
  aborts. Markers survive later wipes, since a tab can sleep through several. On a mismatch the write is dropped and the page reloads, so nothing from a
  tab still holding the old owner reaches the events store, the read model, snapshots or the queue.

Known limits. Without Web Locks (plain http) the lock is skipped, so two visible tabs could each prompt. A tab that
missed a wipe keeps showing the old owner's data from its own memory until the notice or its first dropped write
reloads it, and an edit made there in that moment is lost without a prompt, since the prompt could not count it. Its
tab-to-tab notices can still go out in that moment: they carry ids only, so a tab acting on one finds nothing to
fold, though a `snapshot-adopted` can hide the entities it names from that tab's view until its next rebuild. Three
writes skip the check because they hold no account data: the HLC node id, the first claim of unowned data (no wipe
can have happened), and the boot migration from legacy localStorage (it runs before any wipe on that browser).
localStorage preferences are outside IndexedDB and are not checked.

**Auth:** Email/password or OAuth2. `isAuthenticated()` / `ensureAuthenticated()` guard all sync
operations. The `auth-changed` window event fires on auth state change, including a token refresh; the
sync session and the auth UI subscribe. The session treats only a different account as a sign-in.

**Snapshot adoption = snapshot + replay (#180).** At launch and on every reconnect, catch-up
(`realtime.js` `catchUp()`, run by the sync session) first adopts each server snapshot newer than the key's last-seen HLC, for
board, `__global__` and `__timetracking__` keys alike. `adoptSnapshot(key, state, hlc)` (`ingest.js`)
saves it and rebuilds the key's view as the snapshot plus this device's stored events newer than it, in
HLC order (`rebuildScope`, §9 Ordering); it never replaces the view wholesale. So an unsynced local edit
newer than the snapshot stays on screen and stays queued for push, and a snapshot newer than every local
event becomes the view: tasks, columns and labels the replaced snapshot held, or that stored events it
covers created, are dropped unless the new snapshot has them.

The event stream (events + snapshots) is the only sync path. The whole-record last-write-wins path
(PR #89: full-board push/pull, auto-sync, the `kanbanSyncMap` id mapping) was removed in #215;
`initStorage()` deletes its stale `kanbanSyncMap` and `kanbanAutoSyncEnabled` localStorage keys on boot.

---

### Installed app and offline app shell

Production builds generate `sw.js` from `client/src/service-worker.js` through
`client/scripts/pwa-build.mjs`. The worker precaches the build's HTML, hashed assets, manifest,
and install icons. It never caches API responses or external requests. App-shell caches are
scoped to the hosting path and build content; IndexedDB remains the source of board data.
`modules/pwa.js` registers the worker on all app pages, provides mobile installation controls,
and offers a reload for waiting updates. Local event and read-model writes finish before reload.
Development runs without a service worker. Production lifecycle tests run with `npm run test:pwa`.

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
| `EVENT_EMITTED` | `'event:emitted'` — a domain event was ingested (local or remote), after projection; wakes the outbound queue. Notification only: emitting it does not project anything |
| `EVENTS_STORED` | `'events:stored'` — events reached the `events` store (`{ ids, local }`); the sync leader tells the other tabs (#222) |
| `SNAPSHOT_ADOPTED` | `'snapshot:adopted'` — this tab adopted a server snapshot (`{ key, forgotten }`); the sync leader tells the other tabs which entities it replaced |
| `PEER_SYNC_CHANGED` | `'sync:peer-changed'` — another tab's events or sync status changed what this tab shows; re-renders the sync indicator |
| `BOARD_SETTINGS_WRITTEN` | `'settings:written'` — settings no event carries were written (`{ boardId }`); the sync leader tells the other tabs to re-read them once stored |

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
| `tasks.js` | Task CRUD; column sort by due date or priority (`sortColumnTasks`, emits `task.moved`) |
| `task-card.js` | Task card DOM element factory |
| `task-modal.js` | Task edit modal (labels, subtasks, relationships) |
| `labels.js` | Label CRUD |
| `labels-modal.js` | Label management modal |
| `render.js` | Two render adapters behind one read model: `renderBoard()` (full rebuild — `innerHTML` reset + `initDragDrop()`) and `reconcileBoard()` (in-place patch — moves cards by id, reorders, counters, collapsed titles, due dates, Done virtualization). Plus the **drag-reconcile window** (`beginDragReconcile()`/`endDragReconcile()`) that routes a drop's `DATA_CHANGED` through reconcile so the just-dragged node is never detached. See §7 "Board Render Flow". |
| `swimlanes.js` | Swimlane grouping logic (`groupTasksBySwimLane`, etc.) |
| `swimlane-renderer.js` | Swimlane board DOM builder and its in-place patch (`reconcileSwimlaneBoard()`) |
| `dragdrop.js` | SortableJS initialization/teardown; swimlane-aware drop handling |
| `importexport.js` | Board JSON export/import with preflight validation |
| `reports.js` | ECharts: lead time, daily completions, cumulative flow diagram |
| `calendar.js` | Monthly calendar view; groups tasks by `dueDate` |
| `reducer.js` | Pure event reducer — `applyEvent(state, event)` folds a domain event into projection state |
| `event-sourcing/emitter.js` | `scheduleDomainEvent()` — stamp (UUID + HLC) and hand the event to `ingestEvent()` with origin `local` |
| `event-sourcing/ingest.js` | `ingestEvent(event, { origin })` — single ingest path for local and remote events (see §4) |
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

A projected `DATA_CHANGED` normally drives a full `renderBoard()` rebuild. A
**drag-drop** opens the drag-reconcile window first (`dragdrop.js` `onEnd`), so the
same `DATA_CHANGED` is routed through `reconcileBoard()` — a keyed in-place patch —
instead of the `innerHTML` teardown. This is why a drag-to-Done no longer detaches
the node Chrome's DnD engine still holds. Swimlane boards go through
`reconcileSwimlaneBoard()`, keyed by lane, column and task. A card state no longer shows
(a drop into a hidden Done cell) stays attached and hidden until Sortable's `onEnd` has
returned, then leaves in the next task; a lane that lost its last task leaves in place and
only its Sortables are destroyed, also after `onEnd`. `reconcileBoard()` returns `false`
(→ full rebuild) for a structural column-set change, a lane the board doesn't have yet, or
a changed lane grouping.
```
drop onEnd → beginDragReconcile() → updateTaskPositionsFromDrop() → …DATA_CHANGED…
           → reconcileBoard() [patch in place]  → endDragReconcile()
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
[every tab, at boot]         → initSyncLeader(): Web Lock decides leader or follower; only the leader's network side does anything
[leader tab closed]          → next tab: fold missed stored events → takeOverSyncSession() (§4 Sync leader)

[sign-in, launch signed in]  → beforeSignIn: Data Owner check (§4), stays signed-out until settled
                               → catching-up (or offline if there is no network)
[online, re-auth, SSE reconnect] → catching-up

catching-up (event-sourcing/sync-session.js), one pull per transition:
   1. stop the queue, start snapshot upload
   2. start the SSE subscription, waiting at most 3 s    (the initial PB_CONNECT is covered by the pull)
   3. catchUp() once; once more if SSE reconnected during it → live: start the queue and drain
      SSE up only after the wait: one extra pull if that pull had started, without leaving live
offline, sign-out → stop the queue, snapshot upload and realtime; a push rejected with 401/403 → paused
                    (queue and upload stopped, realtime stays up; offline → paused-offline, realtime stopped;
                    online → paused, realtime and one pull; only re-authentication resumes)

[local mutation] → scheduleDomainEvent() (stamp UUID + sync HLC) → ingestEvent(event, { origin: 'local' })
[remote event]   → realtime.js SSE → ingestEvent(event, { origin: 'remote', receivedAt: record.created })
                   catchUp() → ingestRemoteBatch([{ event, receivedAt }]) → the same remote path per event
                                                   (remote only: await observeRemote(hlc) first)
[server snapshot]→ catchUp(), before its events → adoptSnapshot(key, state, hlc) → save + rebuildScope(key)

ingestEvent (event-sourcing/ingest.js) — one path, origin is a parameter:
   1. validate                         (drops malformed events and HLCs over 60 s ahead, #181)
   2. remote only: drop if it reached the server a grace window after its HLC; classify against the key's newest applied HLC (§9 Ordering)
   3. project: read-model-projector folds event into state (sole writer, deduped by id)
              → emit(DATA_CHANGED) → renderBoard()      [synchronous for local events; skipped for a late remote one]
   4. emit(EVENT_EMITTED) → outbound sync-queue schedules a drain if it is running (HLC order, unsynced only, as the Data Owner)
   5. persistEvent (synced = origin === 'remote')        [same transaction as step 3's writes, §9 Durability] → EVENTS_STORED → other tabs fold it, leader drains
   6. late event only: rebuildScope(key)                  [the promise settles after the rebuild]
```

---

## 8. Architecture Boundaries

| Boundary | Rule |
|---|---|
| Cross-board data | Use `loadTasksForBoard(id)` / `loadColumnsForBoard(id)` — never read or write another board's state |
| Rendering | Mutations emit a domain event; the reducer projects it and emits `DATA_CHANGED`, which `render.js` and page modules subscribe to. Feature modules do not call `renderBoard()` after a mutation |
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
`kanvana:hlc:node`; drift past 60 s is logged. An event whose HLC is more than `MAX_DRIFT_MS` (60 s) ahead of
this device's clock is rejected at ingest (#181): it would win every field and stay newest for its key.

**Live ingest folds in HLC order** (#179). The projector records the newest HLC it has folded into each
**scope key** (board id, `__global__`, `__timetracking__`) in kv `kanvana:ingest:newestAppliedHlc`
(derived once from the stored events on devices that predate it). `ingestEvent()` classifies each event:

| Event | What happens |
|---|---|
| Already applied (id in the key's memory) | No-op |
| Newer than the key's newest applied event | Folded incrementally onto the live view. No event-store read: the common path never scans the store. |
| Older (a **late** event) | Persisted, then the key's view is **rebuilt**: `rebuildScope(key)` (`ingest.js`) folds the key's stored snapshot plus every stored event newer than it, in HLC order, and the projector replaces the view (`DATA_CHANGED {rebuilt: key}`). A late *local* edit is shown at once and then reordered by the same rebuild. |
| Remote, reached the server more than the grace window after its HLC (`record.created − hlc.wallTime > GRACE_WINDOW_MS`) | **Dropped** and logged once. The server's receipt time is the same on every device, so every device drops the same events whatever it has snapshotted. A record without `created` (servers before migration `1746100013`) is never dropped. |
| Late, covered by this device's snapshot (HLC ≤ snapshot HLC) but not held by it | Folded onto the snapshot (which is saved again), then the key is rebuilt; the events before it may be gone. If the snapshot already holds its id: no-op. |

The rule lives only in `ingest.js`, so SSE and catch-up apply or drop a late event the same way.
Known limit: an event folded onto a snapshot is applied after the events the snapshot holds, so a device
whose snapshot covers it can order it differently from one that never snapshotted; it is still applied on both.
Rebuilds of one key run one at a time; requests made while one waits share it, and events committed
during a rebuild are folded into it.

A rebuild is the reducer's fold, with four exceptions so it does not lose state no event carries yet:
board and global settings start from the live value under the snapshot's (they merge field by field);
task delete records are kept (deletes are permanent); tasks, columns and labels that no snapshot,
replayed event or (on adoption) replaced snapshot or covered stored event knows of (written by import, which emits no event yet) are kept as they are;
and with no snapshot to start from, the fold starts from the demo tasks this device holds.
A snapshot is folded from events alone, except for that same start from the demo tasks. Known limit until those writes emit events: a setting written
without an event (swimlane grouping) is reset by a rebuild to the last replayed `settings.updated` that
carries it.

**Demo tasks** on the default board have stable ids and no `task.created`: each device seeds its own, and seeding
adds nothing to the others. Events on one device still name the same tasks on all. A device's first snapshot folds
onto the demo tasks it holds, as they were seeded, so its snapshots carry them with the changes they cover, since
those events are then collected. A device without them, after an account switch, stays without through a replay,
and adopting a snapshot drops any demo task the device doesn't hold, so work done in a demo task doesn't reach a
device that has none. Known limit, because snapshots sync:

- A device holding them that adopts a snapshot without them (taken on a device that had none) keeps the untouched
  ones and **loses each one an event covered by that snapshot changed**.

Folding them out of snapshots would make this the rule (ADR-0004, Amendment: demo tasks).

**Grace window.** `GRACE_WINDOW_MS` (`snapshot.js`) is **30 days**. It must exceed a realistic offline
period: a laptop left closed over a two- to three-week holiday, plus a week of margin for a late return
or a spare device. 30 days covers that while keeping the event store, and the server's events
collection that catch-up pulls in full, to about a month of history.

- A **snapshot covers only events older than the window**: when one is due (500 events or 14 days, see
  `checkAndScheduleSnapshot`), it folds the stored events older than the window onto the previous
  snapshot, at save time. When one is due but no event is old enough yet, the key is not checked again until its
  oldest stored event leaves the window, so a busy board does not rescan the store on every event. Every event inside the window is therefore newer than every snapshot and can
  be ordered in by a rebuild from it ("the snapshot taken before it").
- **Local cleanup** (`gcEvents`) deletes an event only when it is pushed, covered by the snapshot *and*
  older than the window. **Server cleanup** (`gcServerEvents`) skips events inside the window plus a one-hour clock-skew margin
  (`SERVER_CLOCK_MARGIN_MS`), and skips a delete the server still refuses instead of failing the upload; the
  PocketBase hook `backend/pb_hooks/events_grace_window.pb.js` refuses API deletes of them, which also
  holds clients from before #179 to the window. The hook repeats the constant; keep both equal.
- **Adopting a server snapshot** (catch-up, `adoptSnapshot`) saves it and rebuilds the key, so the device
  keeps its stored events newer than the snapshot (§4 Snapshot adoption).
- The drop decision does not depend on local snapshots: only an event that reached the server more than
  a window after it was stamped is dropped, on every device. Its originating device keeps it, since local
  events are never dropped.

### Durability of local edits

The screen updates synchronously (ADR-0005), so an edit is on screen before IndexedDB has it. Every write
made through `persistEvent()` and the `schedule*` helpers in one tick joins one **write batch**: a single
transaction over kv, events and read_model (`batchedWrite`, `idb-store.js`). An event and its read-model change
therefore land together or not at all, so a read model can not hold an edit whose event is lost and never syncs.
A multi-event delete is one batch. The batch calls `commit()` in the same task as its writes (#256).

The reason for committing there: Chromium finishes a transaction whose `commit()` was already sent, but aborts one
still waiting to auto-commit. A probe that wrote 200 records and called `location.reload()` in the same task kept them
in 40 of 40 runs with `commit()` and 29 of 40 without. Before #256 each event queued about 8 transactions, and its own
event write came last, so the delete of a 20-task column took 258-508 ms to store its events; a reload in that time lost them.

Remaining windows:

- **Chromium, ordinary reload:** none observed; the delete-and-reload journey passed 140 of 140 runs. Writing still
  finishes after the screen updates, 3-35 ms later in the same measurement, but a reload no longer interrupts it.
- **Firefox and Safari:** not measured, and whether they finish a committed transaction through a reload is
  unknown. If they do not, an edit can be lost in those milliseconds, event and read model together.
- **Browsers without `commit()`** (Safari before 15) auto-commit, with the same all-or-nothing result.
- **Browser, OS or power failure:** IndexedDB's default durability does not promise a flush to disk.
- **A failed batch** (quota, say) is logged and stores nothing, while the screen keeps the edit until the next load.
- **Catch-up** stores remote events as they arrive and saves their read model at the end of the batch, or at `pagehide`
  (#237), so this pairing is for local edits; the event store still holds what the read model missed. A local edit made
  during catch-up is not deferred: the board, with the events queued so far, is saved in the edit's own batch.

### Event Envelope

```json
{
  "id": "<uuid>",
  "type": "task.priority_changed",
  "hlc": { /* HLC stamp */ },
  "at": "<ISO datetime>",
  "scope": "board",
  "board_id": "<board uuid | null for global / timetracking>",
  "entity_id": "<id of the affected entity>",
  "actor": { "type": "human", "id": null },
  "payload": { "from": "high", "to": "medium" }
}
```

A column-wide `task.moved` from a column sort carries the column id as `entity_id`, so the reducer's
per-task handling (delete-record check, `columnHistory`) does not fire for it.

A `task.moved` payload's `order` lists every task in each affected column, including cards the DOM
does not show (Done past its cut-off, Done in swimlanes, filtered-out and collapsed cards), and no
other tasks. Applying one overwrites the column and order of the tasks it names. Events from before
#140 list the whole board; they stay in logs and old devices still emit them, and the same reducer
handler replays both shapes.

`payload` (formerly `details`) carries the event data; for field changes, before/after values. Locally,
events are persisted to the `events` IDB store with a `synced` flag; on PocketBase they live in the
`events` collection (`payload`/`board`-text/`hlc`/`scope`/`entity_id`). `scope` is `board`, `global` or
`timetracking`; the last two are board-less and are snapshotted under `__global__` / `__timetracking__`.

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
by `tests/e2e/event-sourcing/` against a real PocketBase (`npm run test:e2e:live`; runs its own throwaway PocketBase container, so needs Docker).

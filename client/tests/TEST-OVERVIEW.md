# Test Overview

Generated from test source. Do not edit by hand; run `npm run test:overview` from `client/`.

## Fast Scan

- Test files: 40
- Test cases: 370
- Unit files: 22
- DOM integration files: 9
- E2E files: 9

## How To Use This

- For a requested feature change, search this file for the feature, module, UI label, and spec name.
- If matching tests exist, update the closest unit/DOM/E2E case first.
- If no matching tests exist, add coverage in the layer recommended by `docs/system/spec/testing-strategy.md`.
- Treat the gap lists below as heuristics, not proof that behavior is untested.

## Coverage Gaps By Name

These lists compare source/spec filenames against test file names and test titles.

### Source Modules Without Obvious Named Coverage

- `src/modules/board-serializer.js`
- `src/modules/calendar.js`
- `src/modules/column-element.js`
- `src/modules/column-modal.js`
- `src/modules/dialog.js`
- `src/modules/icons.js`
- `src/modules/idb-store.js`
- `src/modules/impressum.js`
- `src/modules/labels-modal.js`
- `src/modules/notifications.js`
- `src/modules/reports.js`
- `src/modules/swimlane-renderer.js`
- `src/modules/theme.js`

### Specs Without Obvious Named Coverage

- None detected

## Test Files

## Unit Tests

### Autosync

- Path: `tests/unit/autosync.test.js`
- Type: Unit
- Test count: 16

- `tests/unit/autosync.test.js:40` isAutoSyncEnabled > returns false when not set
- `tests/unit/autosync.test.js:44` isAutoSyncEnabled > returns true after enableAutoSync
- `tests/unit/autosync.test.js:49` isAutoSyncEnabled > returns false after disableAutoSync
- `tests/unit/autosync.test.js:59` scheduleAutoSync > calls pushBoardFull for boardId after debounce delay
- `tests/unit/autosync.test.js:71` scheduleAutoSync > debounces: rapid calls produce a single push
- `tests/unit/autosync.test.js:83` scheduleAutoSync > different boards run independently without interference
- `tests/unit/autosync.test.js:96` scheduleAutoSync > does nothing for falsy boardId
- `tests/unit/autosync.test.js:108` scheduleAutoSync > skips push when auto-sync is disabled
- `tests/unit/autosync.test.js:116` scheduleAutoSync > skips push when not authenticated
- `tests/unit/autosync.test.js:126` scheduleAutoSync > queues second call that arrives while first is in-flight
- `tests/unit/autosync.test.js:152` kanban-local-change event > schedules sync for boardId from event detail
- `tests/unit/autosync.test.js:165` kanban-local-change event > ignores event with no boardId in detail
- `tests/unit/autosync.test.js:176` kanban-local-change event > ignores event with no detail
- `tests/unit/autosync.test.js:191` initializeAutoSync > schedules push for all boards on init when auto-sync enabled
- `tests/unit/autosync.test.js:204` initializeAutoSync > does not schedule catch-up when auto-sync is disabled
- `tests/unit/autosync.test.js:214` initializeAutoSync > does not register duplicate listeners on repeated calls

### Columns

- Path: `tests/unit/columns.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/columns.test.js:15` addColumn creates a new column
- `tests/unit/columns.test.js:25` addColumn does nothing for empty name
- `tests/unit/columns.test.js:31` addColumn normalizes color
- `tests/unit/columns.test.js:39` toggleColumnCollapsed toggles from false to true
- `tests/unit/columns.test.js:51` toggleColumnCollapsed toggles from true to false
- `tests/unit/columns.test.js:61` toggleColumnCollapsed returns false for non-existent column
- `tests/unit/columns.test.js:65` toggleColumnCollapsed returns false for empty ID
- `tests/unit/columns.test.js:71` updateColumn updates name and color
- `tests/unit/columns.test.js:81` updateColumn does nothing for empty name
- `tests/unit/columns.test.js:93` deleteColumn returns false for Done column
- `tests/unit/columns.test.js:97` deleteColumn returns false for missing column
- `tests/unit/columns.test.js:101` deleteColumn deletes column and its tasks
- `tests/unit/columns.test.js:122` deleteColumn soft-deletes: column hidden from loadColumns but present in loadDeletedColumnsForBoard
- `tests/unit/columns.test.js:133` deleteColumn soft-deletes tasks in the column

### Constants

- Path: `tests/unit/constants.test.js`
- Type: Unit
- Test count: 8

- `tests/unit/constants.test.js:14` PRIORITIES contains 5 values in correct order
- `tests/unit/constants.test.js:18` PRIORITY_SET contains all expected priorities and rejects unknown values
- `tests/unit/constants.test.js:28` PRIORITY_ORDER maps priorities to ascending numeric rank
- `tests/unit/constants.test.js:36` DEFAULT_PRIORITY is none
- `tests/unit/constants.test.js:40` DONE_COLUMN_ID is done
- `tests/unit/constants.test.js:44` DEFAULT_COLUMN_COLOR is a valid hex color
- `tests/unit/constants.test.js:48` MAX_LABEL_NAME_LENGTH is a positive integer
- `tests/unit/constants.test.js:53` open boards modal shortcut defaults to Ctrl+B

### Dateutils

- Path: `tests/unit/dateutils.test.js`
- Type: Unit
- Test count: 19

- `tests/unit/dateutils.test.js:13` calculateDaysUntilDue returns 0 when due today
- `tests/unit/dateutils.test.js:17` calculateDaysUntilDue returns 1 when due tomorrow
- `tests/unit/dateutils.test.js:21` calculateDaysUntilDue returns negative when overdue
- `tests/unit/dateutils.test.js:25` calculateDaysUntilDue returns positive for future date
- `tests/unit/dateutils.test.js:29` calculateDaysUntilDue returns null for empty string
- `tests/unit/dateutils.test.js:33` calculateDaysUntilDue returns null for invalid date
- `tests/unit/dateutils.test.js:40` formatCountdown returns empty string for null
- `tests/unit/dateutils.test.js:44` formatCountdown returns today for 0 days
- `tests/unit/dateutils.test.js:48` formatCountdown returns tomorrow for 1 day
- `tests/unit/dateutils.test.js:52` formatCountdown returns day count for 2-29 days
- `tests/unit/dateutils.test.js:57` formatCountdown returns months and days for 30+ days
- `tests/unit/dateutils.test.js:64` formatCountdown returns overdue with singular day
- `tests/unit/dateutils.test.js:68` formatCountdown returns overdue with plural days
- `tests/unit/dateutils.test.js:72` formatCountdown returns overdue with months
- `tests/unit/dateutils.test.js:79` getCountdownClassName returns countdown-none for null
- `tests/unit/dateutils.test.js:83` getCountdownClassName returns countdown-urgent within threshold
- `tests/unit/dateutils.test.js:89` getCountdownClassName returns countdown-warning within threshold
- `tests/unit/dateutils.test.js:94` getCountdownClassName returns countdown-normal beyond thresholds
- `tests/unit/dateutils.test.js:99` getCountdownClassName respects custom thresholds

### Convergence

- Path: `tests/unit/event-sourcing/convergence.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/convergence.test.js:18` same event set converges regardless of input order

### Delete Vs Edit

- Path: `tests/unit/event-sourcing/delete-vs-edit.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/delete-vs-edit.test.js:18` later task edit is dropped after task delete tombstone

### Emitter

- Path: `tests/unit/event-sourcing/emitter.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/emitter.test.js:14` emitDomainEvent stores an unsynced immutable event row

### Hlc

- Path: `tests/unit/event-sourcing/hlc.test.js`
- Type: Unit
- Test count: 7

- `tests/unit/event-sourcing/hlc.test.js:16` emitLocal creates a stable HLC node id that persists across sessions
- `tests/unit/event-sourcing/hlc.test.js:26` emitLocal advances wallTime and resets counter when physical time moves forward
- `tests/unit/event-sourcing/hlc.test.js:37` emitLocal increments counter when physical time does not advance
- `tests/unit/event-sourcing/hlc.test.js:48` compareHlc orders equal wallTime and counter by nodeId
- `tests/unit/event-sourcing/hlc.test.js:56` compareHlc remains transitive across wallTime counter and nodeId
- `tests/unit/event-sourcing/hlc.test.js:70` emitLocal warns when local wall clock drift exceeds the bound
- `tests/unit/event-sourcing/hlc.test.js:80` observeRemote advances counter from the remote HLC when remote wallTime wins

### Reducer

- Path: `tests/unit/event-sourcing/reducer.test.js`
- Type: Unit
- Test count: 10

- `tests/unit/event-sourcing/reducer.test.js:18` applyEvent is idempotent by event id
- `tests/unit/event-sourcing/reducer.test.js:35` task.deleted tombstones prevent later task updates from resurrecting the task
- `tests/unit/event-sourcing/reducer.test.js:51` task.updated merges different field events on the same task
- `tests/unit/event-sourcing/reducer.test.js:74` task.moved updates column order and columnHistory
- `tests/unit/event-sourcing/reducer.test.js:106` unknown event types warn and leave projection unchanged
- `tests/unit/event-sourcing/reducer.test.js:118` label events create update and tombstone labels
- `tests/unit/event-sourcing/reducer.test.js:142` label task membership events update task label refs
- `tests/unit/event-sourcing/reducer.test.js:164` column events create update delete and reorder columns
- `tests/unit/event-sourcing/reducer.test.js:193` settings.updated handles board and global settings
- `tests/unit/event-sourcing/reducer.test.js:211` subtask and relationship events update embedded task collections

### Snapshot

- Path: `tests/unit/event-sourcing/snapshot.test.js`
- Type: Unit
- Test count: 10

- `tests/unit/event-sourcing/snapshot.test.js:39` loadSnapshot returns null when no snapshot exists
- `tests/unit/event-sourcing/snapshot.test.js:43` saveSnapshot and loadSnapshot round-trip preserves projection state
- `tests/unit/event-sourcing/snapshot.test.js:67` gcEvents removes events at or before snapshotHlc and leaves later ones
- `tests/unit/event-sourcing/snapshot.test.js:84` hydrateFromSnapshot with no snapshot replays all events from zero
- `tests/unit/event-sourcing/snapshot.test.js:94` hydrateFromSnapshot equals replay-from-zero when snapshot covers earlier events
- `tests/unit/event-sourcing/snapshot.test.js:120` checkAndScheduleSnapshot schedules snapshot after 500 events with jitter delay
- `tests/unit/event-sourcing/snapshot.test.js:137` checkAndScheduleSnapshot does not schedule when event count is below threshold
- `tests/unit/event-sourcing/snapshot.test.js:151` checkAndScheduleSnapshot schedules when snapshot age exceeds 14 days
- `tests/unit/event-sourcing/snapshot.test.js:169` global snapshot stored under __global__ key does not interfere with board snapshot
- `tests/unit/event-sourcing/snapshot.test.js:187` rehydration after GC produces the same projection as before GC

### Events

- Path: `tests/unit/events.test.js`
- Type: Unit
- Test count: 6

- `tests/unit/events.test.js:4` on + emit delivers event with detail
- `tests/unit/events.test.js:13` off removes the handler
- `tests/unit/events.test.js:24` multiple handlers all receive the event
- `tests/unit/events.test.js:38` emit with no subscribers does not throw
- `tests/unit/events.test.js:42` BOARD_CHANGED constant has expected value
- `tests/unit/events.test.js:46` DATA_CHANGED constant has expected value

### Importexport

- Path: `tests/unit/importexport.test.js`
- Type: Unit
- Test count: 8

- `tests/unit/importexport.test.js:44` inspectImportPayload accepts valid board export objects
- `tests/unit/importexport.test.js:69` inspectImportPayload remaps legacy model ids to UUIDs while preserving references
- `tests/unit/importexport.test.js:103` inspectImportPayload rejects files above the size limit
- `tests/unit/importexport.test.js:109` inspectImportPayload warns for legacy task-only imports
- `tests/unit/importexport.test.js:123` inspectImportPayload preserves and remaps task relationships
- `tests/unit/importexport.test.js:145` inspectImportPayload remaps swimlane settings that reference labels and columns
- `tests/unit/importexport.test.js:172` inspectImportPayload removes unknown label references and warns
- `tests/unit/importexport.test.js:192` buildImportConfirmationMessage includes summary details

### Labels

- Path: `tests/unit/labels.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/labels.test.js:14` addLabel creates label successfully
- `tests/unit/labels.test.js:26` addLabel returns EMPTY_NAME for empty name
- `tests/unit/labels.test.js:32` addLabel returns EMPTY_NAME for whitespace-only name
- `tests/unit/labels.test.js:38` addLabel returns DUPLICATE_NAME for case-insensitive duplicate
- `tests/unit/labels.test.js:45` addLabel truncates name to 40 characters
- `tests/unit/labels.test.js:52` addLabel trims group
- `tests/unit/labels.test.js:59` updateLabel updates label successfully
- `tests/unit/labels.test.js:68` updateLabel returns NOT_FOUND for non-existent label
- `tests/unit/labels.test.js:74` updateLabel returns DUPLICATE_NAME when conflicting with another label
- `tests/unit/labels.test.js:82` updateLabel allows keeping the same name on the same label
- `tests/unit/labels.test.js:88` updateLabel returns EMPTY_NAME for empty name
- `tests/unit/labels.test.js:97` deleteLabel removes label from labels list
- `tests/unit/labels.test.js:104` deleteLabel removes label ID from all tasks
- `tests/unit/labels.test.js:117` deleteLabel soft-deletes: label hidden from loadLabels but present in loadDeletedLabelsForBoard

### Normalize

- Path: `tests/unit/normalize.test.js`
- Type: Unit
- Test count: 30

- `tests/unit/normalize.test.js:16` normalizePriority returns valid priorities unchanged
- `tests/unit/normalize.test.js:24` normalizePriority is case-insensitive
- `tests/unit/normalize.test.js:30` normalizePriority returns none for invalid input
- `tests/unit/normalize.test.js:38` normalizePriority trims whitespace
- `tests/unit/normalize.test.js:44` isHexColor accepts valid 6-digit hex colors
- `tests/unit/normalize.test.js:50` isHexColor accepts valid 3-digit hex colors
- `tests/unit/normalize.test.js:55` isHexColor rejects invalid values
- `tests/unit/normalize.test.js:67` normalizeHexColor returns valid color unchanged
- `tests/unit/normalize.test.js:71` normalizeHexColor trims whitespace from valid color
- `tests/unit/normalize.test.js:75` normalizeHexColor returns default fallback for invalid color
- `tests/unit/normalize.test.js:80` normalizeHexColor uses custom fallback
- `tests/unit/normalize.test.js:86` boardDisplayName returns trimmed name
- `tests/unit/normalize.test.js:90` boardDisplayName returns Untitled board for missing/empty name
- `tests/unit/normalize.test.js:100` normalizeDueDate returns plain date unchanged
- `tests/unit/normalize.test.js:104` normalizeDueDate strips ISO time portion
- `tests/unit/normalize.test.js:109` normalizeDueDate returns empty string for empty/null input
- `tests/unit/normalize.test.js:117` normalizeActivityLog drops malformed entries and preserves valid entries
- `tests/unit/normalize.test.js:138` normalizeActivityLog drops entries with empty type, non-parseable timestamp, or invalid actor
- `tests/unit/normalize.test.js:157` normalizeActivityLog accepts ISO timestamps with UTC offset and microsecond precision
- `tests/unit/normalize.test.js:174` normalizeStringKeys deduplicates and trims
- `tests/unit/normalize.test.js:178` normalizeStringKeys filters empty strings and non-strings
- `tests/unit/normalize.test.js:182` normalizeStringKeys returns empty array for non-array input
- `tests/unit/normalize.test.js:190` normalizeSubTasks returns empty array for non-array input
- `tests/unit/normalize.test.js:197` normalizeSubTasks returns empty array for empty array input
- `tests/unit/normalize.test.js:201` normalizeSubTasks filters entries with missing id or title
- `tests/unit/normalize.test.js:213` normalizeSubTasks coerces completed to boolean
- `tests/unit/normalize.test.js:226` normalizeSubTasks preserves order when valid
- `tests/unit/normalize.test.js:235` normalizeSubTasks assigns index-based order when order is missing or non-finite
- `tests/unit/normalize.test.js:246` normalizeSubTasks trims id and title
- `tests/unit/normalize.test.js:254` normalizeSubTasks ignores non-object entries

### Security

- Path: `tests/unit/security.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/security.test.js:4` escapeHtml encodes HTML-sensitive characters
- `tests/unit/security.test.js:8` formatBytes formats small and larger sizes

### Storage Idb

- Path: `tests/unit/storage-idb.test.js`
- Type: Unit
- Test count: 28

- `tests/unit/storage-idb.test.js:57` initStorage on empty IDB leaves boards list empty
- `tests/unit/storage-idb.test.js:62` initStorage creates a stable HLC node id on boot
- `tests/unit/storage-idb.test.js:68` initStorage is safe to call twice in the same session
- `tests/unit/storage-idb.test.js:79` saveTasks persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:96` emitted task.updated events project into task read model
- `tests/unit/storage-idb.test.js:116` saveColumns persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:135` saveLabels persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:151` saveSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:167` initStorage loads global settings from IDB
- `tests/unit/storage-idb.test.js:177` saveGlobalSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:188` createBoard persists board list and per-board defaults across sessions
- `tests/unit/storage-idb.test.js:203` active board id persists across sessions
- `tests/unit/storage-idb.test.js:218` deleteBoard removes per-board data from IDB
- `tests/unit/storage-idb.test.js:240` v2 migration rehomes board read models and removes legacy kv keys
- `tests/unit/storage-idb.test.js:262` v2 migration deletes legacy board event logs
- `tests/unit/storage-idb.test.js:273` v2 schema creates event sourcing stores and event indexes
- `tests/unit/storage-idb.test.js:285` migrates multi-board localStorage data on first initStorage
- `tests/unit/storage-idb.test.js:312` migrates legacy done id to a UUID done role and rewrites task references
- `tests/unit/storage-idb.test.js:349` migration cleans up localStorage after completing
- `tests/unit/storage-idb.test.js:369` migrates legacy single-board localStorage keys (pre-multi-board format)
- `tests/unit/storage-idb.test.js:391` migrates legacy single-board tasks without columns using UUID default column mappings
- `tests/unit/storage-idb.test.js:413` migration does not run again on a subsequent initStorage call (same IDB)
- `tests/unit/storage-idb.test.js:433` initStorage with corrupt kanbanBoards in IDB yields empty boards list
- `tests/unit/storage-idb.test.js:447` loadTasksForBoard reads tasks for a non-active board without changing active board
- `tests/unit/storage-idb.test.js:464` loadColumnsForBoard reads columns for a non-active board
- `tests/unit/storage-idb.test.js:483` loadLabelsForBoard reads labels for a non-active board
- `tests/unit/storage-idb.test.js:499` loadSettingsForBoard reads settings for a non-active board
- `tests/unit/storage-idb.test.js:515` loadTasksForBoard returns empty array for unknown board id

### Storage

- Path: `tests/unit/storage.test.js`
- Type: Unit
- Test count: 29

- `tests/unit/storage.test.js:31` ensureBoardsInitialized creates default board on empty storage
- `tests/unit/storage.test.js:40` ensureBoardsInitialized is idempotent
- `tests/unit/storage.test.js:49` listBoards returns empty array before any board is initialised
- `tests/unit/storage.test.js:55` createBoard creates board with correct keys
- `tests/unit/storage.test.js:66` createBoard uses Untitled board for empty name
- `tests/unit/storage.test.js:72` renameBoard updates board name
- `tests/unit/storage.test.js:83` renameBoard returns false for non-existent board
- `tests/unit/storage.test.js:88` renameBoard returns false for empty name
- `tests/unit/storage.test.js:94` deleteBoard removes board and its data
- `tests/unit/storage.test.js:104` deleteBoard returns false when only one board exists
- `tests/unit/storage.test.js:110` deleteBoard switches active board if deleted board was active
- `tests/unit/storage.test.js:121` getActiveBoardName returns board name
- `tests/unit/storage.test.js:129` loadColumns returns default columns on fresh board
- `tests/unit/storage.test.js:138` loadColumns ensures Done column exists
- `tests/unit/storage.test.js:146` saveColumns + loadColumns roundtrip
- `tests/unit/storage.test.js:158` loadTasks normalizes priority on load
- `tests/unit/storage.test.js:168` loadTasks adds doneDate to tasks in Done column that lack it
- `tests/unit/storage.test.js:178` loadTasks removes doneDate from tasks not in Done column
- `tests/unit/storage.test.js:188` saveTasks + loadTasks roundtrip
- `tests/unit/storage.test.js:199` loadLabels adds empty group to labels missing it
- `tests/unit/storage.test.js:209` loadSettings returns defaults on fresh board
- `tests/unit/storage.test.js:218` loadSettings normalizes invalid swimLaneGroupBy
- `tests/unit/storage.test.js:225` loadSettings clamps countdownWarningThreshold to be >= urgentThreshold
- `tests/unit/storage.test.js:232` loadGlobalSettings returns defaults on first run
- `tests/unit/storage.test.js:236` saveGlobalSettings drops removed settings
- `tests/unit/storage.test.js:241` global settings and board settings are isolated
- `tests/unit/storage.test.js:257` saveTasks emits kanban-local-change with boardId and entity=task
- `tests/unit/storage.test.js:271` saveColumns emits kanban-local-change with boardId and entity=column
- `tests/unit/storage.test.js:285` saveLabels emits kanban-local-change with boardId and entity=label

### Swimlanes Utils

- Path: `tests/unit/swimlanes-utils.test.js`
- Type: Unit
- Test count: 11

- `tests/unit/swimlanes-utils.test.js:28` getSwimLaneValue returns fallback lane names for label mode
- `tests/unit/swimlanes-utils.test.js:38` getSwimLaneValue returns normalized priority lane names for priority mode
- `tests/unit/swimlanes-utils.test.js:46` getSwimLaneValue returns label values from the selected label group
- `tests/unit/swimlanes-utils.test.js:54` groupTasksBySwimLane groups tasks into distinct lanes plus No Group
- `tests/unit/swimlanes-utils.test.js:68` groupTasksBySwimLane sorts priority lanes in workflow order
- `tests/unit/swimlanes-utils.test.js:80` groupTasksBySwimLane includes one lane per label in the selected group
- `tests/unit/swimlanes-utils.test.js:91` buildBoardGrid places tasks into the correct lane and column cells
- `tests/unit/swimlanes-utils.test.js:109` getVisibleTasksForLane hides done-column tasks but keeps active columns visible
- `tests/unit/swimlanes-utils.test.js:117` moveTask updates both column and explicit label lane assignment
- `tests/unit/swimlanes-utils.test.js:131` moveTask supports selected label-group lanes and explicit No Group assignment
- `tests/unit/swimlanes-utils.test.js:152` moveTask updates priority when grouping by priority lane

### Sync

- Path: `tests/unit/sync.test.js`
- Type: Unit
- Test count: 28

- `tests/unit/sync.test.js:95` isAuthenticated > returns false when authStore has no token
- `tests/unit/sync.test.js:101` isAuthenticated > returns false when token present but no record
- `tests/unit/sync.test.js:107` isAuthenticated > returns true when both token and record present
- `tests/unit/sync.test.js:117` ensureAuthenticated > returns false when no token or record
- `tests/unit/sync.test.js:123` ensureAuthenticated > returns true when token and record are valid
- `tests/unit/sync.test.js:130` ensureAuthenticated > returns false when token present but refresh fails
- `tests/unit/sync.test.js:138` ensureAuthenticated > returns true after successful refresh
- `tests/unit/sync.test.js:155` loginUser > calls authWithPassword with email and password
- `tests/unit/sync.test.js:163` loginUser > propagates errors from PocketBase
- `tests/unit/sync.test.js:172` registerUser > creates user with passwordConfirm field
- `tests/unit/sync.test.js:185` registerUser > does not call authStore.save — no auto-login
- `tests/unit/sync.test.js:191` registerUser > defaults name to empty string when not provided
- `tests/unit/sync.test.js:203` logoutUser > clears the auth store
- `tests/unit/sync.test.js:212` pushBoardFull > throws when not authenticated
- `tests/unit/sync.test.js:218` pushBoardFull > loads board data from storage by boardId
- `tests/unit/sync.test.js:230` pushBoardFull > calls purgeDeleted after syncing (purges tasks when soft-delete is off)
- `tests/unit/sync.test.js:241` pushBoardFull > hard-deletes deleted tasks from PocketBase when syncMap entry exists
- `tests/unit/sync.test.js:263` deleteBoardRemote > deletes the PocketBase board and all board-scoped records
- `tests/unit/sync.test.js:308` pullAllBoards > throws when not authenticated
- `tests/unit/sync.test.js:314` pullAllBoards > returns empty array when server has no boards
- `tests/unit/sync.test.js:324` pullAllBoards > writes pulled board data to storage
- `tests/unit/sync.test.js:346` pullAllBoards > maps PocketBase column IDs back to local IDs in tasks
- `tests/unit/sync.test.js:368` pullAllBoards > preserves active board ID if it exists in pulled boards
- `tests/unit/sync.test.js:389` pullAllBoards > sets active board to first when current active not in pulled boards
- `tests/unit/sync.test.js:407` pullAllBoards > maps all PocketBase label IDs back to local IDs for a task with multiple labels
- `tests/unit/sync.test.js:445` pushBoardFull multi-label > sends all label PB IDs for a task with multiple labels
- `tests/unit/sync.test.js:480` pushBoardFull multi-label > sends correct label PB IDs when syncMap already has label mappings (update path)
- `tests/unit/sync.test.js:520` pushBoardFull multi-label > omits label IDs not present in syncMap rather than sending null

### Tasks

- Path: `tests/unit/tasks.test.js`
- Type: Unit
- Test count: 26

- `tests/unit/tasks.test.js:14` addTask creates task with order 1 (top of column)
- `tests/unit/tasks.test.js:24` addTask bumps existing task orders in same column
- `tests/unit/tasks.test.js:34` addTask does nothing for empty title
- `tests/unit/tasks.test.js:39` addTask sets creationDate, changeDate, and columnHistory
- `tests/unit/tasks.test.js:49` addTask sets doneDate when added to Done column
- `tests/unit/tasks.test.js:55` addTask does not set doneDate for non-Done column
- `tests/unit/tasks.test.js:61` addTask preserves labels
- `tests/unit/tasks.test.js:69` updateTask updates title, description, priority
- `tests/unit/tasks.test.js:82` updateTask does nothing for empty title
- `tests/unit/tasks.test.js:90` updateTask appends to columnHistory on column change
- `tests/unit/tasks.test.js:101` updateTask sets doneDate when moving to Done column
- `tests/unit/tasks.test.js:110` updateTask removes doneDate when moving from Done column
- `tests/unit/tasks.test.js:120` updateTask seeds columnHistory if missing
- `tests/unit/tasks.test.js:133` deleteTask removes task by ID
- `tests/unit/tasks.test.js:145` deleteTask permanently removes task from live and deleted task lists by default
- `tests/unit/tasks.test.js:155` updateTaskPositionsFromDrop preserves existing task tombstones
- `tests/unit/tasks.test.js:184` purgeDeleted hard-removes task tombstones from storage
- `tests/unit/tasks.test.js:197` purgeDeleted with { tasks: false } keeps task tombstones
- `tests/unit/tasks.test.js:212` moveTaskToTopInColumn moves specified task to order 1
- `tests/unit/tasks.test.js:227` moveTaskToTopInColumn returns null for missing args
- `tests/unit/tasks.test.js:234` addTask stores subTasks when provided
- `tests/unit/tasks.test.js:249` addTask stores empty subTasks array when none provided
- `tests/unit/tasks.test.js:256` updateTask persists updated subTasks
- `tests/unit/tasks.test.js:274` updateTask clears subTasks when empty array passed
- `tests/unit/tasks.test.js:286` updateTask normalizes invalid subTask entries
- `tests/unit/tasks.test.js:301` subTasks persist through storage round-trip

### Utils

- Path: `tests/unit/utils.test.js`
- Type: Unit
- Test count: 4

- `tests/unit/utils.test.js:4` generateUUID returns a string
- `tests/unit/utils.test.js:8` generateUUID matches UUID v4 format
- `tests/unit/utils.test.js:13` generateUUID produces unique values
- `tests/unit/utils.test.js:19` generateUUID has version digit 4 at correct position

### Validation

- Path: `tests/unit/validation.test.js`
- Type: Unit
- Test count: 7

- `tests/unit/validation.test.js:6` validateTaskTitle returns true for non-empty string
- `tests/unit/validation.test.js:10` validateTaskTitle returns true for whitespace-padded non-empty string
- `tests/unit/validation.test.js:14` validateTaskTitle returns false for empty string
- `tests/unit/validation.test.js:18` validateTaskTitle returns false for whitespace-only string
- `tests/unit/validation.test.js:22` validateTaskTitle returns false for null and undefined
- `tests/unit/validation.test.js:29` validateColumnName returns true for non-empty string
- `tests/unit/validation.test.js:33` validateColumnName returns false for empty/whitespace/null

## DOM Integration Tests

### Accordion

- Path: `tests/dom/accordion.test.js`
- Type: DOM Integration
- Test count: 1

- `tests/dom/accordion.test.js:6` createAccordionSection toggles collapsed state and updates the chevron

### Authsync

- Path: `tests/dom/authsync.test.js`
- Type: DOM Integration
- Test count: 12

- `tests/dom/authsync.test.js:113` initializeAuthSyncUI > returns without error when required DOM elements are missing
- `tests/dom/authsync.test.js:118` initializeAuthSyncUI > sets up handlers when all required elements present
- `tests/dom/authsync.test.js:126` health probe > disables login-btn when PocketBase is unreachable
- `tests/dom/authsync.test.js:135` health probe > leaves login-btn enabled when PocketBase responds ok
- `tests/dom/authsync.test.js:147` auth UI state > shows login-btn and hides user-info when not authenticated
- `tests/dom/authsync.test.js:154` auth UI state > hides login-btn and shows user-info when authenticated
- `tests/dom/authsync.test.js:163` auth UI state > hides sync-btn when authenticated and auto-sync enabled
- `tests/dom/authsync.test.js:171` auth UI state > shows sync-btn when authenticated but auto-sync disabled
- `tests/dom/authsync.test.js:183` register flow > shows confirm-email message after successful registration
- `tests/dom/authsync.test.js:203` register flow > does not call loginUser after registerUser
- `tests/dom/authsync.test.js:221` sync push > calls pushBoardFull(boardId) for each board — not old multi-arg signature
- `tests/dom/authsync.test.js:246` sync pull > calls renderBoard and initializeBoardsUI after successful pull

### Boards Quick Switch

- Path: `tests/dom/boards-quick-switch.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/boards-quick-switch.test.js:94` click brand-text > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:105` delete board > deletes the PocketBase board before removing the local board
- `tests/dom/boards-quick-switch.test.js:120` Ctrl+B shortcut > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:128` Ctrl+B shortcut > does not open the boards modal with the old Shift+B shortcut
- `tests/dom/boards-quick-switch.test.js:138` Ctrl+B shortcut > does not open the modal when an input is focused
- `tests/dom/boards-quick-switch.test.js:151` keyboard navigation in open boards modal > ArrowDown adds keyboard-focused to the first item on first press
- `tests/dom/boards-quick-switch.test.js:164` keyboard navigation in open boards modal > ArrowDown then ArrowDown moves focus to second item
- `tests/dom/boards-quick-switch.test.js:175` keyboard navigation in open boards modal > ArrowUp does not go below index 0
- `tests/dom/boards-quick-switch.test.js:186` keyboard navigation in open boards modal > does not navigate when modal is closed
- `tests/dom/boards-quick-switch.test.js:201` keyboard navigation in open boards modal > Enter on highlighted board activates it and closes the modal
- `tests/dom/boards-quick-switch.test.js:213` keyboard navigation in open boards modal > Enter does nothing when no item is highlighted

### Feature Modules Emit Events

- Path: `tests/dom/event-sourcing/feature-modules-emit-events.test.js`
- Type: DOM Integration
- Test count: 5

- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:33` updateTask emits one task.updated event with HLC entity id and minimal fields
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:67` addColumn emits column.created with the created column payload
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:79` label mutations emit label entity and task membership events
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:98` updateTask emits collection-op and move events for non-scalar changes
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:122` deleteTask emits task.deleted

### Render Triggers

- Path: `tests/dom/event-sourcing/render-triggers.test.js`
- Type: DOM Integration
- Test count: 1

- `tests/dom/event-sourcing/render-triggers.test.js:6` reducer-applied events emit DATA_CHANGED from the outer dispatcher

### Msw Example

- Path: `tests/dom/msw-example.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/msw-example.test.js:37` MSW intercepts requests and DOM reflects successful response
- `tests/dom/msw-example.test.js:45` MSW per-test handler override causes DOM to reflect error state

### Settings Ui

- Path: `tests/dom/settings-ui.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/settings-ui.test.js:44` settings modal opens with board settings controls
- `tests/dom/settings-ui.test.js:57` settings changes persist through board settings

### Task Card Delete

- Path: `tests/dom/task-card-delete.test.js`
- Type: DOM Integration
- Test count: 3

- `tests/dom/task-card-delete.test.js:53` delete button shows permanent-delete confirmation message by default
- `tests/dom/task-card-delete.test.js:65` cancelling delete leaves the task untouched
- `tests/dom/task-card-delete.test.js:76` confirming permanent delete emits DATA_CHANGED after deletion succeeds

### Task Card Linkify

- Path: `tests/dom/task-card-linkify.test.js`
- Type: DOM Integration
- Test count: 14

- `tests/dom/task-card-linkify.test.js:12` linkifyText > plain text with no URL is rendered as a text node
- `tests/dom/task-card-linkify.test.js:18` linkifyText > https URL becomes a clickable link
- `tests/dom/task-card-linkify.test.js:26` linkifyText > http URL becomes a clickable link
- `tests/dom/task-card-linkify.test.js:33` linkifyText > link opens in a new tab with noopener noreferrer
- `tests/dom/task-card-linkify.test.js:40` linkifyText > surrounding text is preserved around the link
- `tests/dom/task-card-linkify.test.js:47` linkifyText > multiple URLs in one description each become a link
- `tests/dom/task-card-linkify.test.js:55` linkifyText > empty string returns an empty fragment
- `tests/dom/task-card-linkify.test.js:61` linkifyText > non-http scheme is not linkified
- `tests/dom/task-card-linkify.test.js:78` updateDescriptionLinks (modal preview strip) > hidden when text has no URLs
- `tests/dom/task-card-linkify.test.js:84` updateDescriptionLinks (modal preview strip) > shows a chip for a single URL
- `tests/dom/task-card-linkify.test.js:94` updateDescriptionLinks (modal preview strip) > deduplicates the same URL appearing twice
- `tests/dom/task-card-linkify.test.js:100` updateDescriptionLinks (modal preview strip) > shows one chip per distinct URL
- `tests/dom/task-card-linkify.test.js:106` updateDescriptionLinks (modal preview strip) > hides and clears when called with empty string
- `tests/dom/task-card-linkify.test.js:114` updateDescriptionLinks (modal preview strip) > non-http scheme does not produce a chip

## End-to-End Tests

### Boards

- Path: `tests/e2e/boards.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/boards.spec.js:33` Boards Management > should open a board when clicking the Open button in manage-boards modal
- `tests/e2e/boards.spec.js:78` Boards Management > should display multiple boards in the manage-boards modal
- `tests/e2e/boards.spec.js:117` Boards Management > should mark the active board in the boards list

### Create Task

- Path: `tests/e2e/create-task.spec.ts`
- Type: End-to-End
- Test count: 4
- Source plan/spec: `task-creation-with-labels.plan.md`

- `tests/e2e/create-task.spec.ts:24` Task Creation > Create task with 2 existing labels and medium priority in To Do column
- `tests/e2e/create-task.spec.ts:51` Task Creation > Create task with 2 existing labels and medium priority in In Progress column
- `tests/e2e/create-task.spec.ts:77` Task Creation > Create task with due date, 2 labels, and medium priority
- `tests/e2e/create-task.spec.ts:126` Task Creation > Create task with 2 new custom labels and medium priority

### Dragdrop

- Path: `tests/e2e/dragdrop.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/dragdrop.spec.js:53` Drag and Drop Performance > should drag task from In Progress to Done
- `tests/e2e/dragdrop.spec.js:84` Drag and Drop Performance > should handle multiple consecutive drops
- `tests/e2e/dragdrop.spec.js:101` Drag and Drop Performance > should show "Show more" button when Done column has many tasks

### Subtasks

- Path: `tests/e2e/subtasks.spec.ts`
- Type: End-to-End
- Test count: 14

- `tests/e2e/subtasks.spec.ts:34` Sub-tasks > Sub-tasks fieldset is visible in the task modal
- `tests/e2e/subtasks.spec.ts:41` Sub-tasks > Add sub-tasks via quick-add input and press Enter
- `tests/e2e/subtasks.spec.ts:57` Sub-tasks > Empty sub-task input is ignored on Enter
- `tests/e2e/subtasks.spec.ts:69` Sub-tasks > Progress legend shows X / Y in fieldset legend
- `tests/e2e/subtasks.spec.ts:85` Sub-tasks > Checking a sub-task updates the progress legend
- `tests/e2e/subtasks.spec.ts:100` Sub-tasks > Completed sub-tasks have strikethrough style
- `tests/e2e/subtasks.spec.ts:114` Sub-tasks > Delete button removes a sub-task from the list
- `tests/e2e/subtasks.spec.ts:130` Sub-tasks > Sub-tasks are saved and persisted when task is created
- `tests/e2e/subtasks.spec.ts:170` Sub-tasks > Sub-task progress indicator appears on task card when sub-tasks exist
- `tests/e2e/subtasks.spec.ts:188` Sub-tasks > No progress indicator on card when task has no sub-tasks
- `tests/e2e/subtasks.spec.ts:199` Sub-tasks > Sub-tasks survive edit modal round-trip with completion state
- `tests/e2e/subtasks.spec.ts:226` Sub-tasks > Card donut turns green when all sub-tasks are completed
- `tests/e2e/subtasks.spec.ts:245` Sub-tasks > Inline edit: click sub-task title to edit and commit with Enter
- `tests/e2e/subtasks.spec.ts:263` Sub-tasks > Inline edit: Escape cancels edit and restores original title

### Swimlanes Dnd

- Path: `tests/e2e/swimlanes-dnd.spec.js`
- Type: End-to-End
- Test count: 4

- `tests/e2e/swimlanes-dnd.spec.js:57` Swim lane drag and drop > moves a task between swim lanes and columns
- `tests/e2e/swimlanes-dnd.spec.js:69` Swim lane drag and drop > moves a task into Done while done cards remain hidden
- `tests/e2e/swimlanes-dnd.spec.js:79` Swim lane drag and drop > moves a task between priority swim lanes and updates task priority
- `tests/e2e/swimlanes-dnd.spec.js:100` Swim lane drag and drop > moves a task between rows from the selected label group

### Swimlanes Persistence

- Path: `tests/e2e/swimlanes-persistence.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/swimlanes-persistence.spec.js:11` Swim lane persistence > persists enabled state and grouping mode across reloads
- `tests/e2e/swimlanes-persistence.spec.js:42` Swim lane persistence > persists priority grouping mode across reloads
- `tests/e2e/swimlanes-persistence.spec.js:68` Swim lane persistence > persists collapsed swim lane state across reloads

### Swimlanes Toggle

- Path: `tests/e2e/swimlanes-toggle.spec.js`
- Type: End-to-End
- Test count: 5

- `tests/e2e/swimlanes-toggle.spec.js:24` Swim lane toggle > enables and disables swim lanes without losing task data
- `tests/e2e/swimlanes-toggle.spec.js:55` Swim lane toggle > collapses and expands a swim lane from its header
- `tests/e2e/swimlanes-toggle.spec.js:71` Swim lane toggle > collapses and expands a workflow column while swim lanes are enabled
- `tests/e2e/swimlanes-toggle.spec.js:92` Swim lane toggle > keeps swim lane column headers visible while vertically scrolling
- `tests/e2e/swimlanes-toggle.spec.js:169` Swim lane toggle > shows one row per label inside the selected label group

### Task Delete

- Path: `tests/e2e/task-delete.spec.ts`
- Type: End-to-End
- Test count: 2

- `tests/e2e/task-delete.spec.ts:36` Task Deletion > permanent delete — confirm removes task and decrements counter
- `tests/e2e/task-delete.spec.ts:54` Task Deletion > cancel delete — task survives and counter is unchanged

### Validation Missing Title

- Path: `tests/e2e/validation-missing-title.spec.ts`
- Type: End-to-End
- Test count: 1
- Source plan/spec: `task-creation-with-labels.plan.md`

- `tests/e2e/validation-missing-title.spec.ts:7` Task Creation - Edge Cases and Error Handling > Attempt to create task without required title

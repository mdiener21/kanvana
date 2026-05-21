# Test Overview

Generated from test source. Do not edit by hand; run `npm run test:overview` from `client/`.

## Fast Scan

- Test files: 35
- Test cases: 403
- Unit files: 17
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
- `src/modules/icons.js`
- `src/modules/idb-store.js`
- `src/modules/impressum.js`
- `src/modules/labels-modal.js`
- `src/modules/notifications.js`
- `src/modules/reports.js`
- `src/modules/schema.js`
- `src/modules/swimlane-renderer.js`
- `src/modules/theme.js`

### Specs Without Obvious Named Coverage

- `../docs/system/spec/audit-trail.md`
- `../docs/system/spec/backend-storage-pb.md`
- `../docs/system/spec/board-ui.md`
- `../docs/system/spec/calendar.md`
- `../docs/system/spec/data-models.md`
- `../docs/system/spec/notifications.md`
- `../docs/system/spec/overview.md`
- `../docs/system/spec/reports.md`
- `../docs/system/spec/testing-strategy.md`
- `../docs/system/spec/testing.md`

## Test Files

## Unit Tests

### Activity Log

- Path: `tests/unit/activity-log.test.js`
- Type: Unit
- Test count: 6

- `tests/unit/activity-log.test.js:5` createActivityEvent returns an event envelope with caller data
- `tests/unit/activity-log.test.js:18` createActivityEvent uses an ISO timestamp by default
- `tests/unit/activity-log.test.js:25` createActivityEvent accepts valid actors and exposes the default human actor
- `tests/unit/activity-log.test.js:32` createActivityEvent throws for invalid actors
- `tests/unit/activity-log.test.js:40` appendTaskActivity initializes activityLog and appends the event
- `tests/unit/activity-log.test.js:50` appendTaskActivity appends to an existing activityLog

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
- Test count: 20

- `tests/unit/columns.test.js:15` addColumn creates a new column
- `tests/unit/columns.test.js:25` addColumn does nothing for empty name
- `tests/unit/columns.test.js:31` addColumn normalizes color
- `tests/unit/columns.test.js:37` addColumn appends column.created board event
- `tests/unit/columns.test.js:52` toggleColumnCollapsed toggles from false to true
- `tests/unit/columns.test.js:64` toggleColumnCollapsed toggles from true to false
- `tests/unit/columns.test.js:74` toggleColumnCollapsed returns false for non-existent column
- `tests/unit/columns.test.js:78` toggleColumnCollapsed returns false for empty ID
- `tests/unit/columns.test.js:84` updateColumn updates name and color
- `tests/unit/columns.test.js:94` updateColumn appends column.renamed board event when name changes
- `tests/unit/columns.test.js:108` updateColumn does not append rename event when name is unchanged
- `tests/unit/columns.test.js:116` updateColumn does nothing for empty name
- `tests/unit/columns.test.js:128` deleteColumn returns false for Done column
- `tests/unit/columns.test.js:132` deleteColumn returns false and logs no event for missing column
- `tests/unit/columns.test.js:137` deleteColumn deletes column and its tasks
- `tests/unit/columns.test.js:154` deleteColumn appends column.deleted and task.deleted board events for destroyed tasks
- `tests/unit/columns.test.js:176` updateColumnPositions appends a single column.reordered event when columns actually moved
- `tests/unit/columns.test.js:202` updateColumnPositions emits no event when order is unchanged
- `tests/unit/columns.test.js:228` deleteColumn soft-deletes: column hidden from loadColumns but present in loadDeletedColumnsForBoard
- `tests/unit/columns.test.js:239` deleteColumn soft-deletes tasks in the column

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
- Test count: 11

- `tests/unit/importexport.test.js:45` exportBoard includes task activity logs and board events
- `tests/unit/importexport.test.js:60` inspectImportPayload accepts valid board export objects
- `tests/unit/importexport.test.js:85` inspectImportPayload normalizes task activity logs and board events
- `tests/unit/importexport.test.js:122` importTasks restores normalized board events to the imported board
- `tests/unit/importexport.test.js:153` inspectImportPayload remaps legacy model ids to UUIDs while preserving references
- `tests/unit/importexport.test.js:187` inspectImportPayload rejects files above the size limit
- `tests/unit/importexport.test.js:193` inspectImportPayload warns for legacy task-only imports
- `tests/unit/importexport.test.js:207` inspectImportPayload preserves and remaps task relationships
- `tests/unit/importexport.test.js:229` inspectImportPayload remaps swimlane settings that reference labels and columns
- `tests/unit/importexport.test.js:256` inspectImportPayload removes unknown label references and warns
- `tests/unit/importexport.test.js:276` buildImportConfirmationMessage includes summary details

### Labels

- Path: `tests/unit/labels.test.js`
- Type: Unit
- Test count: 15

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
- `tests/unit/labels.test.js:115` deleteLabel appends label removal activity to affected tasks
- `tests/unit/labels.test.js:138` deleteLabel soft-deletes: label hidden from loadLabels but present in loadDeletedLabelsForBoard

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
- Test count: 30

- `tests/unit/storage-idb.test.js:54` getBoardEventsKey returns the board event key shape from the PRD
- `tests/unit/storage-idb.test.js:67` initStorage on empty IDB leaves boards list empty
- `tests/unit/storage-idb.test.js:72` initStorage is safe to call twice in the same session
- `tests/unit/storage-idb.test.js:83` saveTasks persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:100` loadTasks normalizes missing and malformed task activity logs to empty arrays
- `tests/unit/storage-idb.test.js:117` saveTasks normalizes task activity logs before persisting
- `tests/unit/storage-idb.test.js:132` saveColumns persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:151` saveLabels persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:167` saveSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:183` initStorage loads global settings from IDB
- `tests/unit/storage-idb.test.js:193` saveGlobalSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:204` pending hard deletes persist to IDB and survive a session reset
- `tests/unit/storage-idb.test.js:220` appendBoardEvent persists board events and survives a session reset
- `tests/unit/storage-idb.test.js:235` saveBoardEvents persists board events and survives a session reset
- `tests/unit/storage-idb.test.js:250` createBoard persists board list and per-board defaults across sessions
- `tests/unit/storage-idb.test.js:265` active board id persists across sessions
- `tests/unit/storage-idb.test.js:280` deleteBoard removes per-board data from IDB
- `tests/unit/storage-idb.test.js:302` deleteBoard removes board event data from IDB
- `tests/unit/storage-idb.test.js:323` migrates multi-board localStorage data on first initStorage
- `tests/unit/storage-idb.test.js:350` migrates legacy done id to a UUID done role and rewrites task references
- `tests/unit/storage-idb.test.js:387` migration cleans up localStorage after completing
- `tests/unit/storage-idb.test.js:407` migrates legacy single-board localStorage keys (pre-multi-board format)
- `tests/unit/storage-idb.test.js:429` migrates legacy single-board tasks without columns using UUID default column mappings
- `tests/unit/storage-idb.test.js:451` migration does not run again on a subsequent initStorage call (same IDB)
- `tests/unit/storage-idb.test.js:471` initStorage with corrupt kanbanBoards in IDB yields empty boards list
- `tests/unit/storage-idb.test.js:485` loadTasksForBoard reads tasks for a non-active board without changing active board
- `tests/unit/storage-idb.test.js:502` loadColumnsForBoard reads columns for a non-active board
- `tests/unit/storage-idb.test.js:521` loadLabelsForBoard reads labels for a non-active board
- `tests/unit/storage-idb.test.js:537` loadSettingsForBoard reads settings for a non-active board
- `tests/unit/storage-idb.test.js:553` loadTasksForBoard returns empty array for unknown board id

### Storage

- Path: `tests/unit/storage.test.js`
- Type: Unit
- Test count: 32

- `tests/unit/storage.test.js:34` ensureBoardsInitialized creates default board on empty storage
- `tests/unit/storage.test.js:43` ensureBoardsInitialized is idempotent
- `tests/unit/storage.test.js:52` listBoards returns empty array before any board is initialised
- `tests/unit/storage.test.js:58` createBoard creates board with correct keys
- `tests/unit/storage.test.js:69` createBoard uses Untitled board for empty name
- `tests/unit/storage.test.js:75` renameBoard updates board name
- `tests/unit/storage.test.js:86` renameBoard returns false for non-existent board
- `tests/unit/storage.test.js:91` renameBoard returns false for empty name
- `tests/unit/storage.test.js:97` deleteBoard removes board and its data
- `tests/unit/storage.test.js:107` deleteBoard returns false when only one board exists
- `tests/unit/storage.test.js:113` deleteBoard switches active board if deleted board was active
- `tests/unit/storage.test.js:124` getActiveBoardName returns board name
- `tests/unit/storage.test.js:132` loadColumns returns default columns on fresh board
- `tests/unit/storage.test.js:141` loadColumns ensures Done column exists
- `tests/unit/storage.test.js:149` saveColumns + loadColumns roundtrip
- `tests/unit/storage.test.js:161` loadTasks normalizes priority on load
- `tests/unit/storage.test.js:171` loadTasks adds doneDate to tasks in Done column that lack it
- `tests/unit/storage.test.js:181` loadTasks removes doneDate from tasks not in Done column
- `tests/unit/storage.test.js:191` saveTasks + loadTasks roundtrip
- `tests/unit/storage.test.js:202` loadLabels adds empty group to labels missing it
- `tests/unit/storage.test.js:212` loadSettings returns defaults on fresh board
- `tests/unit/storage.test.js:221` loadSettings normalizes invalid swimLaneGroupBy
- `tests/unit/storage.test.js:228` loadSettings clamps countdownWarningThreshold to be >= urgentThreshold
- `tests/unit/storage.test.js:235` loadGlobalSettings returns defaults on first run
- `tests/unit/storage.test.js:239` saveGlobalSettings round-trips soft-delete mode
- `tests/unit/storage.test.js:244` global settings and board settings are isolated
- `tests/unit/storage.test.js:258` getPendingHardDeletes returns an empty queue before any hard deletes are queued
- `tests/unit/storage.test.js:262` addPendingHardDelete appends a task hard-delete intent to the queue
- `tests/unit/storage.test.js:270` clearPendingHardDeleteEntry removes queued entries by local task ID
- `tests/unit/storage.test.js:283` saveTasks emits kanban-local-change with boardId and entity=task
- `tests/unit/storage.test.js:297` saveColumns emits kanban-local-change with boardId and entity=column
- `tests/unit/storage.test.js:311` saveLabels emits kanban-local-change with boardId and entity=label

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
- Test count: 32

- `tests/unit/sync.test.js:102` isAuthenticated > returns false when authStore has no token
- `tests/unit/sync.test.js:108` isAuthenticated > returns false when token present but no record
- `tests/unit/sync.test.js:114` isAuthenticated > returns true when both token and record present
- `tests/unit/sync.test.js:124` ensureAuthenticated > returns false when no token or record
- `tests/unit/sync.test.js:130` ensureAuthenticated > returns true when token and record are valid
- `tests/unit/sync.test.js:137` ensureAuthenticated > returns false when token present but refresh fails
- `tests/unit/sync.test.js:145` ensureAuthenticated > returns true after successful refresh
- `tests/unit/sync.test.js:162` loginUser > calls authWithPassword with email and password
- `tests/unit/sync.test.js:170` loginUser > propagates errors from PocketBase
- `tests/unit/sync.test.js:179` registerUser > creates user with passwordConfirm field
- `tests/unit/sync.test.js:192` registerUser > does not call authStore.save — no auto-login
- `tests/unit/sync.test.js:198` registerUser > defaults name to empty string when not provided
- `tests/unit/sync.test.js:210` logoutUser > clears the auth store
- `tests/unit/sync.test.js:219` pushBoardFull > throws when not authenticated
- `tests/unit/sync.test.js:225` pushBoardFull > loads board data from storage by boardId
- `tests/unit/sync.test.js:237` pushBoardFull > calls purgeDeleted after syncing
- `tests/unit/sync.test.js:248` pushBoardFull > with soft-delete OFF (default), hard-deletes soft-deleted tasks from PocketBase when syncMap entry exists
- `tests/unit/sync.test.js:266` pushBoardFull > hard-deletes queued pending entries that have a PocketBase ID and clears them
- `tests/unit/sync.test.js:287` pushBoardFull > clears queued pending entries without a delete call when no PocketBase ID exists
- `tests/unit/sync.test.js:302` pushBoardFull > with soft-delete ON, does not hard-delete soft-deleted tasks during push
- `tests/unit/sync.test.js:318` pushBoardFull > with soft-delete ON, upserts deleted tasks to PocketBase with deleted flag
- `tests/unit/sync.test.js:343` pushBoardFull > with soft-delete ON, does not drain pending hard-deletes queue
- `tests/unit/sync.test.js:364` pullAllBoards > throws when not authenticated
- `tests/unit/sync.test.js:370` pullAllBoards > returns empty array when server has no boards
- `tests/unit/sync.test.js:380` pullAllBoards > writes pulled board data to storage
- `tests/unit/sync.test.js:402` pullAllBoards > maps PocketBase column IDs back to local IDs in tasks
- `tests/unit/sync.test.js:424` pullAllBoards > preserves active board ID if it exists in pulled boards
- `tests/unit/sync.test.js:445` pullAllBoards > sets active board to first when current active not in pulled boards
- `tests/unit/sync.test.js:463` pullAllBoards > maps all PocketBase label IDs back to local IDs for a task with multiple labels
- `tests/unit/sync.test.js:501` pushBoardFull multi-label > sends all label PB IDs for a task with multiple labels
- `tests/unit/sync.test.js:536` pushBoardFull multi-label > sends correct label PB IDs when syncMap already has label mappings (update path)
- `tests/unit/sync.test.js:576` pushBoardFull multi-label > omits label IDs not present in syncMap rather than sending null

### Tasks

- Path: `tests/unit/tasks.test.js`
- Type: Unit
- Test count: 36

- `tests/unit/tasks.test.js:14` addTask creates task with order 1 (top of column)
- `tests/unit/tasks.test.js:24` addTask bumps existing task orders in same column
- `tests/unit/tasks.test.js:34` addTask does nothing for empty title
- `tests/unit/tasks.test.js:39` addTask sets creationDate, changeDate, and columnHistory
- `tests/unit/tasks.test.js:49` addTask appends task.created activity with column details
- `tests/unit/tasks.test.js:64` addTask sets doneDate when added to Done column
- `tests/unit/tasks.test.js:70` addTask does not set doneDate for non-Done column
- `tests/unit/tasks.test.js:76` addTask preserves labels
- `tests/unit/tasks.test.js:84` updateTask updates title, description, priority
- `tests/unit/tasks.test.js:97` updateTask does nothing for empty title
- `tests/unit/tasks.test.js:105` updateTask appends to columnHistory on column change
- `tests/unit/tasks.test.js:116` updateTask appends activity for changed task fields
- `tests/unit/tasks.test.js:141` updateTask appends activity when labels are added and removed
- `tests/unit/tasks.test.js:162` updateTask appends activity when relationships are added and removed
- `tests/unit/tasks.test.js:193` updateTask appends inverse relationship added activity to target task
- `tests/unit/tasks.test.js:222` updateTask appends inverse relationship removed activity to target task
- `tests/unit/tasks.test.js:258` updateTask appends inverse relationship removed and added activity when target inverse type changes
- `tests/unit/tasks.test.js:296` updateTask sets doneDate when moving to Done column
- `tests/unit/tasks.test.js:305` updateTask removes doneDate when moving from Done column
- `tests/unit/tasks.test.js:315` updateTask seeds columnHistory if missing
- `tests/unit/tasks.test.js:328` deleteTask removes task by ID
- `tests/unit/tasks.test.js:338` deleteTask appends task.deleted board event with task and column details
- `tests/unit/tasks.test.js:356` deleteTask permanently removes task from live and deleted task lists by default
- `tests/unit/tasks.test.js:366` deleteTask queues a pending hard delete in permanent-delete mode
- `tests/unit/tasks.test.js:378` purgeDeleted hard-removes soft-deleted tasks from storage
- `tests/unit/tasks.test.js:393` updateTaskPositionsFromDrop appends activity when task moves columns
- `tests/unit/tasks.test.js:437` updateTaskPositionsFromDrop appends activity when swimlane drag changes priority
- `tests/unit/tasks.test.js:481` updateTaskPositionsFromDrop appends activity when swimlane drag changes labels
- `tests/unit/tasks.test.js:528` moveTaskToTopInColumn moves specified task to order 1
- `tests/unit/tasks.test.js:543` moveTaskToTopInColumn returns null for missing args
- `tests/unit/tasks.test.js:550` addTask stores subTasks when provided
- `tests/unit/tasks.test.js:565` addTask stores empty subTasks array when none provided
- `tests/unit/tasks.test.js:572` updateTask persists updated subTasks
- `tests/unit/tasks.test.js:590` updateTask clears subTasks when empty array passed
- `tests/unit/tasks.test.js:602` updateTask normalizes invalid subTask entries
- `tests/unit/tasks.test.js:617` subTasks persist through storage round-trip

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

### Activity Log Ui

- Path: `tests/dom/activity-log-ui.test.js`
- Type: DOM Integration
- Test count: 24

- `tests/dom/activity-log-ui.test.js:11` formatActivityEvent > task.created
- `tests/dom/activity-log-ui.test.js:16` formatActivityEvent > task.title_changed
- `tests/dom/activity-log-ui.test.js:21` formatActivityEvent > task.description_changed
- `tests/dom/activity-log-ui.test.js:26` formatActivityEvent > task.priority_changed
- `tests/dom/activity-log-ui.test.js:31` formatActivityEvent > task.due_date_changed with a date
- `tests/dom/activity-log-ui.test.js:36` formatActivityEvent > task.due_date_changed cleared
- `tests/dom/activity-log-ui.test.js:41` formatActivityEvent > task.column_moved
- `tests/dom/activity-log-ui.test.js:46` formatActivityEvent > task.label_added
- `tests/dom/activity-log-ui.test.js:51` formatActivityEvent > task.label_removed
- `tests/dom/activity-log-ui.test.js:56` formatActivityEvent > task.relationship_added
- `tests/dom/activity-log-ui.test.js:61` formatActivityEvent > task.relationship_removed
- `tests/dom/activity-log-ui.test.js:66` formatActivityEvent > column.created
- `tests/dom/activity-log-ui.test.js:71` formatActivityEvent > column.renamed
- `tests/dom/activity-log-ui.test.js:76` formatActivityEvent > column.deleted
- `tests/dom/activity-log-ui.test.js:81` formatActivityEvent > column.reordered
- `tests/dom/activity-log-ui.test.js:86` formatActivityEvent > task.deleted
- `tests/dom/activity-log-ui.test.js:91` formatActivityEvent > unknown type fallback
- `tests/dom/activity-log-ui.test.js:96` formatActivityEvent > agent actor adds prefix
- `tests/dom/activity-log-ui.test.js:102` formatActivityEvent > human actor has no prefix
- `tests/dom/activity-log-ui.test.js:112` createTaskActivitySection > returns an accordion DOM element
- `tests/dom/activity-log-ui.test.js:119` createTaskActivitySection > is collapsed by default
- `tests/dom/activity-log-ui.test.js:128` createTaskActivitySection > empty activityLog shows "No activity yet"
- `tests/dom/activity-log-ui.test.js:135` createTaskActivitySection > renders events newest-first
- `tests/dom/activity-log-ui.test.js:152` createTaskActivitySection > missing activityLog does not throw

### Activity Page

- Path: `tests/dom/activity-page.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/activity-page.test.js:6` activity-log-ui renders empty state container without throwing
- `tests/dom/activity-page.test.js:15` formatActivityEvent does not throw for all PRD event types

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
- Test count: 10

- `tests/dom/boards-quick-switch.test.js:87` click brand-text > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:100` Ctrl+B shortcut > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:108` Ctrl+B shortcut > does not open the boards modal with the old Shift+B shortcut
- `tests/dom/boards-quick-switch.test.js:118` Ctrl+B shortcut > does not open the modal when an input is focused
- `tests/dom/boards-quick-switch.test.js:131` keyboard navigation in open boards modal > ArrowDown adds keyboard-focused to the first item on first press
- `tests/dom/boards-quick-switch.test.js:144` keyboard navigation in open boards modal > ArrowDown then ArrowDown moves focus to second item
- `tests/dom/boards-quick-switch.test.js:155` keyboard navigation in open boards modal > ArrowUp does not go below index 0
- `tests/dom/boards-quick-switch.test.js:166` keyboard navigation in open boards modal > does not navigate when modal is closed
- `tests/dom/boards-quick-switch.test.js:181` keyboard navigation in open boards modal > Enter on highlighted board activates it and closes the modal
- `tests/dom/boards-quick-switch.test.js:193` keyboard navigation in open boards modal > Enter does nothing when no item is highlighted

### Msw Example

- Path: `tests/dom/msw-example.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/msw-example.test.js:37` MSW intercepts requests and DOM reflects successful response
- `tests/dom/msw-example.test.js:45` MSW per-test handler override causes DOM to reflect error state

### Settings Ui

- Path: `tests/dom/settings-ui.test.js`
- Type: DOM Integration
- Test count: 10

- `tests/dom/settings-ui.test.js:67` soft-delete toggle reflects persisted global settings when Settings opens
- `tests/dom/settings-ui.test.js:79` toggling soft-delete on switches task deletion to soft-delete mode immediately
- `tests/dom/settings-ui.test.js:111` toggling soft-delete off switches confirmation back and leaves soft-deleted tasks untouched
- `tests/dom/settings-ui.test.js:152` purge button shows count of zero and is disabled when no soft-deleted tasks
- `tests/dom/settings-ui.test.js:163` purge button shows correct count and is enabled when soft-deleted tasks exist
- `tests/dom/settings-ui.test.js:179` purge button enabled when soft-deleted tasks exist even if soft-delete toggle is off
- `tests/dom/settings-ui.test.js:191` clicking purge shows confirmation with count and across all boards
- `tests/dom/settings-ui.test.js:212` cancelling purge confirmation leaves all soft-deleted tasks untouched
- `tests/dom/settings-ui.test.js:226` confirming purge removes all soft-deleted tasks from all boards
- `tests/dom/settings-ui.test.js:243` purge button disables and shows zero count after successful purge

### Task Card Delete

- Path: `tests/dom/task-card-delete.test.js`
- Type: DOM Integration
- Test count: 3

- `tests/dom/task-card-delete.test.js:54` delete button shows permanent-delete confirmation message by default
- `tests/dom/task-card-delete.test.js:66` cancelling delete leaves the task untouched
- `tests/dom/task-card-delete.test.js:77` confirming permanent delete emits DATA_CHANGED after deletion succeeds

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
- `tests/e2e/create-task.spec.ts:120` Task Creation > Create task with 2 new custom labels and medium priority

### Dragdrop

- Path: `tests/e2e/dragdrop.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/dragdrop.spec.js:48` Drag and Drop Performance > should drag task from In Progress to Done
- `tests/e2e/dragdrop.spec.js:79` Drag and Drop Performance > should handle multiple consecutive drops
- `tests/e2e/dragdrop.spec.js:96` Drag and Drop Performance > should show "Show more" button when Done column has many tasks

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
- `tests/e2e/subtasks.spec.ts:164` Sub-tasks > Sub-task progress indicator appears on task card when sub-tasks exist
- `tests/e2e/subtasks.spec.ts:182` Sub-tasks > No progress indicator on card when task has no sub-tasks
- `tests/e2e/subtasks.spec.ts:193` Sub-tasks > Sub-tasks survive edit modal round-trip with completion state
- `tests/e2e/subtasks.spec.ts:220` Sub-tasks > Card donut turns green when all sub-tasks are completed
- `tests/e2e/subtasks.spec.ts:239` Sub-tasks > Inline edit: click sub-task title to edit and commit with Enter
- `tests/e2e/subtasks.spec.ts:257` Sub-tasks > Inline edit: Escape cancels edit and restores original title

### Swimlanes Dnd

- Path: `tests/e2e/swimlanes-dnd.spec.js`
- Type: End-to-End
- Test count: 4

- `tests/e2e/swimlanes-dnd.spec.js:56` Swim lane drag and drop > moves a task between swim lanes and columns
- `tests/e2e/swimlanes-dnd.spec.js:68` Swim lane drag and drop > moves a task into Done while done cards remain hidden
- `tests/e2e/swimlanes-dnd.spec.js:78` Swim lane drag and drop > moves a task between priority swim lanes and updates task priority
- `tests/e2e/swimlanes-dnd.spec.js:99` Swim lane drag and drop > moves a task between rows from the selected label group

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
- Test count: 3

- `tests/e2e/task-delete.spec.ts:65` Task Deletion > permanent delete — confirm removes task and decrements counter
- `tests/e2e/task-delete.spec.ts:83` Task Deletion > cancel delete — task survives and counter is unchanged
- `tests/e2e/task-delete.spec.ts:100` Task Deletion > soft-delete — dialog shows soft-delete message, task removed from board, purge count increments

### Validation Missing Title

- Path: `tests/e2e/validation-missing-title.spec.ts`
- Type: End-to-End
- Test count: 1
- Source plan/spec: `task-creation-with-labels.plan.md`

- `tests/e2e/validation-missing-title.spec.ts:7` Task Creation - Edge Cases and Error Handling > Attempt to create task without required title

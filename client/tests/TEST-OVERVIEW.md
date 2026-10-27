# Test Overview

Generated from test source. Do not edit by hand; run `npm run test:overview` from `client/`.

## Fast Scan

- Test files: 109
- Test cases: 1001
- Unit files: 47
- DOM integration files: 35
- E2E files: 25
- Performance files: 1

## How To Use This

- For a requested feature change, search this file for the feature, module, UI label, and spec name.
- If matching tests exist, update the closest unit/DOM/E2E case first.
- If no matching tests exist, add coverage in the layer recommended by `docs/system/spec/testing-strategy.md`.
- Treat the gap lists below as heuristics, not proof that behavior is untested.

## Coverage Gaps By Name

These lists compare source/spec filenames against test file names and test titles.

### Source Modules Without Obvious Named Coverage

- `src/modules/board-serializer.js`
- `src/modules/chart-theme.js`
- `src/modules/column-element.js`
- `src/modules/column-modal.js`
- `src/modules/dialog.js`
- `src/modules/event-sourcing/event-validation.js`
- `src/modules/icons.js`
- `src/modules/idb-store.js`
- `src/modules/impressum.js`
- `src/modules/labels-modal.js`
- `src/modules/swimlane-renderer.js`
- `src/modules/timetracking-crud.js`
- `src/modules/timetracking-entry-fields.js`
- `src/modules/timetracking-markup.js`
- `src/modules/timetracking-references.js`
- `src/modules/timetracking-reports-panel.js`
- `src/modules/timetracking-settings-panel.js`
- `src/modules/timetracking-toast.js`
- `src/modules/timetracking-ui.js`

### Specs Without Obvious Named Coverage

- None detected

## Test Files

## Unit Tests

### Backend Boards Lock

- Path: `tests/unit/backend-boards-lock.test.js`
- Type: Unit
- Test count: 4

- `tests/unit/backend-boards-lock.test.js:47` boards lock migration exists
- `tests/unit/backend-boards-lock.test.js:51` after the migration, boards create/update/delete are admin-only (AC-001)
- `tests/unit/backend-boards-lock.test.js:58` after the migration, boards list/view stay owner-only (AC-002)
- `tests/unit/backend-boards-lock.test.js:65` rolling the migration back restores the owner rules (AC-003)

### Backend Event Schema

- Path: `tests/unit/backend-event-schema.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/backend-event-schema.test.js:7` latest backend migrations defensively keep events.board as text
- `tests/unit/backend-event-schema.test.js:23` events record the time the server received them (grace-window drop rule, #179)

### Backend Grace Window Hook

- Path: `tests/unit/backend-grace-window-hook.test.js`
- Type: Unit
- Test count: 4

- `tests/unit/backend-grace-window-hook.test.js:28` events grace-window hook > guards delete requests on the events collection only
- `tests/unit/backend-grace-window-hook.test.js:32` events grace-window hook > refuses to delete an event younger than the grace window
- `tests/unit/backend-grace-window-hook.test.js:40` events grace-window hook > lets an event older than the grace window be deleted
- `tests/unit/backend-grace-window-hook.test.js:49` events grace-window hook > lets an event without a readable HLC be deleted

### Columns

- Path: `tests/unit/columns.test.js`
- Type: Unit
- Test count: 19

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
- `tests/unit/columns.test.js:122` deleteColumn hides the column from loadColumns
- `tests/unit/columns.test.js:131` deleteColumn deletes tasks in the column
- `tests/unit/columns.test.js:143` addColumn defaults to an unlimited WIP limit
- `tests/unit/columns.test.js:149` addColumn stores and normalizes a WIP limit
- `tests/unit/columns.test.js:157` updateColumn persists a WIP limit change
- `tests/unit/columns.test.js:165` updateColumn accepts a limit below the current task count
- `tests/unit/columns.test.js:179` omitting the WIP limit on updateColumn preserves the existing one

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

### Backfill

- Path: `tests/unit/event-sourcing/backfill.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/event-sourcing/backfill.test.js:51` event log backfill > emits a created event for every pre-existing entity
- `tests/unit/event-sourcing/backfill.test.js:65` event log backfill > a replaying device reconstructs each board and its tasks
- `tests/unit/event-sourcing/backfill.test.js:90` event log backfill > runs once and is a no-op on the next startup
- `tests/unit/event-sourcing/backfill.test.js:102` event log backfill > skips entities that already have a created event
- `tests/unit/event-sourcing/backfill.test.js:116` event log backfill > records the flag so a later run is skipped

### Board Delete Replay

- Path: `tests/unit/event-sourcing/board-delete-replay.test.js`
- Type: Unit
- Test count: 3

- `tests/unit/event-sourcing/board-delete-replay.test.js:48` a board deleted elsewhere does not come back when its events replay
- `tests/unit/event-sourcing/board-delete-replay.test.js:63` the tombstone survives a reload rather than resurrecting from IDB
- `tests/unit/event-sourcing/board-delete-replay.test.js:77` a board deleted on this device is removed on a second device through its events alone

### Board Import Convergence

- Path: `tests/unit/event-sourcing/board-import-convergence.test.js`
- Type: Unit
- Test count: 1

- `tests/unit/event-sourcing/board-import-convergence.test.js:73` a board import emits events a second device can rebuild the whole board from

### Board Scaffold Convergence

- Path: `tests/unit/event-sourcing/board-scaffold-convergence.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:39` createBoard emits a column.created per default column and a label.created per default label
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:65` a fresh device reconstructs createBoard columns and labels from the event log alone
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:86` the default board uses a stable id across independent device initialisations
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:102` two devices seeding the default board converge to one board with no duplicate columns or labels
- `tests/unit/event-sourcing/board-scaffold-convergence.test.js:127` createBoard does not double-apply its own scaffold events onto the local read-model

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

### Durable Memory

- Path: `tests/unit/event-sourcing/durable-memory.test.js`
- Type: Unit
- Test count: 5

- `tests/unit/event-sourcing/durable-memory.test.js:59` a task deleted before a reload is not resurrected by an older task.created
- `tests/unit/event-sourcing/durable-memory.test.js:69` the remote echo of an edit applied before a reload does not overwrite a newer edit
- `tests/unit/event-sourcing/durable-memory.test.js:81` a delete record in an adopted snapshot makes later edits of that task a no-op, also after a reload
- `tests/unit/event-sourcing/durable-memory.test.js:102` a snapshot holds the board memory and the live applied set is pruned of what it holds
- `tests/unit/event-sourcing/durable-memory.test.js:133` a global-scope echo of an event stored before a reload is answered as applied from the event store

### Emitter

- Path: `tests/unit/event-sourcing/emitter.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/event-sourcing/emitter.test.js:15` scheduleDomainEvent persists an unsynced immutable event row
- `tests/unit/event-sourcing/emitter.test.js:38` a timetracking-scope event carries no board_id even if one is passed

### Hlc

- Path: `tests/unit/event-sourcing/hlc.test.js`
- Type: Unit
- Test count: 13

- `tests/unit/event-sourcing/hlc.test.js:16` emitLocal creates a stable HLC node id that persists across sessions
- `tests/unit/event-sourcing/hlc.test.js:26` emitLocal advances wallTime and resets counter when physical time moves forward
- `tests/unit/event-sourcing/hlc.test.js:37` emitLocal increments counter when physical time does not advance
- `tests/unit/event-sourcing/hlc.test.js:48` compareHlc orders equal wallTime and counter by nodeId
- `tests/unit/event-sourcing/hlc.test.js:56` compareHlc remains transitive across wallTime counter and nodeId
- `tests/unit/event-sourcing/hlc.test.js:70` emitLocal warns when local wall clock drift exceeds the bound
- `tests/unit/event-sourcing/hlc.test.js:80` observeRemote advances counter from the remote HLC when remote wallTime wins
- `tests/unit/event-sourcing/hlc.test.js:91` observeRemote does not advance the local clock beyond the drift limit (#181)
- `tests/unit/event-sourcing/hlc.test.js:102` observeRemote still adopts a remote clock ahead by less than the drift limit
- `tests/unit/event-sourcing/hlc.test.js:110` laterHlc picks the later stamp and ignores a missing one
- `tests/unit/event-sourcing/hlc.test.js:126` observing a catch-up of 800 remote clocks reads the stored node id at most once (#236)
- `tests/unit/event-sourcing/hlc.test.js:136` a node id made in memory before storage was read gives way to the stored one (#236)
- `tests/unit/event-sourcing/hlc.test.js:147` a node id made in memory before any was stored is persisted and kept (#236)

### Out Of Order Ingest

- Path: `tests/unit/event-sourcing/out-of-order-ingest.test.js`
- Type: Unit
- Test count: 3

- `tests/unit/event-sourcing/out-of-order-ingest.test.js:84` rebuild > keeps a task that no event knows of, such as an imported one
- `tests/unit/event-sourcing/out-of-order-ingest.test.js:124` in-order ingest stays incremental > a stream of newer events never reads the event store in bulk and never rebuilds
- `tests/unit/event-sourcing/out-of-order-ingest.test.js:140` in-order ingest stays incremental > a late event is the one that reads the store and rebuilds

### Read Model Projector

- Path: `tests/unit/event-sourcing/read-model-projector.test.js`
- Type: Unit
- Test count: 7

- `tests/unit/event-sourcing/read-model-projector.test.js:78` createReadModelProjector > an ingested board event projects into state and schedules read-model persist
- `tests/unit/event-sourcing/read-model-projector.test.js:88` createReadModelProjector > an event emitted on the bus without ingest is not projected
- `tests/unit/event-sourcing/read-model-projector.test.js:93` createReadModelProjector > ingest is idempotent by event id (dedup) and announces DATA_CHANGED once
- `tests/unit/event-sourcing/read-model-projector.test.js:106` createReadModelProjector > global-scope event projects globalSettings and persists the global key only
- `tests/unit/event-sourcing/read-model-projector.test.js:123` createReadModelProjector > timetracking-scope event is never routed into a board projection and lands in the time-tracking slot
- `tests/unit/event-sourcing/read-model-projector.test.js:149` createReadModelProjector > register() is idempotent — a single ingest projects once
- `tests/unit/event-sourcing/read-model-projector.test.js:156` createReadModelProjector > reset() disconnects the projector from ingest; applied ids live in state, not the projector

### Reducer

- Path: `tests/unit/event-sourcing/reducer.test.js`
- Type: Unit
- Test count: 12

- `tests/unit/event-sourcing/reducer.test.js:18` applyEvent is idempotent by event id
- `tests/unit/event-sourcing/reducer.test.js:35` task.deleted tombstones prevent later task updates from resurrecting the task
- `tests/unit/event-sourcing/reducer.test.js:51` task.updated merges different field events on the same task
- `tests/unit/event-sourcing/reducer.test.js:74` task.moved updates column order and columnHistory
- `tests/unit/event-sourcing/reducer.test.js:106` unknown event types warn and leave projection unchanged
- `tests/unit/event-sourcing/reducer.test.js:131` label events create update and tombstone labels
- `tests/unit/event-sourcing/reducer.test.js:155` label task membership events update task label refs
- `tests/unit/event-sourcing/reducer.test.js:177` column events create update delete and reorder columns
- `tests/unit/event-sourcing/reducer.test.js:206` settings.updated handles board and global settings
- `tests/unit/event-sourcing/reducer.test.js:224` settings.updated in the timetracking scope touches neither board nor global settings
- `tests/unit/event-sourcing/reducer.test.js:238` projection state carries an empty time-tracking slot that survives events
- `tests/unit/event-sourcing/reducer.test.js:246` subtask and relationship events update embedded task collections

### Snapshot

- Path: `tests/unit/event-sourcing/snapshot.test.js`
- Type: Unit
- Test count: 18

- `tests/unit/event-sourcing/snapshot.test.js:42` loadSnapshot returns null when no snapshot exists
- `tests/unit/event-sourcing/snapshot.test.js:46` saveSnapshot and loadSnapshot round-trip preserves projection state
- `tests/unit/event-sourcing/snapshot.test.js:70` gcEvents removes events at or before snapshotHlc and leaves later ones
- `tests/unit/event-sourcing/snapshot.test.js:85` gcEvents never deletes an event that has not been pushed, whatever its HLC
- `tests/unit/event-sourcing/snapshot.test.js:98` gcEvents keeps covered, pushed events that are younger than the grace window
- `tests/unit/event-sourcing/snapshot.test.js:111` gcEvents for a board snapshot does not delete unrelated boards\' events
- `tests/unit/event-sourcing/snapshot.test.js:127` gcEvents scopes timetracking, global and board snapshots independently
- `tests/unit/event-sourcing/snapshot.test.js:146` timetracking snapshot round-trips the time-tracking slot
- `tests/unit/event-sourcing/snapshot.test.js:153` snapshotKeyForEvent maps each scope to its own key
- `tests/unit/event-sourcing/snapshot.test.js:168` checkAndScheduleSnapshot snapshots after 500 events, covering the ones older than the grace window
- `tests/unit/event-sourcing/snapshot.test.js:190` checkAndScheduleSnapshot takes no snapshot while every event is inside the grace window
- `tests/unit/event-sourcing/snapshot.test.js:212` a due snapshot with nothing old enough is not re-checked until the oldest event leaves the grace window
- `tests/unit/event-sourcing/snapshot.test.js:236` checkAndScheduleSnapshot folds with the supplied fold and reports the saved state
- `tests/unit/event-sourcing/snapshot.test.js:255` checkAndScheduleSnapshot does not schedule when event count is below threshold
- `tests/unit/event-sourcing/snapshot.test.js:268` checkAndScheduleSnapshot ignores other boards when counting events
- `tests/unit/event-sourcing/snapshot.test.js:281` checkAndScheduleSnapshot schedules when snapshot age exceeds 14 days
- `tests/unit/event-sourcing/snapshot.test.js:297` global snapshot stored under __global__ key does not interfere with board snapshot
- `tests/unit/event-sourcing/snapshot.test.js:315` rehydration after GC produces the same projection as before GC

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
- `tests/unit/labels.test.js:117` deleteLabel hides the label from loadLabels

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

### Sortable Native Drag

- Path: `tests/unit/sortable-native-drag.test.js`
- Type: Unit
- Test count: 2

- `tests/unit/sortable-native-drag.test.js:30` SortableJS never uses native HTML5 drag > finds every Sortable call site
- `tests/unit/sortable-native-drag.test.js:44` SortableJS never uses native HTML5 drag > task cards are never natively draggable

### Storage Idb

- Path: `tests/unit/storage-idb.test.js`
- Type: Unit
- Test count: 30

- `tests/unit/storage-idb.test.js:57` initStorage on empty IDB leaves boards list empty
- `tests/unit/storage-idb.test.js:62` initStorage creates a stable HLC node id on boot
- `tests/unit/storage-idb.test.js:68` initStorage is safe to call twice in the same session
- `tests/unit/storage-idb.test.js:77` initStorage removes the stale legacy-sync localStorage keys from older versions
- `tests/unit/storage-idb.test.js:89` saveTasks persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:106` emitted task.updated events project into task read model
- `tests/unit/storage-idb.test.js:126` saveColumns persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:145` saveLabels persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:161` saveSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:177` initStorage loads global settings from IDB
- `tests/unit/storage-idb.test.js:187` saveGlobalSettings persists to IDB and survives a session reset
- `tests/unit/storage-idb.test.js:198` createBoard persists board list and per-board defaults across sessions
- `tests/unit/storage-idb.test.js:213` active board id persists across sessions
- `tests/unit/storage-idb.test.js:228` deleteBoard removes per-board data from IDB
- `tests/unit/storage-idb.test.js:250` deleteBoard leaves no read-model record of the board, delete records and applied ids included (#178)
- `tests/unit/storage-idb.test.js:270` v2 migration rehomes board read models and removes legacy kv keys
- `tests/unit/storage-idb.test.js:292` v2 migration deletes legacy board event logs
- `tests/unit/storage-idb.test.js:303` v2 schema creates event sourcing stores and event indexes
- `tests/unit/storage-idb.test.js:315` migrates multi-board localStorage data on first initStorage
- `tests/unit/storage-idb.test.js:342` migrates legacy done id to a UUID done role and rewrites task references
- `tests/unit/storage-idb.test.js:379` migration cleans up localStorage after completing
- `tests/unit/storage-idb.test.js:399` migrates legacy single-board localStorage keys (pre-multi-board format)
- `tests/unit/storage-idb.test.js:421` migrates legacy single-board tasks without columns using UUID default column mappings
- `tests/unit/storage-idb.test.js:443` migration does not run again on a subsequent initStorage call (same IDB)
- `tests/unit/storage-idb.test.js:463` initStorage with corrupt kanbanBoards in IDB yields empty boards list
- `tests/unit/storage-idb.test.js:477` loadTasksForBoard reads tasks for a non-active board without changing active board
- `tests/unit/storage-idb.test.js:494` loadColumnsForBoard reads columns for a non-active board
- `tests/unit/storage-idb.test.js:513` loadLabelsForBoard reads labels for a non-active board
- `tests/unit/storage-idb.test.js:529` loadSettingsForBoard reads settings for a non-active board
- `tests/unit/storage-idb.test.js:545` loadTasksForBoard returns empty array for unknown board id

### Storage

- Path: `tests/unit/storage.test.js`
- Type: Unit
- Test count: 27

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
- `tests/unit/storage.test.js:241` saveGlobalSettings keeps Time Tracking settings
- `tests/unit/storage.test.js:246` global settings and board settings are isolated

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
- Test count: 13

- `tests/unit/sync.test.js:48` isAuthenticated > returns false when authStore has no token
- `tests/unit/sync.test.js:54` isAuthenticated > returns false when token present but no record
- `tests/unit/sync.test.js:60` isAuthenticated > returns true when both token and record present
- `tests/unit/sync.test.js:70` ensureAuthenticated > returns false when no token or record
- `tests/unit/sync.test.js:76` ensureAuthenticated > returns true when token and record are valid
- `tests/unit/sync.test.js:83` ensureAuthenticated > returns false when token present but refresh fails
- `tests/unit/sync.test.js:91` ensureAuthenticated > returns true after successful refresh
- `tests/unit/sync.test.js:108` loginUser > calls authWithPassword with email and password
- `tests/unit/sync.test.js:116` loginUser > propagates errors from PocketBase
- `tests/unit/sync.test.js:125` registerUser > creates user with passwordConfirm field
- `tests/unit/sync.test.js:138` registerUser > does not call authStore.save — no auto-login
- `tests/unit/sync.test.js:144` registerUser > defaults name to empty string when not provided
- `tests/unit/sync.test.js:156` logoutUser > clears the auth store

### Tasks

- Path: `tests/unit/tasks.test.js`
- Type: Unit
- Test count: 23

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
- `tests/unit/tasks.test.js:145` deleteTask permanently removes the task
- `tests/unit/tasks.test.js:158` moveTaskToTopInColumn moves specified task to order 1
- `tests/unit/tasks.test.js:173` moveTaskToTopInColumn returns null for missing args
- `tests/unit/tasks.test.js:180` addTask stores subTasks when provided
- `tests/unit/tasks.test.js:195` addTask stores empty subTasks array when none provided
- `tests/unit/tasks.test.js:202` updateTask persists updated subTasks
- `tests/unit/tasks.test.js:220` updateTask clears subTasks when empty array passed
- `tests/unit/tasks.test.js:232` updateTask normalizes invalid subTask entries
- `tests/unit/tasks.test.js:247` subTasks persist through storage round-trip

### Archive Delete

- Path: `tests/unit/time-tracking/archive-delete.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/time-tracking/archive-delete.test.js:33` archive / unarchive > archiving a customer emits customer.archived
- `tests/unit/time-tracking/archive-delete.test.js:40` archive / unarchive > unarchiving a project emits project.unarchived
- `tests/unit/time-tracking/archive-delete.test.js:48` archive / unarchive > archiving an already archived item emits nothing
- `tests/unit/time-tracking/archive-delete.test.js:54` archive / unarchive > an unknown id is rejected
- `tests/unit/time-tracking/archive-delete.test.js:62` reference guard > a customer is in use while it has projects, archived or not
- `tests/unit/time-tracking/archive-delete.test.js:68` reference guard > a project is in use while it has time entries
- `tests/unit/time-tracking/archive-delete.test.js:74` reference guard > deleting an unreferenced project emits project.deleted with the project
- `tests/unit/time-tracking/archive-delete.test.js:81` reference guard > deleting an unreferenced customer emits customer.deleted with the customer
- `tests/unit/time-tracking/archive-delete.test.js:89` reference guard > a referenced project or customer is not deleted
- `tests/unit/time-tracking/archive-delete.test.js:96` reference guard > deleting an unknown id is rejected
- `tests/unit/time-tracking/archive-delete.test.js:108` archive filtering > a project is selectable only when neither it nor its customer is archived
- `tests/unit/time-tracking/archive-delete.test.js:115` archive filtering > a project whose customer is missing is not selectable
- `tests/unit/time-tracking/archive-delete.test.js:122` archive filtering > the picker offers only selectable projects
- `tests/unit/time-tracking/archive-delete.test.js:126` archive filtering > validation rejects archived projects and projects of archived customers

### Balance

- Path: `tests/unit/time-tracking/balance.test.js`
- Type: Unit
- Test count: 15

- `tests/unit/time-tracking/balance.test.js:16` periodBalance — Target > a finished week has a Target of exactly the Weekly hours
- `tests/unit/time-tracking/balance.test.js:22` periodBalance — Target > the current week counts "so far", including today
- `tests/unit/time-tracking/balance.test.js:29` periodBalance — Target > the Target starts on the day of the first-ever Time Entry when that falls mid-week
- `tests/unit/time-tracking/balance.test.js:36` periodBalance — Target > a future week has no Target or Balance
- `tests/unit/time-tracking/balance.test.js:42` periodBalance — Target > a week entirely before the first-ever Time Entry has no Target or Balance
- `tests/unit/time-tracking/balance.test.js:48` periodBalance — Target > without any Time Entry there is no Target or Balance
- `tests/unit/time-tracking/balance.test.js:59` periodBalance — Target > decimal Weekly hours spread evenly over the counted workdays
- `tests/unit/time-tracking/balance.test.js:72` periodBalance — Workdays > a Monday so far at 40h over Mon–Fri has a Target of 8h
- `tests/unit/time-tracking/balance.test.js:79` periodBalance — Workdays > non-workdays add no Target, so the weekend keeps the Friday Target and work on it is surplus
- `tests/unit/time-tracking/balance.test.js:88` periodBalance — Workdays > a first-ever entry on a weekend leaves that week without Target until the next workday
- `tests/unit/time-tracking/balance.test.js:94` periodBalance — Workdays > custom workdays spread the Weekly hours over only those days
- `tests/unit/time-tracking/balance.test.js:103` periodBalance — Balance > Balance is logged minus Target, positive for a surplus
- `tests/unit/time-tracking/balance.test.js:109` periodBalance — Balance > Balance is negative for a deficit
- `tests/unit/time-tracking/balance.test.js:116` periodBalance — Balance > entries count toward the week containing their start in the Time Tracking timezone
- `tests/unit/time-tracking/balance.test.js:140` the current week starts Monday in the Time Tracking timezone > a finished week containing a DST change still has a Target of exactly the Weekly hours

### Customers Projects

- Path: `tests/unit/time-tracking/customers-projects.test.js`
- Type: Unit
- Test count: 13

- `tests/unit/time-tracking/customers-projects.test.js:29` addCustomer succeeds with a valid name
- `tests/unit/time-tracking/customers-projects.test.js:35` addCustomer trims whitespace from name
- `tests/unit/time-tracking/customers-projects.test.js:41` addCustomer rejects empty name
- `tests/unit/time-tracking/customers-projects.test.js:47` addCustomer rejects duplicate name (case-insensitive)
- `tests/unit/time-tracking/customers-projects.test.js:58` addCustomer allows different customer names
- `tests/unit/time-tracking/customers-projects.test.js:68` addCustomer assigns a color from the palette
- `tests/unit/time-tracking/customers-projects.test.js:76` addProject succeeds with valid customerId and name
- `tests/unit/time-tracking/customers-projects.test.js:88` addProject trims whitespace from name
- `tests/unit/time-tracking/customers-projects.test.js:99` addProject rejects empty name
- `tests/unit/time-tracking/customers-projects.test.js:110` addProject rejects missing customerId
- `tests/unit/time-tracking/customers-projects.test.js:116` addProject rejects duplicate project name within same customer (case-insensitive)
- `tests/unit/time-tracking/customers-projects.test.js:127` addProject allows same project name under different customers
- `tests/unit/time-tracking/customers-projects.test.js:140` addProject assigns a color from the palette

### Day Grouping

- Path: `tests/unit/time-tracking/day-grouping.test.js`
- Type: Unit
- Test count: 6

- `tests/unit/time-tracking/day-grouping.test.js:12` groupEntriesByDay > an entry 31st 22:00 → 1st 02:00 appears wholly under the 31st (Attribution)
- `tests/unit/time-tracking/day-grouping.test.js:21` groupEntriesByDay > day is taken from the start in the user timezone, not UTC
- `tests/unit/time-tracking/day-grouping.test.js:26` groupEntriesByDay > days are newest first, entries within a day newest first, totals per day
- `tests/unit/time-tracking/day-grouping.test.js:37` groupEntriesByDay > headings are Today, Yesterday, then Ddd, <date>
- `tests/unit/time-tracking/day-grouping.test.js:46` groupEntriesByDay > Today follows the user timezone
- `tests/unit/time-tracking/day-grouping.test.js:52` groupEntriesByDay > no entries → no groups

### Display Formats

- Path: `tests/unit/time-tracking/display-formats.test.js`
- Type: Unit
- Test count: 7

- `tests/unit/time-tracking/display-formats.test.js:8` duration format > h:mm is the default
- `tests/unit/time-tracking/display-formats.test.js:13` duration format > decimal shows hours with two decimals and an h unit
- `tests/unit/time-tracking/display-formats.test.js:19` duration format > decimal still accepts h:mm input and displays it as decimal
- `tests/unit/time-tracking/display-formats.test.js:26` duration format > a displayed decimal duration parses back to the same span
- `tests/unit/time-tracking/display-formats.test.js:34` time format > 12-hour displays 2:30 PM and still accepts 24-hour shorthand
- `tests/unit/time-tracking/display-formats.test.js:42` time format > a displayed 12-hour time parses back
- `tests/unit/time-tracking/display-formats.test.js:50` describeEntryTimes follows every display setting > date, time and duration

### Entry Filter

- Path: `tests/unit/time-tracking/entry-filter.test.js`
- Type: Unit
- Test count: 12

- `tests/unit/time-tracking/entry-filter.test.js:27` filterEntries > All keeps every entry
- `tests/unit/time-tracking/entry-filter.test.js:31` filterEntries > by customer keeps entries of all that customer\'s projects, archived ones included
- `tests/unit/time-tracking/entry-filter.test.js:36` filterEntries > by project keeps only that project\'s entries
- `tests/unit/time-tracking/entry-filter.test.js:40` filterEntries > by customer and project
- `tests/unit/time-tracking/entry-filter.test.js:44` filterEntries > entries of an unknown project only show under All
- `tests/unit/time-tracking/entry-filter.test.js:50` filterOptions > lists every customer, archived ones marked
- `tests/unit/time-tracking/entry-filter.test.js:57` filterOptions > with no customer selected, projects of every customer are offered, grouped by customer
- `tests/unit/time-tracking/entry-filter.test.js:64` filterOptions > with a customer selected, only that customer\'s projects are offered
- `tests/unit/time-tracking/entry-filter.test.js:70` filterOptions > a customer without projects is not an empty project group
- `tests/unit/time-tracking/entry-filter.test.js:77` reconcileFilter > keeps a compatible selection
- `tests/unit/time-tracking/entry-filter.test.js:81` reconcileFilter > clears a project that does not belong to the selected customer
- `tests/unit/time-tracking/entry-filter.test.js:85` reconcileFilter > clears selections that no longer exist

### Linked Fields

- Path: `tests/unit/time-tracking/linked-fields.test.js`
- Type: Unit
- Test count: 20

- `tests/unit/time-tracking/linked-fields.test.js:9` resolveLinkedFields > editing End recomputes Duration
- `tests/unit/time-tracking/linked-fields.test.js:17` resolveLinkedFields > editing Start recomputes Duration and keeps End
- `tests/unit/time-tracking/linked-fields.test.js:22` resolveLinkedFields > editing Duration recomputes End = Start + Duration
- `tests/unit/time-tracking/linked-fields.test.js:27` resolveLinkedFields > an End earlier than Start means the next day
- `tests/unit/time-tracking/linked-fields.test.js:34` resolveLinkedFields > a Duration that crosses midnight rolls End over to the next day
- `tests/unit/time-tracking/linked-fields.test.js:40` resolveLinkedFields > End equal to Start is a zero duration, not a full day
- `tests/unit/time-tracking/linked-fields.test.js:46` resolveLinkedFields > changing the Date keeps the Duration and moves End with it
- `tests/unit/time-tracking/linked-fields.test.js:52` resolveLinkedFields > normalises shorthand to the display format
- `tests/unit/time-tracking/linked-fields.test.js:67` resolveLinkedFields > across DST changes (durations come from absolute instants) > spring forward: 01:00 → 04:00 on 29.03.2026 is 2 hours
- `tests/unit/time-tracking/linked-fields.test.js:73` resolveLinkedFields > across DST changes (durations come from absolute instants) > fall back: 01:00 → 04:00 on 25.10.2026 is 4 hours
- `tests/unit/time-tracking/linked-fields.test.js:79` resolveLinkedFields > across DST changes (durations come from absolute instants) > a 3 h Duration from 01:00 on the spring-forward day ends at 05:00
- `tests/unit/time-tracking/linked-fields.test.js:84` resolveLinkedFields > across DST changes (durations come from absolute instants) > an overnight entry into the fall-back night counts the extra hour
- `tests/unit/time-tracking/linked-fields.test.js:95` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > Start moves and Duration recomputes, End stays
- `tests/unit/time-tracking/linked-fields.test.js:100` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > End moves and Duration recomputes
- `tests/unit/time-tracking/linked-fields.test.js:104` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > Duration moves and End recomputes
- `tests/unit/time-tracking/linked-fields.test.js:108` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > Duration never goes below zero
- `tests/unit/time-tracking/linked-fields.test.js:114` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > End moved down clamps at Start instead of rolling over to the next day
- `tests/unit/time-tracking/linked-fields.test.js:123` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > End moved down on an overnight entry stays on the next day
- `tests/unit/time-tracking/linked-fields.test.js:129` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > Start moved past midnight carries the Date along
- `tests/unit/time-tracking/linked-fields.test.js:134` adjustLinkedField (Alt+↑ / Alt+↓, ±15 min) > returns null when the current values do not parse

### Period Summary

- Path: `tests/unit/time-tracking/period-summary.test.js`
- Type: Unit
- Test count: 34

- `tests/unit/time-tracking/period-summary.test.js:30` month period — Attribution > an entry from the last day of a month 22:00 to 02:00 next day counts entirely to the earlier month
- `tests/unit/time-tracking/period-summary.test.js:42` month period — Attribution > the month is taken from the start in the user timezone, not UTC
- `tests/unit/time-tracking/period-summary.test.js:60` month period — totals and grouping > KPIs: total duration, number of entries, number of projects in the month
- `tests/unit/time-tracking/period-summary.test.js:66` month period — totals and grouping > one day bucket per calendar day of the month, with per-project durations
- `tests/unit/time-tracking/period-summary.test.js:75` month period — totals and grouping > customers sorted by total, projects sorted by total within, with share of the month
- `tests/unit/time-tracking/period-summary.test.js:87` month period — totals and grouping > customer subtotals add up to the grand total, project totals to their customer
- `tests/unit/time-tracking/period-summary.test.js:94` month period — totals and grouping > projects list every project tracked in the month, sorted by total, for the chart legend
- `tests/unit/time-tracking/period-summary.test.js:98` month period — totals and grouping > equal totals fall back to name order
- `tests/unit/time-tracking/period-summary.test.js:106` month period — totals and grouping > an entry whose project no longer exists is kept under an unknown customer / project
- `tests/unit/time-tracking/period-summary.test.js:112` month period — totals and grouping > an empty month has zero totals and no rows
- `tests/unit/time-tracking/period-summary.test.js:119` month navigation > the current month is the month of now in the user timezone
- `tests/unit/time-tracking/period-summary.test.js:124` month navigation > a month runs from its first to its last calendar day
- `tests/unit/time-tracking/period-summary.test.js:130` month navigation > shifting a month steps across year boundaries
- `tests/unit/time-tracking/period-summary.test.js:137` month navigation > a month is labelled with its name and year
- `tests/unit/time-tracking/period-summary.test.js:147` week period > a week runs Monday to Sunday around the anchor day
- `tests/unit/time-tracking/period-summary.test.js:155` week period > the current week is the week of now in the user timezone
- `tests/unit/time-tracking/period-summary.test.js:162` week period > a week is labelled with its ISO week number and date range
- `tests/unit/time-tracking/period-summary.test.js:171` week period > shifting a week steps seven days, across month and year boundaries
- `tests/unit/time-tracking/period-summary.test.js:181` week period > one bucket per day Monday to Sunday, entries attributed by start in the user timezone
- `tests/unit/time-tracking/period-summary.test.js:201` week period > around the DST change and across a month end, entries land on the calendar day of their start
- `tests/unit/time-tracking/period-summary.test.js:222` year period > a year runs 1 January to 31 December and is labelled with its number
- `tests/unit/time-tracking/period-summary.test.js:227` year period > the current year is the year of now in the user timezone
- `tests/unit/time-tracking/period-summary.test.js:233` year period > shifting a year steps one calendar year
- `tests/unit/time-tracking/period-summary.test.js:239` year period > one bucket per month, entries attributed by start in the user timezone
- `tests/unit/time-tracking/period-summary.test.js:263` Target and Balance > stay null when Weekly hours are unset
- `tests/unit/time-tracking/period-summary.test.js:270` Target and Balance > a finished month at 40h has the full Target and Balance = logged − Target
- `tests/unit/time-tracking/period-summary.test.js:288` Target and Balance > a finished week at 40h has a Target of exactly 40h
- `tests/unit/time-tracking/period-summary.test.js:294` Target and Balance > the Target starts at the first-ever Time Entry even when only some entries are summarised
- `tests/unit/time-tracking/period-summary.test.js:300` Target and Balance > future periods and periods before the first entry have no Target
- `tests/unit/time-tracking/period-summary.test.js:310` Target and Balance > year Target > a finished 2026 at 40h is 2088h (261 workdays)
- `tests/unit/time-tracking/period-summary.test.js:331` Target and Balance > year Target > the current year counts "so far", including today
- `tests/unit/time-tracking/period-summary.test.js:338` Target and Balance > year Target > a year counts from the first-ever entry when that falls mid-year
- `tests/unit/time-tracking/period-summary.test.js:345` Target and Balance > year Target > the Balance resets on 1 January: a new year counts only its own days and entries
- `tests/unit/time-tracking/period-summary.test.js:352` Target and Balance > year Target > future years and years before the first entry have no Target

### Reducer

- Path: `tests/unit/time-tracking/reducer.test.js`
- Type: Unit
- Test count: 21

- `tests/unit/time-tracking/reducer.test.js:30` customer.created adds customer to timeTracking.customers
- `tests/unit/time-tracking/reducer.test.js:41` customer.created is idempotent by entity_id
- `tests/unit/time-tracking/reducer.test.js:56` project.created adds project to timeTracking.projects
- `tests/unit/time-tracking/reducer.test.js:67` project.created is idempotent by entity_id
- `tests/unit/time-tracking/reducer.test.js:81` time_entry.created adds the entry with its absolute instants
- `tests/unit/time-tracking/reducer.test.js:92` time_entry.created is idempotent by entity_id
- `tests/unit/time-tracking/reducer.test.js:105` time_entry.updated merges the after values into the entry
- `tests/unit/time-tracking/reducer.test.js:114` time_entry.updated for an unknown entry is a no-op
- `tests/unit/time-tracking/reducer.test.js:121` time_entry.deleted removes the entry permanently
- `tests/unit/time-tracking/reducer.test.js:129` time_entry.deleted for an unknown entry is a no-op
- `tests/unit/time-tracking/reducer.test.js:134` edits and deletes converge to the same projection regardless of arrival order
- `tests/unit/time-tracking/reducer.test.js:152` time-tracking events do not affect board-level state
- `tests/unit/time-tracking/reducer.test.js:168` customer.created respects event-level idempotency via appliedEventIds
- `tests/unit/time-tracking/reducer.test.js:183` customer.archived / unarchived toggle the archived flag
- `tests/unit/time-tracking/reducer.test.js:190` project.archived / unarchived toggle the archived flag and keep its entries
- `tests/unit/time-tracking/reducer.test.js:201` project.deleted removes an unreferenced project
- `tests/unit/time-tracking/reducer.test.js:206` customer.deleted removes an unreferenced customer
- `tests/unit/time-tracking/reducer.test.js:211` replayed deletes of referenced items keep them, archived
- `tests/unit/time-tracking/reducer.test.js:226` project.created after its customer was deleted restores the customer as archived
- `tests/unit/time-tracking/reducer.test.js:235` time_entry.created after its project and customer were deleted restores both as archived
- `tests/unit/time-tracking/reducer.test.js:246` a delete that raced a new reference converges to the item archived, whatever the arrival order

### Schema

- Path: `tests/unit/time-tracking/schema.test.js`
- Type: Unit
- Test count: 9

- `tests/unit/time-tracking/schema.test.js:5` createCustomer returns all required fields with defaults
- `tests/unit/time-tracking/schema.test.js:15` createCustomer applies overrides
- `tests/unit/time-tracking/schema.test.js:21` createCustomer auto-assigns color from palette using colorIndex
- `tests/unit/time-tracking/schema.test.js:28` createCustomer wraps palette index
- `tests/unit/time-tracking/schema.test.js:34` createCustomer generates unique ids
- `tests/unit/time-tracking/schema.test.js:39` createProject returns all required fields with defaults
- `tests/unit/time-tracking/schema.test.js:50` createProject applies overrides
- `tests/unit/time-tracking/schema.test.js:56` createProject auto-assigns color from palette
- `tests/unit/time-tracking/schema.test.js:61` createProject generates unique ids

### Settings

- Path: `tests/unit/time-tracking/settings.test.js`
- Type: Unit
- Test count: 28

- `tests/unit/time-tracking/settings.test.js:27` resolveTimeTrackingSettings (spec defaults and options) > defaults: no default customer/project, DD.MM.YYYY, 24-hour, browser zone, h:mm, no Weekly hours, Mon–Fri
- `tests/unit/time-tracking/settings.test.js:40` resolveTimeTrackingSettings (spec defaults and options) > timezone falls back to Europe/Berlin when the browser reports none
- `tests/unit/time-tracking/settings.test.js:46` resolveTimeTrackingSettings (spec defaults and options) > keeps valid choices
- `tests/unit/time-tracking/settings.test.js:56` resolveTimeTrackingSettings (spec defaults and options) > unknown options fall back to defaults
- `tests/unit/time-tracking/settings.test.js:69` resolveTimeTrackingSettings (spec defaults and options) > Weekly hours has no upper limit
- `tests/unit/time-tracking/settings.test.js:73` resolveTimeTrackingSettings (spec defaults and options) > Workdays are kept as sorted, unique ISO weekdays
- `tests/unit/time-tracking/settings.test.js:83` timeTrackingPrefs maps settings to display preferences > carries every display setting and now
- `tests/unit/time-tracking/settings.test.js:92` timeTrackingPrefs maps settings to display preferences > without settings uses the defaults
- `tests/unit/time-tracking/settings.test.js:100` persistence in the global settings layer > saving emits a global settings.updated event and lands in global settings
- `tests/unit/time-tracking/settings.test.js:114` persistence in the global settings layer > saved settings survive a session reset
- `tests/unit/time-tracking/settings.test.js:122` persistence in the global settings layer > a synced settings.updated event from another device is applied
- `tests/unit/time-tracking/settings.test.js:132` persistence in the global settings layer > saving another setting does not pin or sync the browser timezone
- `tests/unit/time-tracking/settings.test.js:146` persistence in the global settings layer > a chosen timezone is kept when another setting is saved
- `tests/unit/time-tracking/settings.test.js:152` persistence in the global settings layer > Weekly hours is saved through the global settings event and synced from another device
- `tests/unit/time-tracking/settings.test.js:171` persistence in the global settings layer > clearing Weekly hours removes it from the stored settings (off)
- `tests/unit/time-tracking/settings.test.js:178` persistence in the global settings layer > saving one setting keeps the others
- `tests/unit/time-tracking/settings.test.js:198` default customer and project > changing the default customer resets the project to its first active project
- `tests/unit/time-tracking/settings.test.js:206` default customer and project > the default project can be changed within the default customer
- `tests/unit/time-tracking/settings.test.js:215` default customer and project > clearing the default customer clears the project
- `tests/unit/time-tracking/settings.test.js:222` default customer and project > prefillProjectId uses the default project while it is active
- `tests/unit/time-tracking/settings.test.js:228` default customer and project > prefillProjectId is empty without a default or once the default is no longer active
- `tests/unit/time-tracking/settings.test.js:249` last-used project prefill > the last-used project wins over the default project
- `tests/unit/time-tracking/settings.test.js:255` last-used project prefill > falls back to the default project without a last-used project
- `tests/unit/time-tracking/settings.test.js:261` last-used project prefill > falls back to the default project when the last-used project is archived
- `tests/unit/time-tracking/settings.test.js:268` last-used project prefill > falls back to the default project when the last-used project customer is archived
- `tests/unit/time-tracking/settings.test.js:275` last-used project prefill > falls back to the default project when the last-used project was deleted
- `tests/unit/time-tracking/settings.test.js:282` last-used project prefill > is empty when neither the last-used nor the default project is active
- `tests/unit/time-tracking/settings.test.js:290` last-used project prefill > is remembered in local storage on this device, without a domain event

### Shorthand

- Path: `tests/unit/time-tracking/shorthand.test.js`
- Type: Unit
- Test count: 3

- `tests/unit/time-tracking/shorthand.test.js:82` parseDate (per date format, year optional, t / y) > today is the calendar day in the user timezone, not UTC
- `tests/unit/time-tracking/shorthand.test.js:88` parseDate (per date format, year optional, t / y) > yesterday crosses month and year boundaries
- `tests/unit/time-tracking/shorthand.test.js:92` parseDate (per date format, year optional, t / y) > MM/DD/YYYY and YYYY-MM-DD follow the configured format

### Time Entries

- Path: `tests/unit/time-tracking/time-entries.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/time-tracking/time-entries.test.js:55` validateTimeEntry > a project is checked before the times
- `tests/unit/time-tracking/time-entries.test.js:59` validateTimeEntry > a valid entry passes
- `tests/unit/time-tracking/time-entries.test.js:65` addTimeEntry > emits time_entry.created in the timetracking scope with absolute instants
- `tests/unit/time-tracking/time-entries.test.js:85` addTimeEntry > normalises instants to UTC ISO strings
- `tests/unit/time-tracking/time-entries.test.js:90` addTimeEntry > invalid entries save nothing
- `tests/unit/time-tracking/time-entries.test.js:104` updateTimeEntry > emits time_entry.updated with the changed fields after and before
- `tests/unit/time-tracking/time-entries.test.js:120` updateTimeEntry > saving without changes emits nothing
- `tests/unit/time-tracking/time-entries.test.js:125` updateTimeEntry > an entry may keep its already-archived project
- `tests/unit/time-tracking/time-entries.test.js:142` updateTimeEntry > an unknown entry is rejected
- `tests/unit/time-tracking/time-entries.test.js:155` duplicateTimeEntry > emits time_entry.created with the same project, description and duration, starting now
- `tests/unit/time-tracking/time-entries.test.js:175` duplicateTimeEntry > an entry on an archived project cannot be duplicated
- `tests/unit/time-tracking/time-entries.test.js:181` duplicateTimeEntry > an unknown entry is rejected
- `tests/unit/time-tracking/time-entries.test.js:193` deleteTimeEntry > emits time_entry.deleted carrying the deleted entry
- `tests/unit/time-tracking/time-entries.test.js:203` deleteTimeEntry > an unknown entry is rejected

### Timezone

- Path: `tests/unit/time-tracking/timezone.test.js`
- Type: Unit
- Test count: 13

- `tests/unit/time-tracking/timezone.test.js:8` fromZoned: wall-clock date + time in a timezone → absolute instant > winter (CET, UTC+1) and summer (CEST, UTC+2)
- `tests/unit/time-tracking/timezone.test.js:13` fromZoned: wall-clock date + time in a timezone → absolute instant > other zones resolve their own offsets
- `tests/unit/time-tracking/timezone.test.js:18` fromZoned: wall-clock date + time in a timezone → absolute instant > either side of the spring-forward change (Berlin 2026-03-29 02:00 → 03:00)
- `tests/unit/time-tracking/timezone.test.js:23` fromZoned: wall-clock date + time in a timezone → absolute instant > a skipped local time moves forward by the gap (02:30 → 03:30 CEST)
- `tests/unit/time-tracking/timezone.test.js:27` fromZoned: wall-clock date + time in a timezone → absolute instant > either side of the fall-back change (Berlin 2026-10-25 03:00 → 02:00)
- `tests/unit/time-tracking/timezone.test.js:32` fromZoned: wall-clock date + time in a timezone → absolute instant > a repeated local time resolves to its first occurrence (02:30 CEST)
- `tests/unit/time-tracking/timezone.test.js:36` fromZoned: wall-clock date + time in a timezone → absolute instant > round-trips through zonedParts
- `tests/unit/time-tracking/timezone.test.js:43` timeTrackingPrefs defaults > DD.MM.YYYY, 24-hour, h:mm, browser timezone
- `tests/unit/time-tracking/timezone.test.js:53` timeTrackingPrefs defaults > falls back to Europe/Berlin when the browser reports no timezone
- `tests/unit/time-tracking/timezone.test.js:64` formatting with default display formats > time is 24-hour HH:mm in the user timezone
- `tests/unit/time-tracking/timezone.test.js:68` formatting with default display formats > time supports 12-hour format
- `tests/unit/time-tracking/timezone.test.js:73` formatting with default display formats > date follows the configured date format in the user timezone
- `tests/unit/time-tracking/timezone.test.js:80` formatting with default display formats > duration is h:mm

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

### Wip Limit

- Path: `tests/unit/wip-limit.test.js`
- Type: Unit
- Test count: 14

- `tests/unit/wip-limit.test.js:17` normalizeWipLimit > coerces anything that is not a positive integer to unlimited
- `tests/unit/wip-limit.test.js:28` normalizeWipLimit > accepts numeric strings and floors fractions
- `tests/unit/wip-limit.test.js:34` normalizeWipLimit > caps at MAX_WIP_LIMIT
- `tests/unit/wip-limit.test.js:40` getWipLimit > reads the column limit
- `tests/unit/wip-limit.test.js:45` getWipLimit > Done is exempt in both role and legacy-id form
- `tests/unit/wip-limit.test.js:50` getWipLimit > tolerates a missing column
- `tests/unit/wip-limit.test.js:57` getWipState > under below the limit
- `tests/unit/wip-limit.test.js:62` getWipState > at exactly the limit
- `tests/unit/wip-limit.test.js:66` getWipState > over above the limit
- `tests/unit/wip-limit.test.js:71` getWipState > an unlimited or Done column is never at or over
- `tests/unit/wip-limit.test.js:78` formatWipCount > shows the bare count when unlimited
- `tests/unit/wip-limit.test.js:83` formatWipCount > shows count/limit when limited
- `tests/unit/wip-limit.test.js:90` wipCounterLabel > carries the state without relying on colour
- `tests/unit/wip-limit.test.js:99` import boundary > normalizeBoardModelIds coerces an untrusted wipLimit

## DOM Integration Tests

### Accordion

- Path: `tests/dom/accordion.test.js`
- Type: DOM Integration
- Test count: 1

- `tests/dom/accordion.test.js:6` createAccordionSection toggles collapsed state and updates the chevron

### Authsync

- Path: `tests/dom/authsync.test.js`
- Type: DOM Integration
- Test count: 8

- `tests/dom/authsync.test.js:81` initializeAuthSyncUI > returns without error when required DOM elements are missing
- `tests/dom/authsync.test.js:86` initializeAuthSyncUI > sets up handlers when all required elements present
- `tests/dom/authsync.test.js:94` health probe > disables login-btn when PocketBase is unreachable
- `tests/dom/authsync.test.js:103` health probe > leaves login-btn enabled when PocketBase responds ok
- `tests/dom/authsync.test.js:115` auth UI state > shows login-btn and hides user-info when not authenticated
- `tests/dom/authsync.test.js:122` auth UI state > hides login-btn and shows user-info when authenticated
- `tests/dom/authsync.test.js:135` register flow > shows confirm-email message after successful registration
- `tests/dom/authsync.test.js:154` register flow > does not call loginUser after registerUser

### Boards Quick Switch

- Path: `tests/dom/boards-quick-switch.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/boards-quick-switch.test.js:90` click brand-text > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:126` delete board > removes the board locally without calling any PocketBase collection while signed in
- `tests/dom/boards-quick-switch.test.js:141` Ctrl+B shortcut > opens the boards modal
- `tests/dom/boards-quick-switch.test.js:149` Ctrl+B shortcut > does not open the boards modal with the old Shift+B shortcut
- `tests/dom/boards-quick-switch.test.js:159` Ctrl+B shortcut > does not open the modal when an input is focused
- `tests/dom/boards-quick-switch.test.js:172` keyboard navigation in open boards modal > ArrowDown adds keyboard-focused to the first item on first press
- `tests/dom/boards-quick-switch.test.js:185` keyboard navigation in open boards modal > ArrowDown then ArrowDown moves focus to second item
- `tests/dom/boards-quick-switch.test.js:196` keyboard navigation in open boards modal > ArrowUp does not go below index 0
- `tests/dom/boards-quick-switch.test.js:207` keyboard navigation in open boards modal > does not navigate when modal is closed
- `tests/dom/boards-quick-switch.test.js:222` keyboard navigation in open boards modal > Enter on highlighted board activates it and closes the modal
- `tests/dom/boards-quick-switch.test.js:234` keyboard navigation in open boards modal > Enter does nothing when no item is highlighted

### Boards Select Refresh

- Path: `tests/dom/boards-select-refresh.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/boards-select-refresh.test.js:50` #board-select refresh on DATA_CHANGED > rebuilds the dropdown when a remote board.created adds a board
- `tests/dom/boards-select-refresh.test.js:65` #board-select refresh on DATA_CHANGED > updates an option label when a board is renamed remotely

### Dragdrop

- Path: `tests/dom/dragdrop.test.js`
- Type: DOM Integration
- Test count: 5

- `tests/dom/dragdrop.test.js:99` task drop mutates state inside the reconcile window
- `tests/dom/dragdrop.test.js:119` task drop wraps its state mutation in a reconcile window
- `tests/dom/dragdrop.test.js:143` collapsed non-done drops still pin the moved task through state
- `tests/dom/dragdrop.test.js:167` reinitializing during an active task drag clears transient drag state
- `tests/dom/dragdrop.test.js:187` reinitializing during an active column drag clears the column drag class

### Auth Refresh

- Path: `tests/dom/event-sourcing/auth-refresh.test.js`
- Type: DOM Integration
- Test count: 6

- `tests/dom/event-sourcing/auth-refresh.test.js:53` auth refresh > signs out a login that expired while the app was closed, so the user is asked to log in again
- `tests/dom/event-sourcing/auth-refresh.test.js:63` auth refresh > renews a still-valid login at startup
- `tests/dom/event-sourcing/auth-refresh.test.js:75` auth refresh > renews again when the user returns to the tab
- `tests/dom/event-sourcing/auth-refresh.test.js:87` auth refresh > signs out when the server refuses the refresh
- `tests/dom/event-sourcing/auth-refresh.test.js:96` auth refresh > keeps the login when the refresh fails for lack of network
- `tests/dom/event-sourcing/auth-refresh.test.js:108` auth refresh > does nothing when signed out

### Board Content Sync

- Path: `tests/dom/event-sourcing/board-content-sync.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/event-sourcing/board-content-sync.test.js:55` a template board reaches a fresh device with its custom columns and tasks
- `tests/dom/event-sourcing/board-content-sync.test.js:68` rendering a board while its columns are still arriving does not add a second Done column

### Column Sort

- Path: `tests/dom/event-sourcing/column-sort.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/event-sourcing/column-sort.test.js:58` sorting by priority emits a task.moved event and updates the read model before returning
- `tests/dom/event-sourcing/column-sort.test.js:68` sorting by due date puts tasks without a due date last
- `tests/dom/event-sourcing/column-sort.test.js:74` sorting a column that is already sorted emits nothing
- `tests/dom/event-sourcing/column-sort.test.js:83` sorting by an unknown key leaves the column unchanged and emits nothing
- `tests/dom/event-sourcing/column-sort.test.js:93` a rebuild triggered by a late remote event keeps the sorted order
- `tests/dom/event-sourcing/column-sort.test.js:136` a sort reaches a second device over SSE
- `tests/dom/event-sourcing/column-sort.test.js:143` a sort reaches a second device through catch-up

### Feature Modules Emit Events

- Path: `tests/dom/event-sourcing/feature-modules-emit-events.test.js`
- Type: DOM Integration
- Test count: 5

- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:33` updateTask emits one task.updated event with HLC entity id and minimal fields
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:67` addColumn emits column.created with the created column payload
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:79` label mutations emit label entity and task membership events
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:98` updateTask emits collection-op and move events for non-scalar changes
- `tests/dom/event-sourcing/feature-modules-emit-events.test.js:128` deleteTask emits task.deleted

### Grace Window

- Path: `tests/dom/event-sourcing/grace-window.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/event-sourcing/grace-window.test.js:96` a late event inside the grace window > is ordered in when it arrives over SSE
- `tests/dom/event-sourcing/grace-window.test.js:103` a late event inside the grace window > is ordered in when it arrives through catch-up
- `tests/dom/event-sourcing/grace-window.test.js:122` adopting a server snapshot > rebuilds from it plus the stored events newer than it
- `tests/dom/event-sourcing/grace-window.test.js:152` the drop decision > is the same on devices with different snapshot histories
- `tests/dom/event-sourcing/grace-window.test.js:161` the drop decision > applies an event without a server receipt time on every device
- `tests/dom/event-sourcing/grace-window.test.js:171` an event older than the grace window > is dropped over SSE and through catch-up, logged once
- `tests/dom/event-sourcing/grace-window.test.js:185` an event older than the grace window > is dropped silently when the snapshot already holds it

### Ingest

- Path: `tests/dom/event-sourcing/ingest.test.js`
- Type: DOM Integration
- Test count: 19

- `tests/dom/event-sourcing/ingest.test.js:70` local events > update the in-memory read model before scheduleDomainEvent() returns (ADR-0005 instant UI)
- `tests/dom/event-sourcing/ingest.test.js:77` local events > ingested with origin local are persisted unsynced for the outbound queue
- `tests/dom/event-sourcing/ingest.test.js:88` remote events > are projected, announced with DATA_CHANGED and persisted as synced
- `tests/dom/event-sourcing/ingest.test.js:100` single path > an event announced on the bus without ingest never reaches the read model
- `tests/dom/event-sourcing/ingest.test.js:105` single path > an echo of an already-ingested event changes nothing and announces nothing
- `tests/dom/event-sourcing/ingest.test.js:160` rejected events > an hlc more than the drift limit ahead of this device
- `tests/dom/event-sourcing/ingest.test.js:165` rejected events > an hlc ahead of this device within the drift limit is accepted
- `tests/dom/event-sourcing/ingest.test.js:171` rejected events > a malformed local event is rejected too
- `tests/dom/event-sourcing/ingest.test.js:192` rejected events > types that carry no payload data still accept an empty payload
- `tests/dom/event-sourcing/ingest.test.js:203` payload entity fields > unknown task keys are dropped from task.created and task.updated
- `tests/dom/event-sourcing/ingest.test.js:219` payload entity fields > known task keys that are not factory defaults survive (doneDate, swimlaneLabelGroup)
- `tests/dom/event-sourcing/ingest.test.js:227` payload entity fields > unknown customer, project and time entry keys are dropped
- `tests/dom/event-sourcing/ingest.test.js:240` payload entity fields > a payload id cannot resurrect a deleted task: the id comes from entity_id
- `tests/dom/event-sourcing/ingest.test.js:250` payload entity fields > a task.updated field cannot change the task id
- `tests/dom/event-sourcing/ingest.test.js:268` payload entity fields > board.created takes its id from entity_id, not the payload
- `tests/dom/event-sourcing/ingest.test.js:276` payload entity fields > the persisted event carries the sanitised payload
- `tests/dom/event-sourcing/ingest.test.js:294` entity colours > a non-hex customer or project colour is normalised to a hex colour
- `tests/dom/event-sourcing/ingest.test.js:303` entity colours > a valid colour is kept (trimmed)
- `tests/dom/event-sourcing/ingest.test.js:308` entity colours > a non-hex label colour is normalised on create and ignored on update

### Page Boot Sync

- Path: `tests/dom/event-sourcing/page-boot-sync.test.js`
- Type: DOM Integration
- Test count: 1

- `tests/dom/event-sourcing/page-boot-sync.test.js:142` time-tracking page boot (#218 AC-001, AC-005) > uploads a locally saved time-tracking snapshot to PocketBase under __timetracking__

### Realtime

- Path: `tests/dom/event-sourcing/realtime.test.js`
- Type: DOM Integration
- Test count: 22

- `tests/dom/event-sourcing/realtime.test.js:95` realtime subscription > AC-001: opens exactly one owner-filtered subscription; second call is a no-op
- `tests/dom/event-sourcing/realtime.test.js:104` realtime subscription > AC-002: stopRealtime closes the subscription
- `tests/dom/event-sourcing/realtime.test.js:112` realtime subscription > does not subscribe when unauthenticated
- `tests/dom/event-sourcing/realtime.test.js:120` applyRemoteEvent > AC-003/AC-007: projects, emits EVENT_EMITTED, advances HLC, stores as synced
- `tests/dom/event-sourcing/realtime.test.js:139` applyRemoteEvent > a remote HLC far in the future is rejected and does not advance the local clock (#181)
- `tests/dom/event-sourcing/realtime.test.js:147` applyRemoteEvent > AC-004: an echo of an already-applied event is a no-op in the projection
- `tests/dom/event-sourcing/realtime.test.js:155` applyRemoteEvent > AC-004 after a reload: an SSE echo of an edit applied before the reload does not undo a newer edit (#178)
- `tests/dom/event-sourcing/realtime.test.js:170` applyRemoteEvent > projects a live timetracking event into the time-tracking slot, never into a board
- `tests/dom/event-sourcing/realtime.test.js:190` catch-up pull > discovers all account boards even while the realtime connection is pending
- `tests/dom/event-sourcing/realtime.test.js:213` catch-up pull > downloads boards when realtime subscription fails
- `tests/dom/event-sourcing/realtime.test.js:228` catch-up pull > fetches boards missed during an automatic SSE reconnect
- `tests/dom/event-sourcing/realtime.test.js:241` catch-up pull > does not skip a delayed board creation older than the catch-up watermark
- `tests/dom/event-sourcing/realtime.test.js:256` catch-up pull > AC-005: pulls events > lastSeenHlc, applies in order, advances lastSeenHlc atomically
- `tests/dom/event-sourcing/realtime.test.js:277` catch-up pull > signals DATA_CHANGED once for the whole pulled batch
- `tests/dom/event-sourcing/realtime.test.js:299` catch-up pull > saves each part of a caught-up board once per batch, not once per event
- `tests/dom/event-sourcing/realtime.test.js:339` catch-up pull > saves a local edit made during a catch-up at once, not when the batch ends
- `tests/dom/event-sourcing/realtime.test.js:372` catch-up pull > a reload after a catch-up shows the same board
- `tests/dom/event-sourcing/realtime.test.js:418` catch-up pull > advances the catch-up watermark only after the board read model is stored
- `tests/dom/event-sourcing/realtime.test.js:447` catch-up pull > signals no DATA_CHANGED when the pulled batch is already stored
- `tests/dom/event-sourcing/realtime.test.js:463` catch-up pull > a poison event among good ones is skipped: good ones applied, poison not persisted, logged once (#181)
- `tests/dom/event-sourcing/realtime.test.js:492` catch-up pull > ingests timetracking events under their own watermark without touching boards
- `tests/dom/event-sourcing/realtime.test.js:521` catch-up pull > AC-005/AC-006: re-running catch-up applies nothing new (idempotent overlap)

### Replay Fidelity

- Path: `tests/dom/event-sourcing/replay-fidelity.test.js`
- Type: DOM Integration
- Test count: 4

- `tests/dom/event-sourcing/replay-fidelity.test.js:68` updateTask relationship change replays the inverse on the target task
- `tests/dom/event-sourcing/replay-fidelity.test.js:84` addTask replays the sibling reorder in the column
- `tests/dom/event-sourcing/replay-fidelity.test.js:105` moving a task into and out of the done column replays its doneDate
- `tests/dom/event-sourcing/replay-fidelity.test.js:129` swimlane drag across priority lanes replays the priority reassignment

### Snapshot Catchup

- Path: `tests/dom/event-sourcing/snapshot-catchup.test.js`
- Type: DOM Integration
- Test count: 13

- `tests/dom/event-sourcing/snapshot-catchup.test.js:105` catch-up with a server snapshot > does not discover unrelated boards from a board-scoped snapshot
- `tests/dom/event-sourcing/snapshot-catchup.test.js:123` catch-up with a server snapshot > reconstructs a board whose events were GC-ed, from the snapshot alone
- `tests/dom/event-sourcing/snapshot-catchup.test.js:141` catch-up with a server snapshot > replays events newer than the snapshot on top of it
- `tests/dom/event-sourcing/snapshot-catchup.test.js:161` catch-up with a server snapshot > ignores events the snapshot already holds
- `tests/dom/event-sourcing/snapshot-catchup.test.js:181` catch-up with a server snapshot > hydrates a timetracking snapshot into the time-tracking slot, not a board
- `tests/dom/event-sourcing/snapshot-catchup.test.js:206` catch-up with a server snapshot > still replays events normally when the server has no snapshot
- `tests/dom/event-sourcing/snapshot-catchup.test.js:254` adopting a snapshot keeps newer local edits > board: a reconnect adopting a snapshot older than an unsynced edit keeps the edit visible and queued
- `tests/dom/event-sourcing/snapshot-catchup.test.js:274` adopting a snapshot keeps newer local edits > board: a snapshot newer than every local event becomes the view
- `tests/dom/event-sourcing/snapshot-catchup.test.js:292` adopting a snapshot keeps newer local edits > board: an entity a stored event created but the newer snapshot dropped is gone
- `tests/dom/event-sourcing/snapshot-catchup.test.js:307` adopting a snapshot keeps newer local edits > global: adopting a snapshot older than an unsynced settings edit keeps the edit
- `tests/dom/event-sourcing/snapshot-catchup.test.js:320` adopting a snapshot keeps newer local edits > global: a snapshot newer than every local event becomes the view
- `tests/dom/event-sourcing/snapshot-catchup.test.js:332` adopting a snapshot keeps newer local edits > time tracking: adopting a snapshot older than an unsynced edit keeps the edit
- `tests/dom/event-sourcing/snapshot-catchup.test.js:346` adopting a snapshot keeps newer local edits > time tracking: a snapshot newer than every local event becomes the view

### Snapshot Download

- Path: `tests/dom/event-sourcing/snapshot-download.test.js`
- Type: DOM Integration
- Test count: 6

- `tests/dom/event-sourcing/snapshot-download.test.js:69` snapshot download > returns null when the server holds no snapshot for the board
- `tests/dom/event-sourcing/snapshot-download.test.js:76` snapshot download > returns null when unauthenticated
- `tests/dom/event-sourcing/snapshot-download.test.js:80` snapshot download > queries the board it was asked for, and empty board_id for global scope
- `tests/dom/event-sourcing/snapshot-download.test.js:95` snapshot download > inflates the payload into projected state
- `tests/dom/event-sourcing/snapshot-download.test.js:112` snapshot download > rehydrates appliedEventIds and taskTombstones as Sets so replay dedups
- `tests/dom/event-sourcing/snapshot-download.test.js:128` snapshot download > picks the highest HLC when the server holds several snapshots

### Snapshot Sync

- Path: `tests/dom/event-sourcing/snapshot-sync.test.js`
- Type: DOM Integration
- Test count: 11

- `tests/dom/event-sourcing/snapshot-sync.test.js:40` snapshot upload > skips when unauthenticated
- `tests/dom/event-sourcing/snapshot-sync.test.js:45` snapshot upload > AC-009: skips upload when server snapshot HLC >= local
- `tests/dom/event-sourcing/snapshot-sync.test.js:59` snapshot upload > creates a snapshot record when the server is behind
- `tests/dom/event-sourcing/snapshot-sync.test.js:73` snapshot upload > buildSnapshotForm carries owner, board_id, hlc, and a gz payload file
- `tests/dom/event-sourcing/snapshot-sync.test.js:84` snapshot upload > AC-009 arbitration: deletes losing server snapshots after upload
- `tests/dom/event-sourcing/snapshot-sync.test.js:100` snapshot upload > AC-010: deletes PB events with hlc <= snapshot.hlc, keeps newer
- `tests/dom/event-sourcing/snapshot-sync.test.js:117` snapshot upload > AC-010 (#179): keeps covered PB events that are younger than the grace window
- `tests/dom/event-sourcing/snapshot-sync.test.js:137` snapshot upload > keeps covered PB events within a clock-skew margin of the grace window
- `tests/dom/event-sourcing/snapshot-sync.test.js:153` snapshot upload > a delete the server refuses is skipped: the other events are still deleted and the upload succeeds
- `tests/dom/event-sourcing/snapshot-sync.test.js:175` snapshot upload > global snapshot filters events by scope=global and uses empty board_id
- `tests/dom/event-sourcing/snapshot-sync.test.js:190` snapshot upload > timetracking snapshot uses its own board_id key and GCs only timetracking events

### Sync Indicator

- Path: `tests/dom/event-sourcing/sync-indicator.test.js`
- Type: DOM Integration
- Test count: 10

- `tests/dom/event-sourcing/sync-indicator.test.js:50` sync state indicator > AC-001: logged in, online, empty queue -> Live (green)
- `tests/dom/event-sourcing/sync-indicator.test.js:58` sync state indicator > AC-002: N events draining -> Syncing… (N) (yellow)
- `tests/dom/event-sourcing/sync-indicator.test.js:68` sync state indicator > AC-003: events stuck retrying -> ⚠ N unsynced (orange)
- `tests/dom/event-sourcing/sync-indicator.test.js:78` sync state indicator > AC-003b: paused (auth failure) tier also shows unsynced
- `tests/dom/event-sourcing/sync-indicator.test.js:86` sync state indicator > AC-004: offline -> Offline (gray)
- `tests/dom/event-sourcing/sync-indicator.test.js:95` sync state indicator > AC-004b: not logged in -> Offline (gray)
- `tests/dom/event-sourcing/sync-indicator.test.js:104` sync state indicator > AC-005: updates live on DATA_CHANGED (queue drains) without reload
- `tests/dom/event-sourcing/sync-indicator.test.js:117` sync state indicator > AC-005b: updates live on offline window event
- `tests/dom/event-sourcing/sync-indicator.test.js:128` sync state indicator > AC-005c: updates live on auth-changed window event
- `tests/dom/event-sourcing/sync-indicator.test.js:140` sync state indicator > updates live when the sync queue status changes

### Sync Queue

- Path: `tests/dom/event-sourcing/sync-queue.test.js`
- Type: DOM Integration
- Test count: 14

- `tests/dom/event-sourcing/sync-queue.test.js:78` sync-queue across a local snapshot (#176) > pushes every event queued offline even after a snapshot covered them
- `tests/dom/event-sourcing/sync-queue.test.js:113` sync-queue startup > drains events left over from a previous session, with no new activity
- `tests/dom/event-sourcing/sync-queue.test.js:129` sync-queue startup > does not push on startup when signed out
- `tests/dom/event-sourcing/sync-queue.test.js:144` sync-queue push > AC-004: pushes a queued event and flips synced after debounce
- `tests/dom/event-sourcing/sync-queue.test.js:164` sync-queue push > pushes a timetracking event with its scope and no board
- `tests/dom/event-sourcing/sync-queue.test.js:183` sync-queue push > AC-005: caps concurrent pushes at 5 and drains the whole queue
- `tests/dom/event-sourcing/sync-queue.test.js:208` sync-queue push > AC-005: drains in HLC order (sequential)
- `tests/dom/event-sourcing/sync-queue.test.js:226` sync-queue push > AC-008: a rejected event is left queued, never rolled back
- `tests/dom/event-sourcing/sync-queue.test.js:247` sync-queue push > AC-006: resumes on the online event without waiting for backoff
- `tests/dom/event-sourcing/sync-queue.test.js:273` sync-queue push > drains pre-existing unsynced events when auth changes after login
- `tests/dom/event-sourcing/sync-queue.test.js:296` sync-queue push > AC-007: pauses on auth failure and resumes on auth-changed
- `tests/dom/event-sourcing/sync-queue.test.js:328` sync-queue push > AC-011: network failures advance the backoff tiers, capped at 5min
- `tests/dom/event-sourcing/sync-queue.test.js:352` sync-queue push > AC-011: a permanent 4xx schedules a ~1h retry
- `tests/dom/event-sourcing/sync-queue.test.js:381` sync-queue duplicate rejection (#217) > AC-003/AC-005: a unique (owner, local_id) rejection marks the event synced with no retry

### Task Moved Payloads

- Path: `tests/dom/event-sourcing/task-moved-payloads.test.js`
- Type: DOM Integration
- Test count: 5

- `tests/dom/event-sourcing/task-moved-payloads.test.js:54` addTask emits the renumbered column with the new task first
- `tests/dom/event-sourcing/task-moved-payloads.test.js:72` updateTask to another column emits every task on the board
- `tests/dom/event-sourcing/task-moved-payloads.test.js:89` a drop to another column emits every task on the board
- `tests/dom/event-sourcing/task-moved-payloads.test.js:117` moveTaskToTopInColumn emits every task on the board
- `tests/dom/event-sourcing/task-moved-payloads.test.js:134` sortColumnTasks emits the sorted column with the column id as entity id

### Msw Example

- Path: `tests/dom/msw-example.test.js`
- Type: DOM Integration
- Test count: 2

- `tests/dom/msw-example.test.js:37` MSW intercepts requests and DOM reflects successful response
- `tests/dom/msw-example.test.js:45` MSW per-test handler override causes DOM to reflect error state

### Page Boot

- Path: `tests/dom/page-boot.test.js`
- Type: DOM Integration
- Test count: 3

- `tests/dom/page-boot.test.js:26` bootPage (#218) > sets up storage, theme, auth refresh, queue, snapshot upload, realtime and the indicator in that order
- `tests/dom/page-boot.test.js:31` bootPage (#218) > mounts the auth UI after auth refresh only when the page asks for it
- `tests/dom/page-boot.test.js:36` bootPage (#218) > still sets up theme and sync when storage fails to open

### Page Entries

- Path: `tests/dom/page-entries.test.js`
- Type: DOM Integration
- Test count: 0

_No executable test cases detected._

### Pwa

- Path: `tests/dom/pwa.test.js`
- Type: DOM Integration
- Test count: 5

- `tests/dom/pwa.test.js:34` PWA controls > offers the native install prompt only when the browser makes it available
- `tests/dom/pwa.test.js:49` PWA controls > provides Add to Home Screen instructions on iOS without a native install event
- `tests/dom/pwa.test.js:57` PWA controls > hides the install control in an installed app
- `tests/dom/pwa.test.js:64` PWA controls > flushes pending local changes before activating an already waiting update
- `tests/dom/pwa.test.js:74` PWA controls > detects a newly installed worker and checks updates when the app comes online

### Reconcile

- Path: `tests/dom/reconcile.test.js`
- Type: DOM Integration
- Test count: 10

- `tests/dom/reconcile.test.js:67` reconcileBoard moves a dragged task card into its new column, preserving the node
- `tests/dom/reconcile.test.js:87` reconcileBoard updates each column task counter to match state
- `tests/dom/reconcile.test.js:98` reconcileBoard updates a collapsed column title count
- `tests/dom/reconcile.test.js:121` a data change inside a drag-reconcile window patches in place instead of rebuilding
- `tests/dom/reconcile.test.js:138` reconcileBoard refreshes notifications, matching a full render
- `tests/dom/reconcile.test.js:148` reconcileBoard respects the active board filter, like a full render
- `tests/dom/reconcile.test.js:170` reconcileBoard defers to a full rebuild when swimlane mode is on
- `tests/dom/reconcile.test.js:183` reconcileBoard defers to a full rebuild when the column set changed
- `tests/dom/reconcile.test.js:196` reconcileBoard virtualizes an overfull Done column instead of rendering every card
- `tests/dom/reconcile.test.js:213` reconcileBoard patches a card due-date in place when it lands in Done

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

### Entry Filter

- Path: `tests/dom/time-tracking/entry-filter.test.js`
- Type: DOM Integration
- Test count: 8

- `tests/dom/time-tracking/entry-filter.test.js:33` entry filter controls (standalone, reusable) > mount into any container with both selects defaulting to All
- `tests/dom/time-tracking/entry-filter.test.js:40` entry filter controls (standalone, reusable) > archived customers and projects are listed and marked as archived
- `tests/dom/time-tracking/entry-filter.test.js:48` entry filter controls (standalone, reusable) > choosing a customer limits the project options to that customer
- `tests/dom/time-tracking/entry-filter.test.js:56` entry filter controls (standalone, reusable) > choosing a customer clears an incompatible project, keeps a compatible one
- `tests/dom/time-tracking/entry-filter.test.js:70` entry filter controls (standalone, reusable) > "All" resets each filter
- `tests/dom/time-tracking/entry-filter.test.js:81` entry filter controls (standalone, reusable) > focus() focuses the customer filter
- `tests/dom/time-tracking/entry-filter.test.js:87` entry filter controls (standalone, reusable) > refresh() picks up renamed / removed data and drops a selection that no longer fits
- `tests/dom/time-tracking/entry-filter.test.js:104` entry filter controls (standalone, reusable) > two instances on one page do not clash

### Projects

- Path: `tests/dom/time-tracking/projects.test.js`
- Type: DOM Integration
- Test count: 17

- `tests/dom/time-tracking/projects.test.js:63` Enter in the customer input creates the customer and lists it
- `tests/dom/time-tracking/projects.test.js:75` clicking Add customer creates the customer and keeps focus in the customer input
- `tests/dom/time-tracking/projects.test.js:85` a new customer becomes selectable for projects
- `tests/dom/time-tracking/projects.test.js:93` empty customer name shows a toast and emits nothing
- `tests/dom/time-tracking/projects.test.js:102` duplicate customer name shows a toast and emits nothing
- `tests/dom/time-tracking/projects.test.js:111` Enter in the project input creates the project nested under its customer
- `tests/dom/time-tracking/projects.test.js:125` after adding a project the customer stays selected and focus stays in the project input
- `tests/dom/time-tracking/projects.test.js:140` project without a selected customer shows a toast and emits nothing
- `tests/dom/time-tracking/projects.test.js:149` empty project name shows a toast and emits nothing
- `tests/dom/time-tracking/projects.test.js:158` duplicate project within the customer shows a toast and emits nothing
- `tests/dom/time-tracking/projects.test.js:171` text typed in the other input survives a data-change re-render
- `tests/dom/time-tracking/projects.test.js:182` a remote data change refreshes the list without touching the forms
- `tests/dom/time-tracking/projects.test.js:197` selection falls back to the placeholder when the selected customer disappears
- `tests/dom/time-tracking/projects.test.js:215` archive and delete > archiving a customer emits customer.archived, mutes the row and offers Unarchive
- `tests/dom/time-tracking/projects.test.js:228` archive and delete > archiving a project emits project.archived and mutes the row; unarchive restores it
- `tests/dom/time-tracking/projects.test.js:241` archive and delete > delete of a referenced item is disabled and explains why
- `tests/dom/time-tracking/projects.test.js:255` archive and delete > delete of an unreferenced project emits project.deleted and removes it; then its customer can go

### Reports

- Path: `tests/dom/time-tracking/reports.test.js`
- Type: DOM Integration
- Test count: 47

- `tests/dom/time-tracking/reports.test.js:74` month navigation > defaults to the current month in the user timezone
- `tests/dom/time-tracking/reports.test.js:79` month navigation > ‹ / › buttons switch the month and the label follows
- `tests/dom/time-tracking/reports.test.js:89` month navigation > prevPeriod() / nextPeriod() (for [ / ]) step the month
- `tests/dom/time-tracking/reports.test.js:98` month navigation > month buttons name their shortcut in the tooltip
- `tests/dom/time-tracking/reports.test.js:104` month navigation > re-resolves the current month on show when the month was not changed
- `tests/dom/time-tracking/reports.test.js:111` month navigation > keeps a month the user switched to when shown again
- `tests/dom/time-tracking/reports.test.js:119` month navigation > follows the current month again after switching back to it
- `tests/dom/time-tracking/reports.test.js:128` month navigation > a timezone change re-resolves the current month
- `tests/dom/time-tracking/reports.test.js:141` KPIs and table > KPIs: total duration, number of entries, number of projects
- `tests/dom/time-tracking/reports.test.js:148` KPIs and table > table: customers by total → projects by total with share; grand total matches the KPI
- `tests/dom/time-tracking/reports.test.js:163` KPIs and table > an entry from 31st 22:00 to 1st 02:00 counts entirely to the earlier month
- `tests/dom/time-tracking/reports.test.js:170` KPIs and table > durations follow the duration-format setting
- `tests/dom/time-tracking/reports.test.js:176` KPIs and table > refreshes when the data changes
- `tests/dom/time-tracking/reports.test.js:185` filters > reuses the entry filter controls; they apply to KPIs, chart and table
- `tests/dom/time-tracking/reports.test.js:200` filters > the filter is kept when switching months
- `tests/dom/time-tracking/reports.test.js:210` chart > one bar per calendar day, stacked series per project in the project colour, with a legend
- `tests/dom/time-tracking/reports.test.js:229` chart > tooltip shows the day, project and duration in the duration format
- `tests/dom/time-tracking/reports.test.js:238` chart > chart is created only once the section is visible, and is resized on show
- `tests/dom/time-tracking/reports.test.js:251` chart > the chart is described for assistive technology
- `tests/dom/time-tracking/reports.test.js:258` empty month > shows "No time tracked this month" and hides chart and table
- `tests/dom/time-tracking/reports.test.js:268` empty month > a filter with no matching entries in the month shows the empty state too
- `tests/dom/time-tracking/reports.test.js:283` Week \| Month switch > defaults to Month, with Month pressed
- `tests/dom/time-tracking/reports.test.js:290` Week \| Month switch > Week shows the current week with its ISO label, and navigation steps whole weeks
- `tests/dom/time-tracking/reports.test.js:303` Week \| Month switch > switching back to Month shows the month containing the current day
- `tests/dom/time-tracking/reports.test.js:312` Week \| Month switch > the choice is remembered on this device
- `tests/dom/time-tracking/reports.test.js:321` Week \| Month switch > showCurrentPeriod("week") opens the current week from any period
- `tests/dom/time-tracking/reports.test.js:331` week view > per-day chart Monday to Sunday and the table for the week
- `tests/dom/time-tracking/reports.test.js:353` week view > an empty week says so
- `tests/dom/time-tracking/reports.test.js:361` balance card > a finished month at 40h shows Logged, the full Target and a signed Balance (October: 22 workdays, 176h)
- `tests/dom/time-tracking/reports.test.js:373` balance card > a Monday at 40h over Mon–Fri has a Target of 8:00 so far
- `tests/dom/time-tracking/reports.test.js:383` balance card > the current week counts the Target so far including today; a surplus is green
- `tests/dom/time-tracking/reports.test.js:394` balance card > a finished week has a Target of exactly Weekly hours
- `tests/dom/time-tracking/reports.test.js:402` balance card > Target and Balance follow the duration-format setting
- `tests/dom/time-tracking/reports.test.js:410` balance card > is hidden when Weekly hours is unset
- `tests/dom/time-tracking/reports.test.js:415` balance card > is hidden while a customer or project filter is active, and the logged total still respects the filter
- `tests/dom/time-tracking/reports.test.js:425` balance card > is hidden for a future period
- `tests/dom/time-tracking/reports.test.js:431` balance card > is hidden for a period before the first entry
- `tests/dom/time-tracking/reports.test.js:442` Year period > Year is offered in the switch and shows the current year, labelled 2026
- `tests/dom/time-tracking/reports.test.js:450` Year period > ‹ / › and prevPeriod() / nextPeriod() (for [ / ]) step whole years
- `tests/dom/time-tracking/reports.test.js:463` Year period > the choice is remembered on this device
- `tests/dom/time-tracking/reports.test.js:472` Year period > per-month stacked bars (12 buckets) and the table for the year
- `tests/dom/time-tracking/reports.test.js:496` Year period > the year tooltip names the month, project and duration
- `tests/dom/time-tracking/reports.test.js:505` Year period > an empty year says so
- `tests/dom/time-tracking/reports.test.js:514` year balance card > a finished 2026 at 40h has a Target of 2088h (261 workdays)
- `tests/dom/time-tracking/reports.test.js:527` year balance card > the current year counts so far, from the first entry when that falls mid-year
- `tests/dom/time-tracking/reports.test.js:535` year balance card > the Balance resets on 1 January
- `tests/dom/time-tracking/reports.test.js:546` year balance card > is hidden when filtered, for a future year and for a year before the first entry

### Settings

- Path: `tests/dom/time-tracking/settings.test.js`
- Type: DOM Integration
- Test count: 22

- `tests/dom/time-tracking/settings.test.js:88` Settings section > shows all six settings with the spec options and defaults
- `tests/dom/time-tracking/settings.test.js:103` Settings section > live preview shows the current date, time and a sample duration and updates on change
- `tests/dom/time-tracking/settings.test.js:120` Settings section > changes are saved to the global settings layer
- `tests/dom/time-tracking/settings.test.js:130` Settings section > default project offers only active projects of the default customer; changing the customer resets it
- `tests/dom/time-tracking/settings.test.js:146` Settings section > an archived default customer stays visible, marked archived, and does not prefill
- `tests/dom/time-tracking/settings.test.js:153` Settings section > an archived default project stays visible, marked archived, and does not prefill
- `tests/dom/time-tracking/settings.test.js:163` Settings section > re-renders from settings synced from another device
- `tests/dom/time-tracking/settings.test.js:178` Weekly hours (contract) setting > is an empty decimal number input with step 0.5 by default
- `tests/dom/time-tracking/settings.test.js:187` Weekly hours (contract) setting > marks zero as out of range but accepts the smallest step and empty
- `tests/dom/time-tracking/settings.test.js:199` Weekly hours (contract) setting > a decimal value is saved through the global settings event
- `tests/dom/time-tracking/settings.test.js:207` Weekly hours (contract) setting > clearing the field switches the feature off
- `tests/dom/time-tracking/settings.test.js:222` Weekly hours (contract) setting > follows a value synced from another device, but not while the user is typing in it
- `tests/dom/time-tracking/settings.test.js:243` Workdays setting > offers Monday to Sunday with Monday to Friday ticked by default
- `tests/dom/time-tracking/settings.test.js:250` Workdays setting > ticking and unticking a day saves the workdays through the global settings event
- `tests/dom/time-tracking/settings.test.js:259` Workdays setting > the last ticked day cannot be unticked
- `tests/dom/time-tracking/settings.test.js:268` Workdays setting > follows workdays synced from another device
- `tests/dom/time-tracking/settings.test.js:278` the page follows the settings > setting Weekly hours shows the "This week" badge on the tracker; clearing it hides the badge
- `tests/dom/time-tracking/settings.test.js:296` the page follows the settings > changing a format re-renders the entry list, day totals and entry bar
- `tests/dom/time-tracking/settings.test.js:316` the page follows the settings > changing the timezone re-displays and re-groups entries without rewriting them
- `tests/dom/time-tracking/settings.test.js:329` the page follows the settings > shorthand date parsing follows the chosen date format
- `tests/dom/time-tracking/settings.test.js:338` the page follows the settings > the default project prefills the entry bar
- `tests/dom/time-tracking/settings.test.js:343` the page follows the settings > choosing a default project prefills an untouched entry bar right away

### Shell

- Path: `tests/dom/time-tracking/shell.test.js`
- Type: DOM Integration
- Test count: 16

- `tests/dom/time-tracking/shell.test.js:40` starts on the Time Tracker section
- `tests/dom/time-tracking/shell.test.js:47` ? opens the cheat-sheet and Escape closes it
- `tests/dom/time-tracking/shell.test.js:55` cheat-sheet lists only implemented shortcuts
- `tests/dom/time-tracking/shell.test.js:63` g then t switches to the Time Tracker section
- `tests/dom/time-tracking/shell.test.js:72` goto sequences are ignored while typing in an input
- `tests/dom/time-tracking/shell.test.js:81` clicking a sidebar entry switches section
- `tests/dom/time-tracking/shell.test.js:92` g then r opens Reports on the current month
- `tests/dom/time-tracking/shell.test.js:102` [ and ] switch the month on Reports
- `tests/dom/time-tracking/shell.test.js:114` with Week selected, [ and ] step whole weeks
- `tests/dom/time-tracking/shell.test.js:126` [ and ] do nothing outside Reports or while typing
- `tests/dom/time-tracking/shell.test.js:140` / on Reports focuses the report filter and stays on Reports
- `tests/dom/time-tracking/shell.test.js:160` switching sections by shortcut keeps the heading out of the Tab order
- `tests/dom/time-tracking/shell.test.js:165` ? moves focus into the cheat-sheet and Escape restores it
- `tests/dom/time-tracking/shell.test.js:175` Tab and Shift+Tab stay inside the open cheat-sheet
- `tests/dom/time-tracking/shell.test.js:184` closing the cheat-sheet with its Close button restores focus
- `tests/dom/time-tracking/shell.test.js:193` shortcuts other than Esc do not reach the page behind the open cheat-sheet

### Tracker

- Path: `tests/dom/time-tracking/tracker.test.js`
- Type: DOM Integration
- Test count: 72

- `tests/dom/time-tracking/tracker.test.js:83` entry bar > opens on the Time Tracker with defaults: today, start = now, end = start, 0:00, no project
- `tests/dom/time-tracking/tracker.test.js:92` entry bar > project type-ahead offers active projects as Customer / Project only
- `tests/dom/time-tracking/tracker.test.js:98` entry bar > keyboard-only flow: n → description → project → duration → Enter saves, resets and refocuses
- `tests/dom/time-tracking/tracker.test.js:138` entry bar > Enter saves from any field, e.g. Description, with an exact project label
- `tests/dom/time-tracking/tracker.test.js:149` entry bar > Enter resolves the field being edited without a prior blur
- `tests/dom/time-tracking/tracker.test.js:162` linked fields > fields normalise on blur and Start / End recompute Duration
- `tests/dom/time-tracking/tracker.test.js:172` linked fields > Duration recomputes End
- `tests/dom/time-tracking/tracker.test.js:179` linked fields > End before Start rolls over and shows +1 day
- `tests/dom/time-tracking/tracker.test.js:194` linked fields > invalid input reverts to the last valid value on blur
- `tests/dom/time-tracking/tracker.test.js:201` linked fields > Alt+↑ / Alt+↓ adjust Start, End and Duration by 15 minutes
- `tests/dom/time-tracking/tracker.test.js:211` linked fields > Alt+arrow does nothing on Description
- `tests/dom/time-tracking/tracker.test.js:219` keyboard > n is ignored while typing in a field
- `tests/dom/time-tracking/tracker.test.js:226` keyboard > Esc leaves the field
- `tests/dom/time-tracking/tracker.test.js:245` validation: toast, nothing saved, values kept > project required
- `tests/dom/time-tracking/tracker.test.js:252` validation: toast, nothing saved, values kept > unmatched project label counts as no project
- `tests/dom/time-tracking/tracker.test.js:257` validation: toast, nothing saved, values kept > archived project
- `tests/dom/time-tracking/tracker.test.js:263` validation: toast, nothing saved, values kept > project of an archived customer
- `tests/dom/time-tracking/tracker.test.js:268` validation: toast, nothing saved, values kept > zero duration
- `tests/dom/time-tracking/tracker.test.js:275` validation: toast, nothing saved, values kept > unparsable time typed right before Enter
- `tests/dom/time-tracking/tracker.test.js:289` entry list > groups by start day with Today / Yesterday / Ddd, date headings and day totals
- `tests/dom/time-tracking/tracker.test.js:308` entry list > a row shows description, project in its colour, customer and duration
- `tests/dom/time-tracking/tracker.test.js:317` entry list > entries on archived projects and archived customers still render and count in the day total
- `tests/dom/time-tracking/tracker.test.js:331` entry list > an entry whose project is not known yet renders as Unknown project
- `tests/dom/time-tracking/tracker.test.js:336` entry list > empty state
- `tests/dom/time-tracking/tracker.test.js:362` selection > j / k move the selection through the visible list, clamped at both ends, and keep it in view
- `tests/dom/time-tracking/tracker.test.js:380` selection > single-key shortcuts are ignored while an input is focused
- `tests/dom/time-tracking/tracker.test.js:391` selection > clicking a row selects it
- `tests/dom/time-tracking/tracker.test.js:399` selection > selection survives a re-render and is dropped when the entry disappears
- `tests/dom/time-tracking/tracker.test.js:410` selection > shortcuts with no selection do nothing
- `tests/dom/time-tracking/tracker.test.js:420` selection > a selected row shows edit, duplicate and delete actions
- `tests/dom/time-tracking/tracker.test.js:440` edit modal > e opens the selected entry with its values and focuses Description
- `tests/dom/time-tracking/tracker.test.js:449` edit modal > linked fields behave as in the entry bar and Enter saves time_entry.updated with before / after
- `tests/dom/time-tracking/tracker.test.js:473` edit modal > Esc cancels without saving
- `tests/dom/time-tracking/tracker.test.js:482` edit modal > validation errors toast and keep the modal open
- `tests/dom/time-tracking/tracker.test.js:492` edit modal > switching to an archived project is rejected
- `tests/dom/time-tracking/tracker.test.js:500` edit modal > an entry may keep its already-archived project
- `tests/dom/time-tracking/tracker.test.js:511` edit modal > saving without changes just closes the modal
- `tests/dom/time-tracking/tracker.test.js:518` edit modal > single-key shortcuts are suppressed while the modal is open
- `tests/dom/time-tracking/tracker.test.js:527` edit modal > double-click and the row edit action also open the modal
- `tests/dom/time-tracking/tracker.test.js:544` duplicate > d copies project, description and duration, starting now, and selects the copy
- `tests/dom/time-tracking/tracker.test.js:565` duplicate > the row duplicate action does the same
- `tests/dom/time-tracking/tracker.test.js:571` duplicate > an entry on an archived project is not duplicated
- `tests/dom/time-tracking/tracker.test.js:589` delete > Del asks inline with description, project and duration
- `tests/dom/time-tracking/tracker.test.js:595` delete > y deletes permanently, removes the row and selects the next one
- `tests/dom/time-tracking/tracker.test.js:610` delete > deleting the last row selects the previous one
- `tests/dom/time-tracking/tracker.test.js:616` delete > Esc cancels and leaves the entry untouched
- `tests/dom/time-tracking/tracker.test.js:625` delete > any other key cancels the confirmation and is then handled normally
- `tests/dom/time-tracking/tracker.test.js:639` delete > Tab cancels the confirmation without being swallowed
- `tests/dom/time-tracking/tracker.test.js:648` delete > the row delete action asks too; Cancel and Delete buttons work with the mouse
- `tests/dom/time-tracking/tracker.test.js:675` entry list filter > filter controls sit above the list and start at All
- `tests/dom/time-tracking/tracker.test.js:684` entry list filter > by customer, by project, both, and All resets
- `tests/dom/time-tracking/tracker.test.js:703` entry list filter > day totals and the entry count reflect the filtered entries
- `tests/dom/time-tracking/tracker.test.js:714` entry list filter > a filter that matches nothing says so
- `tests/dom/time-tracking/tracker.test.js:721` entry list filter > j / k only walk the visible entries and a hidden selection is dropped
- `tests/dom/time-tracking/tracker.test.js:735` entry list filter > / focuses the customer filter; it is ignored while typing
- `tests/dom/time-tracking/tracker.test.js:746` entry list filter > the filter survives new data and archived items stay selectable
- `tests/dom/time-tracking/tracker.test.js:756` entry list filter > / is listed in the shortcut cheat-sheet
- `tests/dom/time-tracking/tracker.test.js:772` last-used project > saving from the entry bar prefills that project for the next entry, without an extra event
- `tests/dom/time-tracking/tracker.test.js:780` last-used project > survives a reload
- `tests/dom/time-tracking/tracker.test.js:787` last-used project > duplicating an entry records its project as last-used
- `tests/dom/time-tracking/tracker.test.js:797` last-used project > editing an existing entry does not change it
- `tests/dom/time-tracking/tracker.test.js:812` last-used project > an archived last-used project is not prefilled
- `tests/dom/time-tracking/tracker.test.js:828` "This week" Balance badge > is hidden when Weekly hours is unset
- `tests/dom/time-tracking/tracker.test.js:834` "This week" Balance badge > shows a signed surplus in green as a button in the tracker header
- `tests/dom/time-tracking/tracker.test.js:845` "This week" Balance badge > shows a signed deficit in red
- `tests/dom/time-tracking/tracker.test.js:853` "This week" Balance badge > updates live after a Time Entry is created, edited and deleted
- `tests/dom/time-tracking/tracker.test.js:878` "This week" Balance badge > ignores the entry list filter
- `tests/dom/time-tracking/tracker.test.js:886` "This week" Balance badge > is hidden while the current week precedes the first-ever Time Entry
- `tests/dom/time-tracking/tracker.test.js:892` "This week" Balance badge > activating it shows Reports with Week selected on the current week and its Balance
- `tests/dom/time-tracking/tracker.test.js:904` "This week" Balance badge > activating it returns to the current week after browsing other periods
- `tests/dom/time-tracking/tracker.test.js:914` "This week" Balance badge > is operable from the keyboard
- `tests/dom/time-tracking/tracker.test.js:923` "This week" Balance badge > activating it does not change the remembered Reports period

### Wip Limit

- Path: `tests/dom/wip-limit.test.js`
- Type: DOM Integration
- Test count: 7

- `tests/dom/wip-limit.test.js:20` applyWipCounter > renders a bare count for an unlimited column
- `tests/dom/wip-limit.test.js:28` applyWipCounter > renders count with the limit in its own span
- `tests/dom/wip-limit.test.js:36` applyWipCounter > re-applying replaces rather than appends
- `tests/dom/wip-limit.test.js:46` syncColumnWip > drives data-wip through under, at and over
- `tests/dom/wip-limit.test.js:59` syncColumnWip > pulses only on the transition into over-limit
- `tests/dom/wip-limit.test.js:72` syncColumnWip > staying over-limit does not re-pulse
- `tests/dom/wip-limit.test.js:84` syncColumnWip > an unlimited column stays under at any count

## End-to-End Tests

### Boards

- Path: `tests/e2e/boards.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/boards.spec.js:34` Boards Management > should open a board when clicking the Open button in manage-boards modal
- `tests/e2e/boards.spec.js:79` Boards Management > should display multiple boards in the manage-boards modal
- `tests/e2e/boards.spec.js:118` Boards Management > should mark the active board in the boards list

### Create Task

- Path: `tests/e2e/create-task.spec.ts`
- Type: End-to-End
- Test count: 4
- Source plan/spec: `task-creation-with-labels.plan.md`

- `tests/e2e/create-task.spec.ts:25` Task Creation > Create task with 2 existing labels and medium priority in To Do column
- `tests/e2e/create-task.spec.ts:53` Task Creation > Create task with 2 existing labels and medium priority in In Progress column
- `tests/e2e/create-task.spec.ts:80` Task Creation > Create task with due date, 2 labels, and medium priority
- `tests/e2e/create-task.spec.ts:130` Task Creation > Create task with 2 new custom labels and medium priority

### Dragdrop Done Crash

- Path: `tests/e2e/dragdrop-done-crash.spec.js`
- Type: End-to-End
- Test count: 5

- `tests/e2e/dragdrop-done-crash.spec.js:64` Drag crash regression (${taskCount} tasks) > task moves never enter native drag or export card text through DataTransfer
- `tests/e2e/dragdrop-done-crash.spec.js:87` Drag crash regression (${taskCount} tasks) > drops into a collapsed column and back without leaving drag state behind
- `tests/e2e/dragdrop-done-crash.spec.js:102` Drag crash regression (${taskCount} tasks) > column reordering avoids native drag and survives reload
- `tests/e2e/dragdrop-done-crash.spec.js:117` Drag crash regression (${taskCount} tasks) > second consecutive drag to Done must not crash or freeze the page
- `tests/e2e/dragdrop-done-crash.spec.js:159` Drag crash regression (${taskCount} tasks) > both dragged tasks land at the top of Done

### Dragdrop

- Path: `tests/e2e/dragdrop.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/dragdrop.spec.js:55` Drag and Drop Performance > should drag task from In Progress to Done
- `tests/e2e/dragdrop.spec.js:82` Drag and Drop Performance > should handle multiple consecutive drops
- `tests/e2e/dragdrop.spec.js:102` Drag and Drop Performance > should show "Show more" button when Done column has many tasks

### Boards Locked Collection

- Path: `tests/e2e/event-sourcing/boards-locked-collection.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/event-sourcing/boards-locked-collection.spec.ts:70` boards created, renamed and deleted still sync with the boards collection locked

### Timetracking Convergence

- Path: `tests/e2e/event-sourcing/timetracking-convergence.spec.ts`
- Type: End-to-End
- Test count: 4

- `tests/e2e/event-sourcing/timetracking-convergence.spec.ts:77` #165 time-tracking convergence (live PocketBase) > a customer and project created on device A appear on device B
- `tests/e2e/event-sourcing/timetracking-convergence.spec.ts:103` #165 time-tracking convergence (live PocketBase) > #166 a time entry logged on device A appears on device B and syncs as time_entry.created
- `tests/e2e/event-sourcing/timetracking-convergence.spec.ts:142` #165 time-tracking convergence (live PocketBase) > #167 edits and deletes on device A converge on device B
- `tests/e2e/event-sourcing/timetracking-convergence.spec.ts:206` #165 time-tracking convergence (live PocketBase) > #173 customer, project and entry from device A reach device B; edit and delete on B converge on A

### Two Context Convergence

- Path: `tests/e2e/event-sourcing/two-context-convergence.spec.ts`
- Type: End-to-End
- Test count: 3

- `tests/e2e/event-sourcing/two-context-convergence.spec.ts:74` AC-009 two-context realtime convergence (live PocketBase) > a task created and moved on device A appears on device B within ~3s
- `tests/e2e/event-sourcing/two-context-convergence.spec.ts:117` AC-009 two-context realtime convergence (live PocketBase) > a template board created on device A shows its real columns on device B
- `tests/e2e/event-sourcing/two-context-convergence.spec.ts:148` AC-009 two-context realtime convergence (live PocketBase) > normal work and a board delete only call the event-sourced endpoints

### Subtasks

- Path: `tests/e2e/subtasks.spec.ts`
- Type: End-to-End
- Test count: 14

- `tests/e2e/subtasks.spec.ts:35` Sub-tasks > Sub-tasks fieldset is visible in the task modal
- `tests/e2e/subtasks.spec.ts:43` Sub-tasks > Add sub-tasks via quick-add input and press Enter
- `tests/e2e/subtasks.spec.ts:60` Sub-tasks > Empty sub-task input is ignored on Enter
- `tests/e2e/subtasks.spec.ts:73` Sub-tasks > Progress legend shows X / Y in fieldset legend
- `tests/e2e/subtasks.spec.ts:90` Sub-tasks > Checking a sub-task updates the progress legend
- `tests/e2e/subtasks.spec.ts:106` Sub-tasks > Completed sub-tasks have strikethrough style
- `tests/e2e/subtasks.spec.ts:121` Sub-tasks > Delete button removes a sub-task from the list
- `tests/e2e/subtasks.spec.ts:138` Sub-tasks > Sub-tasks are saved and persisted when task is created
- `tests/e2e/subtasks.spec.ts:179` Sub-tasks > Sub-task progress indicator appears on task card when sub-tasks exist
- `tests/e2e/subtasks.spec.ts:198` Sub-tasks > No progress indicator on card when task has no sub-tasks
- `tests/e2e/subtasks.spec.ts:210` Sub-tasks > Sub-tasks survive edit modal round-trip with completion state
- `tests/e2e/subtasks.spec.ts:238` Sub-tasks > Card donut turns green when all sub-tasks are completed
- `tests/e2e/subtasks.spec.ts:258` Sub-tasks > Inline edit: click sub-task title to edit and commit with Enter
- `tests/e2e/subtasks.spec.ts:277` Sub-tasks > Inline edit: Escape cancels edit and restores original title

### Swimlanes Dnd

- Path: `tests/e2e/swimlanes-dnd.spec.js`
- Type: End-to-End
- Test count: 4

- `tests/e2e/swimlanes-dnd.spec.js:42` Swim lane drag and drop > moves a task between swim lanes and columns
- `tests/e2e/swimlanes-dnd.spec.js:54` Swim lane drag and drop > moves a task into Done while done cards remain hidden
- `tests/e2e/swimlanes-dnd.spec.js:64` Swim lane drag and drop > moves a task between priority swim lanes and updates task priority
- `tests/e2e/swimlanes-dnd.spec.js:85` Swim lane drag and drop > moves a task between rows from the selected label group

### Swimlanes Persistence

- Path: `tests/e2e/swimlanes-persistence.spec.js`
- Type: End-to-End
- Test count: 3

- `tests/e2e/swimlanes-persistence.spec.js:12` Swim lane persistence > persists enabled state and grouping mode across reloads
- `tests/e2e/swimlanes-persistence.spec.js:43` Swim lane persistence > persists priority grouping mode across reloads
- `tests/e2e/swimlanes-persistence.spec.js:69` Swim lane persistence > persists collapsed swim lane state across reloads

### Swimlanes Toggle

- Path: `tests/e2e/swimlanes-toggle.spec.js`
- Type: End-to-End
- Test count: 5

- `tests/e2e/swimlanes-toggle.spec.js:25` Swim lane toggle > enables and disables swim lanes without losing task data
- `tests/e2e/swimlanes-toggle.spec.js:56` Swim lane toggle > collapses and expands a swim lane from its header
- `tests/e2e/swimlanes-toggle.spec.js:72` Swim lane toggle > collapses and expands a workflow column while swim lanes are enabled
- `tests/e2e/swimlanes-toggle.spec.js:93` Swim lane toggle > keeps swim lane column headers visible while vertically scrolling
- `tests/e2e/swimlanes-toggle.spec.js:170` Swim lane toggle > shows one row per label inside the selected label group

### Task Delete

- Path: `tests/e2e/task-delete.spec.ts`
- Type: End-to-End
- Test count: 2

- `tests/e2e/task-delete.spec.ts:37` Task Deletion > permanent delete — confirm removes task and decrements counter
- `tests/e2e/task-delete.spec.ts:55` Task Deletion > cancel delete — task survives and counter is unchanged

### Timetracking Archive

- Path: `tests/e2e/timetracking-archive.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-archive.spec.ts:10` archived projects leave the picker but keep their entries; referenced items cannot be deleted

### Timetracking Balance

- Path: `tests/e2e/timetracking-balance.spec.ts`
- Type: End-to-End
- Test count: 2

- `tests/e2e/timetracking-balance.spec.ts:30` Weekly hours → logged entries → Reports shows the Balance for the week, the month and the year
- `tests/e2e/timetracking-balance.spec.ts:121` Workdays: a Monday at 40h is an 8h Target over Mon–Fri, and 10h after unticking Friday

### Timetracking Entry

- Path: `tests/e2e/timetracking-entry.spec.ts`
- Type: End-to-End
- Test count: 3

- `tests/e2e/timetracking-entry.spec.ts:28` entries can be selected, edited, duplicated and deleted with the keyboard only
- `tests/e2e/timetracking-entry.spec.ts:86` row actions appear on hover and selection
- `tests/e2e/timetracking-entry.spec.ts:107` a time entry can be logged with the keyboard only

### Timetracking Filter

- Path: `tests/e2e/timetracking-filter.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-filter.spec.ts:27` the entry list can be filtered by customer and project

### Timetracking Keyboard Journey

- Path: `tests/e2e/timetracking-keyboard-journey.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-keyboard-journey.spec.ts:22` the whole time-tracking flow works with the keyboard only

### Timetracking Last Used

- Path: `tests/e2e/timetracking-last-used.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-last-used.spec.ts:3` the entry bar prefills the last-used project across reloads and falls back to the default once it is archived

### Timetracking Mobile

- Path: `tests/e2e/timetracking-mobile.spec.ts`
- Type: End-to-End
- Test count: 2

- `tests/e2e/timetracking-mobile.spec.ts:5` on a phone the sidebar collapses into a top bar and an entry can be logged by touch
- `tests/e2e/timetracking-mobile.spec.ts:59` on a phone a time entry can be edited and deleted by tapping its always-visible row actions

### Timetracking Reports

- Path: `tests/e2e/timetracking-reports.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-reports.spec.ts:32` Reports shows where the month went, by keyboard and buttons

### Timetracking Settings

- Path: `tests/e2e/timetracking-settings.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-settings.spec.ts:18` settings apply across the page and persist across a reload

### Timetracking Shell

- Path: `tests/e2e/timetracking-shell.spec.ts`
- Type: End-to-End
- Test count: 1

- `tests/e2e/timetracking-shell.spec.ts:3` sidebar collapsed on desktop still shows full mobile nav after narrowing

### Timetracking Week Balance

- Path: `tests/e2e/timetracking-week-balance.spec.ts`
- Type: End-to-End
- Test count: 3

- `tests/e2e/timetracking-week-balance.spec.ts:21` on a phone, Weekly hours turns on a touch-sized "This week" badge that fits the screen
- `tests/e2e/timetracking-week-balance.spec.ts:54` on a phone, tapping the "This week" badge opens Reports on the current week with touch-sized controls
- `tests/e2e/timetracking-week-balance.spec.ts:91` on a phone, the Year view with 12 monthly bars and its Balance fit the screen

### Validation Missing Title

- Path: `tests/e2e/validation-missing-title.spec.ts`
- Type: End-to-End
- Test count: 1
- Source plan/spec: `task-creation-with-labels.plan.md`

- `tests/e2e/validation-missing-title.spec.ts:8` Task Creation - Edge Cases and Error Handling > Attempt to create task without required title

### Wip Limit

- Path: `tests/e2e/wip-limit.spec.ts`
- Type: End-to-End
- Test count: 4

- `tests/e2e/wip-limit.spec.ts:31` WIP limits > a regular column exposes a WIP limit field defaulting to unlimited
- `tests/e2e/wip-limit.spec.ts:43` WIP limits > the Done column hides the WIP limit field
- `tests/e2e/wip-limit.spec.ts:53` WIP limits > counter shows count/limit and escalates under → at → over
- `tests/e2e/wip-limit.spec.ts:79` WIP limits > the limit survives a reload

## Performance Tests

### Large Board

- Path: `tests/performance/large-board.spec.js`
- Type: Performance
- Test count: 4

- `tests/performance/large-board.spec.js:298` smoke: 400-task standard board renders within startup budget
- `tests/performance/large-board.spec.js:346` ${scenario.taskCount} tasks in ${scenario.view} view stay within performance budgets
- `tests/performance/large-board.spec.js:428` ${taskCount} tasks complete event-log backfill within budget
- `tests/performance/large-board.spec.js:651` ${taskCount} tasks (${taskCount * 2} events) catch up on a fresh signed-in device within budget

## Other Tests

### Pwa

- Path: `tests/pwa/pwa.spec.js`
- Type: Other
- Test count: 5

- `tests/pwa/pwa.spec.js:63` mobile install metadata uses branded PNGs and supports subpath hosting
- `tests/pwa/pwa.spec.js:83` offline launches preserve tasks and all app views without caching API responses
- `tests/pwa/pwa.spec.js:99` a waiting release reloads on request and keeps local tasks across two tabs
- `tests/pwa/pwa.spec.js:128` an update already waiting when the app opens can still be applied
- `tests/pwa/pwa.spec.js:140` a release missing an app file cannot replace the working offline app

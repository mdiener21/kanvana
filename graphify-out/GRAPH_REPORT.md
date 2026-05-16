# Graph Report - .  (2026-05-16)

## Corpus Check
- 168 files · ~140,243 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1103 nodes · 1888 edges · 63 communities detected
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 435 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Init|Init]]
- [[_COMMUNITY_Tasks|Tasks]]
- [[_COMMUNITY_getPb|getPb]]
- [[_COMMUNITY_H|H]]
- [[_COMMUNITY_Emit|Emit]]
- [[_COMMUNITY_Task|Task]]
- [[_COMMUNITY_shortId|shortId]]
- [[_COMMUNITY_Kanvana|Kanvana]]
- [[_COMMUNITY_isUuid|isUuid]]
- [[_COMMUNITY_addTask|addTask]]
- [[_COMMUNITY_moveTask|moveTask]]
- [[_COMMUNITY_Main|Main]]
- [[_COMMUNITY_Dragdrop.Js|Dragdrop.Js]]
- [[_COMMUNITY_taskModal|taskModal]]
- [[_COMMUNITY_toPosix|toPosix]]
- [[_COMMUNITY_endOfMonth|endOfMonth]]
- [[_COMMUNITY_addTask|addTask]]
- [[_COMMUNITY_Main|Main]]
- [[_COMMUNITY_Plans|Plans]]
- [[_COMMUNITY_getPb|getPb]]
- [[_COMMUNITY_readTask|readTask]]
- [[_COMMUNITY_linkifyText|linkifyText]]
- [[_COMMUNITY_escapeHtml|escapeHtml]]
- [[_COMMUNITY_Nginx Proxy|Nginx Proxy]]
- [[_COMMUNITY_Main|Main]]
- [[_COMMUNITY_readTask|readTask]]
- [[_COMMUNITY_mountToBody|mountToBody]]
- [[_COMMUNITY_dateOffset|dateOffset]]
- [[_COMMUNITY_taskModal|taskModal]]
- [[_COMMUNITY_addSubTask|addSubTask]]
- [[_COMMUNITY_IndexedDB|IndexedDB]]
- [[_COMMUNITY_Kanvana Color Logo|Kanvana Color Logo]]
- [[_COMMUNITY_Human Intent|Human Intent]]
- [[_COMMUNITY_normalizeDueDate|normalizeDueDate]]
- [[_COMMUNITY_moveTask|moveTask]]
- [[_COMMUNITY_makeCellCollapseKey|makeCellCollapseKey]]
- [[_COMMUNITY_h DOM Helper|h DOM Helper]]
- [[_COMMUNITY_Main|Main]]
- [[_COMMUNITY_Testing Stack|Testing Stack]]
- [[_COMMUNITY_formatCountdown|formatCountdown]]
- [[_COMMUNITY_Human Intent|Human Intent]]
- [[_COMMUNITY_React Report UI|React Report UI]]
- [[_COMMUNITY_decodeText|decodeText]]
- [[_COMMUNITY_renderFragment|renderFragment]]
- [[_COMMUNITY_validateTaskTitle|validateTaskTitle]]
- [[_COMMUNITY_getArg|getArg]]
- [[_COMMUNITY_Keyboard Shortcuts|Keyboard Shortcuts]]
- [[_COMMUNITY_openBoardsModal|openBoardsModal]]
- [[_COMMUNITY_OnOffEmit|On/Off/Emit]]
- [[_COMMUNITY_resetLocalStorage|resetLocalStorage]]
- [[_COMMUNITY_IndexedDB Privacy Model|IndexedDB Privacy Model]]
- [[_COMMUNITY_Kanvana Db|Kanvana Db]]
- [[_COMMUNITY_Event Bus Recommendation|Event Bus Recommendation]]
- [[_COMMUNITY_gh CLI|gh CLI]]
- [[_COMMUNITY_Actor Model|Actor Model]]
- [[_COMMUNITY_h DOM Helper|h DOM Helper]]
- [[_COMMUNITY_syncTaskCounters|syncTaskCounters]]
- [[_COMMUNITY_Unit Test Browser API Mocks|Unit Test Browser API Mocks]]
- [[_COMMUNITY_Reports And Calendar|Reports And Calendar]]
- [[_COMMUNITY_Import Export Security|Import Export Security]]
- [[_COMMUNITY_Schema Factories|Schema Factories]]
- [[_COMMUNITY_Architecture Rules|Architecture Rules]]
- [[_COMMUNITY_Explicit PushPull Conflict Resolution|Explicit Push/Pull Conflict Resolution]]

## God Nodes (most connected - your core abstractions)
1. `addEventListener()` - 35 edges
2. `loadTasks()` - 30 edges
3. `ensureBoardsInitialized()` - 28 edges
4. `getActiveBoardId()` - 26 edges
5. `loadColumns()` - 24 edges
6. `keyFor()` - 23 edges
7. `loadLabels()` - 22 edges
8. `generateUUID()` - 21 edges
9. `loadSettings()` - 21 edges
10. `schedulePersist()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Import Preflight and Compatibility Tests` --references--> `Board JSON Import and Export`  [INFERRED]
  client/tests/unit/importexport.test.js → docs/readme.md
- `Swimlane Utility Tests` --references--> `Swim Lanes Feature`  [INFERRED]
  client/tests/unit/swimlanes-utils.test.js → docs/readme.md
- `Task CRUD Unit Tests` --references--> `Sub-tasks Feature`  [INFERRED]
  client/tests/unit/tasks.test.js → docs/readme.md
- `Task Domain Object` --references--> `Priority Constants`  [EXTRACTED]
  AGENTS.md → client/src/modules/constants.js
- `Column Domain Object` --shares_data_with--> `showEditColumnModal`  [EXTRACTED]
  AGENTS.md → client/src/modules/column-modal.js

## Hyperedges (group relationships)
- **Task Creation Plan Implementation** — task_creation_plan, create_task_suite, validation_missing_title_suite [INFERRED 0.84]
- **PocketBase Optional Backend Bundle** — 2026_04_04_pocketbase_backend_design_storage_adapter_pattern, 2026_04_04_pocketbase_backend_design_pocketbase_schema, 2026_04_04_pocketbase_backend_design_migration_flow, 2026_04_04_pocketbase_backend_design_user_isolation_rules, 2026_04_04_pocketbase_backend_design_read_only_offline_mode [EXTRACTED 1.00]
- **PocketBase Backend Integration Flow** — 2026_04_04_pocketbase_backend_pb_auth, 2026_04_04_pocketbase_backend_pb_migration, 2026_04_04_pocketbase_backend_pb_storage, 2026_04_04_pocketbase_backend_app_settings [EXTRACTED 1.00]
- **UUID Migration Coverage** — 2026_04_28_uuid_model_ids_uuid_model_ids, storage_idb_test_idb_storage_tests, importexport_test_import_preflight_tests, utils_test_uuid_tests [EXTRACTED 1.00]
- **Swim Lane Feature Bundle** — swimlanes_swim_lanes, settings_settings, tasks_tasks, labels_labels, columns_done_column_rules [EXTRACTED 1.00]
- **IndexedDB Migration Plan Components** — plan_migrate_to_indexeddb_indexeddb, plan_migrate_to_indexeddb_idb_wrapper, plan_migrate_to_indexeddb_async_storage_api, plan_migrate_to_indexeddb_localstorage_migration [EXTRACTED 1.00]
- **Swimlane Cell Collapse Implementation** — swimlane_column_collapse_make_cell_collapse_key, swimlane_column_collapse_is_swimlane_cell_collapsed, swimlane_column_collapse_toggle_swimlane_cell_collapsed, swimlane_column_collapse_swimlane_cell_collapsed_keys [EXTRACTED 1.00]
- **Product Delivery Feedback Loop** — image_human_intent, image_product_specs, image_technical_planning, image_work_breakdown, image_sdlc_execution, image_deploy_operate, image_feedback_telemetry_defects_new_needs [EXTRACTED 1.00]
- **AI-Agentic Engineering Pipeline** — image_1_human_goal_vision, image_1_product_definition_specification, image_1_plan_generation, image_1_execution_breakdown, image_1_implementation_via_sdlc, image_1_deployment_operations, image_1_feedback_learning_loop [EXTRACTED 1.00]
- **Audit Trail Outputs** — image_1_product_specs, image_1_plans, image_1_epics_tasks_code, image_1_tests, image_1_security_evidence, image_1_deployment_records [EXTRACTED 1.00]
- **Board Aggregate Root Model** — context_board, context_column, context_task, context_label, context_settings [EXTRACTED 1.00]
- **Two Log Audit Trail System** — context_task_activity_log, context_board_event_log, context_actor_model, adr_two_log_audit_trail [EXTRACTED 1.00]
- **Frontend Auxiliary Pages** — index_html_main_board_page, reports_html_reports_dashboard, calendar_html_due_date_calendar, activity_html_board_activity_page [EXTRACTED 1.00]
- **Local First Storage System** — storage_indexeddb_persistence, storage_idb_kv_store, storage_init_storage, data_models_board_model [EXTRACTED 1.00]
- **Audit Trail Two Logs** — audit_trail_two_log_design, audit_trail_task_activity_log, audit_trail_board_event_store, audit_trail_activity_event [EXTRACTED 1.00]
- **Test Stack Layers** — testing_strategy_unit_tests, testing_strategy_dom_tests, testing_strategy_msw_mocks, testing_strategy_playwright_e2e [EXTRACTED 1.00]

## Communities

### Community 0 - "Init"
Cohesion: 0.05
Nodes (103): keyFor(), init(), createActivityEvent(), isValidActor(), renderActivityPage(), applyBoardTemplate(), refreshBoardsModalList(), renderBoardsList() (+95 more)

### Community 1 - "Tasks"
Cohesion: 0.04
Nodes (75): Storage Adapter Pattern, Board Event Store, Task Activity Log, Two-Log Audit Trail, Auto-Sync, PocketBase Collections, PocketBase Sync, Soft Delete (+67 more)

### Community 2 - "getPb"
Cohesion: 0.06
Nodes (55): disableAutoSync(), enableAutoSync(), getActiveBoardIdLocal(), hasWindow(), initializeAutoSync(), isAutoSyncEnabled(), listBoardsLocal(), loadColumnsLocal() (+47 more)

### Community 3 - "H"
Cohesion: 0.05
Nodes (44): initializeAuthSyncUI(), initializeAuthSyncUI(), getBuiltInBoardTemplates(), initializeBoardsUI(), initializeBoardsModalHandlers(), populateTemplateSelect(), refreshBoardSelect(), refreshBrandText() (+36 more)

### Community 4 - "Emit"
Cohesion: 0.05
Nodes (60): calculateDaysUntilDue, formatCountdown, getCountdownClassName, alertDialog, confirmDialog, initColumnSortable, initDragDrop, initTaskSortables (+52 more)

### Community 5 - "Task"
Cohesion: 0.04
Nodes (57): Done Column Role, Legacy ID Remapping, UUID Model IDs, Board Activity Page, Two-log Audit Trail ADR, Agent Developer Guide, Label Domain Object, Audit Trail PRD (+49 more)

### Community 6 - "shortId"
Cohesion: 0.06
Nodes (37): createAccordionSection(), createTaskActivitySection(), showColumnModal(), showEditColumnModal(), updateColumnColorHex(), getLabelsManagerSearchQuery(), groupLabels(), hideLabelModal() (+29 more)

### Community 7 - "Kanvana"
Cohesion: 0.04
Nodes (54): createAccordionSection, Column Domain Object, IndexedDB Storage, Kanvana, Local-first Kanban Board, GitHub Actions Release Process, renderBoard Refresh Pattern, Specification Governance (+46 more)

### Community 8 - "isUuid"
Cohesion: 0.07
Nodes (36): isUuid(), normalizeBoardModelIds(), nowIso(), remapCellCollapseKeys(), remapId(), remapReference(), boardNameFromFile(), buildExportMeta() (+28 more)

### Community 9 - "addTask"
Cohesion: 0.09
Nodes (27): appendTaskActivity(), isDoneColumn(), normalizeTaskForExport(), boardDisplayName(), defaultColumnColor(), isHexColor(), normalizeHexColor(), normalizeRelationships() (+19 more)

### Community 10 - "moveTask"
Cohesion: 0.15
Nodes (32): renderSwimlaneBoard(), applySwimLaneAssignment(), buildBoardGrid(), getAvailableLabelGroupsFromCollection(), getAvailableLanes(), getAvailableSwimLaneLabelGroups(), getExplicitLaneValue(), getFallbackLaneDescriptor() (+24 more)

### Community 11 - "Main"
Cohesion: 0.15
Nodes (29): addDays(), bucketKeyForDate(), buildBarChartOption(), buildCfdOption(), buildDailyUpdatesOption(), buildLeadTimeOption(), computeCompletions(), computeCumulativeFlow() (+21 more)

### Community 12 - "Dragdrop.Js"
Cohesion: 0.21
Nodes (12): autoScrollActiveTaskList(), clearCollapsedDropHover(), destroySortables(), initColumnSortable(), initDragDrop(), initTaskSortables(), isSwimlaneViewEnabled(), setCollapsedDropHover() (+4 more)

### Community 13 - "taskModal"
Cohesion: 0.17
Nodes (16): getTaskCount, Task Creation E2E Suite, taskModal, Seed Test Placeholder, Task Creation Edge Cases and Error Handling, Task Creation Happy Path Scenarios, Task Creation Cross-Column and Integration Scenarios, Task Creation Label Management Scenarios (+8 more)

### Community 14 - "toPosix"
Cohesion: 0.2
Nodes (12): buildCoverageIndex(), collectSourceModules(), collectSpecFiles(), collectTestFiles(), hasCoverage(), listFiles(), normalizeToken(), parseTestFile() (+4 more)

### Community 15 - "endOfMonth"
Cohesion: 0.24
Nodes (10): endOfMonth(), extractTaskDueDateIso(), formatIsoDate(), formatMonthKey(), groupTasksByDueDateForMonth(), isoDateOnly(), isTaskDone(), isTaskOverdue() (+2 more)

### Community 16 - "addTask"
Cohesion: 0.13
Nodes (15): addColumn, Column CRUD Unit Tests, deleteColumn, toggleColumnCollapsed, updateColumn, addLabel, deleteLabel, Label CRUD Unit Tests (+7 more)

### Community 17 - "Main"
Cohesion: 0.13
Nodes (15): assertVersion, findReleaseBlock, main, parseArgs, Release Notes Extraction, assertSupportedBumpType, buildReleaseBlock, bumpVersion (+7 more)

### Community 18 - "Plans"
Cohesion: 0.19
Nodes (15): AI-Agentic Engineering Workflow, Artifacts / Audit Trail, Deployment & Operations, Deployment Records, Epics, Tasks, Code, Execution Breakdown, Feedback / Learning Loop, Human Goal / Vision (+7 more)

### Community 19 - "getPb"
Cohesion: 0.2
Nodes (8): emptySyncMap(), ensureAuthenticated(), getPbId(), loadSyncMap(), pullAllBoards(), saveSyncMap(), setPbId(), upsertRecord()

### Community 20 - "readTask"
Cohesion: 0.22
Nodes (14): Core Board Regression Coverage, Swimlane Coverage Gap Assessment and Expansion Plan, Secondary Pages and Navigation Coverage, Swim Lane Regression Expansion, dragByMouse, readTask, Swim Lane Drag and Drop Suite, writeIDBValue (+6 more)

### Community 21 - "linkifyText"
Cohesion: 0.27
Nodes (10): renderFragment(), calculateDaysUntilDue(), formatCountdown(), getCountdownClassName(), syncMovedTaskDueDate(), createTaskElement(), formatDisplayDate(), formatDisplayDateTime() (+2 more)

### Community 22 - "escapeHtml"
Cohesion: 0.15
Nodes (13): Docker Compose Stack, GHCR CI Docker Build, Nginx PocketBase Proxy, App Settings Backend UI, Optional PocketBase Backend, PocketBase Authentication Module, IDB to PocketBase Migration, PocketBase Storage Adapter (+5 more)

### Community 23 - "Nginx Proxy"
Cohesion: 0.17
Nodes (12): CI/CD Pipeline, Docker & DevOps Design, Nginx Proxy, PocketBase Isolation, Static Frontend, VPS Deployment, AI Agent Authentication, IDB to PocketBase Migration Flow (+4 more)

### Community 24 - "Main"
Cohesion: 0.35
Nodes (10): assertSupportedBumpType(), buildReleaseBlock(), bumpVersion(), extractSections(), main(), parseArgs(), todayIsoDate(), updateChangelog() (+2 more)

### Community 25 - "readTask"
Cohesion: 0.25
Nodes (3): readTask(), readIDBSettings(), readIDBValue()

### Community 26 - "mountToBody"
Cohesion: 0.32
Nodes (8): createAccordionSection Toggle Test, exampleApiUrl, MSW Handlers, MSW Error State Test, loadExampleItems, MSW Success State Test, MSW Test Server, mountToBody

### Community 27 - "dateOffset"
Cohesion: 0.25
Nodes (8): Performance Board Fixture, Drag and Drop Performance Suite, dateOffset, dateString, generateId, Performance Task Generation, randomItem, randomItems

### Community 28 - "taskModal"
Cohesion: 0.43
Nodes (5): addSubTask(), openAddTaskModal(), openEditTaskModal(), subtaskInput(), taskModal()

### Community 29 - "addSubTask"
Cohesion: 0.33
Nodes (7): addSubTask, openAddTaskModal, openEditTaskModal, subtaskInput, subtasksList, Sub-tasks E2E Suite, subtasks taskModal

### Community 30 - "IndexedDB"
Cohesion: 0.29
Nodes (7): Async Storage API, fake-indexeddb, idb Wrapper, IndexedDB, Kanvana Storage Migration, localStorage Limitations, One-time localStorage Migration

### Community 31 - "Kanvana Color Logo"
Cohesion: 0.33
Nodes (7): Abstract Leaf Flower Mark, Embedded PNG Reference Image, Inkscape SVG Document, Kanban Column Bar Motif, Kanvana Color Logo, kanvana-vector-logo.svg Docname, Multicolor Gradient Palette

### Community 32 - "Human Intent"
Cohesion: 0.33
Nodes (7): Deploy & Operate, Feedback, Telemetry, Defects, New Needs, Human Intent, Product Specs, SDLC Execution, Technical Planning, Work Breakdown

### Community 34 - "normalizeDueDate"
Cohesion: 0.33
Nodes (6): Normalization Unit Tests, normalizeDueDate, normalizeHexColor, normalizePriority, normalizeStringKeys, normalizeSubTasks

### Community 35 - "moveTask"
Cohesion: 0.33
Nodes (6): Swim Lanes Feature, buildBoardGrid, getSwimLaneValue, groupTasksBySwimLane, moveTask, Swimlane Utility Tests

### Community 36 - "makeCellCollapseKey"
Cohesion: 0.33
Nodes (6): Swimlane Cell Collapse, Composite Cell Collapse Key, isSwimLaneCellCollapsed, makeCellCollapseKey, swimLaneCellCollapsedKeys, toggleSwimLaneCellCollapsed

### Community 37 - "h DOM Helper"
Cohesion: 0.33
Nodes (6): Personal Kanban Board Architectural Review, DOM as State Source, h() DOM Helper, modals.js God Module, render.js God Module, Shared Normalizers

### Community 38 - "Main"
Cohesion: 0.7
Nodes (4): assertVersion(), findReleaseBlock(), main(), parseArgs()

### Community 39 - "Testing Stack"
Cohesion: 0.4
Nodes (5): Testing Stack, Playwright E2E Configuration, Playwright Test Report HTML, Vitest DOM Test Configuration, Vitest Unit Test Configuration

### Community 41 - "formatCountdown"
Cohesion: 0.5
Nodes (4): calculateDaysUntilDue, Due Date Countdown Tests, formatCountdown, getCountdownClassName

### Community 42 - "Human Intent"
Cohesion: 0.67
Nodes (4): Human Intent, Product-First Engineering Flow, Product Specs, SDLC Execution

### Community 43 - "React Report UI"
Cohesion: 0.5
Nodes (4): Image Diff Viewer, Playwright Test Report, React Report UI, Test Attachments

### Community 44 - "decodeText"
Cohesion: 1.0
Nodes (2): decodeText(), formatEmailSnippet()

### Community 47 - "renderFragment"
Cohesion: 0.67
Nodes (3): linkifyText Test Suite, renderFragment, updateDescriptionLinks Modal Preview Test Suite

### Community 48 - "validateTaskTitle"
Cohesion: 0.67
Nodes (3): validateColumnName, validateTaskTitle, Validation Unit Tests

### Community 49 - "getArg"
Cohesion: 0.67
Nodes (3): getArg, getChangedFiles, Spec Sync Check

### Community 50 - "Keyboard Shortcuts"
Cohesion: 0.67
Nodes (3): Manage Boards Modal, Keyboard Shortcuts, Ctrl+B Manage Boards Shortcut

### Community 57 - "openBoardsModal"
Cohesion: 1.0
Nodes (2): Boards Management E2E Suite, openBoardsModal

### Community 58 - "On/Off/Emit"
Cohesion: 1.0
Nodes (2): Event Bus Unit Tests, on/off/emit

### Community 59 - "resetLocalStorage"
Cohesion: 1.0
Nodes (2): resetLocalStorage, _resetStorageForTesting

### Community 60 - "IndexedDB Privacy Model"
Cohesion: 1.0
Nodes (2): IndexedDB Privacy Model, Kanvana Local-first Browser Kanban

### Community 61 - "Kanvana Db"
Cohesion: 1.0
Nodes (2): kanvana-db, IndexedDB Object Stores

### Community 62 - "Event Bus Recommendation"
Cohesion: 1.0
Nodes (2): Dynamic Import Circular Dependencies, Event Bus Recommendation

### Community 65 - "gh CLI"
Cohesion: 1.0
Nodes (2): gh CLI, GitHub Issues

### Community 66 - "Actor Model"
Cohesion: 1.0
Nodes (2): ActivityEvent, Actor Model

### Community 88 - "h DOM Helper"
Cohesion: 1.0
Nodes (1): h DOM Helper

### Community 89 - "syncTaskCounters"
Cohesion: 1.0
Nodes (1): syncTaskCounters

### Community 90 - "Unit Test Browser API Mocks"
Cohesion: 1.0
Nodes (1): Unit Test Browser API Mocks

### Community 107 - "Reports And Calendar"
Cohesion: 1.0
Nodes (1): Reports And Calendar

### Community 108 - "Import Export Security"
Cohesion: 1.0
Nodes (1): Import Export Security

### Community 109 - "Schema Factories"
Cohesion: 1.0
Nodes (1): Schema Factories

### Community 110 - "Architecture Rules"
Cohesion: 1.0
Nodes (1): Architecture Rules

### Community 111 - "Explicit Push/Pull Conflict Resolution"
Cohesion: 1.0
Nodes (1): Explicit Push/Pull Conflict Resolution

## Ambiguous Edges - Review These
- `Import Export Backups` → `IndexedDB Persistence`  [AMBIGUOUS]
  docs/user/help-how-to.md · relation: conceptually_related_to

## Knowledge Gaps
- **200 isolated node(s):** `Specification Governance`, `GitHub Actions Release Process`, `Docker Compose Stack`, `Clickable Task Description URLs`, `IndexedDB Migration` (+195 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `decodeText`** (3 nodes): `impressum.js`, `decodeText()`, `formatEmailSnippet()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `openBoardsModal`** (2 nodes): `Boards Management E2E Suite`, `openBoardsModal`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `On/Off/Emit`** (2 nodes): `Event Bus Unit Tests`, `on/off/emit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `resetLocalStorage`** (2 nodes): `resetLocalStorage`, `_resetStorageForTesting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IndexedDB Privacy Model`** (2 nodes): `IndexedDB Privacy Model`, `Kanvana Local-first Browser Kanban`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Kanvana Db`** (2 nodes): `kanvana-db`, `IndexedDB Object Stores`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Bus Recommendation`** (2 nodes): `Dynamic Import Circular Dependencies`, `Event Bus Recommendation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `gh CLI`** (2 nodes): `gh CLI`, `GitHub Issues`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Actor Model`** (2 nodes): `ActivityEvent`, `Actor Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `h DOM Helper`** (1 nodes): `h DOM Helper`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `syncTaskCounters`** (1 nodes): `syncTaskCounters`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Unit Test Browser API Mocks`** (1 nodes): `Unit Test Browser API Mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Reports And Calendar`** (1 nodes): `Reports And Calendar`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Import Export Security`** (1 nodes): `Import Export Security`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Schema Factories`** (1 nodes): `Schema Factories`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Architecture Rules`** (1 nodes): `Architecture Rules`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Explicit Push/Pull Conflict Resolution`** (1 nodes): `Explicit Push/Pull Conflict Resolution`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Import Export Backups` and `IndexedDB Persistence`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `addEventListener()` connect `H` to `Init`, `getPb`, `shortId`, `moveTask`, `Main`, `endOfMonth`, `linkifyText`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `loadLabels()` connect `Init` to `shortId`, `isUuid`, `addTask`, `moveTask`, `linkifyText`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `loadTasks()` connect `Init` to `H`, `shortId`, `addTask`, `Main`, `linkifyText`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 34 inferred relationships involving `addEventListener()` (e.g. with `setupModalCloseHandlers()` and `initializeModalHandlers()`) actually correct?**
  _`addEventListener()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `loadTasks()` (e.g. with `deleteLabel()` and `exportTasks()`) actually correct?**
  _`loadTasks()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `ensureBoardsInitialized()` (e.g. with `initializeBoardsUI()` and `main()`) actually correct?**
  _`ensureBoardsInitialized()` has 9 INFERRED edges - model-reasoned connections that need verification._
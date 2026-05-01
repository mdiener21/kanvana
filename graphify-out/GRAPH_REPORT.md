# Graph Report - .  (2026-04-28)

## Corpus Check
- 127 files · ~128,182 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 860 nodes · 1387 edges · 54 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 240 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Board Data Management|Board Data Management]]
- [[_COMMUNITY_Due Date Dragging|Due Date Dragging]]
- [[_COMMUNITY_Project Governance|Project Governance]]
- [[_COMMUNITY_Import Export Security|Import Export Security]]
- [[_COMMUNITY_Board UI Templates|Board UI Templates]]
- [[_COMMUNITY_Label Task Modals|Label Task Modals]]
- [[_COMMUNITY_Swimlane Rendering|Swimlane Rendering]]
- [[_COMMUNITY_Icons Notifications Theme|Icons Notifications Theme]]
- [[_COMMUNITY_Board Settings Modals|Board Settings Modals]]
- [[_COMMUNITY_Reports Analytics|Reports Analytics]]
- [[_COMMUNITY_Import Compatibility|Import Compatibility]]
- [[_COMMUNITY_Drag Drop Runtime|Drag Drop Runtime]]
- [[_COMMUNITY_Task Creation Testing|Task Creation Testing]]
- [[_COMMUNITY_Calendar View|Calendar View]]
- [[_COMMUNITY_CRUD Unit Tests|CRUD Unit Tests]]
- [[_COMMUNITY_Release Automation|Release Automation]]
- [[_COMMUNITY_Agentic Workflow|Agentic Workflow]]
- [[_COMMUNITY_Swimlane Test Coverage|Swimlane Test Coverage]]
- [[_COMMUNITY_Column Elements Events|Column Elements Events]]
- [[_COMMUNITY_Task Card Dates|Task Card Dates]]
- [[_COMMUNITY_Column Validation Modal|Column Validation Modal]]
- [[_COMMUNITY_PocketBase Backend Plan|PocketBase Backend Plan]]
- [[_COMMUNITY_DevOps Architecture|DevOps Architecture]]
- [[_COMMUNITY_Prepare Release Script|Prepare Release Script]]
- [[_COMMUNITY_Swimlane E2E Helpers|Swimlane E2E Helpers]]
- [[_COMMUNITY_DOM MSW Tests|DOM MSW Tests]]
- [[_COMMUNITY_Performance Fixtures|Performance Fixtures]]
- [[_COMMUNITY_Subtasks Helpers|Subtasks Helpers]]
- [[_COMMUNITY_Subtasks E2E|Subtasks E2E]]
- [[_COMMUNITY_IndexedDB Migration|IndexedDB Migration]]
- [[_COMMUNITY_Logo Assets|Logo Assets]]
- [[_COMMUNITY_Product Workflow Loop|Product Workflow Loop]]
- [[_COMMUNITY_Normalization Tests|Normalization Tests]]
- [[_COMMUNITY_Swimlane Utilities|Swimlane Utilities]]
- [[_COMMUNITY_Swimlane Collapse|Swimlane Collapse]]
- [[_COMMUNITY_Architecture Review|Architecture Review]]
- [[_COMMUNITY_Release Notes Script|Release Notes Script]]
- [[_COMMUNITY_Test Configuration|Test Configuration]]
- [[_COMMUNITY_Due Date Tests|Due Date Tests]]
- [[_COMMUNITY_Product Engineering Flow|Product Engineering Flow]]
- [[_COMMUNITY_Playwright Reports|Playwright Reports]]
- [[_COMMUNITY_Impressum Encoding|Impressum Encoding]]
- [[_COMMUNITY_Linkify Tests|Linkify Tests]]
- [[_COMMUNITY_Validation Unit Tests|Validation Unit Tests]]
- [[_COMMUNITY_Spec Sync Utility|Spec Sync Utility]]
- [[_COMMUNITY_Boards Modal Tests|Boards Modal Tests]]
- [[_COMMUNITY_Event Bus Tests|Event Bus Tests]]
- [[_COMMUNITY_Storage Test Reset|Storage Test Reset]]
- [[_COMMUNITY_Local First Privacy|Local First Privacy]]
- [[_COMMUNITY_IndexedDB Stores|IndexedDB Stores]]
- [[_COMMUNITY_Circular Dependency Notes|Circular Dependency Notes]]
- [[_COMMUNITY_DOM Helper Concept|DOM Helper Concept]]
- [[_COMMUNITY_Task Counter Sync|Task Counter Sync]]
- [[_COMMUNITY_Browser API Mocks|Browser API Mocks]]

## God Nodes (most connected - your core abstractions)
1. `loadTasks()` - 28 edges
2. `ensureBoardsInitialized()` - 25 edges
3. `loadColumns()` - 21 edges
4. `loadLabels()` - 21 edges
5. `loadSettings()` - 19 edges
6. `getActiveBoardId()` - 17 edges
7. `keyFor()` - 14 edges
8. `listBoards()` - 14 edges
9. `saveTasks()` - 14 edges
10. `main()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Board JSON Import and Export` --references--> `Import Preflight and Compatibility Tests`  [INFERRED]
  docs/readme.md → client/tests/unit/importexport.test.js
- `Swim Lanes Feature` --references--> `Swimlane Utility Tests`  [INFERRED]
  docs/readme.md → client/tests/unit/swimlanes-utils.test.js
- `Sub-tasks Feature` --references--> `Task CRUD Unit Tests`  [INFERRED]
  docs/readme.md → client/tests/unit/tasks.test.js
- `Priority Constants` --references--> `Task Domain Object`  [EXTRACTED]
  client/src/modules/constants.js → AGENTS.md
- `showEditColumnModal` --shares_data_with--> `Column Domain Object`  [EXTRACTED]
  client/src/modules/column-modal.js → AGENTS.md

## Hyperedges (group relationships)
- **Core Domain Model** — agents_task_domain_object, agents_column_domain_object, agents_label_domain_object [EXTRACTED 1.00]
- **Frontend Entry Points** — index_main_board_ui, reports_dashboard_page, calendar_due_date_page, kanban_entrypoint [EXTRACTED 1.00]
- **Column Management Flow** — column_element_create, column_modal_initialize_handlers, columns_add_column, columns_update_column, columns_delete_column [INFERRED 0.86]
- **Task Due Date Rendering Flow** — dateutils_calculateDaysUntilDue, dateutils_formatCountdown, dateutils_getCountdownClassName, taskCard_createTaskElement, render_syncMovedTaskDueDate, notifications_getNotificationTasks [EXTRACTED 0.90]
- **Swimlane Board Flow** — render_renderBoard, swimlaneRenderer_renderSwimlaneBoard, swimlanes_groupTasksBySwimLane, swimlanes_buildBoardGrid, swimlanes_applySwimLaneAssignment, tasks_updateTaskPositionsFromDrop [EXTRACTED 0.88]
- **Modal Label Task Coordination** — modals_initializeModalHandlers, labelsModal_initializeLabelsModalHandlers, labelsModal_showLabelModal, taskModal_updateTaskLabelsSelection, labels_addLabel [EXTRACTED 0.86]
- **Swim Lane E2E Fixture Flow** — swimlanes_helpers_seedSwimlaneBoard, swimlanes_helpers_readIDBValue, swimlanes_dnd_suite, swimlanes_persistence_suite, swimlanes_toggle_suite [INFERRED 0.86]
- **Task Creation Plan Implementation** — task_creation_plan, create_task_suite, validation_missing_title_suite [INFERRED 0.84]
- **DOM Testing Support** — setup_mountToBody, accordion_test_createAccordionSection_toggle, msw_example_success_state_test, msw_example_error_state_test [INFERRED 0.78]
- **Unit Tests Cover Storage Domain Behavior** — storage_test_storage_crud_tests, storage_idb_test_idb_storage_tests, setup_test_unit_test_browser_mocks [EXTRACTED 1.00]
- **UUID Migration Coverage** — 2026_04_28_uuid_model_ids_uuid_model_ids, storage_idb_test_idb_storage_tests, importexport_test_import_preflight_tests, utils_test_uuid_tests [EXTRACTED 1.00]
- **PocketBase Backend Integration Flow** — 2026_04_04_pocketbase_backend_pb_auth, 2026_04_04_pocketbase_backend_pb_migration, 2026_04_04_pocketbase_backend_pb_storage, 2026_04_04_pocketbase_backend_app_settings [EXTRACTED 1.00]
- **Local-first Data Model Bundle** — data_models_task_model, data_models_column_model, data_models_label_model, data_models_settings_model, storage_storage, import_export_import_export [EXTRACTED 1.00]
- **Swim Lane Feature Bundle** — swimlanes_swim_lanes, settings_settings, tasks_tasks, labels_labels, columns_done_column_rules [EXTRACTED 1.00]
- **PocketBase Optional Backend Bundle** — 2026_04_04_pocketbase_backend_design_storage_adapter_pattern, 2026_04_04_pocketbase_backend_design_pocketbase_schema, 2026_04_04_pocketbase_backend_design_migration_flow, 2026_04_04_pocketbase_backend_design_user_isolation_rules, 2026_04_04_pocketbase_backend_design_read_only_offline_mode [EXTRACTED 1.00]
- **IndexedDB Migration Plan Components** — plan_migrate_to_indexeddb_indexeddb, plan_migrate_to_indexeddb_idb_wrapper, plan_migrate_to_indexeddb_async_storage_api, plan_migrate_to_indexeddb_localstorage_migration [EXTRACTED 1.00]
- **Swimlane Cell Collapse Implementation** — swimlane_column_collapse_make_cell_collapse_key, swimlane_column_collapse_is_swimlane_cell_collapsed, swimlane_column_collapse_toggle_swimlane_cell_collapsed, swimlane_column_collapse_swimlane_cell_collapsed_keys [EXTRACTED 1.00]
- **Release Automation Scripts** — prepare_release_release_preparation, prepare_release_update_changelog, extract_release_notes_release_notes_extraction [INFERRED 0.84]
- **AI-Agentic Engineering Pipeline** — image_1_human_goal_vision, image_1_product_definition_specification, image_1_plan_generation, image_1_execution_breakdown, image_1_implementation_via_sdlc, image_1_deployment_operations, image_1_feedback_learning_loop [EXTRACTED 1.00]
- **Audit Trail Outputs** — image_1_product_specs, image_1_plans, image_1_epics_tasks_code, image_1_tests, image_1_security_evidence, image_1_deployment_records [EXTRACTED 1.00]
- **Product Delivery Feedback Loop** — image_human_intent, image_product_specs, image_technical_planning, image_work_breakdown, image_sdlc_execution, image_deploy_operate, image_feedback_telemetry_defects_new_needs [EXTRACTED 1.00]

## Communities

### Community 0 - "Board Data Management"
Cohesion: 0.07
Nodes (78): applyBoardTemplate(), refreshBoardsModalList(), renderBoardsList(), renderBoardsSelect(), showBoardRenameModal(), showBoardsModal(), main(), addColumn() (+70 more)

### Community 1 - "Due Date Dragging"
Cohesion: 0.05
Nodes (60): calculateDaysUntilDue, formatCountdown, getCountdownClassName, alertDialog, confirmDialog, initColumnSortable, initDragDrop, initTaskSortables (+52 more)

### Community 2 - "Project Governance"
Cohesion: 0.04
Nodes (57): createAccordionSection, Column Domain Object, IndexedDB Storage, Kanvana, Label Domain Object, Local-first Kanban Board, GitHub Actions Release Process, renderBoard Refresh Pattern (+49 more)

### Community 3 - "Import Export Security"
Cohesion: 0.08
Nodes (36): boardNameFromFile(), buildExportMeta(), buildImportConfirmationMessage(), exportBoard(), getCurrentAppVersion(), getImportSections(), importTasks(), inspectImportPayload() (+28 more)

### Community 4 - "Board UI Templates"
Cohesion: 0.07
Nodes (43): Storage Adapter Pattern, Board UI, Drag and Drop Behavior, AI Agent Ops Starter Board, Board Templates, Project Management Board, Workflow Columns, Calendar Page (+35 more)

### Community 5 - "Label Task Modals"
Cohesion: 0.08
Nodes (29): createAccordionSection(), createLabelListItem(), getLabelsManagerSearchQuery(), groupLabels(), hideLabelModal(), hideLabelsModal(), populateLabelGroupSuggestions(), renderLabelsList() (+21 more)

### Community 6 - "Swimlane Rendering"
Cohesion: 0.12
Nodes (34): createSwimlaneCell(), renderSwimlaneBoard(), applySwimLaneAssignment(), buildBoardGrid(), getAvailableLabelGroupsFromCollection(), getAvailableLanes(), getAvailableSwimLaneLabelGroups(), getExplicitLaneValue() (+26 more)

### Community 7 - "Icons Notifications Theme"
Cohesion: 0.09
Nodes (24): renderIcons(), getNotificationTasks(), initializeNotifications(), isNotificationBannerHidden(), refreshNotifications(), renderNotificationBanner(), renderNotificationsModalContent(), setNotificationBannerHidden() (+16 more)

### Community 8 - "Board Settings Modals"
Cohesion: 0.1
Nodes (22): getBuiltInBoardTemplates(), initializeBoardsUI(), initializeBoardsModalHandlers(), populateTemplateSelect(), refreshBoardSelect(), refreshBrandText(), initializeColumnModalHandlers(), alertDialog() (+14 more)

### Community 9 - "Reports Analytics"
Cohesion: 0.15
Nodes (29): addDays(), bucketKeyForDate(), buildBarChartOption(), buildCfdOption(), buildDailyUpdatesOption(), buildLeadTimeOption(), computeCompletions(), computeCumulativeFlow() (+21 more)

### Community 10 - "Import Compatibility"
Cohesion: 0.1
Nodes (22): Done Column Role, Legacy ID Remapping, UUID Model IDs, Priority and App Constants, buildImportConfirmationMessage, Import Preflight and Compatibility Tests, inspectImportPayload, Board JSON Import and Export (+14 more)

### Community 11 - "Drag Drop Runtime"
Cohesion: 0.21
Nodes (12): autoScrollActiveTaskList(), clearCollapsedDropHover(), destroySortables(), initColumnSortable(), initDragDrop(), initTaskSortables(), isSwimlaneViewEnabled(), setCollapsedDropHover() (+4 more)

### Community 12 - "Task Creation Testing"
Cohesion: 0.17
Nodes (16): getTaskCount, Task Creation E2E Suite, taskModal, Seed Test Placeholder, Task Creation Edge Cases and Error Handling, Task Creation Happy Path Scenarios, Task Creation Cross-Column and Integration Scenarios, Task Creation Label Management Scenarios (+8 more)

### Community 13 - "Calendar View"
Cohesion: 0.24
Nodes (10): endOfMonth(), extractTaskDueDateIso(), formatIsoDate(), formatMonthKey(), groupTasksByDueDateForMonth(), isoDateOnly(), isTaskDone(), isTaskOverdue() (+2 more)

### Community 14 - "CRUD Unit Tests"
Cohesion: 0.13
Nodes (15): addColumn, Column CRUD Unit Tests, deleteColumn, toggleColumnCollapsed, updateColumn, addLabel, deleteLabel, Label CRUD Unit Tests (+7 more)

### Community 15 - "Release Automation"
Cohesion: 0.13
Nodes (15): assertVersion, findReleaseBlock, main, parseArgs, Release Notes Extraction, assertSupportedBumpType, buildReleaseBlock, bumpVersion (+7 more)

### Community 16 - "Agentic Workflow"
Cohesion: 0.19
Nodes (15): AI-Agentic Engineering Workflow, Artifacts / Audit Trail, Deployment & Operations, Deployment Records, Epics, Tasks, Code, Execution Breakdown, Feedback / Learning Loop, Human Goal / Vision (+7 more)

### Community 17 - "Swimlane Test Coverage"
Cohesion: 0.22
Nodes (14): Core Board Regression Coverage, Swimlane Coverage Gap Assessment and Expansion Plan, Secondary Pages and Navigation Coverage, Swim Lane Regression Expansion, dragByMouse, readTask, Swim Lane Drag and Drop Suite, writeIDBValue (+6 more)

### Community 18 - "Column Elements Events"
Cohesion: 0.19
Nodes (8): createColumnElement(), getTaskCountInColumn(), initColumnMenuCloseHandler(), sortColumnTasks(), sortTasksByDueDate(), sortTasksByPriority(), emit(), applyAndRerender()

### Community 19 - "Task Card Dates"
Cohesion: 0.27
Nodes (10): renderFragment(), calculateDaysUntilDue(), formatCountdown(), getCountdownClassName(), syncMovedTaskDueDate(), createTaskElement(), formatDisplayDate(), formatDisplayDateTime() (+2 more)

### Community 20 - "Column Validation Modal"
Cohesion: 0.27
Nodes (9): showColumnModal(), showEditColumnModal(), updateColumnColorHex(), clearFieldError(), showFieldError(), validateAndShowColumnNameError(), validateAndShowTaskTitleError(), validateColumnName() (+1 more)

### Community 21 - "PocketBase Backend Plan"
Cohesion: 0.15
Nodes (13): Docker Compose Stack, GHCR CI Docker Build, Nginx PocketBase Proxy, App Settings Backend UI, Optional PocketBase Backend, PocketBase Authentication Module, IDB to PocketBase Migration, PocketBase Storage Adapter (+5 more)

### Community 22 - "DevOps Architecture"
Cohesion: 0.17
Nodes (12): CI/CD Pipeline, Docker & DevOps Design, Nginx Proxy, PocketBase Isolation, Static Frontend, VPS Deployment, AI Agent Authentication, IDB to PocketBase Migration Flow (+4 more)

### Community 23 - "Prepare Release Script"
Cohesion: 0.35
Nodes (10): assertSupportedBumpType(), buildReleaseBlock(), bumpVersion(), extractSections(), main(), parseArgs(), todayIsoDate(), updateChangelog() (+2 more)

### Community 24 - "Swimlane E2E Helpers"
Cohesion: 0.25
Nodes (3): readTask(), readIDBSettings(), readIDBValue()

### Community 25 - "DOM MSW Tests"
Cohesion: 0.32
Nodes (8): createAccordionSection Toggle Test, exampleApiUrl, MSW Handlers, MSW Error State Test, loadExampleItems, MSW Success State Test, MSW Test Server, mountToBody

### Community 26 - "Performance Fixtures"
Cohesion: 0.25
Nodes (8): Performance Board Fixture, Drag and Drop Performance Suite, dateOffset, dateString, generateId, Performance Task Generation, randomItem, randomItems

### Community 27 - "Subtasks Helpers"
Cohesion: 0.43
Nodes (5): addSubTask(), openAddTaskModal(), openEditTaskModal(), subtaskInput(), taskModal()

### Community 28 - "Subtasks E2E"
Cohesion: 0.33
Nodes (7): addSubTask, openAddTaskModal, openEditTaskModal, subtaskInput, subtasksList, Sub-tasks E2E Suite, subtasks taskModal

### Community 29 - "IndexedDB Migration"
Cohesion: 0.29
Nodes (7): Async Storage API, fake-indexeddb, idb Wrapper, IndexedDB, Kanvana Storage Migration, localStorage Limitations, One-time localStorage Migration

### Community 30 - "Logo Assets"
Cohesion: 0.33
Nodes (7): Abstract Leaf Flower Mark, Embedded PNG Reference Image, Inkscape SVG Document, Kanban Column Bar Motif, Kanvana Color Logo, kanvana-vector-logo.svg Docname, Multicolor Gradient Palette

### Community 31 - "Product Workflow Loop"
Cohesion: 0.33
Nodes (7): Deploy & Operate, Feedback, Telemetry, Defects, New Needs, Human Intent, Product Specs, SDLC Execution, Technical Planning, Work Breakdown

### Community 33 - "Normalization Tests"
Cohesion: 0.33
Nodes (6): Normalization Unit Tests, normalizeDueDate, normalizeHexColor, normalizePriority, normalizeStringKeys, normalizeSubTasks

### Community 34 - "Swimlane Utilities"
Cohesion: 0.33
Nodes (6): Swim Lanes Feature, buildBoardGrid, getSwimLaneValue, groupTasksBySwimLane, moveTask, Swimlane Utility Tests

### Community 35 - "Swimlane Collapse"
Cohesion: 0.33
Nodes (6): Swimlane Cell Collapse, Composite Cell Collapse Key, isSwimLaneCellCollapsed, makeCellCollapseKey, swimLaneCellCollapsedKeys, toggleSwimLaneCellCollapsed

### Community 36 - "Architecture Review"
Cohesion: 0.33
Nodes (6): Personal Kanban Board Architectural Review, DOM as State Source, h() DOM Helper, modals.js God Module, render.js God Module, Shared Normalizers

### Community 37 - "Release Notes Script"
Cohesion: 0.7
Nodes (4): assertVersion(), findReleaseBlock(), main(), parseArgs()

### Community 38 - "Test Configuration"
Cohesion: 0.4
Nodes (5): Testing Stack, Playwright E2E Configuration, Playwright Test Report HTML, Vitest DOM Test Configuration, Vitest Unit Test Configuration

### Community 40 - "Due Date Tests"
Cohesion: 0.5
Nodes (4): calculateDaysUntilDue, Due Date Countdown Tests, formatCountdown, getCountdownClassName

### Community 41 - "Product Engineering Flow"
Cohesion: 0.67
Nodes (4): Human Intent, Product-First Engineering Flow, Product Specs, SDLC Execution

### Community 42 - "Playwright Reports"
Cohesion: 0.5
Nodes (4): Image Diff Viewer, Playwright Test Report, React Report UI, Test Attachments

### Community 43 - "Impressum Encoding"
Cohesion: 1.0
Nodes (2): decodeText(), formatEmailSnippet()

### Community 46 - "Linkify Tests"
Cohesion: 0.67
Nodes (3): linkifyText Test Suite, renderFragment, updateDescriptionLinks Modal Preview Test Suite

### Community 47 - "Validation Unit Tests"
Cohesion: 0.67
Nodes (3): validateColumnName, validateTaskTitle, Validation Unit Tests

### Community 48 - "Spec Sync Utility"
Cohesion: 0.67
Nodes (3): getArg, getChangedFiles, Spec Sync Check

### Community 55 - "Boards Modal Tests"
Cohesion: 1.0
Nodes (2): Boards Management E2E Suite, openBoardsModal

### Community 56 - "Event Bus Tests"
Cohesion: 1.0
Nodes (2): Event Bus Unit Tests, on/off/emit

### Community 57 - "Storage Test Reset"
Cohesion: 1.0
Nodes (2): resetLocalStorage, _resetStorageForTesting

### Community 58 - "Local First Privacy"
Cohesion: 1.0
Nodes (2): IndexedDB Privacy Model, Kanvana Local-first Browser Kanban

### Community 59 - "IndexedDB Stores"
Cohesion: 1.0
Nodes (2): kanvana-db, IndexedDB Object Stores

### Community 60 - "Circular Dependency Notes"
Cohesion: 1.0
Nodes (2): Dynamic Import Circular Dependencies, Event Bus Recommendation

### Community 85 - "DOM Helper Concept"
Cohesion: 1.0
Nodes (1): h DOM Helper

### Community 86 - "Task Counter Sync"
Cohesion: 1.0
Nodes (1): syncTaskCounters

### Community 87 - "Browser API Mocks"
Cohesion: 1.0
Nodes (1): Unit Test Browser API Mocks

## Knowledge Gaps
- **167 isolated node(s):** `Specification Governance`, `GitHub Actions Release Process`, `Docker Compose Stack`, `Clickable Task Description URLs`, `IndexedDB Migration` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Impressum Encoding`** (3 nodes): `impressum.js`, `decodeText()`, `formatEmailSnippet()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Boards Modal Tests`** (2 nodes): `Boards Management E2E Suite`, `openBoardsModal`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Bus Tests`** (2 nodes): `Event Bus Unit Tests`, `on/off/emit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Storage Test Reset`** (2 nodes): `resetLocalStorage`, `_resetStorageForTesting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Local First Privacy`** (2 nodes): `IndexedDB Privacy Model`, `Kanvana Local-first Browser Kanban`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IndexedDB Stores`** (2 nodes): `kanvana-db`, `IndexedDB Object Stores`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Circular Dependency Notes`** (2 nodes): `Dynamic Import Circular Dependencies`, `Event Bus Recommendation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DOM Helper Concept`** (1 nodes): `h DOM Helper`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task Counter Sync`** (1 nodes): `syncTaskCounters`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Browser API Mocks`** (1 nodes): `Unit Test Browser API Mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadTasks()` connect `Board Data Management` to `Import Export Security`, `Label Task Modals`, `Icons Notifications Theme`, `Reports Analytics`, `Column Elements Events`, `Task Card Dates`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `loadLabels()` connect `Board Data Management` to `Import Export Security`, `Label Task Modals`, `Swimlane Rendering`, `Icons Notifications Theme`, `Task Card Dates`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `main()` connect `Reports Analytics` to `Board Data Management`, `Icons Notifications Theme`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `loadTasks()` (e.g. with `deleteLabel()` and `exportTasks()`) actually correct?**
  _`loadTasks()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `ensureBoardsInitialized()` (e.g. with `initializeBoardsUI()` and `main()`) actually correct?**
  _`ensureBoardsInitialized()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `loadColumns()` (e.g. with `exportTasks()` and `showModal()`) actually correct?**
  _`loadColumns()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `loadLabels()` (e.g. with `addLabel()` and `updateLabel()`) actually correct?**
  _`loadLabels()` has 15 INFERRED edges - model-reasoned connections that need verification._
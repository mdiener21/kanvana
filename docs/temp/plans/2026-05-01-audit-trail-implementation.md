# Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two-log audit trail from `docs/superpowers/specs/2026-04-29-audit-trail-prd.md`: task-embedded `activityLog[]` plus board-scoped event log.

**Architecture:** Use `activity-log.js` as the single event construction and append module. Store task events on task objects and board events under a board-scoped IndexedDB `kv` key. Render task events in the task modal and board events on a new Activity page.

**Tech Stack:** Vanilla JavaScript ES modules, IndexedDB through existing `idb` wrapper, Vitest unit tests, Vitest DOM tests, Vite build.

---

## Baseline

- Fresh worktree: `/home/mdiener/dev/kanvana/.worktrees/audit-trail-build`
- Branch: `feature/audit-trail-build`
- `npm run test:unit`: passing before feature work
- `npm run test:dom`: passing before feature work
- `npm test`: E2E baseline has 14 unrelated failures around legacy column IDs/swimlanes/subtasks. User approved proceeding with `test:unit`, `test:dom`, and `build` verification.

## Files

- Create: `client/src/modules/activity-log.js` for event envelopes, actor validation, task event append, board event append/read helpers.
- Create: `client/src/modules/activity-log-ui.js` for formatting and rendering task and board activity lists.
- Create: `client/src/activity.html` for board activity page entry.
- Create: `client/src/modules/activity.js` for board activity page startup and render.
- Modify: `client/src/modules/normalize.js` to add `normalizeActivityLog()`.
- Modify: `client/src/modules/storage.js` to default task `activityLog`, persist board event logs, delete event keys on board delete, and expose public helpers.
- Modify: `client/src/modules/importexport.js` to round-trip task activity logs and board events.
- Modify: `client/src/modules/tasks.js` to emit task activity and `task.deleted` board events.
- Modify: `client/src/modules/columns.js` to emit column board events and task deletion board events for column deletion.
- Modify: `client/src/modules/labels.js` to emit task label removal events when deleting labels.
- Modify: `client/src/modules/task-modal.js` and `client/src/index.html` to add task Activity accordion.
- Modify: `client/src/modules/icons.js`, `client/src/styles/index.css`, and component CSS for Activity UI.
- Modify: `client/vite.config.js` to include the Activity page entry.
- Modify: `CHANGELOG.md` and `docs/system/spec/*.md` to keep contracts synchronized.

## Task 1: Core Audit Module And Storage

**Files:**
- Create: `client/src/modules/activity-log.js`
- Modify: `client/src/modules/normalize.js`
- Modify: `client/src/modules/storage.js`
- Test: `client/tests/unit/activity-log.test.js`
- Test: `client/tests/unit/normalize.test.js`
- Test: `client/tests/unit/storage-idb.test.js`

- [ ] Add one failing behavior test for event envelope creation: valid `task.created` includes `type`, ISO `at`, caller-supplied actor, and details.
- [ ] Implement minimal `createActivityEvent(type, details, actor, at = new Date().toISOString())` and `DEFAULT_HUMAN_ACTOR` in `activity-log.js`.
- [ ] Add one failing behavior test that invalid actors throw and valid human/agent/user actors pass.
- [ ] Implement actor validation.
- [ ] Add one failing behavior test that `appendTaskActivity(task, event)` initializes missing `activityLog` and returns a task with appended event.
- [ ] Implement `appendTaskActivity()` without mutating unrelated fields.
- [ ] Add one failing behavior test for `normalizeActivityLog()`: non-array returns `[]`, malformed entries drop, valid entries preserve.
- [ ] Implement `normalizeActivityLog()` in `normalize.js`.
- [ ] Add one failing storage behavior test: board events written for active board survive `_flushPersistsForTesting()` and reload.
- [ ] Add storage helpers: `loadBoardEvents(boardId)`, `saveBoardEvents(boardId, events)`, `appendBoardEvent(boardId, event)`, `getBoardEventsKey(boardId)`.
- [ ] Normalize task `activityLog` on all storage/import load paths that construct task objects.
- [ ] Run `npm run test:unit -- activity-log normalize storage-idb` until green.

## Task 2: Task Mutation Events

**Files:**
- Modify: `client/src/modules/tasks.js`
- Modify: `client/src/modules/labels.js`
- Test: `client/tests/unit/tasks.test.js`
- Test: `client/tests/unit/labels.test.js`

- [ ] Add one failing test for `addTask()`: created task has a `task.created` event with `{ column, columnName }`.
- [ ] Implement task creation logging using `createActivityEvent()` and `appendTaskActivity()`.
- [ ] Add one failing test for `updateTask()`: title/description/priority/due date changes produce expected events, and description stores only `{ changed: true }`.
- [ ] Implement field diff logging in `updateTask()`.
- [ ] Add one failing test for column move: `columnHistory` still updates and `activityLog` adds `task.column_moved` using same move.
- [ ] Implement column move logging in modal update and drag/drop update paths.
- [ ] Add one failing test for labels and relationships: added/removed labels and relationships emit per-change task events.
- [ ] Implement label and relationship diff logging, including inverse relationship mutations where existing public behavior changes target tasks.
- [ ] Add one failing test for `deleteTask()`: board event log contains `task.deleted` with `{ taskId, taskTitle, column, columnName }`.
- [ ] Implement task deletion board event before task removal.
- [ ] Add one failing test for label deletion: affected tasks get `task.label_removed` events.
- [ ] Implement label deletion logging before `saveTasks()`.
- [ ] Run `npm run test:unit -- tasks labels activity-log` until green.

## Task 3: Column Events And Import/Export

**Files:**
- Modify: `client/src/modules/columns.js`
- Modify: `client/src/modules/importexport.js`
- Test: `client/tests/unit/columns.test.js`
- Test: `client/tests/unit/importexport.test.js`

- [ ] Add one failing test for column create/rename/reorder/delete board events.
- [ ] Implement `column.created`, `column.renamed`, `column.reordered`, and `column.deleted` logging.
- [ ] Add one failing test for column deletion: board log records `tasksDestroyed` and one `task.deleted` event per destroyed task.
- [ ] Implement column deletion destructive-event logging before task removal.
- [ ] Add one failing import/export test: task `activityLog` round-trips through exported board JSON.
- [ ] Preserve task `activityLog` in export and normalize it on import.
- [ ] Add one failing import/export test: board events round-trip through exported board JSON and import as new board-scoped events.
- [ ] Include `boardEvents` in board export payload and save normalized events during import.
- [ ] Run `npm run test:unit -- columns importexport activity-log` until green.

## Task 4: Activity UI

**Files:**
- Create: `client/src/modules/activity-log-ui.js`
- Create: `client/src/activity.html`
- Create: `client/src/modules/activity.js`
- Modify: `client/src/index.html`
- Modify: `client/src/modules/task-modal.js`
- Modify: `client/src/modules/icons.js`
- Modify: `client/src/styles/index.css`
- Modify: `client/vite.config.js`
- Test: `client/tests/dom/activity-log-ui.test.js`
- Test: `client/tests/dom/activity-page.test.js`

- [ ] Add one failing DOM test: task Activity section renders collapsed by default and expands to newest-first events.
- [ ] Implement `formatActivityEvent()`, `createTaskActivitySection()`, and modal integration.
- [ ] Add one failing DOM test: empty task activity renders "No activity yet".
- [ ] Implement empty state.
- [ ] Add one failing DOM test: board Activity page renders board events newest-first.
- [ ] Implement `activity.html`, `activity.js`, Vite input, nav link, icon mapping, and minimal styles using existing tokens.
- [ ] Run `npm run test:dom -- activity` until green.

## Task 5: Docs And Verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/specification-kanban.md`
- Modify: `docs/system/spec/data-models.md`
- Modify: `docs/system/spec/storage.md`
- Modify: `docs/system/spec/tasks.md`
- Modify: `docs/system/spec/columns.md`
- Modify: `docs/system/spec/import-export.md`
- Modify: `docs/system/spec/testing.md`

- [ ] Add `### Added` changelog entry under `## [Unreleased]` for task Activity log and board Activity page.
- [ ] Document task `activityLog[]`, board event log, actor shape, event envelope, and event type payloads.
- [ ] Document import/export preservation and malformed log normalization.
- [ ] Update spec ownership map for new modules and page.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run test:dom`.
- [ ] Run `npm run build`.
- [ ] Report E2E baseline remains skipped/deferred due pre-existing failures unless user asks to fix.

## Review Checklist

- [ ] Every audit event is created through `activity-log.js`; no inline event object construction in mutation modules.
- [ ] Description events never store description content.
- [ ] Task deletion board event is written before deleting task.
- [ ] Column deletion logs `column.deleted` and task deletion summaries before deleting tasks.
- [ ] `columnHistory` remains intact and still used for reports.
- [ ] Existing boards load with empty `activityLog` and no errors.
- [ ] Import accepts missing/malformed logs and drops bad entries.

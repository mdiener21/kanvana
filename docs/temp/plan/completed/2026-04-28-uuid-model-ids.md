# UUID Model IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every board, task, column, and label model with a UUID `id` while preserving import/export compatibility with legacy string IDs.

**Architecture:** Add UUID-aware normalization at storage and import boundaries. Represent the permanent Done column by `role: "done"` rather than the literal `done` ID, and migrate all references when legacy IDs are encountered.

**Tech Stack:** Vanilla JavaScript ES modules, IndexedDB via `idb`, Vitest unit tests.

---

### Task 1: ID Normalization Boundaries

**Files:**
- Modify: `client/src/modules/storage.js`
- Modify: `client/src/modules/importexport.js`
- Test: `client/tests/unit/storage-idb.test.js`
- Test: `client/tests/unit/importexport.test.js`

- [ ] Add helpers for UUID detection, legacy ID remapping, and Done role detection.
- [ ] Normalize boards, columns, labels, tasks, and settings when loading from IDB/localStorage and before saving imported board payloads.
- [ ] Rewrite references for `task.column`, `task.columnHistory[].column`, `task.labels[]`, `task.swimlaneLabelId`, and `relationships[].targetTaskId`.
- [ ] Keep legacy import/export payloads accepted while persisting imported models with UUID ids.

### Task 2: Done Column Role

**Files:**
- Modify: `client/src/modules/constants.js`
- Modify: `client/src/modules/storage.js`
- Modify: `client/src/modules/tasks.js`
- Modify: `client/src/modules/columns.js`
- Modify: `client/src/modules/importexport.js`
- Modify: `client/src/modules/reports.js`
- Modify: `client/src/modules/notifications.js`
- Modify: `client/src/modules/swimlanes.js`
- Modify: `client/src/modules/task-modal.js`

- [ ] Add `DONE_COLUMN_ROLE = "done"` and helpers/imports where needed.
- [ ] Replace literal `done` behavior checks with role-aware checks derived from the current board columns.
- [ ] Ensure new and normalized Done columns have a UUID id and `role: "done"`.
- [ ] Preserve the rule that the Done column is permanent and cannot be deleted.

### Task 3: Defaults and Templates

**Files:**
- Modify: `client/src/modules/storage.js`
- Modify: `client/src/modules/boards.js`
- Test: `client/tests/unit/storage.test.js`

- [ ] Generate UUID IDs for the default board, default columns, and default labels.
- [ ] Generate UUID IDs for newly created boards, columns, and labels without slug prefixes.
- [ ] Normalize built-in board templates through the same import-style remapper before saving them to a newly created board.

### Task 4: Tests, Docs, Verification

**Files:**
- Modify: `client/tests/unit/storage.test.js`
- Modify: `client/tests/unit/storage-idb.test.js`
- Modify: `client/tests/unit/importexport.test.js`
- Modify: `docs/system/spec/data-models.md`
- Modify: `docs/system/spec/storage.md`
- Modify: `docs/system/spec/import-export.md`
- Modify: `docs/system/spec/columns.md`
- Modify: `CHANGELOG.md`

- [ ] Assert new boards, columns, labels, and imported legacy payloads persist UUID ids.
- [ ] Assert legacy `done` imports are remapped to a UUID Done column with `role: "done"`.
- [ ] Document UUID ID requirements, Done role semantics, and compatibility migration.
- [ ] Run `npm run test:unit` from `client/` and fix regressions.

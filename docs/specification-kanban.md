# Personal Kanban Board Specification

This file is the entrypoint to the canonical application specification. Detailed product, data, and workflow rules live in focused files under `docs/spec/`.

## Canonical Spec Map

- `docs/spec/overview.md` - architecture, technology rules, module map, rendering foundations, CSS architecture
- `docs/spec/data-models.md` - persisted models and settings shape
- `docs/spec/storage.md` - localStorage keys, migration, persistence scope
- `docs/spec/board-ui.md` - board shell, controls, modals, rendering, warnings, drag/drop behavior
- `docs/spec/tasks.md` - task model usage, modal behavior, card display, ordering
- `docs/spec/columns.md` - column CRUD, collapse, sorting, Done rules
- `docs/spec/labels.md` - label groups, management modal, validation, assignment
- `docs/spec/swimlanes.md` - swim lane layout, grouping rules, collapse, mobile behavior
- `docs/spec/settings.md` - per-board settings and swim lane controls
- `docs/spec/notifications.md` - banner and modal notification behavior
- `docs/spec/reports.md` - reports calculations and layout rules
- `docs/spec/calendar.md` - due-date calendar behavior
- `docs/spec/import-export.md` - board JSON import/export rules and compatibility expectations
- `docs/spec/relationships.md` - task relationship types, bidirectional sync, card display, modal UI
- `docs/spec/testing.md` - testing stack, scripts, and coverage focus

## Update Policy

- Every code change that adds, changes, or removes product behavior must update `CHANGELOG.md` in the same work session.
- Every code change that affects functionality, data shape, storage, UI behavior, or workflow rules must also update the relevant file in `docs/spec/` in the same work session.
- Update this index file when the spec structure, ownership map, or update process changes.
- If contributor workflow or module structure changes, also update `CLAUDE.md` and `.github/copilot-instructions.md`.

## Ownership Map

Use this mapping to decide which spec files to update alongside code changes.

- `src/modules/storage.js` -> `docs/spec/storage.md`, `docs/spec/data-models.md`
- `src/modules/importexport.js` -> `docs/spec/import-export.md`, `docs/spec/storage.md`, `docs/spec/data-models.md`
- `src/modules/tasks.js` -> `docs/spec/tasks.md`, `docs/spec/data-models.md`, `docs/spec/relationships.md`
- `src/modules/normalize.js`, `src/modules/task-modal.js`, `src/modules/task-card.js` -> `docs/spec/relationships.md` and any affected feature spec files
- `src/modules/columns.js` -> `docs/spec/columns.md`
- `src/modules/labels.js` -> `docs/spec/labels.md`
- `src/modules/swimlanes.js` -> `docs/spec/swimlanes.md`, `docs/spec/settings.md`, `docs/spec/data-models.md`
- `src/modules/settings.js` -> `docs/spec/settings.md`
- `src/modules/notifications.js` -> `docs/spec/notifications.md`, `docs/spec/tasks.md`
- `src/modules/reports.js` -> `docs/spec/reports.md`
- `src/modules/calendar.js` -> `docs/spec/calendar.md`
- `src/modules/render.js`, `src/modules/dragdrop.js`, `src/index.html`, `src/styles/**` -> `docs/spec/board-ui.md` and any affected feature spec files
- `tests/**`, `playwright.config.js`, `vitest*.config.js` -> `docs/spec/testing.md` and `docs/testing-strategy.md` when strategy or naming conventions change

## Contributor Workflow

When making a change:

1. Identify the affected code area.
2. Update the matching `docs/spec/*.md` file or files.
3. Update `CHANGELOG.md` under `Unreleased`.
4. Update this index only if the spec structure, ownership map, or process changed.

## Related Docs

- `docs/help-how-to.md` - canonical in-app help copy
- `docs/testing-strategy.md` - deeper testing architecture and naming conventions
- `CLAUDE.md` - contributor workflow and repository guidance
- `.github/copilot-instructions.md` - AI contributor guidance aligned with the same spec structure

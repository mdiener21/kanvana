# Import and Export

## Export Behavior

- Export combines the selected board's `boardName`, tasks, columns, labels, and settings into one JSON file
- Import/export actions are accessed from Manage Boards; the main toolbar does not provide separate import/export buttons
- Board-management export can export a chosen board directly
- Export writes metadata in `exportMeta` including `appVersion`, `schemaVersion`, and `exportedAt`
- Export filenames use `{boardName}-YYYY-MM-DD.json`
- Export runs the same strict structural validation used by import preview; when invalid references are found, export is blocked and the user gets actionable guidance
- Exported current data uses UUID model IDs for boards, tasks, columns, and labels
- The Done column is exported with `role: "done"`

## Import Behavior

- Import creates a new board from JSON rather than overwriting an existing board
- Imported settings are restored when present
- When `boardName` exists in the file, it becomes the new board name
- Import warns that a new board will be created and the UI will switch to it
- Import performs a preflight review before saving any data: file size is checked first, the JSON shape is validated, and the user must confirm a summary of counts and warnings before the new board is created
- Imports above the supported size limit are rejected, and unusually large but still supported imports show a caution message before confirmation
- Imports reject schema mismatches such as malformed sections or task references to unknown imported columns
- Unknown task column references are rejected with explicit manual-fix instructions (add the missing column ids in `columns[]` or remap `task.column` to an existing id)
- When imported tasks reference labels not present in the imported label list, those missing label references are dropped and surfaced as a warning during the preflight review
- Legacy imported IDs, including `done`, `todo`, slug label IDs, and prefixed board IDs, are remapped to UUIDs before persistence
- Import rewrites task column references, column history entries, task labels, swim lane label IDs, and task relationship target IDs when IDs are remapped

## Compatibility Rules

- Import must preserve backward compatibility with older shapes where feasible
- If the persisted schema changes, update import normalization and export serialization in the same change
- Import/export must round-trip current board data, labels, columns, settings, and lane metadata

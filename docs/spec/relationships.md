# Relationships

## Overview

Tasks can optionally be linked to one or more other tasks using typed relationships. Relationships communicate dependencies and connections between work items. They are optional — tasks without relationships behave exactly as before.

## Relationship Types

| Type | Meaning | Inverse |
|---|---|---|
| `prerequisite` | Another task must be completed before this one can begin | `dependent` |
| `dependent` | This task is needed by another task before that task can begin | `prerequisite` |
| `related` | A general connection between two tasks without implying order | `related` |

## Bidirectional Sync

- Relationships are always stored on **both** tasks in a pair.
- Adding a relationship on Task A automatically creates the inverse on Task B.
- Removing a relationship on Task A automatically removes the inverse on Task B.
- Inverse pairs: `prerequisite` ↔ `dependent`, `related` ↔ `related`.
- All 3 types are manually selectable. Adding `dependent → B` on Task A auto-creates `prerequisite → A` on Task B — equivalent to adding `prerequisite → B` on Task B directly.

## One Relationship Per Pair

- A task pair can have at most one relationship type at a time.
- If a relationship already exists between Task A and Task B, adding a new type replaces the existing one and updates both sides atomically.
- Already-linked tasks appear in the search results with their current type shown so the user can see the existing relationship before replacing it.

## Data Model

Each task stores its relationships as an array on the task object:

```javascript
{
  // ...other task fields
  relationships: [
    { type: "prerequisite" | "dependent" | "related", targetTaskId: "uuid" }
  ]
}
```

- `type` — one of `prerequisite`, `dependent`, `related`
- `targetTaskId` — UUID of the linked task
- Default: `[]` (empty array) for all tasks, including existing tasks on load
- Deduplication: only one entry per `targetTaskId` is allowed

## Short ID Format

- Tasks are identified in the relationships UI using a short ID: `#` followed by the last 5 characters of the task UUID.
- Example: a task with ID `a1b2c3d4-e5f6-7890-abcd-ef1234ae2ry5` displays as `#ae2ry`.
- Short IDs are display-only; storage always uses the full UUID.

## Card Display

- Task cards show a relationship indicator only when `task.relationships.length > 0`.
- The indicator uses the `git-branch` Lucide icon followed by the text `relationships (N)` where N is the count.
- The indicator is placed below the labels section, above the footer.
- No relationship indicator is shown when the count is zero.

## Modal UI

### Relationships Fieldset

- The task edit modal includes a "Relationships" fieldset below the Labels fieldset in the right column.
- The fieldset contains:
  - An active relationships list showing current relationships as badges
  - A type selector (`<select>`) with options: Prerequisite, Dependent, Related
  - A search input for finding tasks by short ID or title
  - A results dropdown (autocomplete)

### Relationship Badges

- Each active relationship is displayed as a compact pill badge.
- Badge content: type label + short ID (e.g. `prerequisite #ae2ry`)
- Badges are color-coded by type (subtle background color per type).
- Each badge has a remove button (×) to delete that relationship.
- Clicking the short ID portion of a badge opens the linked task in the edit modal.

### Search and Autocomplete

- The search input filters all tasks on the current board (excluding the task being edited and done tasks).
- Filtering matches against:
  - Short ID prefix: typing `#ae` matches tasks whose last-5 UUID chars start with `ae`
  - Title substring: case-insensitive match anywhere in the title
- Up to 8 results are shown in the dropdown.
- Already-linked tasks appear in results with their current type indicated (e.g. `[prerequisite] Task B #ae2ry`).
- Selecting a result adds it to the active relationships using the currently selected type. If the task is already linked, the type is replaced.
- The search input and results are cleared after a selection.
- Clicking outside the results dropdown closes it.

### Persistence

- Relationships are saved when the task form is submitted (same as other task fields).
- The bidirectional sync (auto-create/remove inverse) is applied at save time in `tasks.js`.
- All affected tasks (the edited task and any target tasks) are saved in a single `saveTasks()` call.

## Normalization

- `normalizeRelationships(value)` in `normalize.js` ensures the field is always a valid array.
- Entries with missing or invalid `type`, or missing/empty `targetTaskId`, are dropped.
- Duplicate `targetTaskId` entries are deduplicated (first occurrence kept).
- Applied on load in `loadTasks()` to handle existing tasks and imported data.

## Import / Export

- `relationships` is included in board JSON export as part of each task object.
- On import, `normalizeRelationships()` is applied to each task's relationships field.
- Bidirectional sync is not re-applied on import — both sides are expected to already be present in the exported data.

## Update Requirements

Update this file when you change:

- relationship types or their inverses
- bidirectional sync rules
- short ID format or display
- card indicator behavior
- modal UI structure or search behavior
- data model shape or normalization rules
- import/export handling for relationships

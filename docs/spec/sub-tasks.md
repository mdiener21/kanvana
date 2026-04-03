# Sub-tasks

## Overview

Sub-tasks are lightweight checklist items scoped to a parent task. They are not independent board cards and are not visible outside the task they belong to.

## Data Model

Each task may contain a `subTasks` array. Each entry has:

- `id` — unique string identifier
- `title` — required non-empty string
- `completed` — boolean
- `order` — integer position within the parent task

Sub-tasks do not support labels, relationships, priorities, due dates, or column placement.

## Create and Edit

- Sub-tasks are created, edited, deleted, and reordered inside the task edit modal
- A **Sub-tasks** fieldset appears below the Relationships fieldset in the right column of the modal
- Quick-add: type a title in the input field and press **Enter** to append a new sub-task
- Blank or whitespace-only input is ignored
- Each sub-task title can be edited inline by clicking it; an input field appears in place of the title
  - Press **Enter** or blur to commit; press **Escape** to cancel and restore the original title
  - Committing an empty string is a no-op (original title is preserved)
- Each sub-task has a delete button that removes it from the list immediately

## Ordering

- Sub-tasks can be reordered via drag and drop using a drag handle on the left of each item
- Order is updated in memory as items are dragged and is persisted when the modal is saved

## Completion

- Each sub-task has a checkbox; checking it marks it complete, unchecking reverts it
- Completed sub-tasks are visually distinct: title is struck through and muted
- Completing all sub-tasks does **not** automatically move the parent task to Done

## Progress Legend

- The Sub-tasks fieldset legend shows a `completed / total` counter when at least one sub-task exists (e.g. `2 / 5`)
- The counter updates immediately when a checkbox is toggled
- No counter is shown when the task has no sub-tasks

## Sub-tasks on Task Cards

- If a task has one or more sub-tasks, the card footer row includes a donut circle progress indicator and a `completed/total Done` label
- The donut stroke is blue by default; it turns green when all sub-tasks are completed
- The indicator is inline in the footer alongside due date and age
- If a task has no sub-tasks, no indicator is shown

## Persistence

- Sub-tasks are stored in the `subTasks` array on the parent task object in IndexedDB
- `subTasks` defaults to `[]` for tasks that have no sub-tasks, including tasks created before this feature
- The storage migration in `loadTasks()` normalizes the field on every load, so existing boards are unaffected

## Import and Export

- `subTasks` is included in board JSON exports
- On import, `subTasks` is normalized via `normalizeSubTasks()`: entries with missing or empty `id` or `title` are dropped, `completed` is coerced to boolean, and `order` defaults to index position if absent
- Boards exported before this feature was introduced will import cleanly with `subTasks: []` on all tasks

## Update Requirements

Update this file when you change:

- the sub-task data model or validation rules
- the modal UI for creating, editing, deleting, or reordering sub-tasks
- the completion or progress logic
- the card progress indicator layout or coloring rules
- import/export handling of sub-tasks

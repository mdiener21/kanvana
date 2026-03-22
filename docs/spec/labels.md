# Labels

## Label Model and Grouping

- Labels have `id`, `name`, `color`, and optional `group`
- Groups are simple strings and are not stored as a separate entity
- Task cards display only label name and color, not the group name
- Built-in board templates may ship grouped starter labels tailored to a workflow, such as Agent, Workstream, or Artifact groupings

## Manage Labels Modal

- Dedicated management modal lists labels with color swatch, name, and edit/delete actions
- Search filters labels by name or group using case-insensitive substring matching
- Labels are grouped in accordion sections by label group, with `Ungrouped` for labels without a group
- The first accordion section is expanded by default and sections toggle independently

## Create and Edit

- Label create/edit form includes name, group, color picker, and editable hex field
- Group input offers datalist autocomplete from existing groups
- Color picker and hex field stay synchronized bidirectionally
- Invalid hex values show inline validation and block save

## Assignment

- Tasks can have multiple labels
- Task modal organizes available labels by group
- Labels can be created inline from task editing without dismissing the task modal

## Delete Behavior

- Deleting a label requires confirmation
- Deleting a label removes it from all tasks

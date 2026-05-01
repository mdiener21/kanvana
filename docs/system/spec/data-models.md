# Data Models

## Board Model

```javascript
{
  id: "uuid",
  name: "Board Name",
  createdAt: "YYYY-MM-DDTHH:MM:SSZ"
}
```

## Task Model

```javascript
{
  id: "uuid",
  title: "task title",
  description: "optional longer description",
  priority: "urgent" | "high" | "medium" | "low" | "none",
  dueDate: "YYYY-MM-DD" | "",
  column: "column-uuid",
  order: number,
  labels: ["label-uuid-1", "label-uuid-2"],
  swimlaneLabelId: "label-uuid" | "",
  swimlaneLabelGroup: "Group Name" | "",
  creationDate: "YYYY-MM-DDTHH:MM:SSZ",
  changeDate: "YYYY-MM-DDTHH:MM:SSZ",
  doneDate: "YYYY-MM-DDTHH:MM:SSZ",
  columnHistory: [
    { column: "column-uuid", at: "YYYY-MM-DDTHH:MM:SSZ" }
  ],
  relationships: [
    { type: "prerequisite" | "dependent" | "related", targetTaskId: "uuid" }
  ]
}
```

### Task Field Notes

- `priority` uses the stable order `urgent`, `high`, `medium`, `low`, `none`
- `dueDate` is stored as `YYYY-MM-DD`
- `changeDate` updates on task save and on column changes
- `doneDate` exists only while the task is in the Done column
- `columnHistory` is appended when a task changes columns and powers cumulative-flow reporting
- `swimlaneLabelId` and `swimlaneLabelGroup` preserve explicit swim lane assignment metadata
- `relationships` defaults to `[]`; each entry stores a `type` (`prerequisite`, `dependent`, or `related`) and the UUID `targetTaskId` of the linked task; both sides of a relationship are always stored (bidirectional)

## Column Model

```javascript
{
  id: "uuid",
  name: "Column Name",
  color: "#hexcolor",
  role: "done" | undefined,
  collapsed: boolean,
  order: number
}
```

### Column Notes

- `collapsed` defaults to `false`
- All column IDs are UUIDs
- The column with `role: "done"` is permanent and cannot be deleted
- Legacy imported or migrated column id `done` is remapped to a UUID-backed column with `role: "done"`

## Label Model

```javascript
{
  id: "uuid",
  name: "Label Name",
  color: "#hexcolor",
  group: "Group Name"
}
```

### Label Notes

- `name` has a maximum length of 40 characters
- All label IDs are UUIDs
- `group` is optional and defaults to an empty string
- Label groups are strings, not separate persisted entities

## Settings Model

Board settings are stored per board and include UI visibility, due-date thresholds, locale, default priority, and swim lane state.

Key persisted fields include:

- `showPriority`
- `showDueDate`
- `showAge`
- `showChangeDate`
- `notificationsDaysAhead`
- `dueDateUrgentThreshold`
- `dueDateWarningThreshold`
- `locale`
- `defaultTaskPriority`
- `swimLanesEnabled`
- `swimLaneGroupBy`
- `swimLaneLabelGroup`
- `swimLaneCollapsedKeys`
- `swimLaneCellCollapsedKeys`

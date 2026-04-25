# Data Models

## Board Model

```javascript
{
  id: "board-uuid",
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
  column: "column-id",
  order: number,
  labels: ["label-id-1", "label-id-2"],
  swimlaneLabelId: "label-id" | "",
  swimlaneLabelGroup: "Group Name" | "",
  creationDate: "YYYY-MM-DDTHH:MM:SSZ",
  changeDate: "YYYY-MM-DDTHH:MM:SSZ",
  doneDate: "YYYY-MM-DDTHH:MM:SSZ",
  columnHistory: [
    { column: "column-id", at: "YYYY-MM-DDTHH:MM:SSZ" }
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
- `relationships` defaults to `[]`; each entry stores a `type` (`prerequisite`, `dependent`, or `related`) and the `targetTaskId` of the linked task; both sides of a relationship are always stored (bidirectional)

## Column Model

```javascript
{
  id: "column-id",
  name: "Column Name",
  color: "#hexcolor",
  collapsed: boolean,
  order: number
}
```

### Column Notes

- `collapsed` defaults to `false`
- The column with id `done` is permanent and cannot be deleted

## Label Model

```javascript
{
  id: "label-id",
  name: "Label Name",
  color: "#hexcolor",
  group: "Group Name"
}
```

### Label Notes

- `name` has a maximum length of 40 characters
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

import { test, expect } from 'vitest';
import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  SWIMLANE_GROUP_BY_PRIORITY,
  SWIMLANE_HIDDEN_DONE_COLUMN_ID,
  buildBoardGrid,
  getVisibleTasksForLane,
  getSwimLaneValue,
  groupTasksBySwimLane,
  moveTask
} from '../../src/modules/swimlanes.js';

const labels = [
  { id: 'label-a', name: 'Project A', color: '#2563eb', group: 'Projects' },
  { id: 'label-b', name: 'Project B', color: '#16a34a', group: 'Projects' },
  { id: 'label-c', name: 'Ops', color: '#f59e0b', group: 'Workstreams' }
];

const columns = [
  { id: 'todo', name: 'To Do', order: 1 },
  { id: 'inprogress', name: 'In Progress', order: 2 },
  { id: 'done', name: 'Done', order: 3 }
];

test('getSwimLaneValue returns fallback lane names for label mode', () => {
  const labeledTask = { id: 't1', column: 'todo', labels: ['label-b'] };
  const unlabeledTask = { id: 't2', column: 'todo', labels: [] };
  const explicitNoGroupTask = { id: 't3', column: 'todo', labels: ['label-a'], swimlaneLabelId: '' };

  expect(getSwimLaneValue(labeledTask, SWIMLANE_GROUP_BY_LABEL, labels)).toBe('Project B');
  expect(getSwimLaneValue(unlabeledTask, SWIMLANE_GROUP_BY_LABEL, labels)).toBe(NO_GROUP_LANE_LABEL);
  expect(getSwimLaneValue(explicitNoGroupTask, SWIMLANE_GROUP_BY_LABEL, labels)).toBe(NO_GROUP_LANE_LABEL);
});

test('getSwimLaneValue returns normalized priority lane names for priority mode', () => {
  const urgentTask = { id: 't1', column: 'todo', priority: 'urgent' };
  const invalidPriorityTask = { id: 't2', column: 'todo', priority: 'invalid' };

  expect(getSwimLaneValue(urgentTask, SWIMLANE_GROUP_BY_PRIORITY, labels)).toBe('Urgent');
  expect(getSwimLaneValue(invalidPriorityTask, SWIMLANE_GROUP_BY_PRIORITY, labels)).toBe('None');
});

test('getSwimLaneValue returns label values from the selected label group', () => {
  const task = { id: 't1', column: 'todo', labels: ['label-b', 'label-c'] };
  const noGroupTask = { id: 't2', column: 'todo', labels: ['label-c'] };

  expect(getSwimLaneValue(task, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects')).toBe('Project B');
  expect(getSwimLaneValue(noGroupTask, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects')).toBe(NO_GROUP_LANE_LABEL);
});

test('groupTasksBySwimLane groups tasks into distinct lanes plus No Group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'inprogress', order: 1, labels: ['label-b'] },
    { id: 't3', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project A')?.tasks.map((task) => task.id)).toEqual(['t1']);
  expect(grouped.find((lane) => lane.value === NO_GROUP_LANE_LABEL)?.tasks.map((task) => task.id)).toEqual(['t3']);
});

test('groupTasksBySwimLane sorts priority lanes in workflow order', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, priority: 'low' },
    { id: 't2', column: 'todo', order: 2, priority: 'urgent' },
    { id: 't3', column: 'todo', order: 3, priority: 'medium' },
    { id: 't4', column: 'todo', order: 4, priority: 'none' }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_PRIORITY, labels);
  expect(grouped.map((lane) => lane.value)).toEqual(['Urgent', 'Medium', 'Low', 'None']);
});

test('groupTasksBySwimLane includes one lane per label in the selected group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  expect(grouped.map((lane) => lane.value)).toEqual(['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  expect(grouped.find((lane) => lane.value === 'Project B')?.tasks).toEqual([]);
});

test('buildBoardGrid places tasks into the correct lane and column cells', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'inprogress', order: 2, labels: ['label-a'] },
    { id: 't3', column: 'done', order: 1, labels: [] }
  ];
  const lanes = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);
  const grid = buildBoardGrid(columns, lanes, tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  const projectALane = grid.find((lane) => lane.value === 'Project A');
  const noGroupLane = grid.find((lane) => lane.key === NO_GROUP_LANE_KEY);

  expect(projectALane?.cells.todo.map((task) => task.id)).toEqual(['t1']);
  expect(projectALane?.cells.inprogress.map((task) => task.id)).toEqual(['t2']);
  expect(projectALane?.cells.done).toEqual([]);
  expect(noGroupLane?.cells.done.map((task) => task.id)).toEqual(['t3']);
});

test('getVisibleTasksForLane hides done-column tasks but keeps active columns visible', () => {
  const todoTasks = [{ id: 't1', column: 'todo', order: 1, labels: ['label-a'] }];
  const doneTasks = [{ id: 't2', column: 'done', order: 1, labels: [] }];

  expect(getVisibleTasksForLane(todoTasks, 'todo').map((task) => task.id)).toEqual(['t1']);
  expect(getVisibleTasksForLane(doneTasks, SWIMLANE_HIDDEN_DONE_COLUMN_ID)).toEqual([]);
});

test('moveTask updates both column and explicit label lane assignment', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'done', order: 1, labels: [] }
  ];

  const moved = moveTask(tasks, 't1', 'done', 'label-b', SWIMLANE_GROUP_BY_LABEL, labels);
  const task = moved.find((entry) => entry.id === 't1');

  expect(task?.column).toBe('done');
  expect(task?.swimlaneLabelId).toBe('label-b');
  expect(task?.labels).toEqual(['label-b', 'label-a']);
});

test('moveTask supports selected label-group lanes and explicit No Group assignment', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-c'] }
  ];

  const movedToGroup = moveTask(tasks, 't1', 'inprogress', 'label-b', SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  const groupedTask = movedToGroup[0];
  expect(groupedTask.column).toBe('inprogress');
  expect(groupedTask.swimlaneLabelGroup).toBe('Projects');
  expect(groupedTask.swimlaneLabelId).toBe('label-b');
  expect(groupedTask.labels).toEqual(['label-b', 'label-c']);

  const movedToNoGroup = moveTask(movedToGroup, 't1', 'done', NO_GROUP_LANE_KEY, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  const noGroupTask = movedToNoGroup[0];
  expect(noGroupTask.column).toBe('done');
  expect(noGroupTask.swimlaneLabelGroup).toBe('');
  expect(noGroupTask.swimlaneLabelId).toBe('');
  expect(noGroupTask.labels).toEqual(['label-c']);
  expect(getSwimLaneValue(noGroupTask, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects')).toBe(NO_GROUP_LANE_LABEL);
});

test('moveTask updates priority when grouping by priority lane', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, priority: 'medium', labels: ['label-c'] }
  ];

  const moved = moveTask(tasks, 't1', 'inprogress', 'urgent', SWIMLANE_GROUP_BY_PRIORITY, labels);
  const task = moved[0];

  expect(task.column).toBe('inprogress');
  expect(task.priority).toBe('urgent');
  expect(getSwimLaneValue(task, SWIMLANE_GROUP_BY_PRIORITY, labels)).toBe('Urgent');
});

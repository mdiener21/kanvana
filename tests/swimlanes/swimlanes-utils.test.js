import test from 'node:test';
import assert from 'node:assert/strict';

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

  assert.equal(getSwimLaneValue(labeledTask, SWIMLANE_GROUP_BY_LABEL, labels), 'Project B');
  assert.equal(getSwimLaneValue(unlabeledTask, SWIMLANE_GROUP_BY_LABEL, labels), NO_GROUP_LANE_LABEL);
  assert.equal(getSwimLaneValue(explicitNoGroupTask, SWIMLANE_GROUP_BY_LABEL, labels), NO_GROUP_LANE_LABEL);
});

test('getSwimLaneValue returns normalized priority lane names for priority mode', () => {
  const urgentTask = { id: 't1', column: 'todo', priority: 'urgent' };
  const invalidPriorityTask = { id: 't2', column: 'todo', priority: 'invalid' };

  assert.equal(getSwimLaneValue(urgentTask, SWIMLANE_GROUP_BY_PRIORITY, labels), 'Urgent');
  assert.equal(getSwimLaneValue(invalidPriorityTask, SWIMLANE_GROUP_BY_PRIORITY, labels), 'None');
});

test('getSwimLaneValue returns label values from the selected label group', () => {
  const task = { id: 't1', column: 'todo', labels: ['label-b', 'label-c'] };
  const noGroupTask = { id: 't2', column: 'todo', labels: ['label-c'] };

  assert.equal(getSwimLaneValue(task, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects'), 'Project B');
  assert.equal(getSwimLaneValue(noGroupTask, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects'), NO_GROUP_LANE_LABEL);
});

test('groupTasksBySwimLane groups tasks into distinct lanes plus No Group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'inprogress', order: 1, labels: ['label-b'] },
    { id: 't3', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL, labels);

  assert.deepEqual(
    grouped.map((lane) => lane.value),
    ['Project A', 'Project B', NO_GROUP_LANE_LABEL]
  );
  assert.deepEqual(grouped.find((lane) => lane.value === 'Project A')?.tasks.map((task) => task.id), ['t1']);
  assert.deepEqual(grouped.find((lane) => lane.value === NO_GROUP_LANE_LABEL)?.tasks.map((task) => task.id), ['t3']);
});

test('groupTasksBySwimLane sorts priority lanes in workflow order', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, priority: 'low' },
    { id: 't2', column: 'todo', order: 2, priority: 'urgent' },
    { id: 't3', column: 'todo', order: 3, priority: 'medium' },
    { id: 't4', column: 'todo', order: 4, priority: 'none' }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_PRIORITY, labels);

  assert.deepEqual(grouped.map((lane) => lane.value), ['Urgent', 'Medium', 'Low', 'None']);
});

test('groupTasksBySwimLane includes one lane per label in the selected group', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'done', order: 1, labels: [] }
  ];

  const grouped = groupTasksBySwimLane(tasks, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');

  assert.deepEqual(grouped.map((lane) => lane.value), ['Project A', 'Project B', NO_GROUP_LANE_LABEL]);
  assert.deepEqual(grouped.find((lane) => lane.value === 'Project B')?.tasks, []);
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

  assert.deepEqual(projectALane?.cells.todo.map((task) => task.id), ['t1']);
  assert.deepEqual(projectALane?.cells.inprogress.map((task) => task.id), ['t2']);
  assert.deepEqual(projectALane?.cells.done, []);
  assert.deepEqual(noGroupLane?.cells.done.map((task) => task.id), ['t3']);
});

test('getVisibleTasksForLane hides done-column tasks but keeps active columns visible', () => {
  const todoTasks = [{ id: 't1', column: 'todo', order: 1, labels: ['label-a'] }];
  const doneTasks = [{ id: 't2', column: 'done', order: 1, labels: [] }];

  assert.deepEqual(getVisibleTasksForLane(todoTasks, 'todo').map((task) => task.id), ['t1']);
  assert.deepEqual(getVisibleTasksForLane(doneTasks, SWIMLANE_HIDDEN_DONE_COLUMN_ID), []);
});

test('moveTask updates both column and explicit label lane assignment', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-a'] },
    { id: 't2', column: 'done', order: 1, labels: [] }
  ];

  const moved = moveTask(tasks, 't1', 'done', 'label-b', SWIMLANE_GROUP_BY_LABEL, labels);
  const task = moved.find((entry) => entry.id === 't1');

  assert.equal(task?.column, 'done');
  assert.equal(task?.swimlaneLabelId, 'label-b');
  assert.deepEqual(task?.labels, ['label-b', 'label-a']);
});

test('moveTask supports selected label-group lanes and explicit No Group assignment', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-c'] }
  ];

  const movedToGroup = moveTask(tasks, 't1', 'inprogress', 'label-b', SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  const groupedTask = movedToGroup[0];
  assert.equal(groupedTask.column, 'inprogress');
  assert.equal(groupedTask.swimlaneLabelGroup, 'Projects');
  assert.equal(groupedTask.swimlaneLabelId, 'label-b');
  assert.deepEqual(groupedTask.labels, ['label-b', 'label-c']);

  const movedToNoGroup = moveTask(movedToGroup, 't1', 'done', NO_GROUP_LANE_KEY, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects');
  const noGroupTask = movedToNoGroup[0];
  assert.equal(noGroupTask.column, 'done');
  assert.equal(noGroupTask.swimlaneLabelGroup, '');
  assert.equal(noGroupTask.swimlaneLabelId, '');
  assert.deepEqual(noGroupTask.labels, ['label-c']);
  assert.equal(getSwimLaneValue(noGroupTask, SWIMLANE_GROUP_BY_LABEL_GROUP, labels, 'Projects'), NO_GROUP_LANE_LABEL);
});

test('moveTask updates priority when grouping by priority lane', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, priority: 'medium', labels: ['label-c'] }
  ];

  const moved = moveTask(tasks, 't1', 'inprogress', 'urgent', SWIMLANE_GROUP_BY_PRIORITY, labels);
  const task = moved[0];

  assert.equal(task.column, 'inprogress');
  assert.equal(task.priority, 'urgent');
  assert.equal(getSwimLaneValue(task, SWIMLANE_GROUP_BY_PRIORITY, labels), 'Urgent');
});
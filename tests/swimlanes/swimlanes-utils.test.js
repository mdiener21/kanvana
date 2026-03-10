import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_GROUP_LANE_KEY,
  NO_GROUP_LANE_LABEL,
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  buildBoardGrid,
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

test('moveTask supports label-group lanes and explicit No Group assignment', () => {
  const tasks = [
    { id: 't1', column: 'todo', order: 1, labels: ['label-c'] }
  ];

  const movedToGroup = moveTask(tasks, 't1', 'inprogress', 'Projects', SWIMLANE_GROUP_BY_LABEL_GROUP, labels);
  const groupedTask = movedToGroup[0];
  assert.equal(groupedTask.column, 'inprogress');
  assert.equal(groupedTask.swimlaneLabelGroup, 'Projects');

  const movedToNoGroup = moveTask(movedToGroup, 't1', 'done', NO_GROUP_LANE_KEY, SWIMLANE_GROUP_BY_LABEL_GROUP, labels);
  const noGroupTask = movedToNoGroup[0];
  assert.equal(noGroupTask.column, 'done');
  assert.equal(noGroupTask.swimlaneLabelGroup, '');
  assert.equal(getSwimLaneValue(noGroupTask, SWIMLANE_GROUP_BY_LABEL_GROUP, labels), NO_GROUP_LANE_LABEL);
});
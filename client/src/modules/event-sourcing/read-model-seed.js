// The Read Model's seed data: the default board, its demo tasks, and the defaults a new board starts from.
// The demo-task replay rules in read-model-projector.js key off STABLE_DEFAULT_BOARD_ID and stableDemoTasks.

import { generateUUID } from '../utils.js';
import { DONE_COLUMN_ID, DONE_COLUMN_ROLE } from '../constants.js';

// Well-known stable id for the auto-seeded "Default Board". Every fresh device
// mints the default board with THIS id (not a random UUID) so two devices on the
// same account converge onto a single board instead of accruing duplicates.
// Valid uuid-v4 shape so it passes existing id validation/UUID_RE checks.
export const STABLE_DEFAULT_BOARD_ID = '00000000-0000-4000-8000-000000000001';

function nowIso() {
  return new Date().toISOString();
}

export function defaultColumns() {
  return [
    { id: generateUUID(), name: 'To Do', color: '#3583ff' },
    { id: generateUUID(), name: 'In Progress', color: '#f59e0b' },
    { id: generateUUID(), name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

export function legacyDefaultColumns() {
  return [
    { id: 'todo', name: 'To Do', color: '#3583ff' },
    { id: 'inprogress', name: 'In Progress', color: '#f59e0b' },
    { id: DONE_COLUMN_ID, name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

export function defaultLabels() {
  return [
    { id: generateUUID(), name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: generateUUID(), name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: generateUUID(), name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: generateUUID(), name: 'Idea', color: '#25b631', group: '' },
    { id: generateUUID(), name: 'Goal', color: '#1b7cbd', group: '' },
  ];
}

function columnIdByName(columns, name) {
  return columns.find((column) => column.name === name)?.id || columns[0]?.id || '';
}

function labelIdByName(labels, name) {
  return labels.find((label) => label.name === name)?.id || '';
}

export function defaultTasks(columns = defaultColumns(), labels = defaultLabels(), created = nowIso()) {
  const todoColumnId = columnIdByName(columns, 'To Do');
  const inProgressColumnId = columnIdByName(columns, 'In Progress');
  const doneColumnId = columns.find((column) => column.role === DONE_COLUMN_ROLE)?.id || columnIdByName(columns, 'Done');
  const taskLabelId = labelIdByName(labels, 'Task');
  const ideaLabelId = labelIdByName(labels, 'Idea');
  return [
    {
      id: generateUUID(),
      title: 'Find out where the Soul Stone is',
      description: 'Identify current location and access requirements.',
      priority: 'high',
      dueDate: '',
      column: todoColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: todoColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Steal the Time Stone',
      description: 'Coordinate with Dr. Strange and plan retrieval.',
      priority: 'urgent',
      dueDate: '',
      column: inProgressColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Mind Stone',
      description: 'Determine safe extraction approach.',
      priority: 'medium',
      dueDate: '',
      column: inProgressColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Hide the Reality Stone',
      description: 'Dig a deep hole to hide the stone from the Collector, avoid escalation.',
      priority: 'low',
      dueDate: '',
      column: inProgressColumnId,
      labels: taskLabelId ? [taskLabelId] : [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Find a bag for stones',
      description: 'A bag with good durability and space is needed to hold all the stones securely.',
      priority: 'none',
      dueDate: '',
      column: inProgressColumnId,
      labels: taskLabelId ? [taskLabelId] : [],
      creationDate: created,
      changeDate: created,
      columnHistory: [{ column: inProgressColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Power Stone',
      description: 'Verify secure containment after retrieval.',
      priority: 'high',
      dueDate: '',
      column: doneColumnId,
      labels: ideaLabelId ? [ideaLabelId] : [],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: doneColumnId, at: created }]
    },
    {
      id: generateUUID(),
      title: 'Collect the Space Stone',
      description: '',
      priority: 'low',
      dueDate: '',
      column: doneColumnId,
      labels: [],
      creationDate: created,
      changeDate: created,
      doneDate: created,
      columnHistory: [{ column: doneColumnId, at: created }]
    }
  ];
}

export function defaultBoardData(includeTasks = true) {
  const columns = defaultColumns();
  const labels = defaultLabels();
  return {
    columns,
    labels,
    tasks: includeTasks ? defaultTasks(columns, labels) : [],
    settings: defaultSettings()
  };
}

// Deterministic column/label ids for the well-known default board, so two
// devices seeding their own default board emit identical column.created /
// label.created events that dedup on merge (see STABLE_DEFAULT_BOARD_ID).
function stableDefaultColumns() {
  return [
    { id: '00000000-0000-4000-8000-000000000010', name: 'To Do', color: '#3583ff' },
    { id: '00000000-0000-4000-8000-000000000011', name: 'In Progress', color: '#f59e0b' },
    { id: '00000000-0000-4000-8000-000000000012', name: 'Done', color: '#505050', role: DONE_COLUMN_ROLE }
  ];
}

function stableDefaultLabels() {
  return [
    { id: '00000000-0000-4000-8000-000000000020', name: 'Task', color: '#f59e0b', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000021', name: 'Meeting', color: '#ffd001', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000022', name: 'Email', color: '#d4a300', group: 'Activity' },
    { id: '00000000-0000-4000-8000-000000000023', name: 'Idea', color: '#25b631', group: '' },
    { id: '00000000-0000-4000-8000-000000000024', name: 'Goal', color: '#1b7cbd', group: '' }
  ];
}

// Numbered in defaultTasks() order. Only the default board has these; every other caller keeps random ids.
export function stableDemoTasks(created = nowIso()) {
  return defaultTasks(stableDefaultColumns(), stableDefaultLabels(), created)
    .map((task, index) => ({ ...task, id: `00000000-0000-4000-8000-${String(30 + index).padStart(12, '0')}` }));
}

// Demo tasks are never emitted: each device seeds its own, with ids that let an event on one name them on all (#263).
export function stableDefaultBoardData() {
  return {
    columns: stableDefaultColumns(),
    labels: stableDefaultLabels(),
    tasks: stableDemoTasks(),
    settings: defaultSettings()
  };
}

export function defaultSettings() {
  const locale = (typeof navigator !== 'undefined' && typeof navigator.language === 'string')
    ? navigator.language
    : 'en-US';

  return {
    showPriority: true,
    showDueDate: true,
    showAge: true,
    showChangeDate: false,
    locale,
    defaultPriority: 'none',
    notificationDays: 3,
    countdownUrgentThreshold: 3,
    countdownWarningThreshold: 10,
    swimLanesEnabled: false,
    swimLaneGroupBy: 'label',
    swimLaneLabelGroup: '',
    swimLaneCollapsedKeys: [],
    swimLaneCellCollapsedKeys: [],
    swimLaneOrder: []
  };
}

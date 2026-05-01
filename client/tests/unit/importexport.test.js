import { test, expect, beforeEach, vi } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { inspectImportPayload, buildImportConfirmationMessage, IMPORT_LIMITS, exportBoard, importTasks } from '../../src/modules/importexport.js';
import { createActivityEvent, DEFAULT_HUMAN_ACTOR } from '../../src/modules/activity-log.js';
import { createBoard, getActiveBoardId, loadBoardEvents, saveBoardEvents, saveColumns, saveTasks } from '../../src/modules/storage.js';

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog: vi.fn(() => Promise.resolve(true)),
  alertDialog: vi.fn(() => Promise.resolve(true))
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  resetLocalStorage();
});

function captureExportJson(callback) {
  const previousBlob = globalThis.Blob;
  const previousUrl = globalThis.URL;
  const previousDocument = globalThis.document;
  let exportedJson = '';

  globalThis.Blob = class {
    constructor(parts) {
      exportedJson = parts.join('');
    }
  };
  globalThis.URL = { createObjectURL: () => 'blob:export', revokeObjectURL: () => {} };
  globalThis.document = {
    createElement: () => ({ click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  };

  try {
    callback();
    return JSON.parse(exportedJson);
  } finally {
    globalThis.Blob = previousBlob;
    globalThis.URL = previousUrl;
    globalThis.document = previousDocument;
  }
}

test('exportBoard includes task activity logs and board events', () => {
  const board = createBoard('Audit Board');
  const boardId = getActiveBoardId();
  const taskEvent = createActivityEvent('task.created', { taskId: 't1' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:00:00.000Z');
  const boardEvent = createActivityEvent('column.created', { columnId: 'todo', columnName: 'To Do' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:01:00.000Z');
  saveColumns([{ id: 'todo', name: 'To Do', color: '#3b82f6', order: 1 }]);
  saveTasks([{ id: 't1', title: 'Task 1', column: 'todo', priority: 'none', activityLog: [taskEvent] }]);
  saveBoardEvents(boardId, [boardEvent]);

  const exported = captureExportJson(() => exportBoard(board.id));

  expect(exported.tasks[0].activityLog).toEqual([taskEvent]);
  expect(exported.boardEvents).toEqual([boardEvent]);
});

test('inspectImportPayload accepts valid board export objects', () => {
  const preview = inspectImportPayload({
    boardName: 'Imported',
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      { id: 'task-1', title: 'Task 1', column: 'todo', labels: ['label-1'], priority: 'high' }
    ],
    labels: [
      { id: 'label-1', name: 'Label', color: '#ff0000' }
    ],
    settings: {
      showPriority: true
    }
  }, { name: 'import.json', size: 1024 });

  expect(preview.errors).toEqual([]);
  expect(preview.importedName).toBe('Imported');
  expect(preview.summary.tasks).toBe(1);
  expect(preview.summary.columns).toBe(2);
  expect(preview.summary.labels).toBe(1);
});

test('inspectImportPayload normalizes task activity logs and board events', () => {
  const taskEvent = createActivityEvent('task.created', { taskId: 'task-1' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:00:00.000Z');
  const boardEvent = createActivityEvent('column.created', { columnId: 'todo', columnName: 'Todo' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:01:00.000Z');

  const preview = inspectImportPayload({
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Task 1',
        column: 'todo',
        labels: [],
        priority: 'none',
        activityLog: [
          taskEvent,
          { ...taskEvent, type: '' },
          { ...taskEvent, at: 'not-a-date' },
          { ...taskEvent, actor: { type: 'bot', id: 'bot-1' } }
        ]
      }
    ],
    boardEvents: [
      boardEvent,
      { ...boardEvent, type: '' },
      { ...boardEvent, at: 'not-a-date' },
      { ...boardEvent, actor: { type: 'bot', id: 'bot-1' } }
    ]
  }, { name: 'activity.json', size: 512 });

  expect(preview.errors).toEqual([]);
  expect(preview.normalizedTasks[0].activityLog).toEqual([taskEvent]);
  expect(preview.normalizedBoardEvents).toEqual([boardEvent]);
});

test('importTasks restores normalized board events to the imported board', async () => {
  const previousFileReader = globalThis.FileReader;
  const boardEvent = createActivityEvent('column.created', { columnId: 'todo', columnName: 'Todo' }, DEFAULT_HUMAN_ACTOR, '2026-05-01T00:01:00.000Z');
  const payload = {
    boardName: 'Imported Audit',
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      { id: 'task-1', title: 'Task 1', column: 'todo', labels: [], priority: 'none' }
    ],
    boardEvents: [boardEvent, { at: 'broken' }]
  };

  globalThis.FileReader = class {
    readAsText() {
      this.onload({ target: { result: JSON.stringify(payload) } });
    }
  };

  try {
    importTasks({ name: 'audit.json', size: 512 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    globalThis.FileReader = previousFileReader;
  }

  expect(loadBoardEvents(getActiveBoardId())).toEqual([boardEvent]);
});

test('inspectImportPayload remaps legacy model ids to UUIDs while preserving references', () => {
  const preview = inspectImportPayload({
    boardName: 'Legacy IDs',
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Task 1',
        column: 'done',
        labels: ['label-1'],
        priority: 'high',
        columnHistory: [{ column: 'done', at: '2024-01-01T00:00:00Z' }]
      }
    ],
    labels: [
      { id: 'label-1', name: 'Label', color: '#ff0000' }
    ]
  }, { name: 'legacy-ids.json', size: 1024 });

  expect(preview.errors).toEqual([]);
  const doneColumn = preview.normalizedColumns.find((column) => column.role === 'done');
  const task = preview.normalizedTasks[0];
  const label = preview.normalizedLabels[0];
  expect(doneColumn.id).toMatch(UUID_RE);
  expect(task.id).toMatch(UUID_RE);
  expect(label.id).toMatch(UUID_RE);
  expect(task.column).toBe(doneColumn.id);
  expect(task.columnHistory[0].column).toBe(doneColumn.id);
  expect(task.labels).toEqual([label.id]);
});

test('inspectImportPayload rejects files above the size limit', () => {
  const threeMb = 3 * 1024 * 1024;
  const preview = inspectImportPayload([], { name: 'large.json', size: threeMb });
  expect(preview.errors[0]).toMatch(/too large/i);
});

test('inspectImportPayload warns for legacy task-only imports', () => {
  const preview = inspectImportPayload([
    { id: 'task-1', title: 'Task 1', column: 'todo', labels: [], priority: 'none' }
  ], { name: 'legacy.json', size: 128 });

  expect(preview.errors).toEqual([]);
  expect(preview.warnings.join(' ')).toMatch(/Legacy task-only import detected/i);
  const task = preview.normalizedTasks[0];
  const todoColumn = preview.normalizedColumns.find((column) => column.name === 'To Do');
  expect(task.id).toMatch(UUID_RE);
  expect(todoColumn.id).toMatch(UUID_RE);
  expect(task.column).toBe(todoColumn.id);
});

test('inspectImportPayload preserves and remaps task relationships', () => {
  const preview = inspectImportPayload({
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      { id: 'task-a', title: 'Task A', column: 'todo', labels: [], priority: 'none', relationships: [{ type: 'dependent', targetTaskId: 'task-b' }] },
      { id: 'task-b', title: 'Task B', column: 'todo', labels: [], priority: 'none', relationships: [{ type: 'prerequisite', targetTaskId: 'task-a' }] }
    ],
    labels: []
  }, { name: 'relationships.json', size: 256 });

  expect(preview.errors).toEqual([]);
  const taskA = preview.normalizedTasks.find((task) => task.title === 'Task A');
  const taskB = preview.normalizedTasks.find((task) => task.title === 'Task B');
  expect(taskA.id).toMatch(UUID_RE);
  expect(taskB.id).toMatch(UUID_RE);
  expect(taskA.relationships).toEqual([{ type: 'dependent', targetTaskId: taskB.id }]);
  expect(taskB.relationships).toEqual([{ type: 'prerequisite', targetTaskId: taskA.id }]);
});

test('inspectImportPayload remaps swimlane settings that reference labels and columns', () => {
  const preview = inspectImportPayload({
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      { id: 'task-1', title: 'Task 1', column: 'todo', labels: ['label-1'], priority: 'none' }
    ],
    labels: [
      { id: 'label-1', name: 'Label', color: '#ff0000' }
    ],
    settings: {
      swimLaneOrder: ['label-1'],
      swimLaneCollapsedKeys: ['label-1'],
      swimLaneCellCollapsedKeys: ['label-1::todo']
    }
  }, { name: 'swimlanes.json', size: 512 });

  expect(preview.errors).toEqual([]);
  const label = preview.normalizedLabels[0];
  const todoColumn = preview.normalizedColumns.find((column) => column.name === 'Todo');
  expect(preview.normalizedSettings.swimLaneOrder).toEqual([label.id]);
  expect(preview.normalizedSettings.swimLaneCollapsedKeys).toEqual([label.id]);
  expect(preview.normalizedSettings.swimLaneCellCollapsedKeys).toEqual([`${label.id}::${todoColumn.id}`]);
});

test('inspectImportPayload removes unknown label references and warns', () => {
  const preview = inspectImportPayload({
    columns: [
      { id: 'todo', name: 'Todo', color: '#3b82f6', order: 1 },
      { id: 'done', name: 'Done', color: '#16a34a', order: 2 }
    ],
    tasks: [
      { id: 'task-1', title: 'Task 1', column: 'todo', labels: ['known', 'unknown'], priority: 'none' }
    ],
    labels: [
      { id: 'known', name: 'Known', color: '#ff0000' }
    ]
  }, { name: 'labels.json', size: 128 });

  expect(preview.errors).toEqual([]);
  expect(preview.normalizedTasks[0].labels).toEqual([preview.normalizedLabels[0].id]);
  expect(preview.normalizedLabels[0].id).toMatch(UUID_RE);
  expect(preview.warnings.join(' ')).toMatch(/Removed 1 label reference/i);
});

test('buildImportConfirmationMessage includes summary details', () => {
  const message = buildImportConfirmationMessage({
    importedName: 'Security Review',
    fileSize: 2048,
    summary: { tasks: 3, columns: 4, labels: 2, includesSettings: true },
    warnings: ['Large import file detected.']
  });

  expect(message).toMatch(/Security Review/);
  expect(message).toMatch(/3 tasks/);
  expect(message).toMatch(/settings included/);
  expect(message).toMatch(/Warnings:/);
});

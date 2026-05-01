import { test, expect } from 'vitest';
import { inspectImportPayload, buildImportConfirmationMessage } from '../../src/modules/importexport.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

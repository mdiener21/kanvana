import { test, expect } from 'vitest';
import { inspectImportPayload, buildImportConfirmationMessage, IMPORT_LIMITS } from '../../src/modules/importexport.js';

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

test('inspectImportPayload rejects files larger than the hard limit', () => {
  const preview = inspectImportPayload([], { name: 'large.json', size: IMPORT_LIMITS.maxFileSizeBytes + 1 });
  expect(preview.errors[0]).toMatch(/too large/i);
});

test('inspectImportPayload warns for legacy task-only imports', () => {
  const preview = inspectImportPayload([
    { id: 'task-1', title: 'Task 1', column: 'todo', labels: [], priority: 'none' }
  ], { name: 'legacy.json', size: 128 });

  expect(preview.errors).toEqual([]);
  expect(preview.warnings.join(' ')).toMatch(/Legacy task-only import detected/i);
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
  expect(preview.normalizedTasks[0].labels).toEqual(['known']);
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
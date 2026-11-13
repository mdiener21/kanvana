import { readdirSync, readFileSync } from 'node:fs';
import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, ensureBoardsInitialized, loadColumns, loadLabels, loadTasks } from '../../src/modules/storage.js';
import { normalizeBoardModelIds } from '../../src/modules/board-serializer.js';

// Every built-in template becomes a board with its columns, labels and starter tasks. The E2E suite
// drives two representative templates through the UI (board-templates.spec.ts); this covers each
// template's data in milliseconds instead of a browser journey apiece.
const templatesDir = new URL('../../src/templates/', import.meta.url);
const templates = readdirSync(templatesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, templatesDir), 'utf8')) }));

beforeEach(() => {
  resetLocalStorage();
  ensureBoardsInitialized();
});

test('the templates folder holds templates', () => {
  expect(templates.length).toBeGreaterThan(0);
});

test.each(templates.map(({ file, data }) => [file, data]))('%s creates a board with its columns, labels and starter tasks', (file, data) => {
  expect(data.boardName, `${file} needs a boardName to be offered`).toBeTruthy();

  createBoard(data.boardName, normalizeBoardModelIds(data));

  const expectedColumns = [...data.columns].sort((a, b) => a.order - b.order).map((column) => column.name);
  const columns = loadColumns().sort((a, b) => a.order - b.order);
  expect(columns.map((column) => column.name)).toEqual(expectedColumns);

  const labels = loadLabels();
  expect(labels.map((label) => label.name).sort()).toEqual(data.labels.map((label) => label.name).sort());

  // Every label a starter task names must exist in the template, and arrive on the task.
  const templateLabelName = new Map(data.labels.map((label) => [label.id, label.name]));
  const labelName = new Map(labels.map((label) => [label.id, label.name]));
  const columnIds = new Set(columns.map((column) => column.id));
  const tasks = loadTasks();
  expect(tasks).toHaveLength(data.tasks.length);
  for (const source of data.tasks) {
    const task = tasks.find((candidate) => candidate.title === source.title);
    expect(task, `${file}: task "${source.title}"`).toBeTruthy();
    expect(columnIds.has(task.column), `${file}: "${source.title}" sits in a template column`).toBe(true);
    const expected = (source.labels ?? []).map((id) => templateLabelName.get(id));
    expect(expected, `${file}: "${source.title}" names a label the template defines`).not.toContain(undefined);
    expect((task.labels ?? []).map((id) => labelName.get(id))).toEqual(expected);
  }
});

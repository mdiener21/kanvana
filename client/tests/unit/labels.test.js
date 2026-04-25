import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadLabels, saveLabels, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addLabel, updateLabel, deleteLabel } from '../../src/modules/labels.js';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
  saveLabels([]);
});

// ── addLabel ────────────────────────────────────────────────────────

test('addLabel creates label successfully', () => {
  const result = addLabel('Bug', '#ff0000', 'Type');
  expect(result.success).toBe(true);
  expect(result.label.name).toBe('Bug');
  expect(result.label.color).toBe('#ff0000');
  expect(result.label.group).toBe('Type');
  expect(result.label.id).toBeTruthy();

  const labels = loadLabels();
  expect(labels.length).toBe(1);
});

test('addLabel returns EMPTY_NAME for empty name', () => {
  const result = addLabel('', '#ff0000');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('EMPTY_NAME');
});

test('addLabel returns EMPTY_NAME for whitespace-only name', () => {
  const result = addLabel('   ', '#ff0000');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('EMPTY_NAME');
});

test('addLabel returns DUPLICATE_NAME for case-insensitive duplicate', () => {
  addLabel('Bug', '#ff0000');
  const result = addLabel('bug', '#00ff00');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('DUPLICATE_NAME');
});

test('addLabel truncates name to 40 characters', () => {
  const longName = 'A'.repeat(50);
  const result = addLabel(longName, '#ff0000');
  expect(result.success).toBe(true);
  expect(result.label.name.length).toBe(40);
});

test('addLabel trims group', () => {
  const result = addLabel('Bug', '#ff0000', '  Type  ');
  expect(result.label.group).toBe('Type');
});

// ── updateLabel ─────────────────────────────────────────────────────

test('updateLabel updates label successfully', () => {
  const { label } = addLabel('Bug', '#ff0000', 'Type');
  const result = updateLabel(label.id, 'Feature', '#00ff00', 'Category');
  expect(result.success).toBe(true);
  expect(result.label.name).toBe('Feature');
  expect(result.label.color).toBe('#00ff00');
  expect(result.label.group).toBe('Category');
});

test('updateLabel returns NOT_FOUND for non-existent label', () => {
  const result = updateLabel('non-existent', 'Name', '#ff0000');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('NOT_FOUND');
});

test('updateLabel returns DUPLICATE_NAME when conflicting with another label', () => {
  addLabel('Bug', '#ff0000');
  const { label } = addLabel('Feature', '#00ff00');
  const result = updateLabel(label.id, 'Bug', '#0000ff');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('DUPLICATE_NAME');
});

test('updateLabel allows keeping the same name on the same label', () => {
  const { label } = addLabel('Bug', '#ff0000');
  const result = updateLabel(label.id, 'Bug', '#00ff00');
  expect(result.success).toBe(true);
});

test('updateLabel returns EMPTY_NAME for empty name', () => {
  const { label } = addLabel('Bug', '#ff0000');
  const result = updateLabel(label.id, '', '#ff0000');
  expect(result.success).toBe(false);
  expect(result.reason).toBe('EMPTY_NAME');
});

// ── deleteLabel ─────────────────────────────────────────────────────

test('deleteLabel removes label from labels list', () => {
  const { label } = addLabel('Bug', '#ff0000');
  expect(loadLabels().length).toBe(1);
  deleteLabel(label.id);
  expect(loadLabels().length).toBe(0);
});

test('deleteLabel removes label ID from all tasks', () => {
  const { label } = addLabel('Bug', '#ff0000');
  saveTasks([
    { id: 't1', title: 'Task 1', column: 'todo', labels: [label.id, 'other-label'] }
  ]);
  deleteLabel(label.id);
  const tasks = loadTasks();
  expect(tasks[0].labels.includes(label.id)).toBe(false);
  expect(tasks[0].labels.includes('other-label')).toBe(true);
});

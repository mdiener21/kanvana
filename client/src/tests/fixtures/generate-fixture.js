#!/usr/bin/env node
/**
 * Generates performance test fixture with 300+ tasks for drag-drop testing
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturePath = join(__dirname, 'performance-board.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

const labelIds = fixture.labels.map(l => l.id);
const priorities = ['low', 'medium', 'high'];
const tasks = [];

// Helper to generate a UUID-like ID
function generateId(prefix, index) {
  const hex = index.toString(16).padStart(8, '0');
  return `${prefix}-${hex}`;
}

// Helper to get random items from array
function randomItems(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Helper to get random item
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to generate date offset from now
function dateOffset(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

// Helper to generate YYYY-MM-DD date
function dateString(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

// Generate 300 tasks in Done column
for (let i = 0; i < 300; i++) {
  const createdDaysAgo = Math.floor(Math.random() * 90) + 1; // 1-90 days ago
  const doneDaysAgo = Math.floor(Math.random() * createdDaysAgo); // Done after created
  const creationDate = dateOffset(createdDaysAgo);
  const doneDate = dateOffset(doneDaysAgo);
  
  tasks.push({
    id: generateId('task-done', i),
    title: `Completed task ${i + 1}`,
    description: `This is a performance test task #${i + 1} in the done column`,
    priority: randomItem(priorities),
    dueDate: dateString(createdDaysAgo - Math.floor(Math.random() * 5)),
    column: 'done',
    order: i + 1,
    labels: randomItems(labelIds, Math.floor(Math.random() * 3) + 1), // 1-3 labels
    creationDate,
    changeDate: doneDate,
    doneDate,
    columnHistory: [
      { column: 'backlog', at: creationDate },
      { column: 'in-progress', at: dateOffset(doneDaysAgo + Math.floor(createdDaysAgo - doneDaysAgo) / 2) },
      { column: 'done', at: doneDate }
    ]
  });
}

// Generate 10 tasks in In Progress column (to drag from)
for (let i = 0; i < 10; i++) {
  const createdDaysAgo = Math.floor(Math.random() * 14) + 1; // 1-14 days ago
  const movedDaysAgo = Math.floor(Math.random() * createdDaysAgo);
  const creationDate = dateOffset(createdDaysAgo);
  const changeDate = dateOffset(movedDaysAgo);
  
  tasks.push({
    id: generateId('task-prog', i),
    title: `In progress task ${i + 1}`,
    description: `This is a test task #${i + 1} ready to be moved to done`,
    priority: randomItem(priorities),
    dueDate: dateString(-Math.floor(Math.random() * 7)), // Due in 0-7 days
    column: 'in-progress',
    order: i + 1,
    labels: randomItems(labelIds, Math.floor(Math.random() * 3) + 1),
    creationDate,
    changeDate,
    columnHistory: [
      { column: 'backlog', at: creationDate },
      { column: 'in-progress', at: changeDate }
    ]
  });
}

// Add tasks to fixture
fixture.tasks = tasks;

// Write back to file
writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf-8');

console.log(`✅ Generated ${tasks.length} tasks (300 done, 10 in-progress)`);
console.log(`   Labels: ${labelIds.length}`);
console.log(`   Columns: ${fixture.columns.length}`);

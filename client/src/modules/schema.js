// Domain schema — canonical factory functions for all domain objects.
// Every new entity must be constructed through these factories so all fields
// are always present and initialized to their documented defaults.

import { generateUUID } from './utils.js';
import { DEFAULT_PRIORITY, DEFAULT_COLUMN_COLOR, DONE_COLUMN_ROLE } from './constants.js';

function nowIso() {
  return new Date().toISOString();
}

// ── Type constants ─────────────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = ['prerequisite', 'dependent', 'related'];

// ── Task ───────────────────────────────────────────────────────────────────────

/**
 * Full task shape. All fields are always present.
 *
 * Stored flat per-board in IndexedDB; synced to PocketBase tasks collection.
 * `relationships` syncs to the task_relationships collection.
 *
 * @param {object} overrides
 * @returns {Task}
 */
export function createTask(overrides = {}) {
  const now = nowIso();
  const id = generateUUID();
  return {
    id,
    title: '',
    description: '',
    priority: DEFAULT_PRIORITY,
    dueDate: '',
    column: '',
    order: 0,
    labels: [],
    creationDate: now,
    changeDate: now,
    // doneDate is set only when the task moves to the Done column.
    columnHistory: [{ column: '', at: now }],
    relationships: [],
    subTasks: [],
    swimlaneLabelId: '',
    deleted: false,
    ...overrides,
  };
}

// ── Column ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} overrides
 * @returns {Column}
 */
export function createColumn(overrides = {}) {
  return {
    id: generateUUID(),
    name: '',
    color: DEFAULT_COLUMN_COLOR,
    order: 0,
    collapsed: false,
    // role: 'done' marks the terminal Done column; absent for regular columns.
    role: '',
    deleted: false,
    ...overrides,
  };
}

// ── Label ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} overrides
 * @returns {Label}
 */
export function createLabel(overrides = {}) {
  return {
    id: generateUUID(),
    name: '',
    color: DEFAULT_COLUMN_COLOR,
    group: '',
    deleted: false,
    ...overrides,
  };
}

// ── Board ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} overrides
 * @returns {Board}
 */
export function createBoard(overrides = {}) {
  return {
    id: generateUUID(),
    name: '',
    createdAt: nowIso(),
    ...overrides,
  };
}

// ── Sub-task ───────────────────────────────────────────────────────────────────

/**
 * Sub-tasks are stored in the `subTasks` array on the parent task.
 * They are not independent board entities.
 *
 * @param {object} overrides
 * @returns {SubTask}
 */
export function createSubTask(overrides = {}) {
  return {
    id: generateUUID(),
    title: '',
    completed: false,
    order: 0,
    ...overrides,
  };
}

// ── Relationship ───────────────────────────────────────────────────────────────

/**
 * Stored in `task.relationships[]` locally; synced to the task_relationships
 * PocketBase collection. Adding a relationship always creates the inverse
 * entry on the target task.
 *
 * @param {object} overrides
 * @returns {Relationship}
 */
export function createRelationship(overrides = {}) {
  return {
    // One of RELATIONSHIP_TYPES.
    type: 'related',
    targetTaskId: '',
    ...overrides,
  };
}

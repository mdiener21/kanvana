import { generateUUID } from './utils.js';
import { loadLabels, saveLabels, loadTasks, saveTasks } from './storage.js';

const MAX_LABEL_NAME_LENGTH = 40;

/**
 * Normalize a label name for comparison.
 * This function defines the canonical equality rules.
 */
function normalizeLabelName(name) {
  return name
    .trim()
    .slice(0, MAX_LABEL_NAME_LENGTH)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


/**
 * Check if a normalized label name already exists.
 * Optionally excludes a label by ID (used for updates).
 */
function labelNameExists(labels, normalizedName, excludeLabelId = null) {
  return labels.some(label => {
    if (excludeLabelId && label.id === excludeLabelId) return false;
    return normalizeLabelName(label.name) === normalizedName;
  });
}


/**
 * Add a new label (prevents duplicates, case-insensitive).
 */
export function addLabel(name, color, group = '') {
  if (!name || name.trim() === '') {
    return { success: false, reason: 'EMPTY_NAME' };
  }

  const trimmedName = name.trim().slice(0, MAX_LABEL_NAME_LENGTH);
  const normalizedName = normalizeLabelName(trimmedName);

  const labels = loadLabels();

  if (labelNameExists(labels, normalizedName)) {
    return {
      success: false,
      reason: 'DUPLICATE_NAME',
      message: `Label "${trimmedName}" already exists.`
    };
  }

  const id =
    normalizedName.replace(/\s+/g, '-') +
    '-' +
    generateUUID().substring(0, 8);

  const trimmedGroup = typeof group === 'string' ? group.trim() : '';
  const newLabel = { id, name: trimmedName, color, group: trimmedGroup };
  labels.push(newLabel);
  saveLabels(labels);

  return { success: true, label: newLabel };
}

/**
 * Update an existing label (prevents duplicates, case-insensitive).
 */
export function updateLabel(labelId, name, color, group = '') {
  if (!name || name.trim() === '') {
    return { success: false, reason: 'EMPTY_NAME' };
  }

  const trimmedName = name.trim().slice(0, MAX_LABEL_NAME_LENGTH);
  const normalizedName = normalizeLabelName(trimmedName);

  const labels = loadLabels();
  const labelIndex = labels.findIndex(l => l.id === labelId);

  if (labelIndex === -1) {
    return { success: false, reason: 'NOT_FOUND' };
  }

  if (labelNameExists(labels, normalizedName, labelId)) {
    return {
      success: false,
      reason: 'DUPLICATE_NAME',
      message: `Another label with the name "${trimmedName}" already exists.`
    };
  }

  labels[labelIndex].name = trimmedName;
  labels[labelIndex].color = color;
  labels[labelIndex].group = typeof group === 'string' ? group.trim() : '';
  saveLabels(labels);

  return { success: true, label: labels[labelIndex] };
}

// Delete a label
export function deleteLabel(labelId) {
  const labels = loadLabels();
  const tasks = loadTasks();
  
  // Remove label from all tasks
  tasks.forEach(task => {
    if (task.labels) {
      task.labels = task.labels.filter(id => id !== labelId);
    }
  });
  saveTasks(tasks);
  
  // Remove the label
  const filteredLabels = labels.filter(l => l.id !== labelId);
  saveLabels(filteredLabels);
}

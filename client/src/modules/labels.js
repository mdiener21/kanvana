import { generateUUID } from './utils.js';
import { getActiveBoardId, loadDeletedLabelsForBoard, loadLabels, saveLabels, loadTasks, saveTasks } from './storage.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

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

  const id = generateUUID();

  const trimmedGroup = typeof group === 'string' ? group.trim() : '';
  const newLabel = { id, name: trimmedName, color, group: trimmedGroup };
  labels.push(newLabel);
  saveLabels(labels);
  scheduleDomainEvent({
    type: 'label.created',
    boardId: getActiveBoardId(),
    entityId: id,
    payload: { label: newLabel }
  });

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
  scheduleDomainEvent({
    type: 'label.updated',
    boardId: getActiveBoardId(),
    entityId: labelId,
    payload: { fields: { name: labels[labelIndex].name, color: labels[labelIndex].color, group: labels[labelIndex].group } }
  });

  return { success: true, label: labels[labelIndex] };
}

// Delete a label
export function deleteLabel(labelId) {
  const boardId = getActiveBoardId();
  const liveLabels = loadLabels();
  const liveTasks = loadTasks();
  const label = liveLabels.find(l => l.id === labelId);

  // Remove label ref from tasks
  const allTasks = [...liveTasks, ...[]]; // live only — deleted tasks don't need label cleanup
  const updatedTasks = allTasks.map(task => {
    if (task.labels?.includes(labelId)) {
      return {
        ...task,
        labels: task.labels.filter(id => id !== labelId)
      };
    }
    return task;
  });
  saveTasks(updatedTasks);

  // Soft-delete the label, preserving already-deleted labels
  const allLabels = [...liveLabels, ...loadDeletedLabelsForBoard(boardId)];
  const updatedLabels = allLabels.map(l => l.id === labelId ? { ...l, deleted: true } : l);
  saveLabels(updatedLabels);
  liveTasks
    .filter((task) => task.labels?.includes(labelId))
    .forEach((task) => {
      scheduleDomainEvent({
        type: 'label.removed_from_task',
        boardId,
        entityId: task.id,
        payload: { label_id: labelId }
      });
    });
  scheduleDomainEvent({
    type: 'label.deleted',
    boardId,
    entityId: labelId,
    payload: {}
  });
}

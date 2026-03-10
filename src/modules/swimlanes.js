import { loadSettings, saveSettings } from './storage.js';

export const SWIMLANE_GROUP_BY_LABEL = 'label';
export const SWIMLANE_GROUP_BY_LABEL_GROUP = 'label-group';
export const NO_GROUP_LANE_KEY = '__no-group__';
export const NO_GROUP_LANE_LABEL = 'No Group';

const SWIMLANE_GROUP_BY_VALUES = new Set([
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP
]);

function normalizeGroupBy(groupBy) {
  const normalized = (groupBy || '').toString().trim().toLowerCase();
  return SWIMLANE_GROUP_BY_VALUES.has(normalized) ? normalized : SWIMLANE_GROUP_BY_LABEL;
}

function normalizeLabelCollection(labels) {
  if (labels instanceof Map) return labels;

  const byId = new Map();
  if (!Array.isArray(labels)) return byId;

  labels.forEach((label) => {
    if (!label || typeof label.id !== 'string') return;
    byId.set(label.id, label);
  });
  return byId;
}

function getTaskLabelIds(task) {
  return Array.isArray(task?.labels) ? task.labels.filter((value) => typeof value === 'string' && value.trim()) : [];
}

function getExplicitLaneValue(task, groupBy) {
  if (groupBy === SWIMLANE_GROUP_BY_LABEL) {
    return typeof task?.swimlaneLabelId === 'string' ? task.swimlaneLabelId.trim() : null;
  }

  return typeof task?.swimlaneLabelGroup === 'string' ? task.swimlaneLabelGroup.trim() : null;
}

function getFallbackLaneDescriptor(task, groupBy, labels) {
  const labelIds = getTaskLabelIds(task);

  if (groupBy === SWIMLANE_GROUP_BY_LABEL) {
    for (const labelId of labelIds) {
      const label = labels.get(labelId);
      if (!label) continue;
      return {
        key: label.id,
        value: label.name,
        isDefault: false
      };
    }
  }

  if (groupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    for (const labelId of labelIds) {
      const label = labels.get(labelId);
      const group = (label?.group || '').toString().trim();
      if (!group) continue;
      return {
        key: group,
        value: group,
        isDefault: false
      };
    }
  }

  return {
    key: NO_GROUP_LANE_KEY,
    value: NO_GROUP_LANE_LABEL,
    isDefault: true
  };
}

export function getSwimLaneDescriptor(task, groupBy, labelsInput) {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const labels = normalizeLabelCollection(labelsInput);
  const explicitValue = getExplicitLaneValue(task, normalizedGroupBy);

  if (explicitValue === '') {
    return {
      key: NO_GROUP_LANE_KEY,
      value: NO_GROUP_LANE_LABEL,
      isDefault: true
    };
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL && explicitValue) {
    const label = labels.get(explicitValue);
    if (label) {
      return {
        key: label.id,
        value: label.name,
        isDefault: false
      };
    }
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP && explicitValue) {
    return {
      key: explicitValue,
      value: explicitValue,
      isDefault: false
    };
  }

  return getFallbackLaneDescriptor(task, normalizedGroupBy, labels);
}

export function getSwimLaneValue(task, groupBy, labelsInput) {
  return getSwimLaneDescriptor(task, groupBy, labelsInput).value;
}

export function groupTasksBySwimLane(tasks, groupBy, labelsInput) {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const byLane = new Map();

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const lane = getSwimLaneDescriptor(task, normalizedGroupBy, labels);
    if (!byLane.has(lane.key)) {
      byLane.set(lane.key, {
        key: lane.key,
        value: lane.value,
        isDefault: lane.isDefault,
        tasks: []
      });
    }
    byLane.get(lane.key).tasks.push(task);
  });

  return [...byLane.values()].sort((left, right) => {
    if (left.isDefault && !right.isDefault) return 1;
    if (!left.isDefault && right.isDefault) return -1;
    return left.value.localeCompare(right.value, undefined, { sensitivity: 'base' });
  });
}

export function buildBoardGrid(columns, swimLanes, tasks, groupBy, labelsInput) {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const normalizedLanes = Array.isArray(swimLanes) ? swimLanes : [];
  const cellsByLane = new Map();

  normalizedLanes.forEach((lane) => {
    const cells = {};
    normalizedColumns.forEach((column) => {
      cells[column.id] = [];
    });
    cellsByLane.set(lane.key, cells);
  });

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const lane = getSwimLaneDescriptor(task, groupBy, labels);
    const laneCells = cellsByLane.get(lane.key);
    if (!laneCells) return;
    if (!laneCells[task.column]) return;
    laneCells[task.column].push(task);
  });

  return normalizedLanes.map((lane) => ({
    ...lane,
    cells: cellsByLane.get(lane.key) || {}
  }));
}

export function applySwimLaneAssignment(task, groupBy, laneKey, labelsInput) {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const labels = normalizeLabelCollection(labelsInput);
  const nextLaneKey = typeof laneKey === 'string' && laneKey.trim() ? laneKey.trim() : NO_GROUP_LANE_KEY;
  const nextTask = {
    ...task,
    labels: getTaskLabelIds(task)
  };

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL) {
    if (nextLaneKey === NO_GROUP_LANE_KEY) {
      nextTask.swimlaneLabelId = '';
      return nextTask;
    }

    const label = labels.get(nextLaneKey);
    if (!label) return nextTask;

    nextTask.swimlaneLabelId = label.id;
    nextTask.labels = [
      label.id,
      ...nextTask.labels.filter((labelId) => labelId !== label.id)
    ];
    return nextTask;
  }

  if (nextLaneKey === NO_GROUP_LANE_KEY) {
    nextTask.swimlaneLabelGroup = '';
    return nextTask;
  }

  nextTask.swimlaneLabelGroup = nextLaneKey;
  return nextTask;
}

export function moveTask(tasks, taskId, targetColumnId, targetLaneKey, groupBy, labelsInput) {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const nextTasks = normalizedTasks.map((task) => {
    if (task.id !== taskId) return task;

    const movedTask = applySwimLaneAssignment(task, groupBy, targetLaneKey, labels);
    return {
      ...movedTask,
      column: targetColumnId
    };
  });

  return nextTasks;
}

export function syncSwimLaneToolbar(settings = loadSettings()) {
  const toggle = document.getElementById('swimlane-enabled-toggle');
  const groupBy = document.getElementById('swimlane-group-by');
  if (!toggle || !groupBy) return;

  toggle.checked = settings.swimLanesEnabled === true;
  groupBy.value = normalizeGroupBy(settings.swimLaneGroupBy);
  groupBy.disabled = settings.swimLanesEnabled !== true;
}

export function initializeSwimLaneControls(onChange) {
  const toggle = document.getElementById('swimlane-enabled-toggle');
  const groupBy = document.getElementById('swimlane-group-by');
  if (!toggle || !groupBy) return;

  syncSwimLaneToolbar();

  toggle.addEventListener('change', () => {
    const current = loadSettings();
    const next = {
      ...current,
      swimLanesEnabled: toggle.checked === true
    };
    saveSettings(next);
    syncSwimLaneToolbar(next);
    onChange?.(next);
  });

  groupBy.addEventListener('change', () => {
    const current = loadSettings();
    const next = {
      ...current,
      swimLaneGroupBy: normalizeGroupBy(groupBy.value)
    };
    saveSettings(next);
    syncSwimLaneToolbar(next);
    onChange?.(next);
  });
}
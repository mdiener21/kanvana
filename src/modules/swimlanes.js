import { loadLabels, loadSettings, saveSettings } from './storage.js';

export const SWIMLANE_GROUP_BY_LABEL = 'label';
export const SWIMLANE_GROUP_BY_LABEL_GROUP = 'label-group';
export const SWIMLANE_GROUP_BY_PRIORITY = 'priority';
export const NO_GROUP_LANE_KEY = '__no-group__';
export const NO_GROUP_LANE_LABEL = 'No Group';
export const SWIMLANE_HIDDEN_DONE_COLUMN_ID = 'done';

const PRIORITY_LANE_ORDER = ['urgent', 'high', 'medium', 'low', 'none'];
const PRIORITY_LANE_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None'
};

const SWIMLANE_GROUP_BY_VALUES = new Set([
  SWIMLANE_GROUP_BY_LABEL,
  SWIMLANE_GROUP_BY_LABEL_GROUP,
  SWIMLANE_GROUP_BY_PRIORITY
]);

function normalizeSelectedLabelGroup(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeGroupBy(groupBy) {
  const normalized = (groupBy || '').toString().trim().toLowerCase();
  return SWIMLANE_GROUP_BY_VALUES.has(normalized) ? normalized : SWIMLANE_GROUP_BY_LABEL;
}

function normalizeCollapsedLaneKeys(keys) {
  if (!Array.isArray(keys)) return [];

  const seen = new Set();
  return keys
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizePriorityLaneKey(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  return PRIORITY_LANE_ORDER.includes(normalized) ? normalized : 'none';
}

function getPriorityLaneDescriptor(value) {
  const key = normalizePriorityLaneKey(value);
  return {
    key,
    value: PRIORITY_LANE_LABELS[key],
    isDefault: key === 'none'
  };
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

function getAvailableLabelGroupsFromCollection(labels) {
  const groups = new Set();

  labels.forEach((label) => {
    const group = normalizeSelectedLabelGroup(label?.group);
    if (group) groups.add(group);
  });

  return [...groups].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function getSelectedLabelGroup(group, labels) {
  const normalizedGroup = normalizeSelectedLabelGroup(group);
  const availableGroups = getAvailableLabelGroupsFromCollection(labels);
  if (availableGroups.includes(normalizedGroup)) return normalizedGroup;
  return availableGroups[0] || '';
}

function getLabelsForSelectedGroup(labels, selectedLabelGroup) {
  const group = getSelectedLabelGroup(selectedLabelGroup, labels);
  if (!group) return [];

  return [...labels.values()]
    .filter((label) => normalizeSelectedLabelGroup(label?.group) === group)
    .sort((left, right) => {
      const leftName = (left?.name || '').toString();
      const rightName = (right?.name || '').toString();
      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    });
}

function getSelectedGroupLaneLabel(task, labels, selectedLabelGroup) {
  const group = getSelectedLabelGroup(selectedLabelGroup, labels);
  if (!group) return null;

  const explicitLabelId = typeof task?.swimlaneLabelId === 'string' ? task.swimlaneLabelId.trim() : '';
  if (explicitLabelId) {
    const explicitLabel = labels.get(explicitLabelId);
    if (explicitLabel && normalizeSelectedLabelGroup(explicitLabel.group) === group) {
      return explicitLabel;
    }
  }

  const labelIds = getTaskLabelIds(task);
  for (const labelId of labelIds) {
    const label = labels.get(labelId);
    if (label && normalizeSelectedLabelGroup(label.group) === group) {
      return label;
    }
  }

  return null;
}

function getTaskLabelIds(task) {
  return Array.isArray(task?.labels) ? task.labels.filter((value) => typeof value === 'string' && value.trim()) : [];
}

function getExplicitLaneValue(task, groupBy) {
  if (groupBy === SWIMLANE_GROUP_BY_LABEL) {
    return typeof task?.swimlaneLabelId === 'string' ? task.swimlaneLabelId.trim() : null;
  }

  if (groupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    return normalizePriorityLaneKey(task?.priority);
  }

  return typeof task?.swimlaneLabelGroup === 'string' ? task.swimlaneLabelGroup.trim() : null;
}

function getFallbackLaneDescriptor(task, groupBy, labels) {
  if (groupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    return getPriorityLaneDescriptor(task?.priority);
  }

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

export function getAvailableSwimLaneLabelGroups(labelsInput = loadLabels()) {
  const labels = normalizeLabelCollection(labelsInput);
  return getAvailableLabelGroupsFromCollection(labels);
}

export function getSwimLaneDescriptor(task, groupBy, labelsInput, selectedLabelGroup = '') {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const labels = normalizeLabelCollection(labelsInput);
  const explicitValue = getExplicitLaneValue(task, normalizedGroupBy);

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    return getPriorityLaneDescriptor(explicitValue);
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    const selectedLaneLabel = getSelectedGroupLaneLabel(task, labels, selectedLabelGroup);
    if (selectedLaneLabel) {
      return {
        key: selectedLaneLabel.id,
        value: selectedLaneLabel.name,
        isDefault: false
      };
    }

    return {
      key: NO_GROUP_LANE_KEY,
      value: NO_GROUP_LANE_LABEL,
      isDefault: true
    };
  }

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

export function getSwimLaneValue(task, groupBy, labelsInput, selectedLabelGroup = '') {
  return getSwimLaneDescriptor(task, groupBy, labelsInput, selectedLabelGroup).value;
}

export function groupTasksBySwimLane(tasks, groupBy, labelsInput, selectedLabelGroup = '') {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const byLane = new Map();

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    getLabelsForSelectedGroup(labels, selectedLabelGroup).forEach((label) => {
      byLane.set(label.id, {
        key: label.id,
        value: label.name,
        isDefault: false,
        tasks: []
      });
    });
  }

  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const lane = getSwimLaneDescriptor(task, normalizedGroupBy, labels, selectedLabelGroup);
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
    if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
      return PRIORITY_LANE_ORDER.indexOf(left.key) - PRIORITY_LANE_ORDER.indexOf(right.key);
    }

    if (left.isDefault && !right.isDefault) return 1;
    if (!left.isDefault && right.isDefault) return -1;
    return left.value.localeCompare(right.value, undefined, { sensitivity: 'base' });
  });
}

export function buildBoardGrid(columns, swimLanes, tasks, groupBy, labelsInput, selectedLabelGroup = '') {
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
    const lane = getSwimLaneDescriptor(task, groupBy, labels, selectedLabelGroup);
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

export function getVisibleTasksForLane(tasksInCell, columnId) {
  const normalizedTasks = Array.isArray(tasksInCell) ? tasksInCell : [];
  return columnId === SWIMLANE_HIDDEN_DONE_COLUMN_ID ? [] : normalizedTasks;
}

export function getHiddenTaskCountForLane(tasksInCell, columnId) {
  if (columnId !== SWIMLANE_HIDDEN_DONE_COLUMN_ID) return 0;
  return Array.isArray(tasksInCell) ? tasksInCell.length : 0;
}

export function isSwimLaneCollapsed(laneKey, settings = loadSettings()) {
  const normalizedLaneKey = (laneKey || '').toString().trim();
  if (!normalizedLaneKey) return false;
  return normalizeCollapsedLaneKeys(settings?.swimLaneCollapsedKeys).includes(normalizedLaneKey);
}

export function toggleSwimLaneCollapsed(laneKey) {
  const normalizedLaneKey = (laneKey || '').toString().trim();
  if (!normalizedLaneKey) return false;

  const current = loadSettings();
  const collapsedKeys = normalizeCollapsedLaneKeys(current.swimLaneCollapsedKeys);
  const nextCollapsedKeys = collapsedKeys.includes(normalizedLaneKey)
    ? collapsedKeys.filter((key) => key !== normalizedLaneKey)
    : [...collapsedKeys, normalizedLaneKey];

  saveSettings({
    ...current,
    swimLaneCollapsedKeys: nextCollapsedKeys
  });

  return true;
}

const CELL_KEY_DELIMITER = '::';

export function makeCellCollapseKey(laneKey, columnId) {
  return `${(laneKey || '').toString().trim()}${CELL_KEY_DELIMITER}${(columnId || '').toString().trim()}`;
}

function normalizeCellCollapsedKeys(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  return keys
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

export function isSwimLaneCellCollapsed(laneKey, columnId, settings = loadSettings()) {
  const key = makeCellCollapseKey(laneKey, columnId);
  if (!key || key === CELL_KEY_DELIMITER) return false;
  return normalizeCellCollapsedKeys(settings?.swimLaneCellCollapsedKeys).includes(key);
}

export function toggleSwimLaneCellCollapsed(laneKey, columnId) {
  const key = makeCellCollapseKey(laneKey, columnId);
  if (!key || key === CELL_KEY_DELIMITER) return false;

  const current = loadSettings();
  const collapsedKeys = normalizeCellCollapsedKeys(current.swimLaneCellCollapsedKeys);
  const nextCollapsedKeys = collapsedKeys.includes(key)
    ? collapsedKeys.filter((k) => k !== key)
    : [...collapsedKeys, key];

  saveSettings({
    ...current,
    swimLaneCellCollapsedKeys: nextCollapsedKeys
  });

  return true;
}

export function applySwimLaneAssignment(task, groupBy, laneKey, labelsInput, selectedLabelGroup = '') {
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

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_PRIORITY) {
    nextTask.priority = normalizePriorityLaneKey(nextLaneKey);
    return nextTask;
  }

  if (normalizedGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP) {
    const group = getSelectedLabelGroup(selectedLabelGroup, labels);
    const groupLabels = getLabelsForSelectedGroup(labels, group);
    const groupLabelIds = new Set(groupLabels.map((label) => label.id));

    nextTask.labels = nextTask.labels.filter((labelId) => !groupLabelIds.has(labelId));

    if (nextLaneKey === NO_GROUP_LANE_KEY || !group) {
      nextTask.swimlaneLabelId = '';
      nextTask.swimlaneLabelGroup = '';
      return nextTask;
    }

    const label = labels.get(nextLaneKey);
    if (!label || normalizeSelectedLabelGroup(label.group) !== group) return nextTask;

    nextTask.swimlaneLabelId = label.id;
    nextTask.swimlaneLabelGroup = group;
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

export function moveTask(tasks, taskId, targetColumnId, targetLaneKey, groupBy, labelsInput, selectedLabelGroup = '') {
  const labels = normalizeLabelCollection(labelsInput);
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const nextTasks = normalizedTasks.map((task) => {
    if (task.id !== taskId) return task;

    const movedTask = applySwimLaneAssignment(task, groupBy, targetLaneKey, labels, selectedLabelGroup);
    return {
      ...movedTask,
      column: targetColumnId
    };
  });

  return nextTasks;
}

export function syncSwimLaneControls(settings = loadSettings()) {
  const toggle = document.getElementById('settings-swimlane-enabled');
  const groupBy = document.getElementById('settings-swimlane-group-by');
  const labelGroup = document.getElementById('settings-swimlane-label-group');
  const labelGroupField = document.getElementById('settings-swimlane-label-group-field');
  if (!toggle || !groupBy) return;

  const labels = normalizeLabelCollection(loadLabels());
  const availableGroups = getAvailableLabelGroupsFromCollection(labels);
  const selectedGroup = getSelectedLabelGroup(settings?.swimLaneLabelGroup, labels);
  const showLabelGroupSelector = settings.swimLanesEnabled === true && normalizeGroupBy(settings?.swimLaneGroupBy) === SWIMLANE_GROUP_BY_LABEL_GROUP;

  toggle.checked = settings.swimLanesEnabled === true;
  groupBy.value = normalizeGroupBy(settings.swimLaneGroupBy);
  groupBy.disabled = settings.swimLanesEnabled !== true;

  if (labelGroup && labelGroupField) {
    labelGroup.innerHTML = '';

    if (availableGroups.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No label groups available';
      labelGroup.appendChild(option);
    } else {
      availableGroups.forEach((group) => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        labelGroup.appendChild(option);
      });
      labelGroup.value = selectedGroup;
    }

    labelGroupField.hidden = !showLabelGroupSelector;
    labelGroup.disabled = !showLabelGroupSelector || availableGroups.length === 0;
  }
}

export function initializeSwimLaneControls(onChange) {
  const toggle = document.getElementById('settings-swimlane-enabled');
  const groupBy = document.getElementById('settings-swimlane-group-by');
  const labelGroup = document.getElementById('settings-swimlane-label-group');
  if (!toggle || !groupBy) return;

  syncSwimLaneControls();

  toggle.addEventListener('change', () => {
    const current = loadSettings();
    const labels = normalizeLabelCollection(loadLabels());
    const next = {
      ...current,
      swimLanesEnabled: toggle.checked === true,
      swimLaneLabelGroup: normalizeGroupBy(current.swimLaneGroupBy) === SWIMLANE_GROUP_BY_LABEL_GROUP
        ? getSelectedLabelGroup(current.swimLaneLabelGroup, labels)
        : current.swimLaneLabelGroup
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });

  groupBy.addEventListener('change', () => {
    const current = loadSettings();
    const labels = normalizeLabelCollection(loadLabels());
    const nextGroupBy = normalizeGroupBy(groupBy.value);
    const next = {
      ...current,
      swimLaneGroupBy: nextGroupBy,
      swimLaneLabelGroup: nextGroupBy === SWIMLANE_GROUP_BY_LABEL_GROUP
        ? getSelectedLabelGroup(current.swimLaneLabelGroup, labels)
        : current.swimLaneLabelGroup
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });

  labelGroup?.addEventListener('change', () => {
    const current = loadSettings();
    const next = {
      ...current,
      swimLaneLabelGroup: normalizeSelectedLabelGroup(labelGroup.value)
    };
    saveSettings(next);
    syncSwimLaneControls(next);
    onChange?.(next);
  });
}
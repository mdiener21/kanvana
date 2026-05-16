// Board import normalizer — remaps non-UUID ids and coerces field values on import.
// Changes when: import format changes, new fields need cross-entity id remapping.

import { generateUUID } from './utils.js';
import { DONE_COLUMN_ID, DONE_COLUMN_ROLE, isDoneColumn } from './constants.js';
import {
  isHexColor,
  defaultColumnColor,
  normalizeRelationships,
  normalizeActivityLog,
  normalizeStringKeys,
} from './normalize.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowIso() {
  return new Date().toISOString();
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function remapId(value, map) {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (isUuid(raw)) return raw;
  if (!raw) return generateUUID();
  if (!map.has(raw)) map.set(raw, generateUUID());
  return map.get(raw);
}

function remapReference(value, map, fallback = '') {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!raw) return fallback;
  return map.get(raw) || (isUuid(raw) ? raw : fallback);
}

function remapCellCollapseKeys(keys, labelIdMap, columnIdMap) {
  if (!Array.isArray(keys)) return [];
  return normalizeStringKeys(keys).map((key) => {
    const [laneKey, columnId] = key.split('::');
    if (columnId === undefined) return remapReference(key, labelIdMap, key);
    const nextLaneKey = remapReference(laneKey, labelIdMap, laneKey);
    const nextColumnId = remapReference(columnId, columnIdMap, columnId);
    return `${nextLaneKey}::${nextColumnId}`;
  });
}

/**
 * Normalize a raw board model (from JSON import or IDB migration) by ensuring
 * all ids are valid UUIDs and all cross-entity id references are remapped
 * consistently. Returns a new object — does not mutate the input.
 *
 * @param {{ board?, columns?, tasks?, labels?, settings? }} input
 * @returns {{ board, columns, tasks, labels, settings, idMaps }}
 */
export function normalizeBoardModelIds({ board = null, columns = [], tasks = [], labels = [], settings = null } = {}) {
  const boardIdMap = new Map();
  const columnIdMap = new Map();
  const labelIdMap = new Map();
  const taskIdMap = new Map();

  const nextBoard = board && typeof board === 'object'
    ? {
        ...board,
        id: remapId(board.id, boardIdMap),
        name: typeof board.name === 'string' && board.name.trim() ? board.name.trim() : 'Untitled board',
        createdAt: typeof board.createdAt === 'string' ? board.createdAt : nowIso()
      }
    : null;

  const normalizedColumns = (Array.isArray(columns) ? columns : []).map((column, index) => {
    const source = column && typeof column === 'object' ? column : {};
    const id = remapId(source.id || `__column_${index}`, columnIdMap);
    const done = isDoneColumn(source);
    return {
      ...source,
      id,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : (done ? 'Done' : 'Untitled column'),
      color: isHexColor(source.color) ? source.color.trim() : defaultColumnColor(done ? DONE_COLUMN_ID : source.id),
      collapsed: source.collapsed === true,
      ...(Number.isFinite(source.order) ? { order: source.order } : {}),
      ...(done ? { role: DONE_COLUMN_ROLE } : {})
    };
  });

  if (!normalizedColumns.some((column) => column.role === DONE_COLUMN_ROLE)) {
    const maxOrder = normalizedColumns.reduce((max, column) => Math.max(max, Number.isFinite(column?.order) ? column.order : 0), 0);
    normalizedColumns.push({ id: generateUUID(), name: 'Done', color: '#16a34a', order: maxOrder + 1, collapsed: false, role: DONE_COLUMN_ROLE });
  }

  const fallbackColumnId = normalizedColumns.find((column) => column.role !== DONE_COLUMN_ROLE)?.id || normalizedColumns[0]?.id || '';

  const normalizedLabels = (Array.isArray(labels) ? labels : []).map((label, index) => {
    const source = label && typeof label === 'object' ? label : {};
    return {
      ...source,
      id: remapId(source.id || `__label_${index}`, labelIdMap),
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Untitled label',
      color: isHexColor(source.color) ? source.color.trim() : '#3b82f6',
      group: typeof source.group === 'string' ? source.group : ''
    };
  });

  const rawTasks = Array.isArray(tasks) ? tasks : [];
  rawTasks.forEach((task, index) => {
    const source = task && typeof task === 'object' ? task : {};
    remapId(source.id || `__task_${index}`, taskIdMap);
  });

  const normalizedTasks = rawTasks.map((task, index) => {
    const source = task && typeof task === 'object' ? task : {};
    const id = remapId(source.id || `__task_${index}`, taskIdMap);
    const column = remapReference(source.column, columnIdMap, fallbackColumnId);
    const labels = Array.isArray(source.labels)
      ? source.labels.map((labelId) => remapReference(labelId, labelIdMap, '')).filter(Boolean)
      : [];
    const columnHistory = Array.isArray(source.columnHistory)
      ? source.columnHistory
          .map((entry) => {
            const historyColumn = remapReference(entry?.column, columnIdMap, '');
            const at = typeof entry?.at === 'string' ? entry.at.trim() : '';
            return historyColumn && at ? { column: historyColumn, at } : null;
          })
          .filter(Boolean)
      : undefined;
    const relationships = normalizeRelationships(source.relationships)
      .map((relationship) => ({
        ...relationship,
        targetTaskId: remapReference(relationship.targetTaskId, taskIdMap, '')
      }))
      .filter((relationship) => relationship.targetTaskId);
    const swimlaneLabelId = remapReference(source.swimlaneLabelId, labelIdMap, '');

    return {
      ...source,
      id,
      column,
      labels,
      relationships,
      activityLog: normalizeActivityLog(source.activityLog),
      ...(columnHistory && columnHistory.length ? { columnHistory } : {}),
      ...(swimlaneLabelId ? { swimlaneLabelId } : (Object.prototype.hasOwnProperty.call(source, 'swimlaneLabelId') ? { swimlaneLabelId: '' } : {}))
    };
  });

  const nextSettings = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? {
        ...settings,
        swimLaneOrder: normalizeStringKeys(settings.swimLaneOrder).map((key) => remapReference(key, labelIdMap, key)),
        swimLaneCollapsedKeys: normalizeStringKeys(settings.swimLaneCollapsedKeys).map((key) => remapReference(key, labelIdMap, key)),
        swimLaneCellCollapsedKeys: remapCellCollapseKeys(settings.swimLaneCellCollapsedKeys, labelIdMap, columnIdMap)
      }
    : settings;

  return {
    board: nextBoard,
    columns: normalizedColumns,
    tasks: normalizedTasks,
    labels: normalizedLabels,
    settings: nextSettings,
    idMaps: { boardIdMap, columnIdMap, labelIdMap, taskIdMap }
  };
}

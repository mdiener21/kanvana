import PocketBase from 'pocketbase';
import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadDeletedColumnsForBoard,
  loadDeletedTasksForBoard,
  loadDeletedLabelsForBoard,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  getBoardById,
  setActiveBoardId,
  getActiveBoardId,
} from './storage.js';

const PB_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PB_URL) || '/';
const pb = new PocketBase(PB_URL);

const SYNC_MAP_KEY = 'kanbanSyncMap';

pb.authStore.onChange(() => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }
});

export function getPb() {
  return pb;
}

export function isAuthenticated() {
  return Boolean(pb.authStore.token && pb.authStore.record);
}

export async function ensureAuthenticated() {
  if (!pb.authStore.token || !pb.authStore.record) return false;
  if (pb.authStore.isValid) return true;
  try {
    await pb.collection('users').authRefresh();
    return Boolean(pb.authStore.token && pb.authStore.record);
  } catch {
    return false;
  }
}

export function getUser() {
  return pb.authStore.record;
}

export async function loginUser(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function registerUser(email, password, name) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || '',
  });
}

export function logoutUser() {
  pb.authStore.clear();
}

export async function loginWithProvider(provider) {
  return pb.collection('users').authWithOAuth2({ provider });
}

// ── syncMap ────────────────────────────────────────────────────────────────────

function loadSyncMap() {
  try {
    const raw = localStorage.getItem(SYNC_MAP_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { boards: {}, columns: {}, labels: {}, tasks: {} };
}

function saveSyncMap(map) {
  localStorage.setItem(SYNC_MAP_KEY, JSON.stringify(map));
}

function getPbId(syncMap, entityType, localId) {
  return syncMap[entityType]?.[localId] || null;
}

function setPbId(syncMap, entityType, localId, pbId) {
  if (!syncMap[entityType]) syncMap[entityType] = {};
  syncMap[entityType][localId] = pbId;
}

async function upsertRecord(collection, syncMap, entityType, localId, data) {
  const pbId = getPbId(syncMap, entityType, localId);
  if (pbId) {
    try {
      return await pb.collection(collection).update(pbId, data);
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
  }
  const record = await pb.collection(collection).create(data);
  setPbId(syncMap, entityType, localId, record.id);
  return record;
}

// ── pushBoardFull ─────────────────────────────────────────────────────────────

export async function pushBoardFull(boardId) {
  if (!(await ensureAuthenticated())) throw new Error('Not authenticated');

  const userId = pb.authStore.record.id;
  const syncMap = loadSyncMap();
  const board = getBoardById(boardId);

  const columns = loadColumnsForBoard(boardId);
  const tasks = loadTasksForBoard(boardId);
  const labels = loadLabelsForBoard(boardId);
  const settings = loadSettingsForBoard(boardId);
  const deletedColumns = loadDeletedColumnsForBoard(boardId);
  const deletedTasks = loadDeletedTasksForBoard(boardId);
  const deletedLabels = loadDeletedLabelsForBoard(boardId);

  const boardRecord = await upsertRecord('boards', syncMap, 'boards', boardId, {
    owner: userId,
    local_id: boardId,
    name: board?.name || '',
    settings: settings || {},
  });
  const boardPbId = boardRecord.id;

  for (const label of labels) {
    await upsertRecord('labels', syncMap, 'labels', label.id, {
      owner: userId,
      board: boardPbId,
      local_id: label.id,
      name: label.name,
      color: label.color || '',
      group: label.group || '',
    });
  }

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    await upsertRecord('columns', syncMap, 'columns', col.id, {
      owner: userId,
      board: boardPbId,
      local_id: col.id,
      name: col.name,
      color: col.color || '',
      order: i,
      collapsed: col.collapsed || false,
    });
  }

  for (const task of tasks) {
    const columnPbId = getPbId(syncMap, 'columns', task.column);
    if (!columnPbId) continue;
    const labelPbIds = (task.labels || [])
      .map(lid => getPbId(syncMap, 'labels', lid))
      .filter(Boolean);
    await upsertRecord('tasks', syncMap, 'tasks', task.id, {
      owner: userId,
      board: boardPbId,
      local_id: task.id,
      title: task.title,
      description: task.description || '',
      priority: task.priority || '',
      due_date: task.dueDate || '',
      column: columnPbId,
      order: typeof task.order === 'number' ? task.order : 0,
      labels: labelPbIds,
      creation_date: task.creationDate || '',
      change_date: task.changeDate || '',
      done_date: task.doneDate || '',
      column_history: task.columnHistory || [],
    });
  }

  for (const label of deletedLabels) {
    const pbId = getPbId(syncMap, 'labels', label.id);
    if (pbId) {
      try { await pb.collection('labels').delete(pbId); } catch { /* 404 ok */ }
      delete syncMap.labels[label.id];
    }
  }
  for (const col of deletedColumns) {
    const pbId = getPbId(syncMap, 'columns', col.id);
    if (pbId) {
      try { await pb.collection('columns').delete(pbId); } catch { /* 404 ok */ }
      delete syncMap.columns[col.id];
    }
  }
  for (const task of deletedTasks) {
    const pbId = getPbId(syncMap, 'tasks', task.id);
    if (pbId) {
      try { await pb.collection('tasks').delete(pbId); } catch { /* 404 ok */ }
      delete syncMap.tasks[task.id];
    }
  }

  await purgeDeleted(boardId);
  saveSyncMap(syncMap);
}

// ── pullAllBoards ─────────────────────────────────────────────────────────────

export async function pullAllBoards() {
  if (!(await ensureAuthenticated())) throw new Error('Not authenticated');

  const activeId = getActiveBoardId();
  const syncMap = { boards: {}, columns: {}, labels: {}, tasks: {} };

  const boardRecords = await pb.collection('boards').getFullList({ sort: '-updated' });
  if (!boardRecords || boardRecords.length === 0) return [];

  const localBoards = [];

  for (const boardRec of boardRecords) {
    const boardLocalId = boardRec.local_id;
    setPbId(syncMap, 'boards', boardLocalId, boardRec.id);

    const [columnRecs, labelRecs, taskRecs] = await Promise.all([
      pb.collection('columns').getFullList({ filter: `board = "${boardRec.id}"`, sort: 'order' }),
      pb.collection('labels').getFullList({ filter: `board = "${boardRec.id}"` }),
      pb.collection('tasks').getFullList({ filter: `board = "${boardRec.id}"`, sort: 'order' }),
    ]);

    const columnPbToLocal = {};
    const labelPbToLocal = {};

    for (const col of columnRecs) {
      setPbId(syncMap, 'columns', col.local_id, col.id);
      columnPbToLocal[col.id] = col.local_id;
    }
    for (const lbl of labelRecs) {
      setPbId(syncMap, 'labels', lbl.local_id, lbl.id);
      labelPbToLocal[lbl.id] = lbl.local_id;
    }

    const localColumns = columnRecs.map(col => ({
      id: col.local_id,
      name: col.name,
      color: col.color || '',
      order: col.order,
      collapsed: col.collapsed || false,
    }));

    const localLabels = labelRecs.map(lbl => ({
      id: lbl.local_id,
      name: lbl.name,
      color: lbl.color || '',
      group: lbl.group || '',
    }));

    const localTasks = taskRecs.map(t => {
      setPbId(syncMap, 'tasks', t.local_id, t.id);
      return {
        id: t.local_id,
        title: t.title,
        description: t.description || '',
        priority: t.priority || 'none',
        dueDate: t.due_date || '',
        column: columnPbToLocal[t.column] || t.column,
        order: t.order || 0,
        labels: (t.labels || []).map(pbId => labelPbToLocal[pbId]).filter(Boolean),
        creationDate: t.creation_date || '',
        changeDate: t.change_date || '',
        doneDate: t.done_date || '',
        columnHistory: t.column_history || [],
      };
    });

    saveColumnsForBoard(boardLocalId, localColumns);
    saveTasksForBoard(boardLocalId, localTasks);
    saveLabelsForBoard(boardLocalId, localLabels);
    saveSettingsForBoard(boardLocalId, boardRec.settings || {});

    localBoards.push({ id: boardLocalId, name: boardRec.name });
  }

  const pulledIds = localBoards.map(b => b.id);
  if (!activeId || !pulledIds.includes(activeId)) {
    setActiveBoardId(localBoards[0].id);
  }

  saveSyncMap(syncMap);
  return localBoards;
}

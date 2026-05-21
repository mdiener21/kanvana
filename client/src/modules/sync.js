import PocketBase from 'pocketbase';
import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadBoardEvents,
  loadDeletedColumnsForBoard,
  loadDeletedTasksForBoard,
  loadDeletedLabelsForBoard,
  getPendingHardDeletes,
  clearPendingHardDeleteEntry,
  addPendingHardDelete,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  saveBoardEvents,
  getBoardById,
  setActiveBoardId,
  getActiveBoardId,
  loadGlobalSettings,
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

function emptySyncMap() {
  return { boards: {}, columns: {}, labels: {}, tasks: {}, task_relationships: {}, events: {} };
}

function loadSyncMap() {
  try {
    const raw = localStorage.getItem(SYNC_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure new entity-type buckets exist in stored maps from older versions.
      return { ...emptySyncMap(), ...parsed };
    }
  } catch { /* ignore */ }
  return emptySyncMap();
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
  const softDeleteEnabled = loadGlobalSettings().softDeleteEnabled === true;

  const columns = loadColumnsForBoard(boardId);
  const tasks = loadTasksForBoard(boardId);
  const labels = loadLabelsForBoard(boardId);
  const settings = loadSettingsForBoard(boardId);
  const boardEvents = loadBoardEvents(boardId);
  const deletedColumns = loadDeletedColumnsForBoard(boardId);
  const deletedTasks = loadDeletedTasksForBoard(boardId);
  const deletedLabels = loadDeletedLabelsForBoard(boardId);

  // ── Board ──────────────────────────────────────────────────────────────────

  const boardRecord = await upsertRecord('boards', syncMap, 'boards', boardId, {
    owner: userId,
    local_id: boardId,
    name: board?.name || '',
    settings: settings || {},
  });
  const boardPbId = boardRecord.id;

  // ── Labels ─────────────────────────────────────────────────────────────────

  for (const label of labels) {
    await upsertRecord('labels', syncMap, 'labels', label.id, {
      owner: userId,
      board: boardPbId,
      local_id: label.id,
      name: label.name,
      color: label.color || '',
      group: label.group || '',
      deleted: label.deleted || false,
    });
  }

  // ── Columns ────────────────────────────────────────────────────────────────

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
      role: col.role || '',
      deleted: col.deleted || false,
    });
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

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
      sub_tasks: task.subTasks || [],
      swimlane_label_id: task.swimlaneLabelId || '',
      deleted: task.deleted || false,
    });
  }

  // ── Task relationships ─────────────────────────────────────────────────────
  // Upsert current relationships; delete any stale syncMap entries.

  const pushedRelLocalIds = new Set();

  for (const task of tasks) {
    const taskPbId = getPbId(syncMap, 'tasks', task.id);
    if (!taskPbId) continue;
    for (const rel of (task.relationships || [])) {
      const targetPbId = getPbId(syncMap, 'tasks', rel.targetTaskId);
      if (!targetPbId) continue;
      const relLocalId = `${task.id}::${rel.targetTaskId}`;
      pushedRelLocalIds.add(relLocalId);
      await upsertRecord('task_relationships', syncMap, 'task_relationships', relLocalId, {
        owner: userId,
        board: boardPbId,
        task: taskPbId,
        target_task: targetPbId,
        relationship_type: rel.type,
        local_id: relLocalId,
      });
    }
  }

  for (const [localId, pbId] of Object.entries(syncMap.task_relationships || {})) {
    if (!pushedRelLocalIds.has(localId)) {
      try { await pb.collection('task_relationships').delete(pbId); } catch { /* 404 ok */ }
      delete syncMap.task_relationships[localId];
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  // Events are append-only; skip entries without an id (pre-schema entries).

  for (const task of tasks) {
    const taskPbId = getPbId(syncMap, 'tasks', task.id);
    if (!taskPbId) continue;
    for (const entry of (task.activityLog || [])) {
      if (!entry.id) continue;
      await upsertRecord('events', syncMap, 'events', entry.id, {
        owner: userId,
        board: boardPbId,
        task: taskPbId,
        event_type: entry.type,
        at: entry.at,
        actor_type: entry.actor?.type || 'human',
        actor_id: entry.actor?.id || '',
        details: entry.details || {},
        local_id: entry.id,
      });
    }
  }

  for (const entry of boardEvents) {
    if (!entry.id) continue;
    await upsertRecord('events', syncMap, 'events', entry.id, {
      owner: userId,
      board: boardPbId,
      task: null,
      event_type: entry.type,
      at: entry.at,
      actor_type: entry.actor?.type || 'human',
      actor_id: entry.actor?.id || '',
      details: entry.details || {},
      local_id: entry.id,
    });
  }

  // ── Hard-deletes ───────────────────────────────────────────────────────────

  if (softDeleteEnabled) {
    for (const task of deletedTasks) {
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
        sub_tasks: task.subTasks || [],
        swimlane_label_id: task.swimlaneLabelId || '',
        deleted: true,
      });
    }
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
  if (!softDeleteEnabled) {
    for (const task of deletedTasks) {
      const pbId = getPbId(syncMap, 'tasks', task.id);
      if (pbId) {
        // PocketBase cascade deletes the task's task_relationships records.
        try { await pb.collection('tasks').delete(pbId); } catch { /* 404 ok */ }
        delete syncMap.tasks[task.id];
      }
    }

    for (const entry of getPendingHardDeletes()) {
      const localTaskId = entry.localTaskId;
      const pbId = getPbId(syncMap, 'tasks', localTaskId);
      if (pbId) {
        try { await pb.collection('tasks').delete(pbId); } catch { /* 404 ok */ }
        delete syncMap.tasks[localTaskId];
      }
      clearPendingHardDeleteEntry(localTaskId);
    }
  }

  await purgeDeleted(boardId);
  saveSyncMap(syncMap);
}

// ── runPurge ──────────────────────────────────────────────────────────────────

export async function runPurge(boards) {
  const online = isAuthenticated();
  const syncMap = online ? loadSyncMap() : null;
  let syncMapDirty = false;

  for (const board of boards) {
    const boardId = board.id;
    const deletedTasks = loadDeletedTasksForBoard(boardId);

    if (online) {
      for (const task of deletedTasks) {
        const pbId = getPbId(syncMap, 'tasks', task.id);
        if (pbId) {
          try { await pb.collection('tasks').delete(pbId); } catch { /* 404 ok */ }
          delete syncMap.tasks[task.id];
          syncMapDirty = true;
        }
      }
    } else {
      for (const task of deletedTasks) {
        addPendingHardDelete({ localTaskId: task.id, boardId });
      }
    }

    await purgeDeleted(boardId);
  }

  if (online && syncMapDirty) saveSyncMap(syncMap);
}

// ── pullAllBoards ─────────────────────────────────────────────────────────────

export async function pullAllBoards() {
  if (!(await ensureAuthenticated())) throw new Error('Not authenticated');

  const activeId = getActiveBoardId();
  const syncMap = emptySyncMap();

  const boardRecords = await pb.collection('boards').getFullList({ sort: '-updated' });
  if (!boardRecords || boardRecords.length === 0) return [];

  const localBoards = [];

  for (const boardRec of boardRecords) {
    const boardLocalId = boardRec.local_id;
    setPbId(syncMap, 'boards', boardLocalId, boardRec.id);

    const [columnRecs, labelRecs, taskRecs, relRecs, eventRecs] = await Promise.all([
      pb.collection('columns').getFullList({ filter: `board = "${boardRec.id}"`, sort: 'order' }),
      pb.collection('labels').getFullList({ filter: `board = "${boardRec.id}"` }),
      pb.collection('tasks').getFullList({ filter: `board = "${boardRec.id}"`, sort: 'order' }),
      pb.collection('task_relationships').getFullList({ filter: `board = "${boardRec.id}"` }),
      pb.collection('events').getFullList({ filter: `board = "${boardRec.id}"`, sort: 'at' }),
    ]);

    // Build PB-id → local-id maps for cross-reference resolution.
    const columnPbToLocal = {};
    const labelPbToLocal = {};
    const taskPbToLocal = {};

    for (const col of columnRecs) {
      setPbId(syncMap, 'columns', col.local_id, col.id);
      columnPbToLocal[col.id] = col.local_id;
    }
    for (const lbl of labelRecs) {
      setPbId(syncMap, 'labels', lbl.local_id, lbl.id);
      labelPbToLocal[lbl.id] = lbl.local_id;
    }
    for (const t of taskRecs) {
      setPbId(syncMap, 'tasks', t.local_id, t.id);
      taskPbToLocal[t.id] = t.local_id;
    }

    // ── Relationships: group by source task local_id ──────────────────────

    const taskRelationships = {};
    for (const rel of relRecs) {
      setPbId(syncMap, 'task_relationships', rel.local_id, rel.id);
      const taskLocalId = taskPbToLocal[rel.task];
      const targetLocalId = taskPbToLocal[rel.target_task];
      if (!taskLocalId || !targetLocalId) continue;
      if (!taskRelationships[taskLocalId]) taskRelationships[taskLocalId] = [];
      taskRelationships[taskLocalId].push({ type: rel.relationship_type, targetTaskId: targetLocalId });
    }

    // ── Events: split into task-scoped and board-scoped ───────────────────

    const taskActivityLogs = {};
    const pulledBoardEvents = [];
    for (const evtRec of eventRecs) {
      setPbId(syncMap, 'events', evtRec.local_id, evtRec.id);
      const entry = {
        id: evtRec.local_id,
        type: evtRec.event_type,
        at: evtRec.at,
        actor: { type: evtRec.actor_type, id: evtRec.actor_id || null },
        details: evtRec.details || {},
      };
      if (evtRec.task) {
        const taskLocalId = taskPbToLocal[evtRec.task];
        if (taskLocalId) {
          if (!taskActivityLogs[taskLocalId]) taskActivityLogs[taskLocalId] = [];
          taskActivityLogs[taskLocalId].push(entry);
        }
      } else {
        pulledBoardEvents.push(entry);
      }
    }

    // ── Reconstruct local domain objects ──────────────────────────────────

    const localColumns = columnRecs.map(col => ({
      id: col.local_id,
      name: col.name,
      color: col.color || '',
      order: col.order,
      collapsed: col.collapsed || false,
      role: col.role || '',
      deleted: col.deleted || false,
    }));

    const localLabels = labelRecs.map(lbl => ({
      id: lbl.local_id,
      name: lbl.name,
      color: lbl.color || '',
      group: lbl.group || '',
      deleted: lbl.deleted || false,
    }));

    const localTasks = taskRecs.map(t => {
      const localId = t.local_id;
      return {
        id: localId,
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
        subTasks: t.sub_tasks || [],
        swimlaneLabelId: t.swimlane_label_id || '',
        deleted: t.deleted || false,
        relationships: taskRelationships[localId] || [],
        activityLog: taskActivityLogs[localId] || [],
      };
    });

    saveColumnsForBoard(boardLocalId, localColumns);
    saveTasksForBoard(boardLocalId, localTasks);
    saveLabelsForBoard(boardLocalId, localLabels);
    saveSettingsForBoard(boardLocalId, boardRec.settings || {});
    saveBoardEvents(boardLocalId, pulledBoardEvents);

    localBoards.push({ id: boardLocalId, name: boardRec.name });
  }

  const pulledIds = localBoards.map(b => b.id);
  if (!activeId || !pulledIds.includes(activeId)) {
    setActiveBoardId(localBoards[0].id);
  }

  saveSyncMap(syncMap);
  return localBoards;
}

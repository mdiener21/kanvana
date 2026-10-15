# Implementation Plan: PocketBase Backend Storage

Date: 2026-05-02
Spec: `docs/system/spec/plan/backend-storage-pb.md`

## Prerequisites

- PocketBase already running in `docker-compose.yml` (adrianmusante/pocketbase image)
- Nginx already proxies `/api/` → PocketBase at `http://pocketbase:80`
- IDB storage layer live in `client/src/modules/storage.js`
- No `pocketbase` npm package installed yet

---

## Phase 1: Storage Layer — Soft-Delete

**Files:** `client/src/modules/storage.js`, `client/src/modules/tasks.js`, `client/src/modules/columns.js`, `client/src/modules/labels.js`

### 1.1 Add `deleted` field to domain objects

- Task: add `deleted: false` to `createTask` factory
- Column: add `deleted: false` to `createColumn` factory
- Label: add `deleted: false` to `createLabel` factory
- Board: add `deleted: false` to board object in `createBoard`

### 1.2 Soft-delete in storage.js

- `saveColumns`, `saveTasks`, `saveLabels` already filter by active board — no change needed to signature
- Add `loadDeletedTasksForBoard(boardId)`, `loadDeletedColumnsForBoard(boardId)`, `loadDeletedLabelsForBoard(boardId)` — returns only `deleted: true` records
- All existing read fns (`loadTasks`, `loadColumns`, `loadLabels`, `loadTasksForBoard`, etc.) add `.filter(x => !x.deleted)`

### 1.3 Soft-delete in mutation modules

- `deleteTask(taskId)` in `tasks.js`: set `deleted: true`, call `saveTasks(updated)` (do not splice)
- `deleteColumn(columnId)` in `columns.js`: set `deleted: true`, call `saveColumns(updated)`
- `deleteLabel(labelId)` in `labels.js`: set `deleted: true`, call `saveLabels(updated)`
- `deleteBoard(boardId)` in `storage.js`: set `deleted: true`, call `saveBoards(updated)`

### 1.4 Emit `kanban-local-change` from storage write fns

Add to `storage.js` (internal helper, not exported):
```js
function emitLocalChange(boardId, entity) {
  window.dispatchEvent(new CustomEvent('kanban-local-change', { detail: { boardId, entity } }));
}
```

Call after each IDB write in: `saveTasks`, `saveColumns`, `saveLabels`, `saveSettings`, `saveBoards` (pass `activeBoardId` and entity name).

### 1.5 `purgeDeleted(boardId)`

Export from `storage.js`:
- Hard-remove all `deleted: true` records from IDB for the given board
- Called by sync layer after confirmed PocketBase deletes

---

## Phase 2: PocketBase Migrations

**Files:** `devops/local/backend/pb_migrations/`

### 2.1 Collection migration files

Create one JSON migration file per collection. PocketBase loads these on startup.

Files:
- `1746000000_create_boards.json`
- `1746000001_create_columns.json`
- `1746000002_create_labels.json`
- `1746000003_create_tasks.json`

Each file defines: collection name, fields (see spec schema table), access rules:
```json
"listRule": "owner = @request.auth.id",
"viewRule": "owner = @request.auth.id",
"createRule": "owner = @request.auth.id",
"updateRule": "owner = @request.auth.id",
"deleteRule": "owner = @request.auth.id"
```

### 2.2 PocketBase Dockerfile

`devops/local/backend/Dockerfile`:
- Base: `adrianmusante/pocketbase` (match docker-compose image)
- Copy `pb_migrations/` into image at PocketBase migrations path
- PocketBase auto-applies migrations on start

### 2.3 Update docker-compose.yml

- Point `pocketbase` service to build from `devops/local/backend/Dockerfile`
- Mount `pb_data` volume for persistence
- Keep healthcheck

---

## Phase 3: Sync Module

**File:** `client/src/modules/sync.js`

### 3.1 PocketBase client init

```js
import PocketBase from 'pocketbase';
const PB_URL = import.meta.env.VITE_PB_URL || '/';
const pb = new PocketBase(PB_URL);
```

No manual `hydrateAuthStoreFromLocalStorage` — SDK restores from localStorage on init.

Emit `auth-changed` on store change:
```js
pb.authStore.onChange(() => window.dispatchEvent(new CustomEvent('auth-changed')));
```

### 3.2 Auth fns

- `isAuthenticated()`: `return Boolean(pb.authStore.token && pb.authStore.record)`
- `ensureAuthenticated()`: check token+record → if expired, try `authRefresh()` → if refresh fails, return `false`
- `getUser()`: `return pb.authStore.record`
- `loginUser(email, password)`: `pb.collection('users').authWithPassword(...)`
- `registerUser(email, password, name)`: `pb.collection('users').create(...)` — caller shows "confirm email" message, no auto-login
- `loginWithProvider(provider)`: `pb.collection('users').authWithOAuth2({ provider })`
- `logoutUser()`: `pb.authStore.clear()`

### 3.3 syncMap helpers

Keep in localStorage as-is from plan: `loadSyncMap`, `saveSyncMap`, `getPbId`, `setPbId`.

### 3.4 `pushBoardFull(boardId)`

Signature change: takes `boardId` only, loads data internally:

```js
import { loadColumnsForBoard, loadTasksForBoard, loadLabelsForBoard, loadSettingsForBoard,
         loadDeletedColumnsForBoard, loadDeletedTasksForBoard, loadDeletedLabelsForBoard,
         purgeDeleted } from './storage.js';
```

Steps:
1. `ensureAuthenticated()` — throw if false
2. Load live data via board-scoped storage fns (never touch activeBoardId)
3. Upsert board record
4. Upsert live columns, labels, tasks via `upsertRecord`
5. For each deleted entity: delete from PocketBase by `local_id`, remove from syncMap
6. After all deletes confirmed: call `purgeDeleted(boardId)`
7. Save syncMap

### 3.5 `pullAllBoards()`

Steps:
1. `ensureAuthenticated()` — throw if false
2. Fetch all boards for user from PocketBase
3. For each board: fetch columns, labels, tasks in parallel
4. Map PocketBase IDs back to local IDs
5. Write to IDB via `storage.js` write fns — never `localStorage.setItem`
6. Preserve active board ID if exists in pulled boards, else set to first
7. Save syncMap
8. Return pulled board list

---

## Phase 4: Auto-Sync Module

**File:** `client/src/modules/autosync.js`

### 4.1 Lean on storage.js

Remove all local `safeParseArray`, `listBoardsLocal`, `loadColumnsLocal` etc. — import from `storage.js` directly.

### 4.2 Scoped push

```js
window.addEventListener('kanban-local-change', (e) => {
  const { boardId } = e.detail || {};
  if (boardId) scheduleAutoSync(boardId);
});
```

`scheduleAutoSync(boardId)` debounces per boardId (700ms), calls `pushBoardFull(boardId)`.

### 4.3 In-flight guard

Per-boardId in-flight + queue flags (not global). Concurrent pushes for different boards are fine.

### 4.4 Exports

- `isAutoSyncEnabled()` — reads localStorage
- `enableAutoSync()` — sets localStorage flag
- `disableAutoSync()`
- `initializeAutoSync()` — registers `kanban-local-change` listener, catch-up push on page load
- `scheduleAutoSync(boardId)`

---

## Phase 5: Auth/Sync UI Module

**File:** `client/src/modules/authsync.js`

### 5.1 Replace `alert()` with `alertDialog`

All `alert(...)` calls → `await alertDialog({ title, message })` from `dialog.js`.

### 5.2 Registration flow

After `registerUser()` success:
```
await alertDialog({ title: 'Confirm your email', message: 'Check your email to confirm your account before logging in.' });
setEmailMode(false); // switch back to login mode
```
No auto-login.

### 5.3 Sync button handler

- Push: call `pushBoardFull` for each board (loop, not push-all fn)
- Pull: call `pullAllBoards()`, then `renderBoard()` + `initializeBoardsUI()`
- Enable auto-sync after first successful push

### 5.4 "Go Online" availability

On `initializeAuthSyncUI()`, probe PocketBase health (`/api/health`). If unreachable:
- Disable `#login-btn`
- Set `title="Backend unavailable"` tooltip
- Log `console.warn('PocketBase unreachable at', PB_URL)`

### 5.5 Auth UI update

After pull, preserve active board: check if current `activeBoardId` in pulled boards, else set first.

---

## Phase 6: CSS

**File:** `client/src/styles/components/auth.css`

Copy from plan `feature-backend-storage/auth.css` — already uses design tokens, no changes needed.

Import in `client/src/styles/index.css`:
```css
@import './components/auth.css';
```

---

## Phase 7: HTML + Icons

**File:** `client/src/index.html`

Add login modal markup (from spec). Add `#login-btn`, `#user-info`, `#user-name`, `#sync-btn`, `#logout-btn` to header.

**File:** `client/src/modules/icons.js`

Add: `Cloud`, `RefreshCw`, `LogOut`, `Chrome`, `Apple`, `LayoutGrid` (already imported in plan).

**File:** `client/src/modules/modals.js`

Add `hideLoginModal()` export.

---

## Phase 8: Entry Point Wiring

**File:** `client/src/kanban.js`

```js
import { initializeAuthSyncUI } from './modules/authsync.js';
import { initializeAutoSync } from './modules/autosync.js';

// after initStorage():
initializeAuthSyncUI();
initializeAutoSync();
```

---

## Phase 9: npm Dependency

```bash
cd client && npm install pocketbase
```

---

## Implementation Order

1. Phase 1 — soft-delete + emit events (storage layer, no new deps)
2. Phase 2 — PocketBase migrations + Dockerfile
3. Phase 9 — install pocketbase npm package
4. Phase 3 — sync.js
5. Phase 4 — autosync.js
6. Phase 6 — auth.css
7. Phase 7 — HTML + icons + modals
8. Phase 5 — authsync.js
9. Phase 8 — kanban.js wiring

---

## Testing Checklist

- [ ] Soft-delete: deleted tasks/columns/labels not visible in board UI
- [ ] `loadDeletedTasksForBoard` returns only deleted records
- [ ] `purgeDeleted` hard-removes from IDB
- [ ] `kanban-local-change` fires on every mutation with correct `boardId` + `entity`
- [ ] `isAuthenticated()` false when no token
- [ ] `ensureAuthenticated()` returns false on failed refresh
- [ ] Register → email confirmation message shown, no auto-login
- [ ] Login → auth UI updates, "Go Online" hidden, user chip shown
- [ ] Push → all boards upserted, deleted entities removed from PocketBase + purged local
- [ ] Pull → IDB updated via storage fns, active board preserved if exists
- [ ] Auto-sync: edit task → debounced push fires for that board only
- [ ] "Go Online" disabled + tooltip when PocketBase unreachable
- [ ] No `alert()` or `window.confirm()` anywhere in auth/sync flow
- [ ] Docker: `docker compose up` → PocketBase starts with migrations applied

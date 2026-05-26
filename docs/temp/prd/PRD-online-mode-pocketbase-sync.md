# Product Requirement Document (PRD): Online Mode PocketBase Sync

---

## 1. Problem Statement

Kanvana is local-first by default. Users can work fully offline in the browser, but they also need an optional way to sign in, persist boards to PocketBase, and restore those boards on another device.

Online Mode is the current product contract for that optional backend path. It must keep offline use safe, make backend availability visible, and avoid hidden merge behavior.

---

## 2. Scope

Online Mode covers:

- `Go Online` entry point in the header.
- PocketBase health probe.
- Email/password sign-in and registration.
- OAuth2 sign-in through Google, Apple, and Microsoft.
- Session refresh and logout.
- Manual `Sync` push/pull.
- Auto-sync after successful push.
- PocketBase data mapping for boards, columns, labels, tasks, relationships, and events.

Online Mode does not change the local-first storage model. IndexedDB remains the source of local app state.

---

## 3. Current Product Contract

### Local-First Default

Users can use Kanvana without a backend. If PocketBase is unreachable, the board remains usable offline and no local data is blocked.

### Backend Availability

On board page load, Kanvana probes the PocketBase health endpoint:

```text
<VITE_PB_URL or same-origin /> + /api/health
```

When the probe succeeds, `Go Online` remains available.

When the probe fails or times out:

- `Go Online` is disabled.
- The button title becomes `Backend unavailable`.
- A modal titled `Sync Server Unavailable` tells the user the board still works offline.
- The modal shows the exact health URL that was probed.
- A warning is logged to the console.

### Authentication

`Go Online` opens the login modal when enabled.

Email login:

- User enters email and password.
- Success closes the modal and shows the signed-in user chip.
- Failure displays an inline message in the modal.

Registration:

- User enters email, password, and optional name.
- Success returns to login mode and prompts the user to confirm email before logging in.
- Registration does not auto-login.

OAuth2 login:

- Supported providers: Google, Apple, Microsoft.
- Unsupported provider buttons are rejected with an inline error.

Session handling:

- PocketBase SDK persists auth in `localStorage`.
- Auth changes emit `auth-changed`.
- Before sync, `ensureAuthenticated()` refreshes an expired token.
- If refresh fails, sync stops and the login modal opens with a session-expired message.

### Manual Sync

The `Sync` button is visible when the user is authenticated and auto-sync is off.

Clicking `Sync` first verifies authentication, then asks:

| Choice | Current behavior |
|---|---|
| Push to Cloud | Pushes every local board to PocketBase, enables auto-sync, schedules one auto-sync for each board, then shows success feedback. |
| Pull from Cloud | Requires a second confirmation, replaces local board data with PocketBase data, re-renders the board, rebuilds board UI, then shows success feedback. |

If pull finds no remote boards, Kanvana shows `No data found in cloud.` and leaves local data unchanged.

### Auto-Sync

Auto-sync is enabled only after a successful manual push.

When enabled:

- `kanban-local-change` events schedule a push for the affected board.
- Pushes debounce for 700ms per board.
- A per-board in-flight guard prevents overlapping pushes.
- If a change happens while a board push is in flight, one follow-up push is queued.
- Auto-sync errors are logged and do not block local work.

### Conflict Policy

Online Mode V1 has no merge strategy and no conflict-resolution UI.

The current conflict contract is explicit direction choice:

- Push: local state overwrites cloud state for pushed entities.
- Pull: cloud state replaces local state after user confirmation.
- Auto-sync: local changes push to cloud per board.

---

## 4. Synced Data

`pushBoardFull(boardId)` serializes one local board and syncs:

- Board metadata and settings.
- Columns.
- Labels.
- Tasks.
- Task relationships.
- Task activity log entries.
- Board event log entries.
- Soft-deleted task records when soft-delete mode is enabled.
- Pending hard-deletes when permanent-delete mode is active.

`pullAllBoards()` fetches all remote boards for the authenticated user and reconstructs local records using PocketBase record IDs mapped back to local UUIDs.

The sync map lives in `localStorage` under `kanbanSyncMap` and maps local UUIDs to PocketBase record IDs for:

- `boards`
- `columns`
- `labels`
- `tasks`
- `task_relationships`
- `events`

---

## 5. User Stories

- As an offline-first user, I can use Kanvana even when PocketBase is unavailable.
- As a user trying to go online, I can see immediately when the sync backend is unreachable.
- As a user or support person, I can see the exact backend health URL that failed.
- As a user, I can sign in with email/password or supported OAuth providers.
- As a new user, I can register and get clear email-confirmation guidance.
- As a signed-in user, I can push all local boards to cloud.
- As a signed-in user, I can pull cloud boards into local storage only after explicit confirmation.
- As a signed-in user, I can rely on auto-sync after an initial successful push.
- As a user with data on multiple devices, I understand that V1 uses push/pull direction choice, not automatic merge.

---

## 6. Acceptance Criteria

- Health probe uses `VITE_PB_URL` when present and same-origin `/` otherwise.
- Failed health probe disables `#login-btn`, sets tooltip text, logs a warning, and shows `Sync Server Unavailable`.
- Login errors are shown inline in the login modal.
- HTTP 5xx auth errors include status code and backend URL.
- Successful login updates header auth UI without page reload.
- Registration success tells the user to confirm email and does not auto-login.
- Manual push calls `pushBoardFull(boardId)` for every local board.
- Successful manual push enables auto-sync and schedules each board.
- Manual pull requires explicit replace-local confirmation.
- Successful manual pull calls `pullAllBoards()`, `renderBoard()`, and `initializeBoardsUI()`.
- Auto-sync remains per-board, debounced, and non-blocking.
- No V1 flow attempts automatic merge or conflict resolution.

---

## 7. Out of Scope

- Shared boards or multi-user collaboration.
- Realtime PocketBase subscriptions.
- Field-level merge.
- Conflict-resolution UI.
- Offline operation queue beyond existing pending hard-delete cleanup.
- Backend admin UI flows.
- Changing local IndexedDB as primary runtime storage.

---

## 8. Source References

| Area | Source |
|---|---|
| Auth and sync UI | `client/src/modules/authsync.js` |
| PocketBase SDK and push/pull | `client/src/modules/sync.js` |
| Auto-sync | `client/src/modules/autosync.js` |
| Header controls and login modal | `client/src/index.html` |
| PocketBase migrations | `backend/pb_migrations/` |
| Sync spec | `docs/system/spec/sync.md` |
| Backend storage spec | `docs/system/spec/backend-storage-pb.md` |


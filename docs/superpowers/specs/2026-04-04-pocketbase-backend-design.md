# PocketBase Backend Integration Design

**Date:** 2026-04-04
**Status:** Approved — Security-Hardened Revision
**Scope:** Phase 1 (local-first default + optional PocketBase backend, single-user, read-only offline)

---

## Overview

Kanvana is a local-first kanban board that stores all data in browser IndexedDB. This design adds an
optional PocketBase backend that users can explicitly enable by connecting to a self-hosted PocketBase
instance. The default local-only experience is unchanged.

### Goals

- Local-first mode remains the default; users opt in to PocketBase explicitly
- All local data migrates to PocketBase on first connect (no data loss)
- Multi-user: each user authenticates and sees only their own boards
- Writes sync immediately to PocketBase on every save
- Phase 1 offline: read-only from cache when PocketBase is unreachable
- Phase 2 (future): full offline with write queue and real-time multi-user collaboration
- Zero-trust security: deny by default, least-privilege access, every request verified
- AI agents are first-class users, authenticated via API tokens (not interactive credentials)

### Non-Goals (Phase 1)

- Board sharing or collaboration between users
- Offline write queue / conflict resolution
- Real-time subscriptions
- PocketBase-hosted file attachments

---

## Architecture

### Storage Adapter Pattern

A new module `src/modules/storage-adapter.js` acts as the single import point for all storage
operations. It holds a reference to the active adapter and re-exports the same function signatures
that `storage.js` provides today.

```
src/modules/storage-adapter.js   ← single import point for all consumers
  ├── IDB adapter  →  src/modules/storage.js         (unchanged, existing)
  └── PB adapter   →  src/modules/pb-storage.js      (new)
```

On startup, `storage-adapter.js` checks IDB for a `kanvana-pb-config` key. If present and the auth
token is valid (or successfully refreshed), it activates the PocketBase adapter. Otherwise it
activates the IDB adapter.

All existing call sites (`tasks.js`, `columns.js`, `boards.js`, `render.js`, `importexport.js`,
entry points, etc.) are updated to import from `./storage-adapter.js` instead of `./storage.js`.
No other changes are required in those modules.

### Adapter Interface Contract

Every adapter must implement the following functions with identical signatures to `storage.js`:

```js
initStorage()
ensureBoardsInitialized()

listBoards()
getBoardById(boardId)
getActiveBoardId()
setActiveBoardId(boardId)
createBoard(name)
renameBoard(boardId, newName)
deleteBoard(boardId)

loadTasks()
saveTasks(tasks)
loadColumns()
saveColumns(columns)
loadLabels()
saveLabels(labels)
loadSettings()
saveSettings(settings)

loadTasksForBoard(boardId)
loadColumnsForBoard(boardId)
loadLabelsForBoard(boardId)
loadSettingsForBoard(boardId)
```

The IDB adapter (`storage.js`) already implements all of these. No changes to its public API.

---

## PocketBase Schema

Four collections plus PocketBase's built-in `users` collection. All collections carry a `user`
relation field and API rules that enforce per-user data isolation.

### API Rules (applied to every collection)

Zero-trust deny-by-default: every collection must explicitly grant access. No collection may have
empty rules. New collections added in future must follow the same pattern before going live.

```
list/search:  @request.auth.id != "" && user = @request.auth.id
view:         @request.auth.id != "" && user = @request.auth.id
create:       @request.auth.id != "" && @request.body.user = @request.auth.id
update:       @request.auth.id != "" && user = @request.auth.id
delete:       @request.auth.id != "" && user = @request.auth.id
```

**PocketBase admin API:** The admin API (`/_/`) must never be exposed publicly. Self-hosters must
place it behind a firewall rule or reverse-proxy block. Kanvana never calls admin routes — any
adapter code that would require admin credentials is forbidden.

### Collection: `boards`

| Field        | Type     | Notes                                      |
|--------------|----------|--------------------------------------------|
| id           | auto     | PocketBase record ID                       |
| user         | relation | → users (required)                         |
| name         | text     | Board display name                         |
| createdAt    | date     |                                            |
| kanvana_id   | text     | Original client-side UUID (migration key)  |

### Collection: `tasks`

| Field          | Type     | Notes                                               |
|----------------|----------|-----------------------------------------------------|
| id             | auto     |                                                     |
| user           | relation | → users                                             |
| board          | relation | → boards                                            |
| kanvana_id     | text     | Original client-side UUID                           |
| title          | text     |                                                     |
| description    | text     |                                                     |
| priority       | text     | urgent\|high\|medium\|low\|none                     |
| dueDate        | text     | YYYY-MM-DD or empty                                 |
| column         | text     | kanvana_id of the column                            |
| order          | number   |                                                     |
| labels         | json     | array of label kanvana_ids                          |
| columnHistory  | json     | `[{ column: kanvana_id, at: ISO }]`                 |
| relationships  | json     | `[{ type, targetTaskId: kanvana_id }]`              |
| subTasks       | json     | sub-task array                                      |
| creationDate   | date     |                                                     |
| changeDate     | date     |                                                     |
| doneDate       | date     | present only when task is in Done column            |

### Collection: `columns`

| Field       | Type     | Notes                         |
|-------------|----------|-------------------------------|
| id          | auto     |                               |
| user        | relation | → users                       |
| board       | relation | → boards                      |
| kanvana_id  | text     | Original client-side UUID     |
| name        | text     |                               |
| color       | text     | hex color                     |
| order       | number   |                               |
| collapsed   | bool     |                               |

### Collection: `labels`

| Field       | Type     | Notes                     |
|-------------|----------|---------------------------|
| id          | auto     |                           |
| user        | relation | → users                   |
| board       | relation | → boards                  |
| kanvana_id  | text     | Original client-side UUID |
| name        | text     | max 40 chars              |
| color       | text     | hex color                 |
| group       | text     | optional label group      |

### Collection: `board_settings`

| Field  | Type     | Notes                                                          |
|--------|----------|----------------------------------------------------------------|
| id     | auto     |                                                               |
| user   | relation | → users                                                        |
| board  | relation | → boards (unique per board per user)                           |
| data   | json     | Full settings object (matches `defaultSettings()` shape)       |

Using a single `data` JSON field for settings avoids schema churn as settings fields evolve.

---

## Authentication & Configuration

### Connection Flow

1. User opens a new top-level "App Settings" modal (global, not per-board)
2. User enters PocketBase instance URL, email, and password
3. Kanvana calls PocketBase auth endpoint via the PocketBase JS SDK
4. On success: migration flow starts (see Migration section)
5. On failure: error message shown inline, no state change

### Token Persistence

Stored in IDB under key `kanvana-pb-config`:

```js
{
  url: "https://pb.myserver.com",
  token: "<pb-auth-token>",
  userId: "<pb-user-id>",
  tokenExpiry: "ISO-date-string"
}
```

- Password is never stored
- On app startup, if `kanvana-pb-config` is present: attempt silent token refresh via PocketBase
  auth refresh endpoint
- If refresh succeeds: activate PocketBase adapter
- If refresh fails: fall back to IDB adapter, surface "Reconnect to PocketBase" prompt in header
- Logout: delete `kanvana-pb-config` from IDB, switch to IDB adapter, reload

**Token expiry — mid-session:** `pb-auth.js` sets a JavaScript timer at startup to refresh the
token 60 seconds before `tokenExpiry`. If the refresh fails mid-session, the app transitions to
read-only offline mode and surfaces a "Session expired — reconnect" prompt. It does not wait for
the next page load.

**Token storage risk acknowledgement:** IDB is accessible to any JavaScript on the same origin.
A CSP (see Security section) materially reduces this risk but does not eliminate it. This is an
inherent trade-off of storing auth state in a browser-only app. The token is short-lived (PocketBase
default: 30 minutes) to limit the blast radius of any exfiltration.

### Disconnect

A "Disconnect" button in App Settings clears `kanvana-pb-config`, switches back to the IDB adapter,
and reloads. Local IDB data (the migration snapshot) is still present and becomes active again.

---

## PocketBase Adapter (`src/modules/pb-storage.js`)

### In-Memory Cache

The adapter maintains the same in-memory `state` shape as `storage.js`:

```js
const state = {
  boards: [],
  activeBoardId: null,
  tasks: {},     // { [boardId]: task[] }
  columns: {},   // { [boardId]: column[] }
  labels: {},    // { [boardId]: label[] }
  settings: {}   // { [boardId]: object }
}
```

`initStorage()` fetches all user data from PocketBase and populates this cache. Subsequent reads are
synchronous from cache — identical behaviour to the IDB adapter.

### ID Mapping

The adapter maintains an internal `idMap` that translates `kanvana_id` ↔ PocketBase record `id`:

```js
const idMap = {
  boards: Map<kanvana_id, pb_id>,
  tasks:  Map<kanvana_id, pb_id>,
  columns: Map<kanvana_id, pb_id>,
  labels: Map<kanvana_id, pb_id>
}
```

The rest of the app always works with `kanvana_id` values. The adapter translates to/from PocketBase
IDs internally when constructing API payloads. This preserves all existing cross-references
(`task.column`, `task.labels[]`, `task.relationships[].targetTaskId`) without changes to any
consuming module.

### Write Strategy

Every `saveTasks()`, `saveColumns()`, `saveLabels()`, `saveSettings()` call:

1. Updates the in-memory cache immediately (UI never waits for network)
2. Diffs the new state against the previous cache to determine which records to `create`, `update`,
   or `delete` on PocketBase
3. Fires async PocketBase REST calls
4. On error: logs to console, emits a `pb:sync-error` event that the UI layer listens to in order
   to show a non-blocking toast. The in-memory state remains updated; the change is not durably
   persisted until the next successful write.

**Phase 2 note:** Step 4 will instead enqueue the failed write to a durable IDB write queue,
enabling full offline sync on reconnect.

### Connectivity & Offline (Phase 1)

- Every outbound call is wrapped in a try/catch
- On network error or non-2xx PocketBase response: set `isOffline = true`, emit `pb:offline` event
- While `isOffline`:
  - All reads serve from cache (normal operation)
  - All writes are rejected; a `pb:write-blocked` event triggers the "read-only" UI notice
- A periodic ping every 30 seconds attempts a lightweight PocketBase health check
- On success: clear `isOffline`, emit `pb:online` event, UI restores write access

---

## Migration Flow

### Trigger

Fires automatically after the user successfully authenticates to PocketBase for the first time.

### Sequence

1. Read all boards from IDB in-memory state (already loaded)
2. Open migration progress modal: "Migrating your data to PocketBase…"
3. For each board (showing board name + count progress, e.g. "Board 2 of 4"):
   - `POST /api/collections/boards/records` — create board, store returned `pb_id` in `idMap`
   - Bulk-create all columns for that board
   - Bulk-create all labels for that board
   - Bulk-create all tasks for that board (all `kanvana_id` references preserved)
   - `POST /api/collections/board_settings/records` — create settings record
4. On full success:
   - Persist `kanvana-pb-config` to IDB
   - Switch active adapter to PocketBase
   - Close migration modal with "Migration complete" message
   - Reload active board from PocketBase cache
5. On error at any step:
   - Show error details in the modal
   - Offer "Retry" (re-attempt from the failed board) or "Cancel" (discard migration, stay in IDB mode)
   - IDB data is never modified or deleted

### No Destructive Action on Local Data

IDB data is never wiped. Disconnect → IDB snapshot is still there and becomes active. This makes
PocketBase opt-in and fully reversible.

---

## UI Changes

### New: App Settings Modal

A top-level modal (distinct from per-board settings) accessible from the app header. Contains a
"Backend" section:

- **Disconnected state:** "Connect to PocketBase" button → opens inline connection form (URL,
  email, password, "Connect" button)
- **Connected state:** instance URL, logged-in user email, "Disconnect" button

### Mode Badge (App Header)

A small pill badge next to the app title indicating current storage mode:

| State                        | Badge text            | Color  |
|------------------------------|-----------------------|--------|
| Local IDB (default)          | `Local`               | grey   |
| PocketBase connected + online| `PocketBase`          | green  |
| PocketBase configured + offline | `Offline — read only` | amber |

Clicking the badge in `Offline — read only` state shows a "Reconnect" prompt.

### Sync Error Toast

Non-blocking toast at the bottom of the screen when a PocketBase write fails. Shows "Sync failed —
changes not saved" with a dismiss button. Does not block the UI.

### Migration Progress Modal

Shown once during initial migration only. Displays:
- Current board name being processed
- Progress count ("Board 2 of 4")
- Success state: "Migration complete" with a close button
- Error state: error message + "Retry" and "Cancel" buttons

### No Changes to Existing UI

Board UI, task cards, columns, labels, drag-drop, reports, and calendar are entirely unchanged.
The backend is transparent to all existing screens.

---

## New Files

| File                                   | Purpose                                              |
|----------------------------------------|------------------------------------------------------|
| `src/modules/storage-adapter.js`       | Adapter selector and re-export layer                 |
| `src/modules/pb-storage.js`            | PocketBase adapter (implements adapter interface)    |
| `src/modules/pb-auth.js`               | Auth: `initWithCredentials`, `initWithApiKey`, logout, token refresh, mid-session expiry, URL validation, config persistence, audit logging |
| `src/modules/pb-migration.js`          | One-time migration: IDB → PocketBase                 |
| `src/modules/pb-sync.js`               | Write helpers: diff, sanitize, normalize, create/update/delete PB records |
| `src/modules/app-settings.js`          | App Settings modal UI (backend section)              |
| `src/modules/pb-status.js`             | Mode badge, offline detection, reconnect ping, toast |

---

## Modified Files

| File                          | Change                                                              |
|-------------------------------|---------------------------------------------------------------------|
| All modules importing `storage.js` | Change import to `storage-adapter.js`                          |
| `src/kanban.js`               | Import `storage-adapter.js`; wire App Settings modal; wire mode badge |
| `src/reports.js`              | Import `storage-adapter.js`                                         |
| `src/calendar.js`             | Import `storage-adapter.js`                                         |
| `src/index.html`              | Add mode badge element; add App Settings trigger in header          |
| `package.json`                | Add `pocketbase` JS SDK dependency                                  |

---

## Phase 2 Notes

The following are explicitly out of scope for Phase 1 but the design accommodates them:

- **Offline write queue:** Replace the Phase 1 write-rejection path with an IDB-backed queue in
  `pb-sync.js`. On reconnect, drain the queue with conflict resolution.
- **Real-time collaboration:** Activate PocketBase realtime subscriptions in `pb-storage.js`.
  Subscribe to board/task/column/label collections; on incoming events, update in-memory cache and
  call `renderBoard()`.
- **Board sharing:** Add a `members` relation to the `boards` collection and relax API rules
  accordingly.

---

## Security

This section captures zero-trust security requirements. These are non-negotiable constraints that
apply to every implementation task in this feature.

### Zero-Trust Principles Applied

1. **Never trust, always verify** — every request to PocketBase must carry a valid auth token.
   No unauthenticated routes exist in Kanvana's PocketBase usage.
2. **Least privilege** — collection rules grant the minimum access needed. No wildcard or
   open-read rules. AI agent tokens are scoped to their owning user's data only.
3. **Deny by default** — all PocketBase collections default to deny-all. Access is granted
   explicitly. New collections must have rules before any code touches them.
4. **Assume breach** — tokens are short-lived. No secrets in source code. Logs capture security
   events. Errors never leak internal state.

### Content Security Policy

`src/index.html`, `src/reports.html`, and `src/calendar.html` must include a `<meta>` CSP header
(or the self-hoster's reverse proxy must set it as an HTTP header). Minimum required directives:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self' <pocketbase-origin>;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  frame-ancestors 'none';
```

`connect-src` must be dynamically set to the configured PocketBase URL at the point the user
connects. Until then it is `'self'` only. Inline scripts are forbidden (`script-src 'self'` — no
`unsafe-inline`). This is the primary mitigation against auth token exfiltration via XSS.

### PocketBase URL Validation

The user-entered PocketBase URL must pass strict validation before it is stored or used:

- Must be a valid URL (`new URL(input)` succeeds)
- Protocol must be `https:` only (no `http:`, no other schemes)
- Hostname must not be `localhost`, `127.0.0.1`, `::1`, or any other loopback address (prevents
  SSRF-class abuse where an attacker socially engineers a malicious URL into the config)
- URL must not contain credentials (`url.username` and `url.password` must be empty)
- Maximum length: 512 characters

Validation runs in `pb-auth.js` before any network call is made. Validation errors are shown inline
in the connection form with a clear, specific message.

### Authentication Security

**Human users:**
- Credentials (email + password) are sent directly to PocketBase's auth endpoint over HTTPS — they
  never touch any Kanvana-controlled server
- Passwords are never stored in IDB, in memory beyond the auth call, or in any log
- Error messages on failed auth must be generic: "Authentication failed. Check your credentials and
  PocketBase URL." — never reveal whether the email exists on the instance
- Failed connection attempts must be displayed to the user but are not rate-limited client-side
  (PocketBase's own rate limiting on its auth endpoint is the enforcement layer; self-hosters should
  configure PocketBase rate limits)

**Token lifecycle:**
- Auth tokens stored in IDB are short-lived (PocketBase default 30 min; self-hosters should not
  increase this beyond 1 hour)
- `pb-auth.js` refreshes the token 60 seconds before expiry via PocketBase's auth refresh endpoint
- On refresh failure mid-session: immediately switch to read-only offline mode, clear the in-memory
  token, surface a "Session expired — please reconnect" prompt
- On logout: delete `kanvana-pb-config` from IDB synchronously before any UI update

### AI Agent Authentication

AI agents (LLM agents, automation scripts, CI workflows) are first-class users of the system.
They cannot authenticate interactively. The following model applies:

**Agent identity:**
- Each AI agent is a regular PocketBase user account (email + password created by a human admin)
- Agents authenticate using PocketBase's **API key** (long-lived token) mechanism rather than the
  interactive login flow, generated from their user account via PocketBase admin UI
- Agent API keys are stored in the agent's own secure secret management system (e.g. environment
  variable, vault) — never in Kanvana's IDB or source code

**Agent access to Kanvana:**
- `pb-auth.js` exposes an `initWithApiKey(url, apiKey)` function alongside the interactive
  `initWithCredentials(url, email, password)` function
- When called with an API key, `pb-auth.js` skips the interactive auth call and directly sets the
  PocketBase SDK token to the provided key, then persists `kanvana-pb-config` with
  `{ url, token: apiKey, userId, tokenExpiry: null }`
- `tokenExpiry: null` signals to the refresh timer that no mid-session refresh is needed (API keys
  do not expire by default in PocketBase)
- All collection-level API rules apply identically to agents — they see only their own boards

**Agent scope (Phase 1):**
- Each agent user account owns its own boards, tasks, columns, and labels
- No board sharing between human and agent accounts (Phase 2 collaboration feature)
- Recommended deployment: one agent account per distinct AI workflow (e.g. one account for a
  triage agent, one for a planning agent), not one shared account for all agents

**Security invariant:** An agent token that is compromised can only access that agent's own data.
It cannot escalate to other users' boards due to the collection-level user isolation rules.

### Input Sanitization

All user-supplied strings written to PocketBase must pass through the existing `escapeHtml()`
utility in `src/modules/security.js` before storage. This includes: task title, task description,
board name, column name, label name. This is the existing behavior for local IDB writes; it must
be preserved and enforced equally in the PocketBase adapter write path.

JSON fields (`labels`, `columnHistory`, `relationships`, `subTasks`) are structured data
normalized by the existing `normalize.js` functions before any write. The PocketBase adapter must
call the same normalization functions before constructing its API payloads.

### Audit Logging

`pb-auth.js` must log the following security events to the browser console (prefixed `[Kanvana
Security]`) and emit them as custom DOM events for potential future server-side capture:

| Event                        | Log level | Detail                          |
|------------------------------|-----------|---------------------------------|
| Successful login             | info      | userId, timestamp               |
| Failed login attempt         | warn      | timestamp only (no email/URL)   |
| Token refresh success        | info      | userId, new expiry              |
| Token refresh failure        | warn      | userId, timestamp               |
| Session expired mid-session  | warn      | userId, timestamp               |
| Logout                       | info      | userId, timestamp               |
| Migration started            | info      | userId, board count             |
| Migration completed          | info      | userId, board count             |
| Migration failed             | error     | userId, board id, error message |
| Sync write failure           | warn      | collection, record id, error    |

Logs must never include: passwords, tokens, full URLs with credentials, or raw user data.

### Dependency Security

- The `pocketbase` npm package must be pinned to an exact version in `package.json`
- `npm audit` must pass with zero high/critical findings before any PocketBase feature is shipped
- The PocketBase JS SDK communicates over HTTPS only — the adapter must verify this at init time by
  checking the configured URL's protocol

---

## AI Agent Integration

AI agents interact with Kanvana's PocketBase backend as regular authenticated users. This section
describes how agents connect and the constraints that apply.

### Authentication

Agents use `initWithApiKey(url, apiKey)` in `pb-auth.js`. This function:
1. Validates the URL (same strict rules as human login)
2. Sets the PocketBase SDK token directly (no interactive auth call)
3. Fetches the current user record to confirm the token is valid and retrieves `userId`
4. Persists `kanvana-pb-config` to IDB with `tokenExpiry: null`

Agents are responsible for supplying a valid API key at startup. If the key is invalid or expired,
`initWithApiKey` throws and the adapter falls back to IDB mode.

### Programmatic Access Pattern

An AI agent running in a non-browser environment (Node.js, server-side script) does not use the
Kanvana UI at all — it uses the PocketBase REST API directly. The PocketBase collection schema
described in this spec is the API contract the agent programs against.

For agents running inside the Kanvana browser UI (e.g. a future in-app AI assistant), the standard
`storage-adapter.js` interface is used — the agent calls the same `saveTasks()`, `loadTasks()` etc.
functions as the human-facing UI code.

### Agent Account Setup (operational guidance for self-hosters)

1. In PocketBase admin UI, create a new user account for the agent (e.g. `triage-agent@myorg.com`)
2. Generate an API key for that account
3. Store the API key in the agent's secret management system
4. The agent initializes Kanvana with `initWithApiKey(pbUrl, apiKey)`
5. No human credentials are involved; no interactive UI is required

---

## Dependencies

- `pocketbase` — official PocketBase JS SDK (npm). Handles auth, REST calls, realtime, token
  management.
- No other new dependencies.

---

## Testing Strategy

- Unit tests for `pb-storage.js`: mock the PocketBase SDK, test cache population, write diffing,
  offline flag transitions
- Unit tests for `pb-migration.js`: mock IDB state + PocketBase SDK, assert correct record
  creation order and `idMap` population
- Unit tests for `pb-auth.js`:
  - Token persistence, refresh, mid-session expiry timer, fallback to IDB mode
  - `initWithApiKey`: valid key, invalid key (throws), `tokenExpiry: null` path
  - URL validation: rejects `http://`, rejects `localhost`, rejects URLs with credentials,
    rejects malformed URLs, accepts valid `https://` URL
  - Error messages: assert auth failure message is generic (does not leak email existence)
- Security unit tests:
  - Assert `escapeHtml()` is called on all string fields before PocketBase write
  - Assert normalization functions are called on all JSON fields before PocketBase write
  - Assert collection API rules block cross-user access (mock PocketBase, send requests with
    mismatched `userId`, expect 403)
- DOM integration tests for App Settings modal: connection form, connected state, disconnect,
  validation error display for invalid URLs
- E2E tests (Playwright): connect flow with a local PocketBase test instance (optional, may be
  deferred)
- Security validation checklist (manual, pre-ship):
  - `npm audit` passes with zero high/critical findings
  - CSP header is present and blocks inline scripts (verify with browser devtools)
  - Auth failure message does not reveal email existence
  - Attempting to access another user's records via direct API call returns 403
  - Agent API key path: confirm `tokenExpiry: null` prevents refresh timer from firing

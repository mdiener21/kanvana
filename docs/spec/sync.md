# Sync & Auth Specification

Covers the "Go Online" flow: backend health check, login modal, session management, and sync operations. Related to `backend-storage-pb.md`

---

## Backend URL

The PocketBase base URL is set via the `VITE_PB_URL` environment variable. When the variable is
absent, the frontend uses the same origin (`/`):

| Environment | Value |
|---|---|
| Development | `http://localhost:8090` (`.env.local`) |
| Production | `https://pb.kanvana.com` (`.env.production`) |

The health endpoint is derived by trimming the base URL's trailing slash and appending
`/api/health`. Both `sync.js` and `authsync.js` use this env var; no hardcoded host is permitted.

---

## Go Online Button (`#login-btn`)

- Visible when the user is not authenticated.
- Clicking it opens the login modal when the backend health probe has succeeded.
- The health probe disables the button when PocketBase is unreachable.
- Disabled tooltip text is `Backend unavailable`.

---

## Backend Health Probe

On page load, `initializeAuthSyncUI` fetches `${VITE_PB_URL}/api/health` with a 3-second timeout.

| Probe result | Behavior |
|---|---|
| 200 OK | No UI change. |
| Non-2xx or network error | Disable `Go Online`, set tooltip text to `Backend unavailable`, show a modal notification (via `alertDialog`) with the title "Sync Server Unavailable", the full health URL, and a message that the board remains usable offline. Log a warning to the console. |

The modal must display the exact URL that was probed so users and support staff can diagnose DNS or routing issues without inspecting devtools.

---

## Login Modal

Opened by clicking "Go Online" or when a sync session expires.

### Email tab (default)

1. User enters email + password and submits.
2. On success: modal closes, header switches to show username + logout button.
3. On error:
   - HTTP 4xx (bad credentials, unverified email, etc.): display PocketBase's message.
   - HTTP 5xx: display `Server error (<status>) — the backend at <VITE_PB_URL> may be unavailable.`
   - Network failure: display the fallback message `Authentication failed.`

### Social tab

OAuth2 via Google, Apple, or Microsoft; only those three providers are allowed. Errors are displayed inline in the modal.

### Sign-up / Log-in toggle

A toggle link switches between Login and Sign-up mode within the email pane. Sign-up shows a Name field and registers the user via `registerUser`; after success the modal prompts the user to verify their email before logging in.

---

## Session Management

- PocketBase auth token is persisted in `localStorage` by the PocketBase SDK.
- On auth state change the `auth-changed` window event fires; `updateAuthUI` subscribes to it.
- `ensureAuthenticated` attempts a token refresh before a push; on failure the login modal opens with a "Session expired" message.
- Logging out clears the token locally and sends nothing to the server. Local data stays visible and usable, and edits made while signed out are sent at the same account's next sign-in.

---

## Account Switching

The browser's local data belongs to one account, the Data Owner ([ADR-0006](../adr/0006-data-owner-account-policy.md)). It is checked on every new sign-in and at every launch with a stored token, online or offline, before anything syncs.

| Situation | Behavior |
|---|---|
| Local data has no Data Owner | The account becomes the Data Owner and the data uploads under it. No prompt. |
| The Data Owner signs in | Nothing changes, and the queue drains. No prompt. |
| Another account signs in, nothing unsynced | Local data is replaced with that account's, and the page reloads. No prompt. |
| Another account signs in, N changes unsynced | A prompt offers **Discard N unsynced changes and continue** or **Cancel**. Nothing syncs until the user chooses. |

- **Discard** replaces the local data, makes the new account the Data Owner, and reloads the page, which then pulls that account's data.
- **Cancel**, Escape, the close button and a backdrop click all sign the new account out and leave the data, queue and Data Owner untouched. Cancel has focus when the prompt opens.
- If the local data cannot be replaced, the new account is signed out, a message says so, and nothing changes.
- A switch keeps the theme and other display preferences. Boards, tasks, time tracking and global settings go, and come back from the server when the previous account signs in again.
- With several tabs open there is one prompt, in a tab the user is looking at. After a replacement, the other tabs reload.

---

## Sync Operations

> The manual push/pull `#sync-btn` button was **removed** in issue #115. Sync is now fully automatic
> under event sourcing — there is no "Push to Cloud / Pull from Cloud" choice.

Once authenticated, sync runs without user action:

| Direction | Mechanism |
|---|---|
| Outbound | The event queue (`event-sourcing/sync-queue.js`) drains unsynced domain events to PocketBase in HLC order, always under the Data Owner. |
| Inbound | An SSE subscription (`event-sourcing/realtime.js`) applies remote events live, plus a catch-up pull on launch/reconnect. |

The header **sync-state indicator** (`event-sourcing/sync-indicator.js`) reflects status: `Live ●`,
`Syncing… (N)`, `⚠ N unsynced`, or `Offline`. See `backend-storage-pb.md` and
[ADR-0004](../adr/0004-event-sourced-sync.md) for the full architecture.

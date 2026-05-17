# Sync & Auth Specification

Covers the "Go Online" flow: backend health check, login modal, session management, and sync operations. Related to `docs/system/spec/backend-storage-pb.md`

---

## Backend URL

The PocketBase base URL is set via the `VITE_PB_URL` environment variable:

| Environment | Value |
|---|---|
| Development | `http://localhost:8090` (`.env.local`) |
| Production | `https://pb.kanvana.com` (`.env.production`) |

The health endpoint is derived as `${VITE_PB_URL}/api/health`. Both `sync.js` and `authsync.js` use this env var; no hardcoded host is permitted.

---

## Go Online Button (`#login-btn`)

- Visible when the user is not authenticated.
- Clicking it always opens the login modal regardless of backend health.
- The button is never disabled by the health probe — the login attempt surfaces errors inline.

---

## Backend Health Probe

On page load, `initializeAuthSyncUI` fetches `${VITE_PB_URL}/api/health` with a 3-second timeout.

| Probe result | Behavior |
|---|---|
| 200 OK | No UI change. |
| Non-2xx or network error | Show a modal notification (via `alertDialog`) with the title "Sync Server Unavailable", the full health URL, and a message that the board remains usable offline. Log a warning to the console. |

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
- `ensureAuthenticated` attempts a token refresh before sync; on failure the sync button opens the login modal with a "Session expired" message.

---

## Sync Operations

Triggered by the sync button (`#sync-btn`), visible when authenticated and auto-sync is off.

| Action | Result |
|---|---|
| Push to Cloud | Calls `pushBoardFull` for every local board, then enables auto-sync. |
| Pull from Cloud | Confirms before replacing all local board data with remote data; re-renders the board and rebuilds the boards UI. |

Auto-sync is enabled after a successful push and thereafter keeps boards in sync automatically via `scheduleAutoSync`.

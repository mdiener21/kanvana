# Event Sourcing Offline-First Sync — Research Spike & Recommendation

## Context

Kanvana is local-first with IndexedDB as the per-device source of truth and optional PocketBase push/pull. The current sync model (PR #89) relies on last-write-wins (LWW) on whole records, which is unsafe for multi-device workflows (e.g., laptop + phone offline edits) where user data can be silently overwritten.

After evaluating CRDTs and finding them overly complex and disruptive to our read-model and reporting layers, this document outlines a shift to **Event Sourcing (Command-Based Sync)**. This approach models user interactions as an append-only stream of immutable events, eliminating complex mathematical merging, preventing silent data loss, keeping PocketBase clean, and building an organic foundation for future multi-user support without over-engineering.

Out of scope for this initial implementation: granular access control lists (ACL) and real-time character-by-character conflict resolution.

---

## What concurrent multi-device editing looks like under Event Sourcing

Under Event Sourcing, concurrent edits (whether from the same user on multiple devices or different users on the same board) are resolved chronologically by the server's event ordering:

| Scenario | Resolution under Event Sourcing |
|---|---|
| Edit `title` on A, edit `description` on B | Both events are appended to the log. Replaying them applies both modifications. **No lost updates.** |
| Drag task to new column on A, edit title on B | Both events apply cleanly. Task moves columns and updates its text content. |
| Reorder column on A and B concurrently | Events append in arrival order. The final event processed dictates the final visual sequence deterministically. |
| Add label `urgent` on A, remove label `urgent` on B | Processed sequentially. The final state matches the latest chronological intention. |
| Add subtask on A, add different subtask on B | Both `SUBTASK_ADDED` events append. Both subtasks survive. |
| Delete task on A, edit on B | Reducer logic determines behavior (e.g., if a task is deleted, subsequent edit events to it are gracefully skipped during replay). |

---

## Architectural Blueprint: Invisible Event Sourcing

### 1. The CQRS Data Model
We strictly separate the **Write Model** (the events) from the **Read Model** (the visual board state).

* **The Event Log (Source of Truth):** Every interaction creates an immutable event.
    * *Schema:* `id` (UUID), `board_id` (String/Relation), `client_timestamp` (ISO string), `action` (e.g., `TASK_CREATED`, `STATUS_CHANGED`), `payload` (JSON), `synced` (Boolean, local-only).
* **The Projected State (Read Model):** The current `tasks` and `columns` schema in IndexedDB. This state is a localized byproduct of replaying the Event Log through pure reducer functions.

### 2. Client-Side Flow (Optimistic UI)
The user experiences zero network latency:
1.  **Action:** User interacts with the UI (e.g., moves a task).
2.  **Generate Event:** The application emits an event tied to a specific `board_id`.
3.  **Local Persist:** Append the event directly to the `events` store in IndexedDB.
4.  **Local Projection:** Immediately execute the event reducer against the localized IndexedDB read-model state (`tasks`, `columns`).
5.  **UI Update:** The Kanban board re-renders instantly based on the updated local projection.
6.  **Trigger Sync:** A background routine is notified of unsynced logs.

### 3. Backend Architecture (PocketBase)
PocketBase serves as a highly available, centralized append-only log. 
* **Collections:** `events` and `snapshots`.
* **Event Structure:** `id`, `board_id`, `client_timestamp`, `action`, `payload` (JSON).
* **Security & Multi-User Readiness:** Incorporating `board_id` into the base schema allows us to leverage PocketBase API Rules immediately to ensure data isolation. Users can only read/write events whose `board_id` matches a board they have access to.

### 4. The Real-Time Sync Loop
The synchronization process operates seamlessly in the background using a hybrid of reactive push events and real-time streaming subscriptions.

* **Phase A: Background Push (Client -> Server)**
    1. Query IndexedDB for local events where `synced == false`.
    2. Batch-upload them to PocketBase via the standard API.
    3. Flip the local flag to `synced == true` upon a successful server response.

* **Phase B: Real-Time Broadcast & Subscription (Server -> Client)**
    1. Rather than heavy polling, the client establishes a native PocketBase Server-Sent Events (SSE) subscription on boot: `pb.collection('events').subscribe('*', ...)` filtered by authorized `board_id`s.
    2. When any device pushes an event to the server, PocketBase instantly broadcasts that event down to all other active clients connected to that board.
    3. **Immediate Replay:** Receiving clients pass the broadcasted event into their local reducer, updating the local IndexedDB state and re-rendering the UI immediately.
    4. If the client goes offline, it falls back to checking a `last_sync_timestamp` against PocketBase upon reconnecting to pull missed deltas.

---

## Optimization: Snapshots

To prevent the event stream from growing infinitely—which would degrade the bootstrap time of a brand new device or browser context—we employ standard snapshotting.

* **Mechanism:** Periodically (on a weekly interval, the client aggregates the current read-model state (`tasks`, `columns`) and pushes it to the `snapshots` collection in PocketBase.
* **Multi-User Isolation:** To avoid race conditions where multiple users attempt to snap the same board at once, **only the board owner/creator** is authorized to compute and upload snapshots.
* **Hydration Flow:** A new device or fresh app initialization fetches the latest authoritative *snapshot* first to establish the baseline state, and then requests only the *events* whose timestamps succeed that snapshot.
* **Garbage Collection:** PocketBase can run a lightweight server-side cron job to safely truncate or archive events older than the latest snapshot.

---

## Evolution to Multi-User: Zero Over-Engineering Roadmap

Because our single-user multi-device design relies on atomic chronological event streams, evolving the system into a true collaborative multi-user platform requires no rewriting of core state logic:

1. **Naturally Concurrent:** If User A and User B concurrently modify different tasks on a shared board, their events interleave in the PocketBase collection flawlessly.
2. **Instant Collaboration:** PocketBase's SSE subscription ensures that User A’s drag-and-drop actions appear on User B’s screen in real-time without manual page refreshes.
3. **Deterministic Overlaps:** If two users edit the exact same field while disconnected, the server's standard insertion order arbitrates who wins. The event log records both intents, and the final state converges identically on all devices.

---

## Critical files / modules a future implementation would touch

* `client/src/modules/events.js` — Core architecture containing event definitions, action payloads, and the pure reducer logic transforming events into read-states.
* `client/src/modules/sync.js`, `autosync.js` — Core sync infrastructure handling background batch pushes and setting up PocketBase real-time SSE handlers.
* `client/src/modules/storage.js`, `idb-store.js` — Configuration adjustments to register the new `events` store and hook write routines to emit events.
* `backend/pb_migrations/` — Database migrations generating the `events` and `snapshots` collections with `board_id` relationships and baseline API security rules.
* `docs/adr/` — Archive the finalized Event Sourcing pattern decision.

## Verification

* **Unit Testing (Reducers):** Implement Vitest sweeps verifying that out-of-order execution, edge-case deletes, and rapid status shifts resolve into expected, predictable read models.
* **End-to-End Simulation (Playwright):** Orchestrate multi-browser context testing simulating disconnected user workflows, real-time message broadcasting via simulated latency, and ensuring complete UI convergence.

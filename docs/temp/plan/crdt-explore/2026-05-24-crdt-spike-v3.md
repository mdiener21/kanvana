# Event Sourcing Offline-First Sync — Research Spike & Recommendation

## Context

Kanvana is local-first with IndexedDB as the per-device source of truth and optional PocketBase push/pull. The current sync model (PR #89) relies on last-write-wins (LWW) on whole records, which is unsafe for single-user multi-device workflows (e.g., laptop + phone offline edits).

After evaluating CRDTs and finding them overly complex and disruptive to our read-model/analytics, this document outlines a shift to **Event Sourcing (Command-Based Sync)**. This approach models user interactions as an append-only stream of commands, eliminating complex mathematical merging, preventing silent data loss, and keeping PocketBase as a simple, highly-available storage layer.

Out of scope for this spike: multi-user/shared boards and real-time WebSocket collaboration.

---

## What concurrent multi-device editing actually looks like in Kanvana

Under Event Sourcing, the realistic concurrent-edit scenarios for one user across two devices are resolved chronologically by the server:

| Scenario | Resolution under Event Sourcing |
| --- | --- |
| Edit `title` on A, edit `description` on B | Both events are appended. Replaying them applies both edits sequentially. **No lost updates.** |
| Drag task to new column on A, edit title on B | Both events apply cleanly. Task moves and gets renamed. |
| Reorder column on A and B differently | Events apply in arrival order. The last arriving event sets the final visual order. |
| Add label `urgent` on A, remove label `urgent` on B | Processed sequentially. The final state reflects the latest chronological action. |
| Add subtask on A, add different subtask on B | Both `SUBTASK_ADDED` events append. Both subtasks survive. |
| Delete task on A, edit on B | Depending on reducer logic, the edit event either applies to a tombstone or is ignored. |

---

## Architectural Blueprint: Invisible Event Sourcing

### 1. The Core Data Model (CQRS Pattern)

We separate the **Write Model** (events) from the **Read Model** (Kanban board state).

* **The Event Log (Source of Truth):** Every user action generates an immutable event object.
* *Schema:* `id` (UUID),` board_id` (String/Relation), `client_timestamp` (ISO string), `action` (e.g., `TASK_CREATED`, `STATUS_CHANGED`), `payload` (JSON), `synced` (boolean, local-only).
* **The Projected State (Read Model):** Your current `tasks` and `columns` schema in IndexedDB. It is purely a byproduct of replaying the Event Log locally.

### 2. Client-Side Flow (Optimistic UI)

The user should never wait for a network request.

1. **Action:** User takes an action (e.g., drags a task).
2. **Generate Event:** App creates a `STATUS_CHANGED` event with the local timestamp, tied to a specific `board_id`..
3. **Local Persist:** Append to the `events` object store in IndexedDB.
4. **Local Projection:** Immediately execute the event reducer against the localized IndexedDB read-model state (`tasks`, `columns`).
5. **UI Update:** The board re-renders instantly.
6. **Trigger Sync:** A background worker is notified of unsynced events.

### 3. Backend Architecture (PocketBase)

PocketBase serves as a highly available, centralized append-only log. No custom Go hooks required.

* **Collections:** `events` and `snapshots`.
* **Event Structure:** `id`, `board_id`, `client_timestamp`, `action`, `payload` (JSON).
* **Fields:** `id`, `client_timestamp`, `action`, `payload` (JSON).
* **Security & Multi-User Readiness:** Incorporating `board_id` into the base schema allows us to leverage PocketBase API Rules immediately to ensure data isolation. Users can only read/write events whose `board_id` matches a board they have access to.
* **Concurrency:** If multiple devices push simultaneously, PocketBase accepts all events. The unique IDs prevent database collisions, and the `client_timestamp` ensures deterministic replay.

### 4. The Real-Time Sync Loop

The synchronization process operates seamlessly in the background using a hybrid of reactive push events and real-time streaming subscriptions.

* **Phase A: Background Push (Client -> Server)**
1. Query IndexedDB for events where `synced == false`.
2. Push to PocketBase via a batch request.
3. Mark as `synced == true` locally.


* **Phase B: Pull (Server -> Client)**
1. Client tracks a `last_sync_timestamp`.
2. Client fetches events from PocketBase where `created > last_sync_timestamp`.
3. **Replay:** Client applies new events from other devices to its local projected state in chronological order.
4. Update `last_sync_timestamp`.



### 5. Handling the "Airplane" Scenario (The Target Use Case)

1. **In the air (Phone):** User moves/edits tasks. Events append locally. UI updates instantly. `synced` = `false`.
2. **On the ground:** Cellular connects. Background loop detects network, queries unsynced events, and pushes to PocketBase.
3. **In the office (Laptop):** User opens Kanvana. App boots, pulls events since last sync, downloads the phone's events, and updates the local projection. Board reflects airplane work instantly.

---

## Optimization: Snapshots

To prevent the event log from growing infinitely and slowing down initial syncs on new devices, we implement periodic snapshotting.

* **Mechanism:** Periodically (e.g., every 1,000 events or weekly), the client takes the current `projected_state` (actual tasks/columns) and pushes it to a `snapshots` collection in PocketBase.
* **New Device Flow:** A fresh install pulls the latest *snapshot* to establish a baseline, then only pulls *events* that occurred after that snapshot's timestamp.
* **Garbage Collection:** PocketBase can run a cron job to safely archive or delete events older than the most recent snapshot.

---

## Evolution to Multi-User: Zero Over-Engineering Roadmap

Because our single-user multi-device design relies on atomic chronological event streams, evolving the system into a true collaborative multi-user platform requires no rewriting of core state logic:

1. **Naturally Concurrent:** If User A and User B concurrently modify different tasks on a shared board, their events interleave in the PocketBase collection flawlessly.
2. **Instant Collaboration:** PocketBase's SSE subscription ensures that User A’s drag-and-drop actions appear on User B’s screen in real-time without manual page refreshes.
3. **Deterministic Overlaps:** If two users edit the exact same field while disconnected, the server's standard insertion order arbitrates who wins. The event log records both intents, and the final state converges identically on all devices.

---

## Critical files / modules a future implementation would touch

* `client/src/modules/events.js` (NEW) — Defines the event schema, action types, and the pure reducer functions that apply events to the state.
* `client/src/modules/sync.js`, `autosync.js` — Replace LWW push/pull with the Push/Pull Event Loop and `last_sync_timestamp` tracking.
* `client/src/modules/storage.js`, `idb-store.js` — Add `events` store. Modify mutation helpers (tasks/columns) to emit events instead of just overwriting state. Add snapshot generation logic.
* `backend/pb_migrations/` — Create `events` collection (`action`, `client_timestamp`, `payload`) and `snapshots` collection.
* `docs/adr/` — Record the Event Sourcing + Snapshot architectural decision.

## Verification

* **Unit Tests (Reducers):** Extensive Vitest suite verifying that sequences of events (e.g., `CREATE`, `EDIT`, `DELETE`) accurately construct the expected read-model state.
* **E2E Playwright:** Simulate offline/online transitions. Have Context A generate events while disconnected, Context B generate events, reconnect both, and assert exact visual convergence.
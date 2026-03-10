# User Story — Swim Lanes for Kanban Board

**Title:** Toggleable Swim Lanes in Kanban Board

**As a** user managing tasks on a Kanban board
**I want** the ability to organize tasks into swim lanes in addition to columns
**So that** I can visually group tasks by context (e.g., person, project, priority) while still tracking workflow status.

---

### Description

The Kanban board currently supports **columns** representing workflow states (e.g., *To Do*, *In Progress*, *Done*).
This feature introduces **optional swim lanes** that divide the board horizontally.

Swim lanes allow tasks to be grouped by a chosen attribute (for example: **label, label-group, project, or custom category**). The UI must allow the user to **easily enable or disable swim lanes** without affecting the existing board structure.

When disabled, the board behaves exactly as it does today.

---

### Functional Requirements

1. **Toggle Swim Lanes**

   * A simple UI control (toggle or switch) enables or disables swim lanes.
   * When disabled, tasks appear in the standard column-only layout.
   * When enabled, tasks are grouped horizontally into swim lanes.

2. **Swim Lane Grouping**

   * Tasks are grouped by a selected attribute (initial version: **label or label-group**).
   * Each swim lane displays its name as a header on the left side.

3. **Task Placement**

   * Tasks still belong to a **column** (workflow stage).
   * Tasks also belong to **one swim lane**.
   * The board becomes a **grid**:
     `Swim Lane (rows) × Columns (workflow states)`.

4. **Default Lane**

   * Tasks without the selected attribute appear in a **“No Group”** swim lane.

5. **Drag & Drop**

   * Tasks can be dragged:

     * between columns
     * between swim lanes
   * Updating the swim lane updates the grouping attribute accordingly.

6. **Persistence**

   * Swim lane visibility state (on/off) is saved in user settings.
   * Selected grouping type is also persisted.

---

### UI / UX Requirements

* The swim lane toggle must be **visible and quick to access** (e.g., board toolbar).
* Switching lanes **must not reload the page**.
* Transitions should feel **smooth and fast**.
* The layout should remain **clean and readable even with many tasks**.
* Lane headers should remain **sticky or fixed on the left side** for clarity.
* The feature must work well on **desktop and tablet screens**.

Example UI concept:

```
Toggle: [Swim Lanes ON]

              TODO        IN PROGRESS        DONE
----------------------------------------------------------
Project A |   Task 1      Task 4             Task 8
          |   Task 2

Project B |   Task 3      Task 5

No Group  |                Task 6             Task 7
```

When **Swim Lanes OFF**

```
        TODO        IN PROGRESS        DONE
-----------------------------------------------
        Task 1      Task 4             Task 8
        Task 2      Task 5
        Task 3      Task 6
                    Task 7
```

---

### Acceptance Criteria

1. User can enable or disable swim lanes with a single toggle.
2. When swim lanes are off, the board layout remains unchanged from the current version.
3. When enabled, tasks appear grouped into horizontal swim lanes.
4. Tasks without the grouping attribute appear in a **default lane**.
5. Dragging tasks between swim lanes updates their grouping attribute.
6. The board updates instantly without full reload.
7. User preference for swim lanes is persisted across sessions.

---

### Definition of Done

* Feature toggle implemented in board toolbar.
* Swim lane grouping logic implemented.
* Drag & drop between lanes works.
* Layout responsive and visually clean.
* Unit tests for grouping logic.
* Manual UX validation with large boards.

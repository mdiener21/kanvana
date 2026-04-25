# User Story — Swim Lanes for Kanban Board

Note: this is a feature planning artifact. Canonical shipped behavior now lives in `docs/spec/swimlanes.md`, `docs/spec/settings.md`, and related files linked from `docs/specification-kanban.md`.

**Title:** Toggleable Swim Lanes in Kanban Board

**As a** user managing tasks on a Kanban board
**I want** the ability to organize tasks into swim lanes in addition to columns
**So that** I can visually group tasks by context (e.g., person, project, priority) while still tracking workflow status.

---

### Description

The Kanban board currently supports **columns** representing workflow states (e.g., *To Do*, *In Progress*, *Done*).
This feature introduces **optional swim lanes** that divide the board horizontally.

Swim lanes allow tasks to be grouped by a chosen attribute (for example: **label, label-group, priority, project, or custom category**). The UI must allow the user to **easily enable or disable swim lanes** from a dedicated settings experience without affecting the existing board structure.

One usability problem to solve is that an expanded swim lane can become excessively tall when it contains many completed items. To keep the board compact and readable, tasks in the **Done** column should be excluded from the expanded swim lane content by default, while the **Done** column must still remain a valid drag-and-drop target.

Each swim lane should also support an **accordion-style collapse/expand control** so users can quickly hide or reveal the lane's active work.

When disabled, the board behaves exactly as it does today.

---

### Functional Requirements

1. **Toggle Swim Lanes**

   * A simple UI control (toggle or switch) in the swim lane settings modal enables or disables swim lanes.
   * When disabled, tasks appear in the standard column-only layout.
   * When enabled, tasks are grouped horizontally into swim lanes.

2. **Swim Lane Settings Modal**

   * Swim lane controls are moved out of the board toolbar into their own settings modal.
   * The modal contains the swim lane enable/disable toggle and grouping configuration.
   * The modal can be opened and closed without leaving or reloading the board.

3. **Swim Lane Grouping**

   * Tasks are grouped by a selected attribute (initial version: **label, label-group, or priority**).
   * When grouping by **label-group**, the user must choose a specific label group and each label value inside that group becomes its own swim lane row.
   * Each swim lane displays its name as a header on the left side.
   * When grouping by priority, lane order must stay stable as **Urgent, High, Medium, Low, None**.

4. **Task Placement**

   * Tasks still belong to a **column** (workflow stage).
   * Tasks also belong to **one swim lane**.
   * The board becomes a **grid**:
     `Swim Lane (rows) × Columns (workflow states)`.
   * Column headers must remain visible while the user scrolls vertically through the swim lane grid.

5. **Default Lane**

   * Tasks without the selected attribute appear in a **“No Group”** swim lane.

6. **Drag & Drop**

   * Tasks can be dragged:

     * between columns
     * between swim lanes
   * Updating the swim lane updates the grouping attribute accordingly.
   * Users must still be able to drag a task into the **Done** column even when completed items are excluded from expanded swim lane content.

7. **Done Item Visibility**

   * Tasks in the **Done** column are excluded from the visible expanded swim lane body by default.
   * Excluding done items must reduce lane height for boards with many completed tasks.
   * The **Done** column must remain part of the board grid so tasks can still be dropped into it.

8. **Accordion Collapse / Expand**

   * Each swim lane has a dedicated collapse/expand button in its header.
   * Collapsing a swim lane hides its row content while keeping the lane header visible.
   * Expanding the lane restores its visible task grid immediately without a page reload.

9. **Column Header Behavior in Swim Lane Mode**

   * Workflow column headers remain fixed while the user scrolls vertically so the current columns are always visible.
   * Column collapse remains available while swim lanes are enabled.
   * Collapsing a column in swim lane mode applies consistently across every swim lane row.

10. **Persistence**

   * Swim lane visibility state (on/off) is saved in user settings.
   * Selected grouping type is also persisted.
   * Swim lane collapse/expand state should persist if the board already persists per-lane UI state.

---

### UI / UX Requirements

* Swim lane controls must be available from a **dedicated settings modal** instead of the main board toolbar.
* Opening the swim lane settings modal must feel **quick and lightweight**.
* Switching lanes **must not reload the page**.
* Transitions should feel **smooth and fast**.
* The layout should remain **clean and readable even with many tasks**.
* Expanded swim lanes should emphasize **active work**, not long lists of completed cards.
* The **Done** column must still read as a valid destination during drag and drop.
* Lane headers should remain **sticky or fixed on the left side** for clarity.
* Workflow column headers should remain **visible during vertical scroll** in swim lane mode.
* Lane headers should include an **accordion-style collapse/expand affordance** with a clear state indicator.
* Column collapse controls should remain available and understandable in swim lane mode.
* The swim lane settings modal should clearly group toggle and configuration options together.
* When `Label Group` grouping is selected, the modal should clearly prompt for the specific label group whose labels will become swim lane rows.
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

1. User can open a dedicated swim lane settings modal to manage swim lane behavior.
2. When swim lanes are off, the board layout remains unchanged from the current version.
3. When enabled, tasks appear grouped into horizontal swim lanes.
4. Tasks without the grouping attribute appear in a **default lane**.
5. Dragging tasks between swim lanes updates their grouping attribute.
6. When grouped by a selected label group, the board renders one swim lane per label value inside that group, plus `No Group` when needed.
7. When grouped by priority, dragging a task into another lane updates the task priority to match that lane.
8. Tasks can still be dragged into the **Done** column while swim lanes are enabled.
9. Tasks already in the **Done** column are excluded from expanded swim lane content so lanes do not become excessively tall.
10. Each swim lane can be collapsed and expanded from its header in an accordion-style interaction.
11. Workflow column headers remain visible while the user scrolls vertically in swim lane mode.
12. Columns can still be collapsed and expanded while swim lanes are enabled.
13. Swim lane enable/disable and grouping controls are available inside the swim lane settings modal rather than the board toolbar.
14. The board updates instantly without full reload.
15. User preference for swim lanes is persisted across sessions.

---

### Definition of Done

* Swim lane settings modal implemented for toggle and grouping controls.
* Swim lane grouping logic implemented.
* Drag & drop between lanes works.
* Label-group mode lets the user choose a specific label group and renders one row per label in that group.
* Priority grouping updates `task.priority` when tasks move between priority lanes.
* Drag & drop into **Done** works even though done items are excluded from expanded lane bodies.
* Swim lanes support accordion-style collapse and expand controls.
* Swim lane column headers remain visible during vertical scrolling.
* Column collapse continues to work while swim lanes are enabled.
* Layout responsive and visually clean.
* Unit tests for grouping logic.
* Manual UX validation with large boards.

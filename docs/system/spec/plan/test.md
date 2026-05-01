Architectural Review: Personal Kanban Board
Note: this is an architectural review artifact, not the canonical repository process guide or product specification. Current contributor workflow and spec governance live in `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/specification-kanban.md`, and `docs/spec/`.

1. Architectural Summary
The codebase uses ES modules bundled by Vite with a clear load → modify → save → renderBoard() data flow. Module boundaries are largely well-chosen, and the constraint of vanilla JS + no framework is respected throughout. The code is functional, defensive, and ships real features.

However, the architecture has grown organically to the point where several structural concerns are becoming load-bearing problems: render.js (1,103 lines) and modals.js (1,148 lines) are doing too much, normalization/validation logic is duplicated across 4+ modules, and the absence of any event-driven communication forces tight coupling and circular-dependency workarounds.

2. Critical Issues
2a. render.js is a God Module (1,103 lines)
render.js owns: DOM element creation for tasks, columns, swimlane headers, swimlane cells, swimlane lane headers; task filtering; task sorting by date/priority with persistence; task counter syncing; collapsed title syncing; due-date syncing; "Load More" virtualization for the Done column; column menu close handling; and the main renderBoard() orchestrator.

Why this is a problem: Any change to how a task card looks, how columns sort, or how swimlanes render requires touching this file. The 200-line createColumnElement function alone builds the column, its header, collapse button, drag handle, overflow menu with sort submenu — all with inline event handlers. This makes it hard to test any single concern in isolation.

Recommendation: Extract into focused modules:

task-card.js — createTaskElement() and related helpers
column-element.js — createColumnElement() and column menu logic
swimlane-renderer.js — all createSwimlane* functions and renderSwimlaneBoard
Keep render.js as the thin orchestrator: renderBoard(), syncTaskCounters(), syncCollapsedTitles(), syncMovedTaskDueDate()
2b. modals.js is a God Module (1,148 lines)
modals.js manages 7 different modals (task, column, labels manager, individual label, boards manager, board rename, help), each with its own show/hide/render/submit logic plus state variables (editingTaskId, editingColumnId, editingLabelId, editingBoardId, selectedTaskLabels, etc.).

Why this is a problem: Module-level mutable state for 7 different UI flows creates subtle interaction bugs (e.g., the returnToTaskModalAfterLabelsManager / selectCreatedLabelInTaskEditor flags). Adding a new modal requires understanding the full 1,148-line file.

Recommendation: Each modal should be its own module with its own state:

task-modal.js — task add/edit modal
column-modal.js — column add/edit modal
labels-modal.js — labels manager + individual label modal
boards-modal.js — boards manager, rename, create
2c. Circular Dependencies via Dynamic Import
Multiple modules use await import('./render.js') to call renderBoard() — this is explicitly noted in CLAUDE.md. Found in:

modals.js:477, modals.js:611, modals.js:661, modals.js:850, modals.js:895, modals.js:1049
importexport.js:432
settings.js:45
dragdrop.js:286, dragdrop.js:292
Why this is a problem: Dynamic imports are a workaround, not a solution. They hide the dependency graph, make errors asynchronous, and prevent tree-shaking. The root cause is that renderBoard() is the only way to propagate state changes to the UI.

Recommendation: Introduce a lightweight event bus or use the existing CustomEvent pattern (already used for kanban:boards-changed) consistently:


// events.js
const bus = new EventTarget();
export const on = (e, fn) => bus.addEventListener(e, fn);
export const emit = (e, detail) => bus.dispatchEvent(new CustomEvent(e, { detail }));
Then modules emit emit('data:changed') after mutations, and render.js subscribes: on('data:changed', () => renderBoard()). This eliminates every dynamic await import('./render.js') and the circular dependency pattern entirely.

3. Design Pattern Opportunities
3a. Duplicated Normalization Logic (DRY violation)
normalizePriority is defined independently in three files:

storage.js:227
tasks.js:31
importexport.js:75
isHexColor is defined in:

storage.js:361
columns.js:4
importexport.js:69
normalizeSettings / normalizeSettingsForExport / normalizeImportedSettings are three variants of the same normalization.

boardDisplayName is defined identically in both boards.js:82 and importexport.js:38.

normalizeSwimLaneCollapsedKeys and normalizeCellCollapsedKeys in swimlanes.js are identical functions.

Recommendation: Create a normalize.js module exporting shared validators and normalizers. This is a clear case where extracting a shared utility pays for itself immediately — these functions are identical, not "similar."

3b. DOM as State Source (Anti-pattern)
Several places read state back from the DOM instead of from the data layer:

columns.js:76-89 — updateColumnPositions() reads column order from DOM elements
tasks.js:134-146 — getCurrentTaskOrder() reads task positions from DOM
tasks.js:158-198 — buildOrderByColumnFromDom() reconstructs task ordering from the DOM
This is necessary because SortableJS modifies the DOM directly, but it means the DOM is the source of truth during drag operations. This is fragile — any re-render during a drag breaks the state.

Recommendation: While SortableJS forces some DOM-reading, updateColumnPositions() (non-drag context) could be refactored to accept an ordered array of IDs rather than reading querySelectorAll. This would decouple storage from the DOM.

3c. Inline Styles in JavaScript
modals.js:440-442 and modals.js:578-579 set styles directly:


labelItem.style.display = 'flex';
labelItem.style.alignItems = 'center';
labelItem.style.justifyContent = 'space-between';
Recommendation: Use CSS classes. These are layout concerns that belong in stylesheets, not JavaScript.

3d. alert() Still Used in Import/Export
importexport.js:403, importexport.js:414, importexport.js:435, and modals.js:1086-1088 still use native alert() despite the codebase having alertDialog() and confirmDialog(). This is inconsistent and blocks the main thread.

3e. Legacy/Dead Code
tasks.js:325-369 — updateTaskPositions() is marked "legacy - kept for compatibility" but appears unused
dragdrop.js:349-359 — Three no-op legacy exports (attachTaskListeners, attachColumnListeners, attachColumnDragListeners)
modals.js:1098-1100 — window.lucide?.createIcons() check in board rename — the codebase uses renderIcons() everywhere else
4. Code Quality Notes
4a. Repeated loadTasks() / loadSettings() Calls
renderBoard() calls loadTasks(), loadSettings(), loadLabels() at the top. But functions it calls (like getTaskCountInColumn, syncSwimLaneControls, refreshNotifications) each call loadTasks() / loadSettings() again — parsing JSON from localStorage each time. During a single render cycle, loadTasks() may be called 5+ times.

Recommendation: Pass the already-loaded data through to called functions. Some sync helpers already accept a tasksCache parameter — extend this pattern consistently.

4b. Verbose DOM Construction
The imperative DOM construction (60+ lines for a column element, 80+ lines for task cards) is the biggest readability cost. Every element creation follows the same pattern:


const el = document.createElement('tagName');
el.classList.add('class');
el.setAttribute('attr', 'value');
const icon = document.createElement('span');
icon.dataset.lucide = 'icon-name';
el.appendChild(icon);
Recommendation: A minimal h() helper would cut DOM construction code by ~60%:


function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
    else el.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') el.append(c);
    else if (c) el.appendChild(c);
  });
  return el;
}
This is entirely optional — the current code works — but it would make the 200-line createColumnElement much more scannable.

4c. Magic Strings
Column ID 'done' appears as a string literal in 15+ locations across 8 files. Priority values ('urgent', 'high', etc.) are repeated as string literals and as sets/arrays in 4 files.

Recommendation: Export constants from a single location:


// constants.js
export const DONE_COLUMN_ID = 'done';
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const PRIORITY_SET = new Set(PRIORITIES);
5. Priority-Ordered Action Plan
Priority	Issue	Effort	Impact
1	Extract shared normalizers into normalize.js	Low	Eliminates 6+ duplicate functions
2	Replace await import('./render.js') with event bus	Medium	Eliminates all circular deps, cleaner architecture
3	Split modals.js into per-modal modules	Medium	Each modal becomes independently testable
4	Split render.js into renderer sub-modules	Medium	Reduces cognitive load, enables targeted testing
5	Replace remaining alert() calls with alertDialog()	Low	Consistency, non-blocking UX
6	Remove dead legacy code	Low	Less confusion, smaller bundle
7	Extract magic strings to constants.js	Low	Single source of truth for domain values
8	Add h() DOM helper	Low	Optional readability improvement
The codebase is solid for a local-first vanilla JS app. The main risk is that render.js and modals.js will continue to grow unless decomposed soon — they're already at a size where adding features means reasoning about 1,000+ lines of context. The event bus change (#2) is the highest-leverage architectural improvement, as it decouples the entire mutation-to-render pipeline.

The dependency analysis agent confirmed my findings — no circular dependencies at load time (thanks to the dynamic import workaround), and storage.js is the rightful central hub with 13+ dependents. The architecture is healthy at the foundation layer but showing strain at the UI layer.

The review above covers everything. Let me know if you'd like me to dive deeper into any specific area, or if you want me to start implementing any of the recommended changes — the shared normalizers extraction (#1) or the event bus (#2) would be the highest-impact starting points.

# DOM Refactor Plan — Reduce Boilerplate via `dom.js` Utilities

## Context

The frontend has 1,088 raw DOM calls spread across 45 JS modules (~10,663 lines). The primary driver is `document.getElementById()` (249 calls) plus `document.createElement()` chains (173 calls), `classList` operations (239), `.textContent=` (126), and `.addEventListener()` (144). A `dom.js` module already exists with a hyperscript helper `h()` but is 100% unused — no file imports it.

Goal: eliminate the boilerplate patterns by extending `dom.js` and adopting it across the codebase. No functionality changes. All 3 test layers must stay green after each phase.

**No module-level element caching** — DOM tests reset `document.body.innerHTML = ''` in `beforeEach`/`afterEach` (see `client/tests/dom/setup.js:4-11`), which would make cached element references stale. Use `$id()` inline everywhere.

---

## Phase 0 — Extend `dom.js` (risk: none) ✅

**File:** `client/src/modules/dom.js`

Add these exports below the existing `h()`:

```js
export const $id = (id) => document.getElementById(id);
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
export const addClass = (el, ...n) => el?.classList.add(...n);
export const removeClass = (el, ...n) => el?.classList.remove(...n);
export const toggleClass = (el, name, force) => el?.classList.toggle(name, force);
export const cx = (...parts) => parts.filter(Boolean).join(' ');
```

Also add `style` object support to `h()` — inside the `for (const [k, v] of Object.entries(attrs))` loop, before the final `setAttribute` else-branch:

```js
} else if (k === 'style' && typeof v === 'object' && v !== null) {
  for (const [prop, val] of Object.entries(v)) {
    if (prop.startsWith('--')) el.style.setProperty(prop, val);
    else el.style[prop] = val;
  }
}
```

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** +25 (dom.js grows 48 → ~73)

---

## Phase 1 — `dialog.js` + `modals.js` (risk: low) ✅

**Files:** `client/src/modules/dialog.js`, `client/src/modules/modals.js`

- `dialog.js` has a private `function getEl(id) { return document.getElementById(id); }` (lines 5–7) + 8 call sites. Delete the private function; import `$id` from `dom.js`; replace `getEl(...)` with `$id(...)`.
- `modals.js` has 8 `document.getElementById()` calls. Replace all with `$id()`. Replace `modal.querySelector(...)` with `$(...)` and `modal.querySelectorAll(...)` with `$$(...)`.

**Import:** `import { $id, $, $$ } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −3

---

## Phase 2 — `notifications.js` (risk: low) ✅

**File:** `client/src/modules/notifications.js` (437 lines, 16 getElementById, 13 createElement)

- Replace all `document.getElementById(...)` with `$id(...)`.
- Replace `badge.classList.add('hidden')` / `.remove('hidden')` patterns in `updateNotificationBadge()` with `addClass(badge, 'hidden')` / `removeClass(...)`.
- Convert multi-line createElement chains in `renderNotificationBanner()` and `renderNotificationsModalContent()` to `h()` calls.
- The `[...].map($id).filter(Boolean)` pattern can replace multi-line ID array building.

**Import:** `import { $id, h, addClass, removeClass } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −25 to −35

---

## Phase 3 — `accordion.js` + `activity-log-ui.js` (risk: low) ✅

**Files:** `client/src/modules/accordion.js` (56 lines), `client/src/modules/activity-log-ui.js` (109 lines)

Both are pure element-building functions with no getElementById. Convert the `createElement` + classList + setAttribute chains to nested `h()` calls. Keep event listeners either inline via `onClick` attr or as separate `.addEventListener()` calls when closure variables make inline unwieldy.

Note: `accordion.js` DOM tests in `client/tests/dom/` cover this behavior — verify that the output HTML structure is unchanged.

**Import:** `import { h } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −20

---

## Phase 4 — `column-modal.js` + `settings.js` (risk: low) ✅

**Files:** `client/src/modules/column-modal.js` (138 lines, 14 getElementById), `client/src/modules/settings.js` (158 lines, 14 getElementById)

Replace all `document.getElementById(...)` with inline `$id(...)` calls. No caching — DOM tests reset the DOM between tests.

**Import:** `import { $id } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −16

---

## Phase 5 — `boards-modal.js` (risk: low-medium) ✅

**File:** `client/src/modules/boards-modal.js` (293 lines, ~20 getElementById, 13 createElement)

- Replace all `document.getElementById(...)` with `$id(...)`.
- Convert `renderBoardsList()` item builder to nested `h()`. Each board item (div.label-item > name + actions > 4 buttons) collapses from ~40 lines to ~15 lines.
- Icon-only buttons with `span[data-lucide]` children: 5–7 lines → one `h()` call.

**Import:** `import { $id, h } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −35 to −45

---

## Phase 6 — `swimlane-renderer.js` (risk: low) ✅

**File:** `client/src/modules/swimlane-renderer.js` (283 lines, 28 createElement, 28 classList.add, 15 setAttribute)

Pure renderer — no getElementById. Convert all createElement chains to `h()`. Use `cx()` for conditional class strings and the `style` object key for CSS custom properties (`--column-accent` etc.).

```js
h('section', {
  class: cx('swimlane-column-header', isCollapsed && 'is-collapsed'),
  'data-column': column.id,
  style: column?.color ? { '--column-accent': column.color } : {}
})
```

**Import:** `import { h, cx } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −55 to −70

---

## Phase 7 — `column-element.js` (risk: medium)

**File:** `client/src/modules/column-element.js` (345 lines, 27 createElement, 26 classList.add, 32 setAttribute, 12 addEventListener)

Core board renderer called on every repaint. Convert createElement chains to `h()` with `cx()`. Keep stateful closures as named handlers or inline `onMouseenter`/`onMouseleave` attrs.

`closeAllColumnMenus` uses `document.querySelectorAll('.column-menu')` — leave as-is.

`createTextNode(' Edit')` text nodes pass as string children to `h()`.

**Import:** `import { h, cx } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −60 to −80

---

## Phase 8 — `task-card.js` (risk: medium)

**File:** `client/src/modules/task-card.js` (335 lines, 21 createElement, 24 classList.add, 19 setAttribute)

Convert createElement chains to `h()` with `cx()`.

**Leave untouched:**
- SVG donut (`createElementNS`) for subtask progress.
- `linkifyText()` function — creates `<a>` elements in a while loop.
- Footer conditional append logic at end of `createTaskElement`.

**Import:** `import { h, cx } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e` — `task-card-linkify.test.js` covers `linkifyText`.

**Line delta:** −40 to −55

---

## Phase 9 — `labels-modal.js` (risk: medium)

**File:** `client/src/modules/labels-modal.js` (380 lines, 31 getElementById, 9 createElement)

- Replace all `document.getElementById(...)` with inline `$id(...)`.
- Convert `createLabelListItem()` (9 createElement calls, ~35 lines) to nested `h()`.

**Import:** `import { $id, h } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e`

**Line delta:** −45 to −55

---

## Phase 10 — `task-modal.js` (risk: high)

**File:** `client/src/modules/task-modal.js` (790 lines, 62 getElementById, 24 createElement)

Largest and riskiest file. Highest test coverage via E2E.

- Replace all `document.getElementById(...)` with inline `$id(...)`. No module-level caching.
- Convert dynamic list builders to `h()`:
  - `renderActiveTaskLabels()` — pill + removeBtn
  - `renderActiveTaskRelationships()` — badge + children
  - `updateRelationshipSearchResults()` — result items with icon spans
  - `updateTaskLabelsSelection()` — checkbox labels + group headers
  - `updateDescriptionLinks()` — `<a>` chips

**Leave untouched:**
- `renderSubTaskList()` inline SVG `innerHTML` blobs.
- Any `createElementNS` calls.

**Import:** `import { $id, h, cx } from './dom.js';`

**Verify:** `npm run test:unit && npm run test:dom && npm run test:e2e` — focus on `create-task.spec.ts`, `subtasks.spec.ts`, `validation-missing-title.spec.ts`.

**Line delta:** −80 to −100

---

## Summary

| Phase | Files | Risk | Est. Lines Saved |
|---|---|---|---|
| 0 | `dom.js` | None | +25 (adds utilities) |
| 1 | `dialog.js`, `modals.js` | Low | −3 |
| 2 | `notifications.js` | Low | −30 |
| 3 | `accordion.js`, `activity-log-ui.js` | Low | −20 |
| 4 | `column-modal.js`, `settings.js` | Low | −16 |
| 5 | `boards-modal.js` | Low-Med | −40 |
| 6 | `swimlane-renderer.js` | Low | −65 |
| 7 | `column-element.js` | Medium | −70 |
| 8 | `task-card.js` | Medium | −50 |
| 9 | `labels-modal.js` | Medium | −50 |
| 10 | `task-modal.js` | High | −90 |
| **Total** | 13 files | | **~−409 lines net** |

**Verification per phase (run from `client/`):**
```bash
npm run test:unit && npm run test:dom && npm run test:e2e
```

**Critical files:** `dom.js`, `task-modal.js`, `column-element.js`, `swimlane-renderer.js`, `notifications.js`

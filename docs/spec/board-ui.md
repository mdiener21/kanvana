# Board UI

## Main Layout

- The board uses a horizontal column layout with mobile-friendly horizontal scrolling
- Each column contains a header, task list, and optional "Show all tasks" expansion control
- Task counters appear in column headers and update after adds, deletes, and moves
- Brand text shows the active board name rather than a fixed app title

## Controls Bar

- Includes board-level task search beside the brand area
- Search filters the rendered board in memory only
- Search matches task title, description, priority, label name, and label group name
- A menu button opens controls for boards, help, labels, settings, notifications, add column, calendar, export, and import
- A quick-access bell button mirrors the notification modal and count badge shown in the menu

## Boards UI

- Board selection persists and restores on page load
- Manage Boards supports create, open, export, import, rename, and delete actions
- New boards can be blank or created from a template
- Built-in templates may preload workflow-specific starter columns, grouped labels, and labeled tasks so a new board is immediately usable
- The last remaining board cannot be deleted
- On mobile, the board selector has a larger touch target and the controls menu stays open while the selector is used

## Modals and Dialogs

- Modal close behavior is centralized in `src/modules/modals.js`
- Modals close via Escape or backdrop click
- Confirmations use `confirmDialog()` or `alertDialog()` instead of browser-native dialogs
- Long modals scroll internally while their action row stays sticky at the bottom
- Modals become full-screen on mobile

## Rendering Behavior

- `renderBoard()` is the single board re-render entry point after data changes
- Dynamic DOM updates should re-run `renderIcons()`
- Done-column virtualization renders completed tasks in batches when the column is large

## Drag and Drop Behavior

- Tasks are draggable within and across columns
- Columns are draggable via grip handle only
- Dragging near the top or bottom of a long task list auto-scrolls the list
- Collapsed columns accept drops and place the task at the top
- Done column internal reordering is disabled and dropped tasks are inserted at the top
- Task drops use incremental updates so counters, collapsed titles, due-date display, and notifications refresh without a full board rebuild

## Scrolling and Responsiveness

- Desktop columns default to `max-height: 600px`; expanded state uses `80vh`
- Mobile columns use internal vertical scrolling and snap-scrolling horizontally across the board
- Styled scrollbars use an 8px thumb on supported browsers

## Warnings

- `beforeunload` warns that data lives in localStorage and should be exported if needed
- Deleting tasks, columns, and labels requires confirmation

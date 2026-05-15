# Keyboard Shortcuts

Kanvana supports keyboard shortcuts for fast board management, modal handling, task editing, and accessible list activation. Global shortcuts avoid form fields so typing in inputs, textareas, and selects does not trigger board actions.

| Area | Key binding | Action | Notes |
|---|---|---|---|
| Global board navigation | `Ctrl+B` | Open the Manage Boards modal | Ignored while focus is in an input, textarea, or select |
| Global modal handling | `Escape` | Close the active modal, dialog, or column menu | Applies to task, column, labels, board, help, login, settings, notifications, confirmation dialogs, and open column menus |
| Manage Boards modal | `ArrowDown` | Move focus to the next board | Works only while the Manage Boards modal is open |
| Manage Boards modal | `ArrowUp` | Move focus to the previous board | Works only while the Manage Boards modal is open |
| Manage Boards modal | `Enter` | Open the highlighted board | Closes the Manage Boards modal after switching |
| Task label search | `ArrowDown` | Move highlight to the next label result | Works in the task editor label search field |
| Task label search | `ArrowUp` | Move highlight to the previous label result | Works in the task editor label search field |
| Task label search | `Enter` | Toggle the highlighted label or open Add Label for a new label | Clears the label search after toggling an existing label |
| Sub-task quick add | `Enter` | Add the typed sub-task | Works in the task editor sub-task input |
| Inline sub-task edit | `Enter` | Save the edited sub-task title | Works while editing a sub-task title inline |
| Inline sub-task edit | `Escape` | Cancel the inline sub-task edit | Restores the previous title |
| Notifications banner | `Enter` or `Space` | Open the focused notification task | Works on keyboard-focused notification items |
| Notifications banner | `Enter` or `Space` | Open the notifications modal from the focused overflow item | Applies to the `+N` overflow item |
| Notifications modal | `Enter` or `Space` | Open the focused task and close the notifications modal | Works on keyboard-focused notification rows |


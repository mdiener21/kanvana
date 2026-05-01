# Help (In-App)

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/kanvana/)

This file is the canonical user-facing text for the in-app **Help** modal.

## Quick start

- Create a task with the **+** button in a column header.
- Drag and drop tasks between columns to update status.
- Use **Priority** for urgency, **Due Date** for deadlines, and **Labels** for categories.

## Support & Community

Loving Kanvana the Kanban Board? Help us grow!

- **⭐ Star the Repo**: Show your support on [GitHub](https://github.com/mdiener21/kanvana) to help others discover it!
- **📚 Full Documentation**: Dive deeper with guides, templates, and specs at [docs/](https://github.com/mdiener21/kanvana/tree/main/docs).
- **🐛 Report Issues**: Found a bug? Suggest features on [GitHub Issues](https://github.com/mdiener21/kanvana/issues).

Your feedback keeps the app improving! 🚀

### About Kanvana Web PWA App

This is a fully local personal + AI Agent Kanban board.

- **No server required**: everything runs in your browser.
- **Local-first storage**: data is stored in this browser’s `localStorage`.
- **Backups are your responsibility**: export regularly if you care about the data.

## Controls Menu

All controls are in the header menu (ellipsis **⋮**).

- **Board Select**: switch boards
- **New Board**: create a board
- **Manage Boards**: open/rename/delete boards
- **Add Column**: create a new column
- **Manage Labels**: create/edit/delete labels and groups
- **Export** / **Import**: backup and restore boards
- **Theme** / **Help**: appearance and help

## Boards

- **Switch boards** using the board dropdown.
- The **last active board is restored** when you return.
- **Manage Boards** lets you:
  - Open a board
  - Rename a board
  - Delete a board (confirmation required)
  - The last remaining board cannot be deleted

## Tasks

- **Add**: click the **plus** icon in a column header.
- **Edit**: click a task card to edit its title/description/priority/due date/column/labels.
- **Move**: drag and drop tasks between columns.
- **Delete**: click the task **trash** button and confirm.

#### Task Priority

- **Urgent** (Bright Deep Red) — Needs immediate attention
- **High** (Light Red) — Important, time-sensitive
- **Medium** (Orange) — Standard priority
- **Low** (Light Grey Blue) — Nice to have
- **None** (Grey) — Not decided yet

### Columns

- **Add**: click **Add Column**.
- **Edit/Delete**: use the column **ellipsis** menu.
- **Reorder**: drag the column **grip handle**.
- **Deleting a column**:
  - If the column has tasks, you’ll be warned that tasks will also be deleted.
  - The last remaining column cannot be deleted.

### Labels

- Open **Manage Labels** to create, edit, or delete labels.
- Assign labels while editing a task.
- The task editor includes:
  - A **selected labels** row (pills)
  - A **search box** to filter labels
- Deleting a label removes it from all tasks (confirmation required).

### Import / Export (Backups)

- **Export** downloads the active board only (columns + tasks + labels) as a JSON file. It does not back up all boards.

To back up everything:

- Switch boards
- Export each board individually

**Import** creates a **new board** from the JSON (columns + tasks + labels + settings when present) and switches to it.

Important notes:
- Clearing site data, using private browsing, or switching browsers/devices can make your data disappear.
- Export regularly if you want a durable backup.

### Keyboard & Modal Shortcuts

- **Escape** closes most modals.
- Clicking the **backdrop** closes most modals.

### Tips

- Export on a schedule (end of day / end of week).
- Use multiple boards to separate contexts (work, personal, projects).
- Use labels to slice across columns (e.g., Feature, Finance, Email).

## Writing good task titles (optional)

Short, action-oriented titles are easiest to execute. Examples:

- Implement
- Fix
- Draft
- Review
- Schedule
- Follow up
- Investigate

---



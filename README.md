# Kanvana: The Personal Kanban Board to Nirvana

```js
kanvana == "Kanban" + "Nirvana" # smooth flow
```

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://kanvana.com)
[![Version](https://img.shields.io/badge/version-3.4.29-brightgreen)](CHANGELOG.md)
[![CI](https://github.com/mdiener21/kanvana/actions/workflows/ci.yml/badge.svg)](https://github.com/mdiener21/kanvana/actions/workflows/ci.yml)

> **A sleek, local-first Kanban board and time tracker that runs in your browser.** No account needed, no tracking.

Kanvana keeps your boards, tasks and time entries in your browser, so it works offline and your data
stays on your device. If you want the same boards on your phone and laptop, sign in to sync them;
that's optional.

## 🚀 Live Demo

**[Try Kanvana now](https://kanvana.com)**: nothing to install, start adding tasks right away.

<div align="center">
   <a href="https://kanvana.com"><img width="1462" height="895" alt="Kanvana board with To Do, In Progress and Done columns" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>
</div>

## ✨ Features

### Boards, columns and tasks

- **Multiple boards**: start blank or from a built-in template, then switch boards from the controls menu (⋮)
- **Drag and drop**: move tasks between columns and reorder columns; collapse a column to save space and still drop onto it
- **Tasks**: title, description, priority, due date and labels; links in a description become clickable
- **Search**: find tasks by title, description, label or label group
- **Custom labels and colours**: group labels, colour them, and colour columns; label text switches between black and white to stay readable
- **Light and dark theme**, remembered between visits

### ✅ Sub-tasks

Break a task into steps without leaving the board:

- Type a sub-task and press **Enter** to add it; tick it off when done
- Click a sub-task to rename it; drag the handle to reorder
- The card shows a progress donut with `done/total` that turns green when everything is finished

<img width="355" height="190" alt="Sub-task list in the task editor" src="https://github.com/user-attachments/assets/f6cf23be-8178-4edb-ac27-ddc53741e92f" /><br>
<img width="166" height="87" alt="Sub-task progress on a task card" src="https://github.com/user-attachments/assets/296070c9-0232-41c6-8f88-2f13fa7eb1b9" />

### 🔗 Task relationships

Link tasks as **prerequisite**, **dependent** or **related**. Links work both ways: add one and the other
task shows it too. Find tasks by short ID (e.g. `#ae2ry`) or title, and click a link to jump to that task.

### 🏊 Swim lanes

Split the board into rows grouped by **label**, **label group** or **priority**:

- Drag tasks across columns and lanes in one move; the label or priority updates to match
- Add a task straight into a lane
- Collapse single cells, whole lanes or columns
- Turn lanes on from the controls menu or **Settings**, and reorder them in **Settings**

### ⏱️ Time tracking

Open the time tracker with the clock icon in the board header:

- Type what you worked on, pick a project, and enter times as shorthand like `930`, `90m` or `1.5`
- See entries by day with totals, and edit them from the keyboard
- Monthly reports: totals, a daily chart by project, and a customer and project breakdown
- Archive customers and projects; choose date, time, timezone and duration formats

### 📊 Reports, calendar and reminders

- **Reports**: cumulative flow, lead time, completions per week, same-day completions and a 365-day activity heatmap
- **Calendar**: tasks by due date on a month view, with overdue tasks highlighted
- **Notifications**: reminders before due dates, with colour-coded countdowns on cards

### 🔄 Sync across devices (optional)

Sign in with **Go Online** to keep your boards and time entries in step across devices. Changes show up
on your other devices within seconds, and edits made offline merge when you reconnect. The header shows
the sync state: `Live`, `Syncing…`, `unsynced` or `Offline`.

### 📱 Everywhere you work

- Works on phones, tablets and desktops; on a phone, a bottom tab bar keeps everything in reach
- Install it as an app (**Install app** in the controls menu, when your browser supports it) and use it offline
- Keyboard shortcuts, e.g. `Ctrl+B` opens Manage Boards: see the [shortcut list](docs/user/keybindings.md)

## 🛡️ Your data

Kanvana stores your data in your browser (IndexedDB). It stays there across reloads and restarts, and
nothing is sent anywhere unless you sign in to sync.

Back up a board any time: **Manage Boards → Export** saves it as a JSON file you can keep in OneDrive,
Google Drive or Dropbox, and **Import** brings it back.

## 🏠 Host your own

Kanvana is a static web app. Build it once and put the files on any web host:

```bash
git clone https://github.com/mdiener21/kanvana.git
cd kanvana/client
npm install
npm run build        # the site is in client/dist/
```

To include sync, `docker compose up` from the repository root runs the app with its PocketBase backend.

## 📚 More

- [User guides](docs/user/): boards, labels and keyboard shortcuts
- [Changelog](CHANGELOG.md): what's new in each version
- Contributing code? Start with [AGENTS.md](AGENTS.md): setup, commands, architecture and workflow

## 🤝 Contributing

Bug reports, ideas and pull requests are welcome. [Open an issue](https://github.com/mdiener21/kanvana/issues)
or ⭐ star the repo to show your support.

## 📄 License

MIT. See [LICENSE.md](LICENSE.md).

# Kanvana: The Personal Kanban Board

```js
kanvana == "Kanban" + "nirvana" # smooth flow
```

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/kanvana.svg?style=social)](https://github.com/mdiener21/kanvana/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/kanvana/)
[![Version](https://img.shields.io/badge/version-1.4.0-brightgreen)](CHANGELOG.md)

> **Transform your productivity with a sleek, local-first Kanban board.** No servers, no tracking—just pure efficiency in your browser.

A beautiful, modern-designed personal + AI-Agent Kanban board that runs entirely in your browser. No backend, no cloud, no data tracking. Everything stays local with browser `localStorage` persistence. Perfect for personal task management, work tracking, and staying organized.

**Building with AI agents?** Try the new **AI Agent Ops Starter** board template to track 2–5 agents in parallel, review handoffs, and improve prompts in one local-first workspace. If that sounds useful, give the repo a ⭐ and help more agent builders discover it.

## 🚀 Live Demo

Experience it firsthand: **[Try the Live Demo](https://mdiener21.github.io/kanvana/)**


<div align="center">
   <a href="https://mdiener21.github.io/kanvana/"><img width="1462" height="895" alt="image" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>
</div>


## ✨ Key Features

### ✅ Sub-tasks (New!)

Break complex tasks into smaller, trackable steps without leaving the board:

- **Inline creation** — type a sub-task title and press **Enter** to add it instantly
- **Checkbox completion** — check off each step; completed items are struck through and visually muted
- **Inline editing** — click any sub-task title to edit it in place; press **Enter** to save or **Escape** to cancel
- **Drag to reorder** — grab the handle and drag sub-tasks into the order that makes sense
- **Progress indicator** — the task card shows a donut circle with `completed/total Done` count that turns green when everything is done
- **Lightweight** — sub-tasks have no labels, priorities, or relationships; they stay scoped to their parent task

Sub-tasks are saved with the parent task and survive export/import round-trips. Existing tasks default to zero sub-tasks with no migration needed.


<img width="355" height="190" alt="image" src="https://github.com/user-attachments/assets/f6cf23be-8178-4edb-ac27-ddc53741e92f" /><br>

<img width="166" height="87" alt="image" src="https://github.com/user-attachments/assets/296070c9-0232-41c6-8f88-2f13fa7eb1b9" />


### 🔗 Task Relationships

Link tasks together to communicate dependencies and connections:

- **Prerequisite** — another task must be completed before this one can begin
- **Dependent** — this task is needed by another task before that task can start
- **Related** — a general connection between two tasks without implying order

Relationships are **bidirectional**: adding one automatically creates the inverse on the linked task, and removing it cleans up both sides. Search for tasks by short ID (e.g. `#ae2ry`) or title, view active relationships as color-coded badges in the task modal, and click any badge ID to jump straight to that task.

### 🏊 Swim Lanes

Organize your board into horizontal swim lanes for a powerful two-dimensional view of your workflow:

- **Flexible Grouping**: Group tasks by **label**, **label group**, or **priority** — each mode creates distinct swim lane rows
- **Drag & Drop Across Lanes**: Move tasks between columns, lanes, or both in a single gesture — lane assignments update automatically
- **Per-Cell Control**: Collapse/expand individual swim lane cells, entire rows, or workflow columns independently
- **Quick Task Creation**: Add tasks directly to any swim lane cell with automatic label/priority assignment
- **Smart Done Column**: Done tasks are hidden in swim lanes to keep rows compact, while the Done column remains a drag-and-drop target
- **Sticky Headers**: Lane headers stay pinned during horizontal scrolling; workflow headers stay visible during vertical scrolling
- **Mobile Optimized**: Responsive flex layout with sticky lane headers and snap-scrolling columns on mobile
- **Persistent State**: All swim lane settings, collapsed states, and lane assignments are saved per board

Configure swim lanes in **Settings** — choose your grouping mode and start organizing!

### Core Features

- **🚀 Blazing Fast & Simple**: Lightning-quick performance with a clean, intuitive interface
- **🔍 Powerful Search**: Find tasks instantly by label, title, description, or label groups
- **📊 Productivity Reports**: Visualize your progress with Cumulative Flow Diagrams, weekly lead time, completion stats, and same-day completions tracking
- **📅 Calendar View**: See tasks by due date on a monthly calendar with overdue highlighting
- **🔔 Smart Notifications**: Get reminded of due dates with customizable advance notices and color-coded countdown timers (urgent/warning thresholds)
- **💻 100% Local-First**: No servers, no backend, no cloud. Your data never leaves your device
- **🎨 Drag & Drop**: Effortlessly move tasks and columns with optimized performance (handles 300+ tasks)
- **🏷️ Custom Labels & Colors**: Organize with personalized labels, groups, and column colors
- **📋 Multiple Boards**: Create and manage multiple boards with board templates
- **💾 Easy Backup**: Export/import boards as JSON via **Manage Boards** — save backups to your favorite cloud storage (OneDrive, Google Drive, Dropbox)
- **📱 Fully Responsive**: Optimized for mobile and desktop — work from anywhere
- **🌗 Light & Dark Theme**: Toggle between themes with automatic persistence
- **⚡ Collapsible Columns**: Collapse columns to save space while still accepting drag-and-drop
- **⏱️ Due Date Countdown**: Color-coded countdown timers with configurable urgent and warning thresholds
- **🥇 Free & Open Source**: Always free, no hidden costs or subscriptions

## 📸 Screenshots

<div align="center">
   <a href="https://mdiener21.github.io/kanvana/"><img width="1462" height="895" alt="image" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>
   <br><br>Label Manager
   <a href="https://mdiener21.github.io/kanvana/"><img width="582" height="703" alt="image" src="https://github.com/user-attachments/assets/dec3484f-2156-4163-8b87-b30d2a837c4d"></a>
   <br><br>Control Menu
   <a href="https://mdiener21.github.io/kanvana/"><img width="273" height="556" alt="image" src="https://github.com/user-attachments/assets/2fbc476d-226a-4c5f-a1bd-a2d6713e5c01"></a>
   <br><br>
   <a href="https://mdiener21.github.io/kanvana/"><img width="1273" height="1168" alt="image" src="https://github.com/user-attachments/assets/871a95fb-f7f7-41f8-a1b3-dc74f38ff6a2"></a>

</div>


## 🛡️ Data Security & Persistence

Your data is stored securely in your browser's `localStorage`. It persists across sessions and survives cache clears. For extra safety, use the built-in export feature to save backups to your preferred cloud storage.

## 🚀 Quick Start

Get up and running in minutes!

### For Users: Try It Now
1. Visit the **[Live Demo](https://mdiener21.github.io/kanvana/)**.
2. Start creating boards, tasks, and labels immediately.
3. Export your data anytime for backup.

### For Developers: Host Your Own
The repository includes a pre-built static site in `dist/`. Simply upload it to any web host.

1. Copy the `dist/` folder.
2. Upload to your web host (e.g., [Hetzner](https://www.hetzner.com/de/webhosting), Netlify, Vercel).
3. Done! Your Kanvana achieved and the Kanban board is live.

## 🛠️ Development

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/mdiener21/kanvana.git
   cd kanvana
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```
   The app will open at `http://localhost:3000`.

### Build for Production
```bash
npm run build
```
Built files are in `dist/`.

### Preview Production Build
```bash
npm run preview
```

### Releasing a New Version

Releases are fully automated via GitHub Actions — no local commands needed.

**Step 1 — Keep `CHANGELOG.md` up to date during development**

As you merge features and fixes, add bullet points under `## [Unreleased]` in `CHANGELOG.md`. Use the standard sections:

```markdown
## [Unreleased]

### Added
- Some new feature

### Fixed
- Some bug fix
```

This is a normal commit — not a release trigger.

**Step 2 — Trigger "Generate Release" on GitHub**

1. Go to **Actions** → **Generate Release** → **Run workflow**
2. Fill in the two inputs:
   - **Version bump type** — `patch` (bug fixes), `minor` (new features), or `major` (breaking changes)
   - **Skip tests** — leave unchecked to run the full test suite first (recommended); check to force a release without tests
3. Click **Run workflow**

The workflow runs in two jobs:

- **Run tests** — executes unit, DOM, and Playwright E2E tests (Firefox). If any test fails the workflow stops and no PR is created. Fix the failure and re-trigger. If _Skip tests_ was checked this job is skipped entirely.
- **Create release PR** — only runs when tests passed or were deliberately skipped. Bumps `package.json`, promotes `## [Unreleased]` to a dated release section in `CHANGELOG.md`, updates the README version badge, and opens a pull request. The PR body clearly shows whether tests passed or were skipped.

**Step 3 — Review and merge the PR**

Check that the changelog and version look correct, then merge the pull request. If the PR body shows tests were skipped, decide whether that is acceptable before merging.

**Step 4 — Done**

Merging triggers the **Publish Release** workflow automatically. It reads the version from `package.json`, creates and pushes the git tag, and publishes the GitHub Release with the changelog notes. No further action needed.

> If your repo blocks Actions from creating PRs, enable: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**.

### Run Tests

This project uses a four-layer test stack:

- `Vitest` for pure unit tests in `tests/unit/`
- `Vitest` + `@testing-library/dom` for DOM integration tests in `tests/dom/`
- `MSW` for mocked API behavior shared by Vitest suites from `tests/mocks/`
- `Playwright` for end-to-end and visual/accessibility smoke coverage in `tests/e2e/`

Run the full automated test stack:

```bash
npm test
```

Run only the unit tests:

```bash
npm run test:unit
```

Run only the DOM integration tests:

```bash
npm run test:dom
```

Run only the Playwright E2E tests:

```bash
npm run test:e2e
```

Run only the create-task E2E tests ([tests/e2e/create-task.spec.ts](tests/e2e/create-task.spec.ts)):

```bash
npm run test:e2e -- tests/e2e/create-task.spec.ts
```

The detailed strategy, folder layout, and naming convention live in [docs/testing-strategy.md](docs/testing-strategy.md).

## 📚 Documentation

Dive deeper with our comprehensive docs: **[View Documentation](https://github.com/mdiener21/kanvana/tree/main/docs)**

## 🤝 Contributing

We love contributions! Whether it's bug fixes, features, or docs—every star and fork helps grow the community.

- **Star this repo** ⭐ to show your support!
- **Fork and contribute** code or ideas.
- **Report issues** for bugs or suggestions.

## 📄 License

Licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

---

**Made with ❤️ for productivity enthusiasts. Star us on GitHub to stay updated!**

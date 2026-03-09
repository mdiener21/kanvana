# Personal Kanban Board

[![GitHub stars](https://img.shields.io/github/stars/mdiener21/personal-kanban.svg?style=social)](https://github.com/mdiener21/personal-kanban/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue)](https://mdiener21.github.io/personal-kanban/)

> **Transform your productivity with a sleek, local-first Kanban board.** No servers, no tracking—just pure efficiency in your browser.

A beautiful, modern-designed personal Kanban board that runs entirely in your browser. No backend, no cloud, no data tracking. Everything stays local with browser `localStorage` persistence. Perfect for personal task management, work tracking, and staying organized.

## 🚀 Live Demo

Experience it firsthand: **[Try the Live Demo](https://mdiener21.github.io/personal-kanban/)**

## 📸 Screenshots

<div align="center">
   <a href="https://mdiener21.github.io/personal-kanban/"><img src="https://github.com/user-attachments/assets/7f3a1a83-84ef-41fa-a099-728e45ad3418" alt="Personal Kanban Board Interface" width="80%"></a>
  <br><br>
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="1462" height="895" alt="image" src="https://github.com/user-attachments/assets/0d0ade47-e931-4caa-b1ec-4e0148733d5b"></a>

  <br><br>
   <a href="https://mdiener21.github.io/personal-kanban/"><img src="https://github.com/user-attachments/assets/9faa275b-16b0-4b38-b890-c4b503710e70" alt="Kanban Board Features" width="80%"></a>
   <br><br>Label Manager
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="582" height="703" alt="image" src="https://github.com/user-attachments/assets/dec3484f-2156-4163-8b87-b30d2a837c4d"></a>
   <br><br>Control Menu
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="273" height="556" alt="image" src="https://github.com/user-attachments/assets/2fbc476d-226a-4c5f-a1bd-a2d6713e5c01"></a>
   <br><br>Settings Customization
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="794" height="636" alt="image" src="https://github.com/user-attachments/assets/8c743e44-6810-4497-b93c-7dcdade8a820"></a>
   <br><br>
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="1092" height="745" alt="image" src="https://github.com/user-attachments/assets/dc143944-bff6-47aa-b71a-0db6788c6b19"></a>
   <br><br>
   <a href="https://mdiener21.github.io/personal-kanban/"><img width="1273" height="1168" alt="image" src="https://github.com/user-attachments/assets/871a95fb-f7f7-41f8-a1b3-dc74f38ff6a2"></a>

</div>

## ✨ Key Features

- **🚀 Blazing Fast & Simple**: Lightning-quick performance with a clean, intuitive interface.
- **🔍 Powerful Search**: Find tasks instantly by label, title, description, or label groups.
- **📊 Productivity Reports**: Visualize your progress with Cumulative Flow Diagrams and weekly completion stats.
- **🔔 Smart Notifications**: Get reminded of due dates with customizable advance notices. Toggle on/off and view as a prioritized list.
- **💻 100% Local-First**: No servers, no backend, no cloud. Your data never leaves your device.
- **🎨 Drag & Drop**: Effortlessly move tasks and columns for seamless workflow management.
- **🏷️ Custom Labels & Colors**: Organize with personalized labels, groups, and column colors.
- **💾 Easy Backup**: Export/import boards as JSON files to your favorite cloud storage (OneDrive, Google Drive, Dropbox).
- **📱 Fully Responsive**: Optimized for mobile and desktop—work from anywhere.
- **🥇 Free & Open Source**: Always free, no hidden costs or subscriptions.

## 🛡️ Data Security & Persistence

Your data is stored securely in your browser's `localStorage`. It persists across sessions and survives cache clears. For extra safety, use the built-in export feature to save backups to your preferred cloud storage.

## 🚀 Quick Start

Get up and running in minutes!

### For Users: Try It Now
1. Visit the **[Live Demo](https://mdiener21.github.io/personal-kanban/)**.
2. Start creating boards, tasks, and labels immediately.
3. Export your data anytime for backup.

### For Developers: Host Your Own
The repository includes a pre-built static site in `dist/`. Simply upload it to any web host.

1. Copy the `dist/` folder.
2. Upload to your web host (e.g., [Hetzner](https://www.hetzner.com/de/webhosting), Netlify, Vercel).
3. Done! Your personal Kanban board is live.

## 🛠️ Development

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/mdiener21/personal-kanban.git
   cd personal-kanban
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

### Generate a Release

Use the `Generate Release` workflow to automate release preparation:
- `npm ci` + `npm run build`
- version bump (`package.json` + `package-lock.json`)
- changelog promotion from `Unreleased`
- creation/update of a release PR (`release/vX.Y.Z` → `main`)

After the release PR is merged, `Publish Release` runs automatically on `main` and:
- creates/pushes tag `vX.Y.Z`
- publishes GitHub Release with notes extracted from `CHANGELOG.md`

`Publish Release` is triggered on every push to `main`, but it only creates a tag/release when that version tag does not already exist.

GitHub CLI example:

```bash
gh workflow run release.yml --ref main -f bump=patch
```

Use `bump=minor` or `bump=major` when needed.

If your repo blocks Actions from opening PRs, enable repository setting:
`Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests`.

### Run Tests

Run all Playwright E2E tests:

```bash
npm test
```

Run only the create-task tests ([tests/e2e/create-task.spec.ts](tests/e2e/create-task.spec.ts)):

```bash
npm test -- tests/e2e/create-task.spec.ts
```

## 📚 Documentation

Dive deeper with our comprehensive docs: **[View Documentation](https://github.com/mdiener21/personal-kanban/tree/main/docs)**

## 🤝 Contributing

We love contributions! Whether it's bug fixes, features, or docs—every star and fork helps grow the community.

- **Star this repo** ⭐ to show your support!
- **Fork and contribute** code or ideas.
- **Report issues** for bugs or suggestions.

## 📄 License

Licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

---

**Made with ❤️ for productivity enthusiasts. Star us on GitHub to stay updated!**

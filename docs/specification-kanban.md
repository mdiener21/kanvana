# Kanvana Specs

Short reference for how features behave where the code can't say it plainly: rules, defaults and edge
cases, for AI agents and users. The code is the source of truth; when a spec disagrees with it, fix the
spec. Touch a spec up in a line or two when behaviour it describes changes. Specs never block a change.

| Spec | Covers |
| --- | --- |
| [overview.md](spec/overview.md) | Architecture, module map, rendering, CSS |
| [data-models.md](spec/data-models.md) | Persisted models and settings shape |
| [storage.md](spec/storage.md) | Storage keys, migration, persistence scope |
| [board-ui.md](spec/board-ui.md) | Board shell, controls panel, modals, drag and drop |
| [tasks.md](spec/tasks.md) | Task modal, card display, ordering |
| [columns.md](spec/columns.md) | Column CRUD, collapse, sorting, Done rules |
| [labels.md](spec/labels.md) | Label groups, management modal, assignment |
| [swimlanes.md](spec/swimlanes.md) | Swim lane grouping, collapse, mobile |
| [settings.md](spec/settings.md) | Per-board settings |
| [notifications.md](spec/notifications.md) | Due-date banner and modal |
| [reports.md](spec/reports.md) | Report calculations and layout |
| [calendar.md](spec/calendar.md) | Due-date calendar |
| [import-export.md](spec/import-export.md) | Board JSON import and export |
| [relationships.md](spec/relationships.md) | Task relationships |
| [sub-tasks.md](spec/sub-tasks.md) | Sub-tasks and progress |
| [time-tracking.md](spec/time-tracking.md) | Time tracker, customers, projects, reports |
| [audit-trail.md](spec/audit-trail.md) | Activity log and actor model |
| [sync.md](spec/sync.md) | Go Online, login, session, sync status |
| [backend-storage-pb.md](spec/backend-storage-pb.md) | PocketBase event sync |
| [testing.md](spec/testing.md) | Test stack, scripts, perf baselines |
| [testing-strategy.md](spec/testing-strategy.md) | Test layers and naming |

Architecture decisions are in [adr/](adr/); the domain glossary is [CONTEXT.md](../CONTEXT.md).

# 001 — Global settings storage layer

**Type:** AFK
**Blocked by:** None — can start immediately

## Parent

[Issue #102](https://github.com/mdiener21/kanvana/issues/102) — feat: task deletion redesign — permanent delete default with opt-in soft-delete and purge

## What to build

Introduce a global (cross-board) settings store in IndexedDB under the key `kanvana:settings:global`. Expose `loadGlobalSettings()` and `saveGlobalSettings()` functions that read and write this key. The initial global settings object contains a single field: `softDeleteEnabled` (boolean, default `false`).

This is the foundation slice that all other deletion-redesign slices depend on. The store must be completely independent of the per-board settings store (`kanbanBoard:{boardId}:settings`) — reads and writes must not bleed between the two.

Global settings are loaded once at startup (alongside `initStorage()`) and kept in-memory the same way board settings are. `loadGlobalSettings()` returns the defaults object when the key is absent from IDB (cold start or first run).

## Acceptance criteria

- [ ] `loadGlobalSettings()` returns `{ softDeleteEnabled: false }` on first run (key absent from IDB)
- [ ] `saveGlobalSettings({ softDeleteEnabled: true })` persists the value; a subsequent `loadGlobalSettings()` call returns the updated value
- [ ] Writing to global settings does not affect any board's per-board settings, and vice versa
- [ ] Global settings survive a page reload (persisted in IDB, not just in-memory)
- [ ] `initStorage()` initialises global settings state as part of its bootstrap sequence
- [ ] Unit tests cover: cold-start defaults, round-trip persist/reload, isolation from per-board settings

## Blocked by

None — can start immediately.

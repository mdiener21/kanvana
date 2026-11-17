# Global settings layer separate from per-board settings

**Status: accepted**, amended by [ADR-0004](0004-event-sourced-sync.md): global settings are written
only by `settings.updated` events with scope `global`.

App-wide configuration that applies across all boards is stored under a dedicated IDB key
(`kanvana:settings:global`), read through `loadGlobalSettings()`.
This is separate from the existing per-board settings (`kanbanBoard:{boardId}:settings`).

The need emerged when `softDeleteEnabled` was introduced: the purge operation it governs spans
all boards, making it meaningless to store per-board. Putting it in any single board's settings
would create an ambiguous authority question ("which board's setting governs the purge?").

## Considered Options

**Store in the active board's settings** — simplest, no new IDB key. Rejected because the
setting governs cross-board behaviour; reading it from the active board creates a silent
dependency on which board happens to be open.

**Store in localStorage alongside syncMap** — avoids a new IDB key. Rejected because it creates
a second storage tier inconsistency; all app state lives in IDB, and this should too.

**Dedicated global IDB key (chosen)** — clean separation. Board settings remain board-scoped;
global settings are explicitly global. Scales naturally as future cross-board preferences arise.

## Consequences

- The Read Model owns the `kanvana:settings:global` kv key (`READ_MODEL_KEYS.globalSettings`);
  `storage.js` exposes `loadGlobalSettings()` only.
- The Settings UI should visually separate "Board settings" from "App settings" so users
  understand which settings travel with a board and which apply to every board of the account
  (global-scope events sync across devices).
- `softDeleteEnabled` was the first global setting, then removed in issue #111. Today the layer
  holds only `timeTracking`.

# Time Tracking (MVP)

Terms (Customer, Project, Time Entry, Duration, Archived, Attribution) are defined in
[CONTEXT.md](../../CONTEXT.md#time-tracking-glossary). Visual standard: Clockify.

## Scope

- Standalone, user-wide module — no link to Boards, Columns or Tasks
- Manual time entry only — no running timer
- Fully keyboard-drivable; every action has a shortcut
- Works offline; syncs to PocketBase (`pb.kanvana.com`) when Online Mode is on

## Design Reference

- Layout follows prototype **Variant A ("Clockify classic")**: top bar, left sidebar nav with collapse function and mobile ui, entry bar above a day-grouped entry list, summary-style month report
- Prototype source: `client/src/prototype-timetracker.html` + `client/src/prototypes/timetracker/`
  (throwaway — rewrite, do not promote)

## Page and Navigation

- Entry point: `src/timetracker.html` (new Vite build input)
- Reachable from the main board menu as `Time Tracking`; page links `Back to Board`
- Sidebar sections: **Time Tracker**, **Reports**, **Projects**, **Settings**

## Data Model

Constructed through factories in `schema.js`; IDs via `generateUUID()`.

| Entity | Fields |
|---|---|
| Customer | `id`, `name`, `color`, `archived`,  |
| Project | `id`, `customerId`, `name`, `color`, `archived` |
| Time Entry | `id`, `projectId`, `description`, `start`, `end` |

- `start` / `end` are absolute instants (UTC ISO strings); `end > start`
- A Time Entry stores no customer — it is always the Project's Customer
- `color` is auto-assigned from a fixed palette on customer and project creation
- Customer and project names are required; customer names are unique, project names are unique within their customer (case-insensitive)

## Time Tracker Page

### Entry bar

- Fields in order: Description, Project, Date, Start, End, Duration, `ADD` button
- Description is optional free text (placeholder `What are you working on?`)
- Project is a type-ahead picker over `Customer / Project` labels; archived projects and projects of
  archived customers are not offered
- Defaults for a new entry: Date = today, Start = now, End = Start, Duration = `0:00`
- **Project prefill:** the last project used to save an entry; falls back to the default project from
  Settings when there is no last-used project or it has been archived
- Last-used project is remembered per device (local storage), not synced
- `Enter` in any field saves; after saving, fields reset to defaults and focus returns to Description

### Linked Start / End / Duration

- Editing Start or End recomputes Duration
- Editing Duration recomputes End (`End = Start + Duration`)
- An End earlier than Start means the next day; the bar shows a `+1 day` marker
- `Alt+↑` / `Alt+↓` on Start, End or Duration adjusts by ±15 minutes
- Fields normalise to the display format on blur

### Input shorthand

| Field | Accepted input | Result |
|---|---|---|
| Time | `9`, `930`, `1430`, `14:30`, `2:30pm`, `2p` | 09:00, 09:30, 14:30, 14:30, 14:30, 14:00 |
| Duration | `1:30`, `1.5`, `1,5`, `90m`, `1h30`, `2h` | 1 h 30 min (… 2 h) |
| Date | per date format, year optional; `t` / `today`, `y` / `yesterday` | — |

### Validation

- A Project is required and must not be archived
- Duration must be greater than zero
- Invalid input shows a non-blocking toast; nothing is saved

### Entry list

- Entries grouped by day (attribution day), newest first; headings `Today`, `Yesterday`, then
  `Ddd, <date>`; each group shows its total
- Row: description (or `(no description)`), project name in project colour, customer name,
  `start – end` (with `+1` for overnight), duration
- Row actions (on hover / selection): edit, duplicate, delete
- Filter by customer and/or project; the project filter lists only the selected customer's projects;
  archived customers/projects remain selectable as filters
- Selected row is highlighted and kept in view when moving with `j` / `k`

### Edit, duplicate, delete

- Edit opens a modal with the same fields and linked behaviour as the entry bar; `Enter` saves,
  `Esc` cancels
- Duplicate creates a copy with the same project, description and duration, starting now
- Delete asks for confirmation inline (`y` confirms, `Esc` cancels) and is permanent

## Reports (Month View)

- Month picker with previous / next (`[` / `]`); defaults to the current month
- Customer and project filters apply to every element below
- KPIs: total duration, number of entries, number of projects
- Stacked bar chart: one bar per day of the month, segments coloured by project (ECharts), legend
- Summary table: Customer rows with subtotals → Project rows with duration and share bar; grand total
- All hours follow [Attribution](../../CONTEXT.md#time-tracking-glossary): an entry counts wholly to
  the day and month of its start

## Projects and Customers

- Create customers and projects inline (`Enter` to add); a project needs a customer
- Archive / unarchive customers and projects
- Delete is enabled only when nothing references the item (no entries for a project, no projects
  for a customer); otherwise the control explains "In use — archive instead"
- Archiving a customer hides all its projects from the entry picker

## Settings

Time Tracking settings live in the global settings layer ([ADR-0003](../adr/0003-global-settings-layer.md)),
separate from board settings.

| Setting | Options | Default |
|---|---|---|
| Default customer | active customers | none |
| Default project | active projects of the default customer | none |
| Date format | `DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` | `DD.MM.YYYY` |
| Time format | 24-hour, 12-hour | 24-hour |
| Timezone | IANA zones | browser zone, else `Europe/Berlin` |
| Duration format | `h:mm` (7:30), decimal (7.50 h) | `h:mm` |

- Changing the default customer resets the default project to that customer's first active project
- The timezone controls display and attribution only; changing it never rewrites stored entries
- Settings show a live preview of the current date, time and a sample duration

## Keyboard Shortcuts

Registered in `DEFAULT_APP_KEYBINDINGS` — no hardcoded key strings. Single-key shortcuts are
ignored while an input is focused.

| Key | Action |
|---|---|
| `n` | New entry (focus entry bar Description) |
| `/` | Focus filter |
| `j` / `k` | Select next / previous entry |
| `e` | Edit selected entry |
| `d` | Duplicate selected entry |
| `Del` | Delete selected entry → `y` confirm / `Esc` cancel |
| `g t` / `g r` / `g p` / `g s` | Go to Tracker / Reports / Projects / Settings |
| `[` / `]` | Previous / next month |
| `?` | Shortcut cheat-sheet |
| `Enter` | Save (entry bar, edit modal, inline add fields) |
| `Esc` | Cancel / leave field |
| `Alt+↑` / `Alt+↓` | ±15 min on Start / End / Duration |

## Storage and Sync

- Local-first: read model in IndexedDB like boards; UI renders from the projection
- Every mutation emits a domain event through `scheduleDomainEvent()` with `scope: "timetracking"`
  (no `board_id`), synced via the existing outbound queue / SSE / catch-up ([ADR-0004](../adr/0004-event-sourced-sync.md))
- Event types: `customer.{created,updated,archived,unarchived,deleted}`,
  `project.{created,updated,archived,unarchived,deleted}`, `time_entry.{created,updated,deleted}`
- Settings changes use the existing global settings event path
- No new PocketBase collections

## Testing

- Unit: time / duration / date shorthand parsing; linked field resolution incl. overnight; timezone
  conversion across DST changes; attribution of an entry crossing a month boundary; month summary
  totals and grouping; archive / delete guards; last-used project fallback
- DOM: entry bar save flow, filters, edit modal, delete confirmation
- E2E: full keyboard-only flow (add → select → edit → duplicate → delete → reports month switch) playwright-cli, playwright tests.

## Later (not in MVP)

- **Command-line entry header** (prototype Variant C): one smart input such as
  `9-1030 #project Fix bug @y` with live parse preview and `Tab` project completion
- **Month matrix view** (prototype Variant B): projects × days heatmap with row and day totals, as an
  alternative view toggle on the Reports month page
- Running timer, connect to kanvana labels, connect kanvana projects to boards, billable rates, export
- invoicing

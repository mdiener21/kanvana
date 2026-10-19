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
- Prototype source (removed after the MVP shipped): `client/src/prototype-timetracker.html` + `client/src/prototypes/timetracker/` as of v3.2.0
  (throwaway — rewrite, do not promote)

## Page and Navigation

- Entry point: `src/timetracking.html` (new Vite build input)
- Reachable from the main board menu as `Time Tracking`; page links `Back to Board`
- Sidebar sections: **Time Tracker**, **Reports**, **Projects**, **Settings**
- Touch targets: every Time Tracking control (row actions, project/customer list actions, inline
  delete confirm, edit-modal buttons, add, month previous / next) has a hit area of at least
  44×44px at every screen width

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
- `Alt+↑` / `Alt+↓` on Start, End or Duration adjusts by ±15 minutes; `Alt+↓` on End stops at Start
  and on Duration stops at `0:00` (it never rolls End over to the next day)
- Fields normalise to the display format on blur

### Input shorthand

| Field | Accepted input | Result |
|---|---|---|
| Time | `9`, `930`, `1430`, `14:30`, `2:30pm`, `2p` | 09:00, 09:30, 14:30, 14:30, 14:30, 14:00 |
| Duration | `1:30`, `1.5`, `1,5`, `90m`, `1h30`, `2h` | 1 h 30 min (… 2 h) |
| Date | per date format, year optional; `t` / `today`, `y` / `yesterday` | — |

### Validation

- A Project is required and must not be archived (exception: an edited entry may keep its current
  project, see Edit below)
- Duration must be greater than zero
- Description is limited to 500 characters
- Invalid input shows a non-blocking toast; nothing is saved

### Entry list

- Entries grouped by day (attribution day), newest first; headings `Today`, `Yesterday`, then
  `Ddd, <date>`; each group shows its total
- Row: description (or `(no description)`), project name in project colour, customer name,
  `start – end` (with `+1` for overnight), duration
- Row actions: edit, duplicate, delete. On hover-capable devices they appear on hover, selection or
  focus within the row; on touch devices (`(hover: none)`, by input capability, not screen width)
  they are always visible
- Rows fit a narrow phone screen (Pixel 5) without horizontal overflow
- Filter by customer and/or project; the project filter lists only the selected customer's projects;
  archived customers/projects remain selectable as filters
- Selected row is highlighted and kept in view when moving with `j` / `k`

### Edit, duplicate, delete

- Edit opens a modal with the same fields and linked behaviour as the entry bar; `Enter` saves,
  `Esc` cancels
- Editing an entry may keep its current project even if that project (or its customer) has since
  been archived; switching to a different archived project is rejected
- Duplicate creates a copy with the same project, description and duration, starting now; it is
  refused if the project is archived
- Delete asks for confirmation inline (`y` confirms, `Esc` cancels) and is permanent; any other key
  cancels the confirmation and then does what it normally does (e.g. `Tab` moves focus, `j` / `k`
  move the selection)

## Reports (Week / Month / Year)

- **Week | Month | Year** switch (toggle buttons with `aria-pressed`); the default is Month and the last
  choice is remembered per device in localStorage (`kanvana:timetracking:reportPeriodKind`, not
  synced). Choosing a kind shows the period of that kind containing today
- Previous / next (`[` / `]`) step through the selected period; their labels, tooltips and the empty
  state follow the kind ("Previous week", "Next year", "No time tracked this year")
- Week view: label `W42 · 12–18 Oct 2026`, one bar per day Monday to Sunday (`Mon 12` … `Sun 18`)
  and the customer / project table for the week. Month view is unchanged
- Year view: label `2026`, one stacked bar per month (`Jan` … `Dec`, tooltip `October 2026`) and the
  customer / project table for the calendar year; the chart is described as "Monthly hours by
  project, 2026"
- **Balance card** above the KPIs: `Logged · Target · Balance`, Target and Balance in the duration
  format, Balance with an explicit sign and green (surplus) / red (deficit). Target is the full
  Target for finished periods and "so far" including today for the current one. Hidden when Weekly
  hours is unset, while a customer or project filter is active, and when the period has no Target
  (future, or entirely before the first Time Entry). For the year this is the year Target and
  Balance (2026 at 40h over Mon–Fri: Target 2088h 00m when finished); it resets on 1 January and nothing carries
  across years
- Activating the Time Tracker's "This week" badge opens Reports with Week selected on the current week
- The switch, previous / next and the badge are at least 44×44px; Reports has no horizontal overflow
  on a phone (Pixel 5)
- Customer and project filters apply to every element below
- KPIs: total duration, number of entries, number of projects
- Stacked bar chart: one bar per day of the week or month, or per month of the year, segments coloured by project (ECharts), legend
- Summary table: Customer rows with subtotals → Project rows with duration and share bar; grand total
- All hours follow [Attribution](../../CONTEXT.md#time-tracking-glossary): an entry counts wholly to
  the day, week, month and year of its start
- Every report is computed by one **period summary** (`summarizePeriod` in
  `timetracking-report.js`) for a period of kind week, month or year in the Time Tracking timezone:
  - Week: Monday to Sunday, one bucket per day, labelled with the ISO week, e.g. `W42 · 12–18 Oct 2026`
    (`W1 · 29 Dec 2025 – 4 Jan 2026` across a year boundary)
  - Month: one bucket per day, labelled `October 2026`
  - Year: 1 January to 31 December, one bucket per month, labelled `2026`
  - Previous / next shift by one period of the same kind; an entry counts wholly toward the week,
    month and year of its start
  - Given `now` and `weeklyHours`, the summary fills `target` (from `periodBalance` over all Time
    Entries, so the first-ever entry sets the start) and `balance` (summarised total − Target);
    both are null when Weekly hours is unset or the period has no Target

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
| Weekly hours (contract) | number > 0, step 0.5, decimals allowed, no maximum | empty (off) |
| Workdays | any non-empty set of Mon … Sun (checkboxes) | Mon–Fri |

- Changing the default customer resets the default project to that customer's first active project
- The timezone controls display and attribution only; changing it never rewrites stored entries
- Settings show a live preview of the current date, time and a sample duration
- Weekly hours is a number input (`inputmode="decimal"`); clearing it switches Target and Balance
  off and removes the value from the stored settings. A value of zero or below is not saved.
- Workdays is a group of seven checkboxes (`Mon` … `Sun`); each tick saves immediately. The last
  ticked day is disabled so the set can never be empty. A stored value that is missing or invalid
  resolves to Mon–Fri.

## Weekly hours, Target and Balance

See the [glossary](../../CONTEXT.md#time-tracking-glossary) for Weekly hours, Workdays, Target and
Balance.

- Target = Weekly hours ÷ number of Workdays × counted workdays; counted days run from the later of
  the period start and the first-ever Time Entry's day to the earlier of the period end and today,
  inclusive, and only Workdays among them add Target
- Targets are additive: the Target of a span of days is rounded once from a running workday count,
  so the month Targets of a year (and the days of a week) add up to the millisecond to the year
  Target, in leap and non-leap years. Worked examples at 40h over Mon–Fri: Monday so far 8h 00m,
  week 40h 00m, October 2026 (22 workdays) 176h 00m, February 2026 (20 workdays) 160h 00m, 2026
  (261 workdays) 2088h 00m
- Weeks run Monday to Sunday in the Time Tracking timezone; entries count toward the period of their
  start (Attribution)
- Balance = logged − Target; Target and Balance are absent when Weekly hours is unset, for future
  periods and for periods entirely before the first Time Entry
- The maths lives in one domain module (`timetracking-balance.js`: `periodBalance`) consumed by
  every view that shows a Balance
- **"This week" badge** in the Time Tracker header: `This week ±h:mm`, the current week's Balance in
  the duration format, green for a surplus and red for a deficit, sign always shown. It ignores the
  entry list filter, is hidden when there is no Balance (Weekly hours unset, or no entry yet this
  week or before), updates live on create / edit / delete, and is at least 44px tall

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
| `[` / `]` | Previous / next period (week or month) on Reports |
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
  conversion across DST changes; attribution of an entry crossing a month boundary; period summary (week / month / year, ISO week
  labels, shifting across year boundaries)
  totals and grouping; archive / delete guards; last-used project fallback; Target / Balance for
  finished, current, future and pre-first-entry weeks, decimal Weekly hours and Monday week start
  across DST; Workdays (default Mon–Fri, weekends add no Target, custom sets, invalid values)
- DOM: entry bar save flow, filters, edit modal, delete confirmation; Weekly hours input; Workdays
  checkboxes (default, save, last day locked, sync); "This week"
  badge visibility and live updates; Reports Week | Month switch, navigation and persisted choice,
  week chart and table, balance card values, sign / colour and visibility rules; badge opens the
  current week
- E2E: full keyboard-only flow (add → select → edit → duplicate → delete → reports month switch) playwright-cli, playwright tests.
- E2E (desktop): set Weekly hours → log entries → correct Balance for week and month; a Monday at
  40h shows an 8h Target, and unticking Friday raises it to 10h
- E2E (Pixel 5): tap edit and delete on a row without hover; controls measure at least 44×44px; tap
  the badge to land on the current week with touch-sized period controls and no horizontal overflow

## Later (not in MVP)

- **Command-line entry header** (prototype Variant C): one smart input such as
  `9-1030 #project Fix bug @y` with live parse preview and `Tab` project completion
- **Month matrix view** (prototype Variant B): projects × days heatmap with row and day totals, as an
  alternative view toggle on the Reports month page
- Running timer, connect to kanvana labels, connect kanvana projects to boards, billable rates, export
- invoicing

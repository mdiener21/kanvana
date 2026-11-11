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
- **Ledger refresh (post-MVP):** the Time Tracker page follows prototype **A · Ledger**,
  `docs/prototypes/timetracker/a-ledger.html`. Throwaway like the first prototype: rewrite, do not
  promote. The rejected alternative `b-day-canvas.html` (hour-grid timeline) is kept for reference only

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
| Customer | `id`, `name`, `color`, `archived`, `weeklyHours` (null = no Target), `workdays` (ISO 1–7, default Mon–Fri) |
| Project | `id`, `customerId`, `name`, `color`, `archived` |
| Time Entry | `id`, `projectId`, `description`, `start`, `end` |

- `start` / `end` are absolute instants (UTC ISO strings); `end > start`
- A Time Entry stores no customer — it is always the Project's Customer
- `color` is auto-assigned from a fixed palette on customer and project creation
- Customer and project names are required; customer names are unique, project names are unique within their customer (case-insensitive)

## Time Tracker Page

### Entry bar

- Fields in order: Description, Project, Date, Start, End, Duration, `Add` button
- Every field has a visible label above it (Description, Project, Date, Start, End, Duration); Date,
  Start, End and Duration form one visually grouped time block, with an arrow between Start and End;
  Duration is styled as the computed result of the block
- The Project field shows the selected project's colour dot
- Description is optional free text (placeholder `What did you work on?`)
- Project is a type-ahead picker over `Customer / Project` labels; archived projects and projects of
  archived customers are not offered
- Defaults for a new entry: Date = today, End = now, Start = the latest End among today's entries
  when that is earlier than now (so a new entry continues from the last one), otherwise Start = now;
  Duration is derived. With no entry today, Start = End = now and Duration = `0:00`
- An untouched bar keeps these defaults current: on returning to the page (visibility, focus,
  `pageshow`) and on save its times move to now's defaults; typed or filled times are never replaced
- Phone keyboards: Start and End open the number pad (`inputmode="numeric"`), Duration keeps the text
  keyboard (for `90m`, `1h30`), and every field's action key is Done (`enterkeyhint="done"`).
  Project, Date, Start, End and Duration select their value on focus, so typing replaces it
- A muted hint below the fields shows the shorthand (`930`, `90m`, `1.5`) and `Alt+↑` / `Alt+↓`
  ±15 min; hidden on narrow screens
- **Project prefill:** the last project used to save an entry; falls back to the default project from
  Settings when there is no last-used project or it has been archived
- Last-used project is remembered per device (local storage), not synced
- `Enter` in any field saves; after saving, fields reset to defaults and focus returns to Description.
  On touch devices (`(pointer: coarse)`) focus is not restored, so the soft keyboard closes over the
  new row; focusing a field there scrolls the bar to the top so `Add` stays above the keyboard

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
- Row: description (or `(no description)`), project name with its colour dot, customer name,
  `start – end` (with `+1` for overnight), duration. The project colour also shows as a 3px rail at
  the row's left edge; project and customer names are in text colours, never in the project colour,
  so they meet 4.5:1 contrast for any project colour
- Rows are at least 44px tall; `start – end` never wraps; numbers use tabular figures
- Each row's duration and its day group's total share one right-aligned column
- Day group header: day heading, a **coverage bar** (07:00–19:00, widening to include any entry
  outside that span) with one block per entry in its project colour, a now-marker on today's bar,
  and the day total. Like gaps, the bar shows all of the day's entries, ignoring the list filter. The
  bar is decorative (`aria-hidden`); hidden on narrow screens
- **Click the description to rename it in place:** the description becomes a text input with the
  current text, caret at the end, and an `Enter save · Esc cancel` hint inside the input on wide
  screens. `Enter` or leaving the field saves; `Esc` restores the old text. Saving an unchanged text
  emits no event; saving an empty text stores no description. The rename emits the same
  `time_entry.updated` event as the edit modal. Row actions hide while renaming. `F2` renames the
  selected row
- **Click the project or customer to edit:** the project / customer cell is a button that opens the
  edit modal with Project focused and selected (the pencil action and `e` open it on Description)
- **Click `start – end` to change times:** the range is a button that opens the edit modal with Start
  focused and selected
- On narrow screens a row has two lines: description and duration on the first, project · customer
  and `start – end` on the second; on touch devices the description, project / customer and range
  cells are each at least 44px tall and the whole description cell starts the rename
- Row actions: edit, duplicate, delete. On hover-capable devices they appear on hover, selection or
  focus within the row; on touch devices (`(hover: none)`, by input capability, not screen width)
  they sit in one always-visible, 44px `⋯` **More actions** menu per row (Edit, Duplicate, Delete;
  Delete still asks inline). `Esc` or a tap outside closes the menu
- Rows fit a narrow phone screen (Pixel 5) without horizontal overflow; on a phone the page scrolls
  vertically, so every entry can be reached and edited however long the list is
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

### Untracked gaps

See the [glossary](../../CONTEXT.md#time-tracking-glossary) for Untracked gap.

- Computed per attribution day from **all** of that day's entries (ignoring the list filter), as the
  time between the day's first Start and its last End that no entry covers. Overlapping entries
  merge; only gaps of **5 minutes or more** are shown. An entry crossing midnight covers only up to
  midnight on its own day for this purpose
- In the entry list a gap shows as a slim, hatched row directly above the entry it follows (the one
  whose End is the gap's Start), so it sits between the two entries it separates:
  `10:30 – 10:45 · 15 min untracked` and a **Fill** button. Gap rows are not selectable with
  `j` / `k` and are not counted in the entry count
- Gap rows are hidden while a customer or project filter is active (a gap in a filtered list would
  hide entries of other projects)
- **Fill** pre-fills the entry bar with the gap's Date, Start and End (Duration derived), keeps the
  current Project and Description, and focuses Description (on touch devices it does not, so the
  keyboard stays closed and `Add` stays in reach). Nothing is saved until the user presses
  `Enter` / `Add`
- Below the entry bar, a **Fill** chip appears for each of today's gaps (newest first, at most three),
  e.g. `Fill 12:45 – 13:00`; it does the same as the row's Fill button. Chips are hidden, and `f` is a
  no-op, while a customer or project filter is active (same rule as gap rows)
- `f` with an entry selected fills the gap directly before that entry (between it and the previous
  entry of the same day) and focuses Description; no gap means no-op
- Gaps are recomputed live on create / edit / delete, including from sync

### Week strip

- The Tracker header shows the ISO week (`Week 46 · 9 – 15 Nov 2026`) and a strip of seven day cells,
  Monday to Sunday. Each cell shows the weekday, date, the day's logged Duration over all customers
  (`–` when none) and, when the default customer has Weekly hours, a meter of that customer's logged
  Duration against its day Target; it turns success-green
  at or above Target; a day with a Target of 0 (a weekend) fills once anything is logged, and a day
  with no Target yet (a future day) keeps an empty meter. Today is highlighted; future days are muted
  (in a text colour that still meets 4.5:1)
- Clicking a day cell scrolls the list to that day's group (no-op when the day has no entries)
- The week's logged total (all customers) and the default customer's Balance (same rules as the
  "This week" badge) sit at the header's
  right; that block is the "This week" badge and keeps its behaviour (opens the current week in
  Reports, hidden Balance when there is no Target)
- The strip ignores the entry list filter

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
- **Balance card** above the KPIs: `Logged · Target · Balance` of one customer, Target and Balance
  in the duration format, Balance with an explicit sign and green (surplus) / red (deficit). Target
  is the full Target for finished periods and "so far" including today for the current one
  - Filtered to a customer: that customer's Balance, by the same rules as the main screen (only its
    entries, against its Work week, from its first entry, stopping at its last while archived)
  - Unfiltered: the default customer's Balance, matching the "This week" badge; hidden with no
    default customer
  - Hidden while a project filter is active (a Target belongs to a customer's whole Work week), when
    the customer shown has no Weekly hours, and when the period has no Target (future, or entirely
    before the customer's first Time Entry)
  - Logged on the card is the customer's, so with no filter it can differ from the Total KPI, which
    counts every customer
  - For the year this is the year Target and Balance (2026 at 40h over Mon–Fri: Target 2088h 00m
    when finished); it resets on 1 January and nothing carries across years
  - Switching the customer filter updates the card at once
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
  - Given `now` and `balanceCustomerId`, the summary fills `customerLoggedMs`, `target` and `balance`
    from `customerBalance` for that customer, whatever entries are summarised; Target and Balance are
    null with no (or an unknown) customer, a customer without Weekly hours, or a period with no
    Target

## Projects and Customers

- Create customers and projects inline (`Enter` to add); a project needs a customer
- Rename customers and projects using the pencil button; `Enter` saves and `Escape` cancels
- Archive / unarchive customers and projects
- Delete is enabled only when nothing references the item (no entries for a project, no projects
  for a customer); otherwise the control explains "In use — archive instead"
- Archiving a customer hides all its projects from the entry picker
- Each customer row has a collapsed **Work week** disclosure whose summary reads `40h · Mon–Fri`
  (runs of three or more days as a range, e.g. `7.5h · Mon, Wed–Fri`) or `No target`. Inside:
  - Weekly hours: number input (`inputmode="decimal"`, step 0.5, > 0, no maximum) that saves on
    change; clearing it removes the customer's Weekly hours (no Target); zero or below is not saved
  - Workdays: seven `Mon` … `Sun` checkboxes that save on each tick; the last ticked day is disabled
  - Archived customers stay editable; controls are labelled per customer (`Weekly hours for Acme`,
    `Workdays for Acme`) and at least 44×44px on touch
  - Edits are `customer.updated` field patches and sync like any customer change; the editor stays
    open and keeps focus across the re-render a save causes

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
- The default customer also picks whose Balance the Tracker main screen shows (badge, meters)
- There is no global Weekly hours or Workdays: the Work week is per customer (Projects and
  Customers), and resolved settings expose neither field
- **Legacy migration.** Older versions stored a global `weeklyHours` / `workdays` in
  `globalSettings.timeTracking`. Once the read model is loaded on the Time Tracking page, and
  before the page first renders, a pure migration (`legacyWorkWeekMigration` in
  `timetracking-legacy-work-week.js`) decides the events, emitted through the normal emitter with
  the user's actor. A failed migration is logged once (`[Kanvana]`) and the page still opens:
  - legacy Weekly hours, a default customer set and that customer has no Weekly hours → one
    `customer.updated` with the legacy Weekly hours and Workdays (Mon–Fri when none were stored)
  - any legacy field present → one global `settings.updated` without `weeklyHours` and `workdays`
  - nothing legacy → no events; running it on its own output emits nothing
  - Two devices running it on the same state emit the same values, so the per-field merge converges;
    a device whose default customer already has Weekly hours (from sync) only clears the legacy
    fields. A user with a default customer sees the same Balance before and after the upgrade;
    without one, the legacy values are dropped and no customer gets a Target
  - `settings.updated` replaces `globalSettings.timeTracking` as a whole (the reducer merges global
    settings per top-level key only), so the clear writes every other setting back exactly as the
    device has it. Like any Time Tracking settings save, it wins over a concurrent settings edit
    from another device that it orders after but had not yet received

## Weekly hours, Target and Balance

See the [glossary](../../CONTEXT.md#time-tracking-glossary) for Work week, Weekly hours, Workdays,
Target and Balance.

- Weekly hours and Workdays are a customer's **Work week**; a Target and Balance belong to one
  customer and count only Time Entries booked to its projects
- Target = Weekly hours ÷ number of Workdays × counted workdays; counted days run from the later of
  the period start and the customer's first Time Entry day to the earliest of the period end, today
  and (for an archived customer) its last Time Entry day, inclusive, and only Workdays among them
  add Target. Unarchiving resumes counting to today
- Targets are additive: the Target of a span of days is rounded once from a running workday count,
  so the month Targets of a year (and the days of a week) add up to the millisecond to the year
  Target, in leap and non-leap years. Worked examples at 40h over Mon–Fri: Monday so far 8h 00m,
  week 40h 00m, October 2026 (22 workdays) 176h 00m, February 2026 (20 workdays) 160h 00m, 2026
  (261 workdays) 2088h 00m
- Weeks run Monday to Sunday in the Time Tracking timezone; entries count toward the period of their
  start (Attribution)
- Balance = logged − Target; Target and Balance are absent when the customer has no Weekly hours,
  for future periods and for periods entirely before its first Time Entry
- The maths lives in one domain module with one entry point, `periodBalance(entries, period,
  workWeek, { now, tz })` in `timetracking-balance.js`: it takes the Time Entries to count, a Work
  week (`{ weeklyHours, workdays }`, Workdays defaulting to Mon–Fri) and returns `{ loggedMs,
  targetMs, balanceMs }`. `customerBalance(tt, customerId, period, { now, tz })` wraps it for one
  customer (its entries, its Work week, the archived stop). The badge, week-strip meters and Reports Balance card
  all use `customerBalance`: the main screen for the default customer, Reports for the filtered
  customer or else the default customer
- Reading and validating a Work week lives in `timetracking-work-week-model.js` (`resolveWorkWeek`
  for stored values, `patchWorkWeek` for user edits, `WORK_WEEK_FIELDS`), used by the Balance, the
  Work week editor, `updateCustomerWorkWeek` and the legacy migration
- **"This week" badge** in the Time Tracker header: `This week ±h:mm`, the current week's Balance in
  the duration format, green for a surplus and red for a deficit, sign always shown. It shows the
  default customer's Balance (only its entries, against its Work week), ignores the entry list
  filter, is hidden when there is no Balance (no default customer, a default customer without Weekly
  hours, or no entry of it yet this week or before), updates live when the default customer or its
  Work week changes and on create / edit / delete, and is at least 44px tall. An archived default
  customer shows a Balance frozen at its last entry

## Keyboard Shortcuts

Registered in `DEFAULT_APP_KEYBINDINGS` — no hardcoded key strings. Single-key shortcuts are
ignored while an input is focused.

| Key | Action |
|---|---|
| `n` | New entry (focus entry bar Description) |
| `/` | Focus filter |
| `j` / `k` | Select next / previous entry |
| `e` | Edit selected entry |
| `F2` | Rename selected entry's description in place |
| `f` | Fill the untracked gap before the selected entry |
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
  across DST; Workdays (default Mon–Fri, weekends add no Target, custom sets, invalid values);
  per-customer Balance (only its entries, own first entry, archived stop / unarchive, Mon–Wed gives
  Thu–Sun 0, additivity per customer, a customer without Weekly hours has no Target); the legacy
  Work week migration table (customer patch + settings clear, no / unknown default customer, default
  customer already has Weekly hours, nothing legacy, own output, same Balance before and after); the period summary's Balance for one
  customer in week, month and year (own Work week, own first entry, archived stop, year reset,
  additivity, no customer / no Weekly hours); `customer.updated` Work week patch
  validation and snapshot replay
- DOM: entry bar save flow, filters, edit modal, delete confirmation; Settings shows neither Weekly
  hours nor Workdays, and a stored legacy value gives no badge; "This week"
  badge visibility and live updates; Reports Week | Month switch, navigation and persisted choice,
  week chart and table, balance card values, sign / colour and visibility rules (default customer
  unfiltered, the filtered customer live, hidden under a project filter, without a default customer
  or Weekly hours); badge opens the current week
- Unit (Ledger): untracked gaps per day (overlaps merge, < 5 min dropped, midnight-crossing entry,
  single entry, no entries); entry bar Start default continuing from today's latest End
- DOM (Ledger): inline rename saves on `Enter` and blur, `Esc` restores, unchanged text emits no
  event, `F2` starts it; project / customer click opens the edit modal; gap rows render, hide under
  a filter and Fill pre-fills the entry bar without saving; `f` fills the gap before the selection;
  week strip totals, meters and day-cell scroll
- DOM (Work week): editor summary, save on change, clearing, last tick disabled, archived customer
  editable, labelled controls; badge and meters count only the default customer, hidden cases, live
  update on default customer and Work week change
- E2E: full keyboard-only flow (add → select → edit → duplicate → delete → reports month switch) playwright-cli, playwright tests.
- E2E (desktop): set the default customer's Work week → log entries → correct Balance for week,
  month and year; a Monday at 40h shows an 8h Target, and unticking Friday raises it to 10h
- E2E (desktop, Reports): two customers with different Work weeks; unfiltered the card shows the
  default customer's Balance, the customer filter switches it to that customer's, and a project
  filter hides it
- E2E (desktop, Work week): two customers with different Work weeks; the badge follows the default
  customer and its Work week, another customer's entry changes totals only; an archived customer's
  Work week stays editable; with two customers the badge opens Reports, whose customer filter
  switches the Balance between them, and changing the default customer moves the badge; an upgrade
  from a stored legacy global Weekly hours moves it onto the default customer with the same Balance
- E2E (Pixel 5, Work week): summary, Weekly hours input and day ticks ≥ 44×44px, no horizontal
  overflow; the badge turns on from the default customer's Work week
- E2E (Pixel 5): tap edit and delete on a row without hover; controls measure at least 44×44px; tap
  the badge to land on the current week with touch-sized period controls and no horizontal overflow
- E2E (Pixel 5 tap budgets, taps and keys counted, no `fill()`): continue from the last entry ≤ 2
  taps (≤ 1 with no description) after the page sat open; fill a gap ≤ 2; change Start / End ≤ 3
  taps and ≤ 8 keys; rename ≤ 2; change project ≤ 2 taps and ≤ 4 keys; at 360px and Pixel 5 in light
  and dark: no horizontal overflow, controls ≥ 44×44px, text ≥ 4.5:1

## Later (not in MVP)

- **Command-line entry header** (prototype Variant C): one smart input such as
  `9-1030 #project Fix bug @y` with live parse preview and `Tab` project completion
- **Month matrix view** (prototype Variant B): projects × days heatmap with row and day totals, as an
  alternative view toggle on the Reports month page
- Running timer, connect to kanvana labels, connect kanvana projects to boards, billable rates, export
- invoicing

# Kanvana Coding Standards

How code in this repo is written. Architecture invariants (aggregate root, event sourcing, done column,
keybindings) live in [`CONTEXT.md` §8](CONTEXT.md#8-architecture-boundaries) and the ADRs; this file
covers the code itself. Each rule names the existing helper to reach for, so new code matches the old.

## Language and modules

- Plain JavaScript ES modules in `client/src`. TypeScript appears only in some E2E specs.
- **Named exports only.** Modules export functions and constants; no default exports, no classes.
  Stateful pieces are factory functions returning an object (`createReadModelProjector()`).
- File names are kebab-case and grouped by feature prefix (`timetracking-*.js`, `event-sourcing/*`).
- Imports are static and at the top. The `events.js` bus replaces dynamic `import('./render.js')`;
  a dynamic import is reserved for startup wiring.
- Adding a runtime dependency to `client/package.json` needs the maintainer's approval first.

## Naming

- Functions and variables: `camelCase`, verb-first for actions (`loadTasksForBoard`, `emitTaskMoved`).
- Shared constants: `UPPER_SNAKE_CASE` in `constants.js` (`DONE_COLUMN_ROLE`, `DEFAULT_APP_KEYBINDINGS`).
- Domain event types: `entity.pastTenseVerb` (`task.created`, `column.moved`).
- Bus event names: `'noun:verb'` strings exported as constants from `events.js` (`DATA_CHANGED`).
- Test names are behaviour sentences: `it('saves a local edit made during a catch-up at once')`.

## State changes

- A mutation emits a domain event with `scheduleDomainEvent()` (`event-sourcing/emitter.js`). The
  reducer projects it and fires `DATA_CHANGED`, which re-renders. Feature modules write no read-model
  state themselves ([ADR-0005](docs/adr/0005-reducer-sole-read-model-writer.md)).
- A new event type gets a handler in `reducer.js` `handlers` and a reducer unit test. A new entity
  field goes into its `schema.js` factory, which is where `validateEvent()` learns the allowed fields.
- Reducer handlers are pure: they return new state and leave their input untouched.
- Build entities with the `schema.js` factories (`createTask()`, `createColumn()`, …); ids come from
  `generateUUID()` in `utils.js`.
- Validate and normalise at the edges only: user input, imports and remote events (`validation.js`,
  `normalize.js`, `validateEvent()`). Internal callers trust each other.
- Read board data through the `storage.js` API (`loadTasks()`, `loadTasksForBoard(id)`), never from
  IndexedDB directly.

## Persistence and async

- `initStorage()` runs once at startup; everything after it reads in-memory state synchronously.
- IndexedDB writes go through `idb-store.js` (`schedulePersist`, `scheduleReadModelPersist`) and are
  fire-and-forget. Await `flushPendingPersists()` only where ordering matters, e.g. before advancing a
  sync watermark.
- Hot paths that apply many events (catch-up, rebuild, snapshot fold) work per batch: one state copy
  and one write per board, not one per event. The perf suite in `client/tests/performance/` guards
  this.
- Failures are logged once with a `[Kanvana]` prefix: `console.error('[Kanvana] IDB persist failed', err)`.
  Use `console.warn` for recoverable oddities. `client/src` has no `console.log`.

## DOM and security

- Build elements with `h(tag, attrs, ...children)` from `dom.js`, and query with `$id`, `$`, `$$`.
- When markup is assembled as a string for `innerHTML`, pass every interpolated value through
  `escapeHtml()` from `security.js`.
- Icons are `<i data-lucide="name">` elements followed by `renderIcons()` from `icons.js`.
- Key handling reads from `DEFAULT_APP_KEYBINDINGS`; key strings appear only there.

## Style

- Two-space indent, single quotes, semicolons. `npm run lint` (ESLint) checks correctness rules only,
  so match the surrounding file for everything else.
- Prefer small functions and early returns. Keep edits scoped to the task; refactors get their own
  change.
- Comments are rare one-line `//` notes that state a non-obvious *why*: a hidden constraint, an
  invariant, or a workaround. Cite the issue when a comment explains a fix (`// … (#237)`).
  Existing JSDoc blocks may stay; new code adds none.

## Tests

- Pick the lowest layer that proves the behaviour: unit (`tests/unit`) for pure logic, DOM
  (`tests/dom`) for storage, sync and UI wiring, Playwright E2E (`tests/e2e`) for user flows.
- Fix bugs test-first: the new test fails on the old code.
- Network calls are mocked with MSW (`tests/mocks/`); IndexedDB with `fake-indexeddb`. Use real timers
  with `fake-indexeddb`, since fake timers stall its callbacks.
- Assert on observable behaviour (stored values, rendered DOM, emitted events), not on private
  internals. Count IndexedDB writes with a spy on `IDBObjectStore.prototype.put` when the write count
  is the behaviour.
- Perf budgets (`tests/performance/performance-budgets.js`): structural metrics just above the
  baseline, wall-clock about 2× baseline; record each new baseline in `docs/spec/testing.md`.

## Change hygiene

- Every user-visible change gets a `CHANGELOG.md` line under `[Unreleased]`, written for users and
  ending with the issue number: `… (#237).`
- Update `CONTEXT.md` when a module's responsibility or a domain term changes; record structural
  decisions as an ADR in `docs/adr/`.
- Commits follow Conventional Commits: `perf(sync): …`, `fix(sync): …`, `test(perf): …`.

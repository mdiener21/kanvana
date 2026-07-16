# Frontend Maintainability & Testability Refactor

## Context

The indrz frontend (Nuxt 4 + Vue 3 + OpenLayers) is half-modernised. A recent
mobile-first refactor produced clean, tested seams — `uiStore`,
`useFloorController`, `useMapController`, `ResponsiveDrawer` and the content
components (`SearchContent`, `PoiDetailsContent`, `RoutingContent`) — all with
behaviour-style Vitest tests.

But the **legacy core is untested and tangled**:

- `util/map.js` — 1,119 lines, OL init + layers + overlays + DOM access, 0 tests
- `util/RouteHandler.js` — 736 lines, 18-branch shape dispatch, 0 tests
- `components/IndrzMap.vue` — 789 lines, monolith, 0 tests
- `util/mapHandler.js` + `util/popupModel.js` — map-click → info-panel logic
  spread across ~15 `if (properties.hasOwnProperty(...))` branches mutating a
  shared `globalPopupInfo` object, 0 tests

The single most important untested concept is **Location**: the app receives
heterogeneous payloads (OL vector feature properties, WMS feature info for
campus/building/room, full-text search result features) and each consumer
re-derives type, title, floor and identity ad hoc. `popupModel.openIndrzPopup`
is the worst offender — it is the live "map-click info panel" feature today.

This refactor makes the frontend easier to maintain, update and **test** by
extracting **deep modules** with small public interfaces, built incrementally
with TDD tracer bullets. The map-click info-panel feature already exists in the
legacy code; the refactor is its new foundation — **behaviour must be preserved**.

`docs/spec/frontend/001-map-click-info-panel/` is documentation of that existing
feature, not a separate workstream — it is the behaviour spec the new module
must satisfy.

## Guiding principles (from the `tdd` skill)

- **Tracer bullets, vertical slices.** One behaviour test → minimal code to pass
  → repeat. Each cycle responds to what the previous one taught.
- **Test behaviour users care about**, through the **public interface only**.
  One logical assertion per test. Tests describe *what*, not *how*, and survive
  internal refactors.
- **Never refactor while red.** Get to green, then refactor.
- **Mock only external boundaries** (HTTP, OpenLayers), never internal modules.
- **Characterisation first for legacy.** Before changing untested legacy code,
  write tests that pin its *current* observable behaviour, then refactor under
  that net.

## The campaign — 5 modules, sequenced

Ordered by leverage (pure logic & testability gain) and ascending risk:

| # | Module | Replaces / deepens | Why this order |
|---|--------|--------------------|----------------|
| 1 | **Location module** (pilot) | scattered type/title/floor derivation in `popupModel.js`, `mapHandler.js`, `SearchContent.vue` | Pure logic, zero OL, highest reuse, underpins map-click + search |
| 2 | **Route request module** | `RouteHandler.js` 18-branch dispatch | Pure logic; named location shapes from #1 feed the dispatcher |
| 3 | **Map adapter seam** | deepen `useMapController` into a real adapter; introduce a fake map for tests | Unlocks testing of everything map-driven without OL |
| 4 | **Floor / WMS layer module** | `floor_` string-building, WMS layer naming spread across files | Needs the adapter seam; enables multi-tenant WMS work |
| 5 | **HTTP / config module** | `api.js` + `adminApi.js` + `indrzConfig.js` token/baseURL sprawl | Lowest urgency; consolidates auth + org context last |

Only module 1 is detailed below. Modules 2–5 are sketched and will each be
planned in full when reached, informed by what module 1 teaches.

---

## PILOT — Module 1: Location

### Goal

A pure, framework-free module that turns any raw location payload into one
discriminated `Location` object, so map-click, search and routing all consume
the same shape.

### Public interface (small surface, deep implementation)

New file: `frontend/src/util/location/location.js`

```js
// normalizeLocation(raw) -> Location | null
// raw: OL feature properties, WMS feature-info properties, or search feature
// Location: {
//   locationType: 'room' | 'poi' | 'building' | 'campus' | 'wing',
//   id,                 // stable identity (poiId, spaceid, etc.)
//   title,              // locale-aware display name
//   floorNum,           // number | null
//   coordinates,        // [x, y] | null
//   details: [{ label, value }],   // type-specific display rows
//   raw,                // original payload, for legacy/share consumers
// }
export function normalizeLocation(raw, locale = 'en') { ... }
export function locationTitle(raw, locale = 'en') { ... }   // reuse getTitle logic
```

The module owns the knowledge currently in `getTitle`, `getPopupLabels`,
`getBuildingLetter` and the branch soup in `openIndrzPopup`.

### TDD cycles (tracer bullets — one test, one slice each)

Each cycle: write one failing behaviour test in
`frontend/src/tests/util/location.test.js`, then minimal code in
`location.js`. Tests assert observable output, not branch structure.

1. A WMS room payload (`space_type_id` + `room_code`) → `locationType: 'room'`,
   `title` = room code, `details` includes the room code row.
2. A POI payload (`poiId` + `category`) → `locationType: 'poi'`, `id` = poiId,
   category surfaced in `details`.
3. A WMS building payload (`street`) → `locationType: 'building'`, address rows
   (street, postal code, city) in `details`.
4. A WMS campus payload (`src: 'wms_campus'`) → `locationType: 'campus'`.
5. A wing payload (`wing` present, no room) → `locationType: 'wing'`.
6. Locale handling: `name_de` preferred over `name` when `locale = 'de'`
   (pins current `getTitle` behaviour).
7. Unrecognised / empty payload → returns `null` (caller closes the panel).
8. A full-text search result feature → same `Location` shape as a map click on
   the same entity (the unification assertion).
9. Floor extraction: `floor_num` / `floor` variants → numeric `floorNum`.

(Add cycles as earlier ones reveal edge cases — e.g. `room_external_id`
fallback, `roomcode` vs `room_code` spelling.)

### Integration (after the module is green)

- **`popupModel.openIndrzPopup`** — replace the branch soup with a call to
  `normalizeLocation`; map the resulting `Location` to the returned popup model.
  Keep `globalPopupInfo` mutation for now (legacy share/routing depend on it) —
  derive its fields from the `Location`. This is a behaviour-preserving swap.
- **`SearchContent.doSearch`** (`components/search/SearchContent.vue:108`) —
  map each search feature through `normalizeLocation` instead of the inline
  `.map(f => ({ id, name, floorNum, properties }))`.
- **Characterisation safety net:** before touching `popupModel.js`, add
  `frontend/src/tests/util/popupModel.test.js` asserting `openIndrzPopup`'s
  current return model for one room, one POI and one building payload. These
  tests must stay green through the swap.

### Files

- New: `frontend/src/util/location/location.js`
- New: `frontend/src/tests/util/location.test.js`
- New: `frontend/src/tests/util/popupModel.test.js` (characterisation)
- Modified: `frontend/src/util/popupModel.js` (consume module)
- Modified: `frontend/src/components/search/SearchContent.vue` (consume module)

### Out of scope for the pilot

- `IndrzMap.vue` / `map.js` restructuring — module 3.
- Removing `globalPopupInfo` entirely — happens once all consumers move to
  `Location`; tracked as a follow-up.

---

## Modules 2–5 (sketch — planned in full when reached)

- **2. Route request** — replace `RouteHandler.js` shape detection with named
  shapes (`PoiLocation`, `SpaceLocation`, `ShelfLocation`, `CoordLocation`)
  derived from module 1's `Location`; dispatch on `locationType`, not property
  combinations. TDD: one test per route-request shape → URL/payload.
- **3. Map adapter** — deepen `useMapController` into a `MapAdapter` interface
  (`showLocation`, `drawRoute`, `clearRoute`, `switchFloor`, `onClick`); provide
  a `FakeMapAdapter` for tests so map-driven behaviour is testable without OL.
  Migrate the 4 components that import `MapHandler`/`RouteHandler` directly.
- **4. Floor / WMS layer** — a Floor Layer module owning `floor_`-prefix
  parsing, WMS layer names and GeoServer params; callers ask for "Space layer,
  floor 3".
- **5. HTTP / config** — fold `adminApi.js` into `api.js`; one module owns auth
  header, base URLs and org context; remove `process.env` sprawl.

## Test-infrastructure improvements (alongside module 1)

- **Remove the implementation-coupled tests.** Delete the `fs.readFileSync` /
  "does not import MapHandler" assertions in `SearchContent.test.js:146` and the
  equivalent in `RoutingContent.test.js` — they test source structure, not
  behaviour, and block legitimate refactors.
- **Enable coverage.** Add `coverage` config to
  `frontend/src/vitest.config.js` (`provider: 'v8'`, text + html reporters) so
  the campaign's progress is measurable. No CI gate yet.
- **Shared test helpers.** Add `frontend/src/tests/helpers/` with a
  `mountWithPinia` / fixture helper to cut the repeated
  `setActivePinia(createPinia())` + Vuetify boilerplate.

## Verification

After module 1:

1. `cd frontend/src && npm run test` — all Vitest pass, including the new
   `location.test.js` and the `popupModel.test.js` characterisation net.
2. `npm run lint`.
3. `make up` (or `npm run dev`) and manually exercise the map-click info panel:
   click a room, a POI, a building, a campus, empty space — confirm the panel
   shows the same info as before the refactor.
4. `npm run pw:test` — existing Playwright E2E (`leftPane`, `search`, `share`)
   still green; these are the behaviour-preservation backstop.
5. Confirm coverage report generates and record the baseline number.

Each later module repeats this loop: red test → green code → refactor →
full test + lint + manual + E2E before moving on.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/modules');
const IMPURE = [/\/storage\.js$/, /\/idb-store\.js$/, /\/event-sourcing\/emitter\.js$/, /^idb$/];
const toPosix = (path) => path.replace(/\\/g, '/');

// Every module reachable from `file` through static imports.
// `adapter` is an allowed seam: it is recorded but not followed.
function importGraph(file, seen = new Set(), adapter = null) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!file.endsWith('.js') || file === adapter) return seen;
  const source = readFileSync(file, 'utf8');
  for (const [, spec] of source.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)) {
    importGraph(spec.startsWith('.') ? toPosix(resolve(dirname(file), spec)) : spec, seen, adapter);
  }
  return seen;
}

const modulePath = (name) => toPosix(resolve(MODULES, name));
const impureImportsOf = (name, adapter = null) => [...importGraph(modulePath(name), new Set(), adapter && modulePath(adapter))]
  .filter((dep) => IMPURE.some((re) => re.test(dep)));

describe('pure Time Tracking modules', () => {
  test.each([
    'timetracking-model.js',
    'timetracking-report.js',
    'timetracking-filter.js',
    'timetracking-entry-fields.js',
    'timetracking-balance.js',
    'timetracking-settings.js',
    'timetracking-api.js'
  ])('%s loads no storage, IndexedDB or emitter', (name) => {
    expect(impureImportsOf(name)).toEqual([]);
  });

  test('the import check sees storage behind the storage adapter', () => {
    expect(impureImportsOf('timetracking-api-storage.js').length).toBeGreaterThan(0);
  });
});

// Panels read and change Time Tracking only through the injected interface; the page shell
// reaches storage solely through the storage adapter it creates.
describe('Time Tracking panels', () => {
  test.each([
    'timetracking-tracker.js',
    'timetracking-week-strip.js',
    'timetracking-gap-rows.js',
    'timetracking-work-week.js',
    'timetracking-settings-panel.js',
    'timetracking-reports-panel.js'
  ])('%s loads no storage, IndexedDB or emitter', (name) => {
    expect(impureImportsOf(name)).toEqual([]);
  });

  test('the page shell reaches storage only through the storage adapter', () => {
    expect(impureImportsOf('timetracking-ui.js', 'timetracking-api-storage.js')).toEqual([]);
  });
});

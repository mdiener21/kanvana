import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/modules');
const IMPURE = [/\/storage\.js$/, /\/idb-store\.js$/, /\/event-sourcing\/emitter\.js$/, /^idb$/];
const toPosix = (path) => path.replace(/\\/g, '/');

// Every module reachable from `file` through static imports.
function importGraph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!file.endsWith('.js')) return seen;
  const source = readFileSync(file, 'utf8');
  for (const [, spec] of source.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)) {
    importGraph(spec.startsWith('.') ? toPosix(resolve(dirname(file), spec)) : spec, seen);
  }
  return seen;
}

const impureImportsOf = (name) => [...importGraph(toPosix(resolve(MODULES, name)))]
  .filter((dep) => IMPURE.some((re) => re.test(dep)));

describe('pure Time Tracking modules', () => {
  test.each([
    'timetracking-model.js',
    'timetracking-report.js',
    'timetracking-filter.js',
    'timetracking-entry-fields.js',
    'timetracking-balance.js'
  ])('%s loads no storage, IndexedDB or emitter', (name) => {
    expect(impureImportsOf(name)).toEqual([]);
  });

  test('the import check sees storage behind the commands', () => {
    expect(impureImportsOf('timetracking-crud.js').length).toBeGreaterThan(0);
  });
});

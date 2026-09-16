import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MODULES_DIR = join(process.cwd(), 'src', 'modules');

function sortableCallSites() {
  const sites = [];
  for (const file of readdirSync(MODULES_DIR).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(MODULES_DIR, file), 'utf8');
    let index = source.indexOf('new Sortable(');
    while (index !== -1) {
      const optionsStart = source.indexOf('{', index);
      let depth = 0;
      let end = optionsStart;
      for (; end < source.length; end += 1) {
        if (source[end] === '{') depth += 1;
        else if (source[end] === '}' && (depth -= 1) === 0) break;
      }
      sites.push({ file, options: source.slice(optionsStart, end + 1) });
      index = source.indexOf('new Sortable(', end);
    }
  }
  return sites;
}

describe('SortableJS never uses native HTML5 drag', () => {
  const sites = sortableCallSites();

  it('finds every Sortable call site', () => {
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });

  it.each(sites.map((s, i) => [`${s.file}#${i}`, s]))(
    // Native mode calls dataTransfer.setData('Text', dragEl.textContent), which puts the
    // dragged card's text into an OS drag session. Endpoint DLP/scanner hooks inspect that
    // synchronously and can hang the whole browser UI thread.
    '%s opts out of native drag',
    (_name, site) => {
      expect(site.options).toMatch(/forceFallback:\s*true/);
    }
  );

  it('task cards are never natively draggable', () => {
    const source = readFileSync(join(MODULES_DIR, 'task-card.js'), 'utf8');
    expect(source).not.toMatch(/draggable:\s*'true'/);
  });
});

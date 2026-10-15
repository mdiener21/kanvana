import { describe, expect, test } from 'vitest';
import {
  MAX_WIP_LIMIT,
  formatWipCount,
  getWipLimit,
  getWipState,
  normalizeWipLimit,
  wipCounterLabel
} from '../../src/modules/wip-limit.js';

const todo = { id: 'c1', name: 'Todo', wipLimit: 5 };
const unlimited = { id: 'c2', name: 'Backlog', wipLimit: 0 };
const done = { id: 'c3', name: 'Done', role: 'done', wipLimit: 5 };
const legacyDone = { id: 'done', name: 'Done', wipLimit: 5 };

describe('normalizeWipLimit', () => {
  test('coerces anything that is not a positive integer to unlimited', () => {
    expect(normalizeWipLimit(undefined)).toBe(0);
    expect(normalizeWipLimit(null)).toBe(0);
    expect(normalizeWipLimit('')).toBe(0);
    expect(normalizeWipLimit('abc')).toBe(0);
    expect(normalizeWipLimit(-3)).toBe(0);
    expect(normalizeWipLimit(0)).toBe(0);
    expect(normalizeWipLimit(NaN)).toBe(0);
    expect(normalizeWipLimit(Infinity)).toBe(0);
  });

  test('accepts numeric strings and floors fractions', () => {
    expect(normalizeWipLimit('5')).toBe(5);
    expect(normalizeWipLimit(' 12 ')).toBe(12);
    expect(normalizeWipLimit(2.7)).toBe(2);
  });

  test('caps at MAX_WIP_LIMIT', () => {
    expect(normalizeWipLimit(1e9)).toBe(MAX_WIP_LIMIT);
  });
});

describe('getWipLimit', () => {
  test('reads the column limit', () => {
    expect(getWipLimit(todo)).toBe(5);
    expect(getWipLimit(unlimited)).toBe(0);
  });

  test('Done is exempt in both role and legacy-id form', () => {
    expect(getWipLimit(done)).toBe(0);
    expect(getWipLimit(legacyDone)).toBe(0);
  });

  test('tolerates a missing column', () => {
    expect(getWipLimit(null)).toBe(0);
    expect(getWipLimit({})).toBe(0);
  });
});

describe('getWipState', () => {
  test('under below the limit', () => {
    expect(getWipState(0, todo)).toBe('under');
    expect(getWipState(4, todo)).toBe('under');
  });

  test('at exactly the limit', () => {
    expect(getWipState(5, todo)).toBe('at');
  });

  test('over above the limit', () => {
    expect(getWipState(6, todo)).toBe('over');
    expect(getWipState(50, todo)).toBe('over');
  });

  test('an unlimited or Done column is never at or over', () => {
    expect(getWipState(999, unlimited)).toBe('under');
    expect(getWipState(999, done)).toBe('under');
  });
});

describe('formatWipCount', () => {
  test('shows the bare count when unlimited', () => {
    expect(formatWipCount(3, unlimited)).toBe('3');
    expect(formatWipCount(3, done)).toBe('3');
  });

  test('shows count/limit when limited', () => {
    expect(formatWipCount(3, todo)).toBe('3/5');
    expect(formatWipCount(6, todo)).toBe('6/5');
  });
});

describe('wipCounterLabel', () => {
  test('carries the state without relying on colour', () => {
    expect(wipCounterLabel(3, unlimited)).toBe('3 tasks');
    expect(wipCounterLabel(3, todo)).toBe('3 of 5 tasks');
    expect(wipCounterLabel(5, todo)).toBe('5 of 5 tasks, at limit');
    expect(wipCounterLabel(6, todo)).toBe('6 of 5 tasks, over limit');
  });
});

describe('import boundary', () => {
  test('normalizeBoardModelIds coerces an untrusted wipLimit', async () => {
    const { normalizeBoardModelIds } = await import('../../src/modules/board-serializer.js');

    const { columns } = normalizeBoardModelIds({
      columns: [
        { id: 'a', name: 'Todo', wipLimit: 5 },
        { id: 'b', name: 'Junk', wipLimit: 'not a number' },
        { id: 'c', name: 'Negative', wipLimit: -2 },
        { id: 'd', name: 'Huge', wipLimit: 1e9 },
        { id: 'e', name: 'Missing' }
      ]
    });

    const byName = Object.fromEntries(columns.map((c) => [c.name, c.wipLimit]));
    expect(byName.Todo).toBe(5);
    expect(byName.Junk).toBe(0);
    expect(byName.Negative).toBe(0);
    expect(byName.Huge).toBe(MAX_WIP_LIMIT);
    expect(byName.Missing).toBe(0);
    // The synthesized Done column is always unlimited.
    expect(byName.Done).toBe(0);
  });
});

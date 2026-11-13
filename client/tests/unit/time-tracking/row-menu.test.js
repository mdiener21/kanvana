import { describe, test, expect } from 'vitest';
import { rowMenuOpensUp } from '../../../src/modules/timetracking-row-menu.js';

// A 44px row with a 140px menu, on an 800px-tall viewport whose tab bar starts at 743px.
const placement = (anchorTop, visibleBottom = 743) =>
  rowMenuOpensUp({ anchorTop, anchorBottom: anchorTop + 44, menuHeight: 140, visibleBottom });

describe('rowMenuOpensUp: a row menu opens upward only when it must and can', () => {
  test('opens downward when it fits above the visible bottom', () => {
    expect(placement(100)).toBe(false);
  });

  test('opens upward when opening downward would run under the visible bottom', () => {
    expect(placement(650)).toBe(true);
  });

  test('stays downward near the top of the viewport, even if it runs under the visible bottom', () => {
    // A 150px viewport: no room below, and the anchor's top has only 100px above it.
    expect(placement(100, 150)).toBe(false);
  });

  test('measures the room above from the anchor top, not from where the downward menu would start', () => {
    // 120px above the anchor's top is less than the menu's 140px; the downward menu's top (164px) would
    // wrongly report enough room.
    expect(placement(120, 200)).toBe(false);
    expect(placement(140, 200)).toBe(true);
  });
});

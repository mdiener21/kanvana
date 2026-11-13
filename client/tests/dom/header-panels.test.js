import { describe, it, expect, beforeEach } from 'vitest';

import { initializeHeaderPanels } from '../../src/modules/header-panels.js';

const HEADER_HTML = `
  <div class="controls">
    <div class="board-search"><input id="board-search-input" type="search"></div>
    <button id="search-quick-btn" type="button" aria-expanded="false">Search</button>
  </div>
  <main id="board"></main>
`;

const controls = () => document.querySelector('.controls');
const button = (id) => document.getElementById(id);
const click = (id) => document.getElementById(id).click();

describe('initializeHeaderPanels', () => {
  let panels;

  beforeEach(() => {
    document.body.innerHTML = HEADER_HTML;
    panels = initializeHeaderPanels();
  });

  it('opens search from its button, focused, and closes it on a click elsewhere', () => {
    click('search-quick-btn');
    expect(controls().classList.contains('search-open')).toBe(true);
    expect(button('search-quick-btn').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button('board-search-input'));

    // A click inside the field keeps it open
    button('board-search-input').click();
    expect(controls().classList.contains('search-open')).toBe(true);

    document.getElementById('board').click();
    expect(controls().classList.contains('search-open')).toBe(false);
    expect(button('search-quick-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('dismissSearch closes an open field and returns focus to its button', () => {
    expect(panels.dismissSearch()).toBe(false);

    click('search-quick-btn');
    expect(panels.dismissSearch()).toBe(true);
    expect(controls().classList.contains('search-open')).toBe(false);
    expect(document.activeElement).toBe(button('search-quick-btn'));
  });

  describe('accessible names', () => {
    it('says on the search button when a filter is still applied', () => {
      const input = document.getElementById('board-search-input');
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks');

      input.value = 'Soul Stone';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks, filter applied');

      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks');
    });

    it('keeps the search button name in step when code sets or clears the filter', () => {
      const input = document.getElementById('board-search-input');

      input.value = 'Soul Stone';
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks, filter applied');
      expect(input.value).toBe('Soul Stone');

      input.value = '';
      expect(button('search-quick-btn').getAttribute('aria-label')).toBe('Search tasks');
    });
  });
});

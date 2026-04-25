import { describe, test, expect, beforeEach } from 'vitest';
import { linkifyText } from '../../src/modules/task-card.js';
import { updateDescriptionLinks } from '../../src/modules/task-modal.js';

function renderFragment(text) {
  const div = document.createElement('div');
  div.appendChild(linkifyText(text));
  return div;
}

describe('linkifyText', () => {
  test('plain text with no URL is rendered as a text node', () => {
    const el = renderFragment('just a plain description');
    expect(el.querySelectorAll('a')).toHaveLength(0);
    expect(el.textContent).toBe('just a plain description');
  });

  test('https URL becomes a clickable link', () => {
    const el = renderFragment('https://example.com');
    const links = el.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://example.com/');
    expect(links[0].textContent).toBe('https://example.com');
  });

  test('http URL becomes a clickable link', () => {
    const el = renderFragment('http://example.com/page');
    const links = el.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('http://example.com/page');
  });

  test('link opens in a new tab with noopener noreferrer', () => {
    const el = renderFragment('see https://example.com for details');
    const a = el.querySelector('a');
    expect(a?.target).toBe('_blank');
    expect(a?.rel).toBe('noopener noreferrer');
  });

  test('surrounding text is preserved around the link', () => {
    const el = renderFragment('visit https://example.com for info');
    expect(el.textContent).toBe('visit https://example.com for info');
    const a = el.querySelector('a');
    expect(a?.textContent).toBe('https://example.com');
  });

  test('multiple URLs in one description each become a link', () => {
    const el = renderFragment('a https://foo.com and https://bar.com here');
    const links = el.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].href).toContain('foo.com');
    expect(links[1].href).toContain('bar.com');
  });

  test('empty string returns an empty fragment', () => {
    const el = renderFragment('');
    expect(el.textContent).toBe('');
    expect(el.querySelectorAll('a')).toHaveLength(0);
  });

  test('non-http scheme is not linkified', () => {
    const el = renderFragment('ftp://example.com');
    expect(el.querySelectorAll('a')).toHaveLength(0);
    expect(el.textContent).toBe('ftp://example.com');
  });
});

describe('updateDescriptionLinks (modal preview strip)', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'task-description-links';
    container.hidden = true;
    document.body.appendChild(container);
  });

  test('hidden when text has no URLs', () => {
    updateDescriptionLinks('just some notes');
    expect(container.hidden).toBe(true);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  test('shows a chip for a single URL', () => {
    updateDescriptionLinks('see https://example.com');
    expect(container.hidden).toBe(false);
    const chips = container.querySelectorAll('a.description-link-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].href).toContain('example.com');
    expect(chips[0].target).toBe('_blank');
    expect(chips[0].rel).toBe('noopener noreferrer');
  });

  test('deduplicates the same URL appearing twice', () => {
    updateDescriptionLinks('https://example.com and https://example.com again');
    const chips = container.querySelectorAll('a.description-link-chip');
    expect(chips).toHaveLength(1);
  });

  test('shows one chip per distinct URL', () => {
    updateDescriptionLinks('https://foo.com and https://bar.com');
    const chips = container.querySelectorAll('a.description-link-chip');
    expect(chips).toHaveLength(2);
  });

  test('hides and clears when called with empty string', () => {
    updateDescriptionLinks('https://example.com');
    expect(container.hidden).toBe(false);
    updateDescriptionLinks('');
    expect(container.hidden).toBe(true);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  test('non-http scheme does not produce a chip', () => {
    updateDescriptionLinks('ftp://example.com');
    expect(container.hidden).toBe(true);
  });
});

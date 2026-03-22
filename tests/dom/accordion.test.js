import { fireEvent, getByText } from '@testing-library/dom';
import { expect, test } from 'vitest';
import { createAccordionSection } from '../../src/modules/accordion.js';
import { mountToBody } from './setup.js';

test('createAccordionSection toggles collapsed state and updates the chevron', () => {
  const section = createAccordionSection('Roadmap', ['First item', 'Second item'], false, (item) => {
    const element = document.createElement('div');
    element.textContent = item;
    return element;
  });

  mountToBody(section);

  const header = section.querySelector('.accordion-header');
  const body = section.querySelector('.accordion-body');
  const icon = section.querySelector('[data-lucide]');
  const count = section.querySelector('.accordion-count');

  expect(header?.getAttribute('aria-expanded')).toBe('false');
  expect(body?.classList.contains('collapsed')).toBe(true);
  expect(icon?.dataset.lucide).toBe('chevron-right');
  expect(count?.textContent).toBe('2');
  expect(getByText(section, 'First item')).toBeTruthy();

  fireEvent.click(header);

  expect(header?.getAttribute('aria-expanded')).toBe('true');
  expect(body?.classList.contains('collapsed')).toBe(false);
  expect(icon?.dataset.lucide).toBe('chevron-down');
});
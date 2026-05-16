import { renderIcons } from './icons.js';
import { h, cx } from './dom.js';

/**
 * Creates a collapsible accordion section.
 *
 * @param {string}   title      – Section header text
 * @param {Array}    items      – Array of data items to render inside the body
 * @param {boolean}  expanded   – Whether the section starts expanded
 * @param {function} renderItem – Callback `(item) => HTMLElement` that builds a DOM node for each item
 * @returns {HTMLElement} The accordion section element
 */
export function createAccordionSection(title, items, expanded, renderItem) {
  const icon = h('span', { 'data-lucide': expanded ? 'chevron-down' : 'chevron-right', 'aria-hidden': 'true' });
  const header = h('button', { type: 'button', class: 'accordion-header', 'aria-expanded': String(expanded) },
    icon,
    h('span', { class: 'accordion-title' }, title),
    h('span', { class: 'accordion-count' }, String(items.length))
  );
  const body = h('div', { class: cx('accordion-body', !expanded && 'collapsed') });
  items.forEach(item => body.appendChild(renderItem(item)));

  header.addEventListener('click', () => {
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!isExpanded));
    body.classList.toggle('collapsed', isExpanded);
    icon.dataset.lucide = isExpanded ? 'chevron-right' : 'chevron-down';
    renderIcons();
  });

  return h('div', { class: 'accordion' }, header, body);
}

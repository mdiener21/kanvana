import { renderIcons } from './icons.js';

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
  const section = document.createElement('div');
  section.classList.add('accordion');

  const header = document.createElement('button');
  header.type = 'button';
  header.classList.add('accordion-header');
  header.setAttribute('aria-expanded', String(expanded));

  const icon = document.createElement('span');
  icon.dataset.lucide = expanded ? 'chevron-down' : 'chevron-right';
  icon.setAttribute('aria-hidden', 'true');

  const titleSpan = document.createElement('span');
  titleSpan.classList.add('accordion-title');
  titleSpan.textContent = title;

  const count = document.createElement('span');
  count.classList.add('accordion-count');
  count.textContent = items.length;

  header.appendChild(icon);
  header.appendChild(titleSpan);
  header.appendChild(count);

  const body = document.createElement('div');
  body.classList.add('accordion-body');
  if (!expanded) body.classList.add('collapsed');

  items.forEach(item => {
    body.appendChild(renderItem(item));
  });

  header.addEventListener('click', () => {
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!isExpanded));
    body.classList.toggle('collapsed', isExpanded);
    icon.dataset.lucide = isExpanded ? 'chevron-right' : 'chevron-down';
    renderIcons();
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

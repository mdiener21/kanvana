// Minimal DOM construction helper — cuts verbose createElement boilerplate.

/**
 * Create a DOM element with attributes and children.
 *
 * @param {string} tag - Element tag name
 * @param {Object} [attrs] - Attributes/properties. Special keys:
 *   - 'class': sets className
 *   - 'on*': addEventListener (e.g., onClick → 'click')
 *   - 'data-*': setAttribute (use hyphenated form, e.g. 'data-lane-key')
 *   - anything else: setAttribute
 * @param {...(Node|string|null|undefined)} children
 * @returns {HTMLElement}
 *
 * @example
 *   h('button', { class: 'btn', onClick: handler, 'data-id': '42', type: 'button' },
 *     h('span', { 'data-lucide': 'plus', 'aria-hidden': 'true' }),
 *     'Add'
 *   );
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;

    if (k === 'class') {
      el.className = v;
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k.startsWith('data-')) {
      el.setAttribute(k, v);
    } else if (k === 'style' && typeof v === 'object' && v !== null) {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    } else {
      el.setAttribute(k, v);
    }
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    if (typeof child === 'string') {
      el.append(child);
    } else {
      el.appendChild(child);
    }
  }

  return el;
}

export const $id = (id) => document.getElementById(id);
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
export const addClass = (el, ...n) => el?.classList.add(...n);
export const removeClass = (el, ...n) => el?.classList.remove(...n);
export const toggleClass = (el, name, force) => el?.classList.toggle(name, force);
export const cx = (...parts) => parts.filter(Boolean).join(' ');

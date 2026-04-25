import { afterEach, beforeEach } from 'vitest';
import { resetLocalStorage } from '../unit/setup.js';

beforeEach(() => {
  document.body.innerHTML = '';
  resetLocalStorage();
});

afterEach(() => {
  document.body.innerHTML = '';
});

export function mountToBody(content) {
  document.body.innerHTML = '';

  if (typeof content === 'string') {
    document.body.innerHTML = content;
    return document.body;
  }

  if (content instanceof HTMLElement) {
    document.body.appendChild(content);
    return content;
  }

  throw new TypeError('mountToBody expects an HTML string or HTMLElement');
}
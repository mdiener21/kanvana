import { afterEach, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/dom';
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
// jsdom does not turn Enter / Space into a click; a browser does for a focused native button
// whose keydown is not prevented, so these are the preconditions checked.
export function isKeyboardOperable(button) {
  button.focus();
  return button.tagName === 'BUTTON' && !button.disabled && button.tabIndex >= 0
    && button.ownerDocument.activeElement === button
    && fireEvent.keyDown(button, { key: 'Enter' }) && fireEvent.keyDown(button, { key: ' ' });
}

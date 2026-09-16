import { describe, expect, test } from 'vitest';
import { applyWipCounter, syncColumnWip } from '../../src/modules/wip-limit.js';
import { mountToBody } from './setup.js';

const todo = { id: 'c1', name: 'Todo', wipLimit: 5 };
const unlimited = { id: 'c2', name: 'Backlog', wipLimit: 0 };

function buildColumn() {
  const el = document.createElement('article');
  el.className = 'task-column';
  el.dataset.column = 'c1';
  const counter = document.createElement('span');
  counter.className = 'task-counter';
  el.appendChild(counter);
  mountToBody(el);
  return el;
}

describe('applyWipCounter', () => {
  test('renders a bare count for an unlimited column', () => {
    const counter = document.createElement('span');
    applyWipCounter(counter, 3, unlimited);
    expect(counter.textContent).toBe('3');
    expect(counter.querySelector('.wip-limit')).toBeNull();
    expect(counter.getAttribute('aria-label')).toBe('3 tasks');
  });

  test('renders count with the limit in its own span', () => {
    const counter = document.createElement('span');
    applyWipCounter(counter, 3, todo);
    expect(counter.textContent).toBe('3/5');
    expect(counter.querySelector('.wip-limit')?.textContent).toBe('/5');
    expect(counter.getAttribute('aria-label')).toBe('3 of 5 tasks');
  });

  test('re-applying replaces rather than appends', () => {
    const counter = document.createElement('span');
    applyWipCounter(counter, 3, todo);
    applyWipCounter(counter, 4, todo);
    expect(counter.textContent).toBe('4/5');
    expect(counter.querySelectorAll('.wip-limit')).toHaveLength(1);
  });
});

describe('syncColumnWip', () => {
  test('drives data-wip through under, at and over', () => {
    const el = buildColumn();

    syncColumnWip(el, 4, todo);
    expect(el.dataset.wip).toBe('under');

    syncColumnWip(el, 5, todo);
    expect(el.dataset.wip).toBe('at');

    syncColumnWip(el, 6, todo);
    expect(el.dataset.wip).toBe('over');
  });

  test('pulses only on the transition into over-limit', () => {
    const el = buildColumn();
    const counter = el.querySelector('.task-counter');

    // First paint must not pulse, even if it lands over the limit.
    syncColumnWip(el, 6, todo);
    expect(counter.classList.contains('wip-pulse')).toBe(false);

    syncColumnWip(el, 5, todo);
    syncColumnWip(el, 6, todo);
    expect(counter.classList.contains('wip-pulse')).toBe(true);
  });

  test('staying over-limit does not re-pulse', () => {
    const el = buildColumn();
    const counter = el.querySelector('.task-counter');

    syncColumnWip(el, 5, todo);
    syncColumnWip(el, 6, todo);
    counter.classList.remove('wip-pulse');
    syncColumnWip(el, 7, todo);
    expect(counter.classList.contains('wip-pulse')).toBe(false);
    expect(counter.textContent).toBe('7/5');
  });

  test('an unlimited column stays under at any count', () => {
    const el = buildColumn();
    syncColumnWip(el, 200, unlimited);
    expect(el.dataset.wip).toBe('under');
    expect(el.querySelector('.task-counter').textContent).toBe('200');
  });
});

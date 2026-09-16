import { isDoneColumn } from './constants.js';

export const MAX_WIP_LIMIT = 999;

export function normalizeWipLimit(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), MAX_WIP_LIMIT);
}

// Done is terminal and unbounded — a limit there would block finishing work.
export function getWipLimit(column) {
  if (!column || isDoneColumn(column)) return 0;
  return normalizeWipLimit(column.wipLimit);
}

export function getWipState(count, column) {
  const limit = getWipLimit(column);
  if (!limit) return 'under';
  if (count > limit) return 'over';
  if (count === limit) return 'at';
  return 'under';
}

export function formatWipCount(count, column) {
  const limit = getWipLimit(column);
  return limit ? `${count}/${limit}` : String(count);
}

export function wipCounterLabel(count, column) {
  const limit = getWipLimit(column);
  if (!limit) return `${count} tasks`;
  const state = getWipState(count, column);
  const suffix = state === 'over' ? ', over limit' : state === 'at' ? ', at limit' : '';
  return `${count} of ${limit} tasks${suffix}`;
}

function pulseCounter(counterEl) {
  if (!counterEl) return;
  counterEl.classList.remove('wip-pulse');
  // Force reflow so re-adding the class restarts the animation.
  void counterEl.offsetWidth;
  counterEl.classList.add('wip-pulse');
  counterEl.addEventListener('animationend', () => counterEl.classList.remove('wip-pulse'), { once: true });
}

export function applyWipCounter(counterEl, count, column) {
  if (!counterEl) return;
  const limit = getWipLimit(column);
  counterEl.textContent = String(count);
  if (limit) {
    const limitEl = document.createElement('span');
    limitEl.className = 'wip-limit';
    limitEl.textContent = `/${limit}`;
    counterEl.appendChild(limitEl);
  }
  counterEl.setAttribute('aria-label', wipCounterLabel(count, column));
}

export function syncColumnWip(columnEl, count, column) {
  if (!columnEl) return;
  const counterEl = columnEl.querySelector('.task-counter');
  applyWipCounter(counterEl, count, column);

  const next = getWipState(count, column);
  const prev = columnEl.getAttribute('data-wip');
  if (prev === next) return;
  columnEl.setAttribute('data-wip', next);
  if (prev && prev !== 'over' && next === 'over') pulseCounter(counterEl);
}

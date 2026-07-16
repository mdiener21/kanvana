import { DATA_CHANGED, emit } from '../events.js';
import { applyEvent } from '../reducer.js';

export function reduceEventAndNotify(state, event) {
  const next = applyEvent(state, event);
  if (next !== state) emit(DATA_CHANGED, { event });
  return next;
}

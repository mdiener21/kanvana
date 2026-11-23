import { setActiveBoardId } from './storage.js';
import { DATA_CHANGED, emit } from './events.js';

export function selectBoard(boardId) {
  if (!setActiveBoardId(boardId)) return false;
  emit(DATA_CHANGED);
  return true;
}

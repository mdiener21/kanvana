import { h } from './dom.js';
import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';

const { ttSubmitInline, ttCloseModal } = DEFAULT_APP_KEYBINDINGS;

// Enter or blur saves, Esc cancels; `onDone(save, value)` runs once.
function createInlineRename(value, onDone) {
  const input = h('input', {
    class: 'tt-input tt-rename-input', type: 'text', 'aria-label': 'Description',
    placeholder: 'What did you work on?', autocomplete: 'off', maxlength: '500', enterkeyhint: 'done'
  });
  input.value = value;
  const wrap = h('span', { class: 'tt-rename' },
    input,
    h('span', { class: 'tt-rename-hint', 'aria-hidden': 'true' }, h('kbd', {}, 'Enter'), ' save · ', h('kbd', {}, 'Esc'), ' cancel'));

  let done = false;
  let detaching = false;
  let placed = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    onDone(save, input.value);
  };

  input.addEventListener('keydown', (ev) => {
    if (matchesKey(ev, ttSubmitInline)) {
      ev.preventDefault();
      finish(true);
    } else if (matchesKey(ev, ttCloseModal)) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => {
    if (!detaching) finish(true);
  });

  return {
    place(target) {
      target.replaceWith(wrap);
      input.focus();
      if (!placed) input.setSelectionRange(input.value.length, input.value.length);
      placed = true;
    },
    detach() {
      detaching = true;
      wrap.remove();
      detaching = false;
    }
  };
}

// Renaming one list row at a time. The list re-renders while renaming, so the editor is
// detached before each render and placed into the fresh row (`[data-rename]`) after it.
export function mountRowRename({ rowOf, onDone }) {
  let active = null;

  return {
    isActive: () => active !== null,
    start(id, description) {
      if (active) return;
      active = { id, editor: createInlineRename(description, (save, value) => { active = null; onDone(id, save, value); }) };
    },
    beforeRender() {
      active?.editor.detach();
    },
    afterRender() {
      if (!active) return;
      const row = rowOf(active.id);
      if (!row) { active = null; return; }
      row.classList.add('is-renaming');
      row.querySelector('.tt-entry-actions').hidden = true;
      active.editor.place(row.querySelector('[data-rename]'));
    }
  };
}

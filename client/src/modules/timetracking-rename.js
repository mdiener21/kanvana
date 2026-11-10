// Inline rename of an entry's description in the list: Enter or blur saves, Esc cancels.
// `onDone(save, value)` runs once. The editor survives list re-renders: `detach()` before
// replacing the list, `place(target)` into the new row.
export function createInlineRename(doc, value, onDone) {
  const wrap = doc.createElement('span');
  wrap.className = 'tt-rename';
  wrap.innerHTML = `
    <input class="tt-input tt-rename-input" type="text" aria-label="Description"
      placeholder="What did you work on?" autocomplete="off" maxlength="500">
    <span class="tt-rename-hint" aria-hidden="true"><kbd>Enter</kbd> save · <kbd>Esc</kbd> cancel</span>`;
  const input = wrap.querySelector('input');
  input.value = value;

  let done = false;
  let detaching = false;
  let placed = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    onDone(save, input.value);
  };

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === 'Escape') {
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

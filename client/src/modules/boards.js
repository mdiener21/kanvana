import { $, $id, h } from './dom.js';
import { setupModalCloseHandlers } from './modals.js';
import { emit, on, DATA_CHANGED } from './events.js';
import {
  ensureBoardsInitialized,
  listBoards,
  createBoard,
  getActiveBoardId,
  setActiveBoardId
} from './storage.js';
import { normalizeBoardModelIds } from './board-serializer.js';
import { alertDialog } from './dialog.js';
import { boardDisplayName } from './normalize.js';

const builtInTemplateModules = import.meta.glob('../templates/*.json', {
  eager: true,
  import: 'default'
});

function templateIdFromPath(path) {
  const base = typeof path === 'string' ? path.split('/').pop() : '';
  return base ? base.replace(/\.json$/i, '') : '';
}

function getBuiltInBoardTemplates() {
  return Object.entries(builtInTemplateModules)
    .map(([path, data]) => {
      const id = templateIdFromPath(path);
      const name = typeof data?.boardName === 'string' ? data.boardName.trim() : '';
      const columns = Array.isArray(data?.columns) ? data.columns : null;
      const tasks = Array.isArray(data?.tasks) ? data.tasks : null;
      const labels = Array.isArray(data?.labels) ? data.labels : null;
      const settings = data?.settings && typeof data.settings === 'object' ? data.settings : null;
      if (!id || !name || !tasks) return null;

      return {
        id,
        name,
        board: { boardName: name, columns, tasks, labels, settings }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function populateTemplateSelect(selectEl) {
  if (!selectEl) return;
  const templates = getBuiltInBoardTemplates();

  selectEl.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Blank board';
  blank.selected = true;
  selectEl.appendChild(blank);

  templates.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    selectEl.appendChild(opt);
  });
}

// Preserve the option elements when only the active board or its contents change.
function boardSelectMatchesState(selectEl, boards) {
  if (selectEl.options.length !== boards.length) return false;
  return boards.every(
    (b, i) =>
      selectEl.options[i].value === b.id &&
      selectEl.options[i].textContent === boardDisplayName(b)
  );
}

function refreshBoardNavigation(selectEl) {
  const boards = listBoards();
  if (!boardSelectMatchesState(selectEl, boards)) {
    selectEl.replaceChildren(...boards.map((board) =>
      h('option', { value: board.id }, boardDisplayName(board))
    ));
  }

  const activeId = getActiveBoardId() || '';
  if (selectEl.value !== activeId) selectEl.value = activeId;

  const brandEl = $id('brand-text') || $('.brand-text');
  if (!brandEl) return;
  const activeName = boardDisplayName(boards.find((board) => board.id === activeId));
  if (brandEl.textContent !== activeName) brandEl.textContent = activeName;
}

// Board Create Modal helpers
export function showBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  const nameInput = document.getElementById('board-create-name');
  const templateSelect = document.getElementById('board-create-template');
  if (!modal || !nameInput) return;

  nameInput.value = '';
  if (templateSelect) templateSelect.value = '';
  modal.classList.remove('hidden');
  nameInput.focus();
}

function hideBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  if (modal) modal.classList.add('hidden');
}

export function initializeBoardsUI() {
  ensureBoardsInitialized();

  const selectEl = document.getElementById('board-select');

  if (!selectEl) return;

  refreshBoardNavigation(selectEl);
  on(DATA_CHANGED, () => refreshBoardNavigation(selectEl));

  document.addEventListener('kanban:open-board-create', () => {
    showBoardCreateModal();
  });

  selectEl.addEventListener('change', () => {
    const id = selectEl.value;
    if (!id) return;
    setActiveBoardId(id);
    emit(DATA_CHANGED);

    // Collapse the dropdown menu after a selection.
    const controlsActions = document.getElementById('board-controls-menu');
    const menuBtn = document.getElementById('desktop-menu-btn');
    controlsActions?.classList.remove('show');
    menuBtn?.setAttribute('aria-expanded', 'false');
  });

  // Board Create Modal handlers
  const createModal = document.getElementById('board-create-modal');
  const createForm = document.getElementById('board-create-form');
  const cancelCreateBtn = document.getElementById('cancel-board-create-btn');
  const templateSelect = document.getElementById('board-create-template');

  populateTemplateSelect(templateSelect);

  if (createModal) {
    // Backdrop click closes modal
    const backdrop = createModal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', hideBoardCreateModal);

    // Escape key closes modal
    createModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideBoardCreateModal();
    });
  }

  if (cancelCreateBtn) {
    cancelCreateBtn.addEventListener('click', hideBoardCreateModal);
  }

  setupModalCloseHandlers('board-create-modal', hideBoardCreateModal);

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('board-create-name');
      const trimmed = (nameInput?.value || '').trim();

      if (!trimmed) {
        await alertDialog({ title: 'Error', message: 'Board name cannot be empty.' });
        nameInput?.focus();
        return;
      }

      const selectedTemplateId = (templateSelect?.value || '').trim();
      const templates = selectedTemplateId ? getBuiltInBoardTemplates() : [];
      const template = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;

      createBoard(trimmed, template ? normalizeBoardModelIds(template.board) : {});

      emit(DATA_CHANGED);
      hideBoardCreateModal();

      // Let other UI modules (e.g., Manage Boards modal) react without introducing
      // cross-module imports that can complicate bundling/chunking.
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
    });
  }
}

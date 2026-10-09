import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { escapeHtml } from './security.js';
import {
  addTimeEntry, updateTimeEntry, duplicateTimeEntry, deleteTimeEntry, projectById, customerById, CRUD_ERROR
} from './timetracking-crud.js';
import { showToast } from './timetracking-toast.js';
import { entryFieldsHtml, wireEntryFields } from './timetracking-entry-fields.js';
import { prefillProjectId } from './timetracking-settings.js';
import { groupEntriesByDay, formatTime, formatDuration, plusDaysBetween, floorToMinute } from './timetracking-time.js';

export const ENTRY_ERROR_MESSAGES = {
  [CRUD_ERROR.NO_PROJECT]: 'Select a project.',
  [CRUD_ERROR.ARCHIVED_PROJECT]: 'That project is archived.',
  [CRUD_ERROR.INVALID_TIME]: 'Enter a valid date and time.',
  [CRUD_ERROR.ZERO_DURATION]: 'Duration must be greater than zero.',
  [CRUD_ERROR.NOT_FOUND]: 'That entry no longer exists.'
};

const PANEL_HTML = `
  <div class="tt-tracker-panel">
    <h2 class="tt-section-title">Time Tracker</h2>
    <div class="tt-entry-bar" role="group" aria-label="New time entry">
      ${entryFieldsHtml('tt-entry')}
      <button id="tt-entry-add" class="tt-btn-add" type="button" aria-label="Add entry">
        <span data-lucide="plus" aria-hidden="true"></span>
        Add
      </button>
    </div>
    <section class="tt-entry-list" aria-label="Time entries"></section>
  </div>
`;

const ROW_ACTIONS = [
  { action: 'edit', icon: 'pencil', label: 'Edit entry' },
  { action: 'duplicate', icon: 'copy', label: 'Duplicate entry' },
  { action: 'delete', icon: 'trash-2', label: 'Delete entry' }
];

const descriptionText = (entry) => entry.description || '(no description)';

function reportFailure(result) {
  if (!result.ok) showToast(ENTRY_ERROR_MESSAGES[result.reason]);
  return result.ok;
}

const saveSubmitted = (result, save) => reportFailure(result.ok ? save(result.entry) : result);

function entryRowHtml(entry, tt, prefs, view) {
  const startMs = Date.parse(entry.start);
  const endMs = Date.parse(entry.end);
  const project = projectById(tt, entry.projectId);
  const customer = project && customerById(tt, project.customerId);
  const plusDays = plusDaysBetween(startMs, endMs, prefs.tz);
  const isSelected = entry.id === view.selectedId;
  const attrs = `data-entry-id="${escapeHtml(entry.id)}" aria-current="${isSelected}"`;
  if (entry.id === view.confirmingId) {
    return `
    <li class="tt-entry-row tt-entry-confirm is-selected" ${attrs}>
      <span class="tt-confirm-text">Delete “${escapeHtml(descriptionText(entry))}” · ${escapeHtml(project?.name ?? 'Unknown project')} · ${formatDuration(endMs - startMs, prefs.durationFormat)}?</span>
      <span class="tt-confirm-hint">y = delete · Esc = cancel</span>
      <button type="button" class="tt-btn-danger" data-confirm="yes">Delete</button>
      <button type="button" class="tt-btn-secondary" data-confirm="no">Cancel</button>
    </li>`;
  }
  return `
    <li class="tt-entry-row${isSelected ? ' is-selected' : ''}" ${attrs}>
      <span class="tt-entry-desc${entry.description ? '' : ' tt-entry-desc-empty'}">${escapeHtml(descriptionText(entry))}</span>
      <span class="tt-entry-project"${project ? ` style="color:${escapeHtml(project.color)};"` : ''}>${escapeHtml(project?.name ?? 'Unknown project')}</span>
      <span class="tt-entry-customer">${escapeHtml(customer?.name ?? '')}</span>
      <span class="tt-entry-range"><span>${formatTime(startMs, prefs)} – ${formatTime(endMs, prefs)}</span>${plusDays > 0 ? `<sup class="tt-entry-plus" title="Ends ${plusDays} day(s) later">+${plusDays}</sup>` : ''}</span>
      <span class="tt-entry-duration">${formatDuration(endMs - startMs, prefs.durationFormat)}</span>
      <span class="tt-entry-actions">
        ${ROW_ACTIONS.map(({ action, icon, label }) => `
        <button type="button" class="tt-entry-action" data-action="${action}" aria-label="${label}" title="${label}">
          <span data-lucide="${icon}" aria-hidden="true"></span>
        </button>`).join('')}
      </span>
    </li>`;
}

const EDITOR_HTML = `
  <div class="tt-edit-card">
    <h3 id="tt-edit-title" class="tt-edit-title">Edit entry</h3>
    <div class="tt-edit-fields">${entryFieldsHtml('tt-edit')}</div>
    <div class="tt-edit-actions">
      <button type="button" class="tt-btn-secondary" data-edit="cancel">Cancel</button>
      <button type="button" class="tt-btn-add" data-edit="save">Save</button>
    </div>
  </div>
`;

function entryListHtml(tt, prefs, groups, view) {
  if (tt.timeEntries.length === 0) return '<p class="tt-empty">No time entries yet.</p>';
  return groups.map((group) => {
    const heading = escapeHtml(group.heading);
    return `
      <div class="tt-day">
        <div class="tt-day-header">
          <h3 class="tt-day-heading">${heading}</h3>
          <span class="tt-day-total" aria-label="Total for ${heading}">${formatDuration(group.totalMs, prefs.durationFormat)}</span>
        </div>
        <ul class="tt-day-entries" aria-label="${heading}">
          ${group.entries.map((entry) => entryRowHtml(entry, tt, prefs, view)).join('')}
        </ul>
      </div>`;
  }).join('');
}

export function mountTrackerPanel(container, { getPrefs, getSettings }) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const bar = container.querySelector('.tt-entry-bar');
  const list = container.querySelector('.tt-entry-list');

  const fields = wireEntryFields(bar, {
    getPrefs,
    getTimeTracking: loadTimeTracking,
    onSubmit(result) {
      if (!saveSubmitted(result, addTimeEntry)) return;
      reset();
      fields.focus();
    }
  });

  const currentPrefill = () => prefillProjectId(loadTimeTracking(), getSettings());
  let lastPrefill = null;

  function reset() {
    const now = floorToMinute(getPrefs().now);
    lastPrefill = currentPrefill();
    fields.setEntry({ projectId: lastPrefill, startMs: now, endMs: now });
  }

  // An untouched entry bar follows a changed default project; a typed one is left alone.
  function followPrefill() {
    const prefill = currentPrefill();
    if (prefill === lastPrefill) return;
    if (fields.projectId() === lastPrefill) fields.setProject(prefill);
    lastPrefill = prefill;
  }

  const view = { selectedId: null, confirmingId: null };
  let visibleIds = [];
  let displayKey = null;

  function redisplayOnFormatChange(prefs) {
    const key = [prefs.tz, prefs.dateFormat, prefs.timeFormat, prefs.durationFormat].join('|');
    if (displayKey !== null && key !== displayKey) {
      fields.redisplay();
      editor?.fields.redisplay();
    }
    displayKey = key;
  }

  function refresh() {
    const tt = loadTimeTracking();
    const prefs = getPrefs();
    redisplayOnFormatChange(prefs);
    followPrefill();
    const groups = groupEntriesByDay(tt.timeEntries, prefs);
    visibleIds = groups.flatMap((group) => group.entries.map((e) => e.id));
    if (!visibleIds.includes(view.selectedId)) view.selectedId = null;
    if (!visibleIds.includes(view.confirmingId)) view.confirmingId = null;
    fields.refreshProjects();
    list.innerHTML = entryListHtml(tt, prefs, groups, view);
    renderIcons(list);
  }

  const rowOf = (id) => [...list.querySelectorAll('[data-entry-id]')].find((r) => r.dataset.entryId === id);

  function select(id) {
    view.selectedId = id;
    refresh();
    rowOf(id)?.scrollIntoView?.({ block: 'nearest' });
  }

  function moveSelection(step) {
    if (visibleIds.length === 0) return;
    const index = visibleIds.indexOf(view.selectedId);
    const next = index === -1 ? 0 : Math.min(Math.max(index + step, 0), visibleIds.length - 1);
    select(visibleIds[next]);
  }

  let editor = null;

  function closeEditor() {
    if (!editor) return;
    editor.fields.unwire();
    editor.element.remove();
    editor = null;
  }

  function openEditor(id) {
    const entry = loadTimeTracking().timeEntries.find((e) => e.id === id);
    if (!entry || editor) return;
    const element = container.ownerDocument.createElement('div');
    element.id = 'tt-edit-modal';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'tt-edit-title');
    element.innerHTML = EDITOR_HTML;
    container.ownerDocument.body.appendChild(element);

    const editorFields = wireEntryFields(element.querySelector('.tt-edit-fields'), {
      getPrefs,
      getTimeTracking: loadTimeTracking,
      onSubmit(result) {
        if (!saveSubmitted(result, (entry) => updateTimeEntry(id, entry))) return;
        closeEditor();
        select(id);
      }
    });
    editor = { element, fields: editorFields };
    editorFields.refreshProjects();
    editorFields.setEntry({
      description: entry.description,
      projectId: entry.projectId,
      startMs: Date.parse(entry.start),
      endMs: Date.parse(entry.end)
    });

    element.addEventListener('click', (ev) => {
      const action = ev.target.closest('[data-edit]')?.dataset.edit;
      if (action === 'save') editorFields.submit();
      else if (action === 'cancel' || ev.target === element) closeEditor();
    });
    editorFields.focus();
  }

  function duplicate(id) {
    const result = duplicateTimeEntry(id, getPrefs().now);
    if (reportFailure(result)) select(result.timeEntry.id);
  }

  function askDelete(id) {
    view.selectedId = id;
    view.confirmingId = id;
    refresh();
  }

  function cancelDelete() {
    view.confirmingId = null;
    refresh();
  }

  function confirmDelete() {
    const id = view.confirmingId;
    if (!id) return;
    const index = visibleIds.indexOf(id);
    const neighbour = visibleIds[index + 1] ?? visibleIds[index - 1] ?? null;
    view.confirmingId = null;
    select(reportFailure(deleteTimeEntry(id)) ? neighbour : id);
  }

  const ROW_ACTION_HANDLERS = { edit: openEditor, duplicate, delete: askDelete };

  list.addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-entry-id]');
    if (!row) return;
    if (view.confirmingId) {
      const answer = ev.target.closest('[data-confirm]')?.dataset.confirm;
      if (answer === 'yes') confirmDelete();
      else if (answer === 'no') cancelDelete();
      return;
    }
    const id = row.dataset.entryId;
    const action = ev.target.closest('[data-action]')?.dataset.action;
    select(id);
    ROW_ACTION_HANDLERS[action]?.(id);
  });

  list.addEventListener('dblclick', (ev) => {
    const row = ev.target.closest('[data-entry-id]');
    if (row && !view.confirmingId) openEditor(row.dataset.entryId);
  });

  container.querySelector('#tt-entry-add').addEventListener('click', () => fields.submit());

  reset();
  refresh();
  on(DATA_CHANGED, refresh);
  return {
    focusNewEntry: () => fields.focus(),
    selectNext: () => moveSelection(1),
    selectPrev: () => moveSelection(-1),
    editSelected: () => view.selectedId && openEditor(view.selectedId),
    duplicateSelected: () => view.selectedId && duplicate(view.selectedId),
    deleteSelected: () => view.selectedId && askDelete(view.selectedId),
    confirmDelete,
    isEditing: () => editor !== null,
    isConfirming: () => view.confirmingId !== null,
    cancel() {
      if (view.confirmingId) cancelDelete();
      else if (editor) closeEditor();
      else return false;
      return true;
    },
    unmount() {
      closeEditor();
      off(DATA_CHANGED, refresh);
      fields.unwire();
    }
  };
}

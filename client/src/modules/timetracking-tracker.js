import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { escapeHtml } from './security.js';
import {
  addTimeEntry, updateTimeEntry, duplicateTimeEntry, deleteTimeEntry, projectById, customerById, CRUD_ERROR
} from './timetracking-crud.js';
import { showToast } from './timetracking-toast.js';
import { entryFieldsHtml, wireEntryFields } from './timetracking-entry-fields.js';
import { filterEntries, mountEntryFilter } from './timetracking-filter.js';
import { prefillProjectId, loadLastUsedProjectId, rememberLastUsedProject } from './timetracking-settings.js';
import { WEEK_HEADER_HTML, mountWeekStrip } from './timetracking-week-strip.js';
import { groupEntriesByDay, formatTime, formatDuration, plusDaysBetween, newEntryTimes } from './timetracking-time.js';
import { colorDotHtml } from './timetracking-markup.js';
import { rowMenuOpensUp } from './timetracking-row-menu.js';
import { dayCoverage, coverageBarHtml } from './timetracking-coverage.js';
import { mountRowRename } from './timetracking-rename.js';
import { untrackedGaps } from './timetracking-gaps.js';
import { dayRowsHtml, fillChipsHtml, gapBefore, gapOfFillButton } from './timetracking-gap-rows.js';

export const ENTRY_ERROR_MESSAGES = {
  [CRUD_ERROR.NO_PROJECT]: 'Select a project.',
  [CRUD_ERROR.ARCHIVED_PROJECT]: 'That project is archived.',
  [CRUD_ERROR.INVALID_TIME]: 'Enter a valid date and time.',
  [CRUD_ERROR.ZERO_DURATION]: 'Duration must be greater than zero.',
  [CRUD_ERROR.NOT_FOUND]: 'That entry no longer exists.'
};

const PANEL_HTML = `
  <div class="tt-tracker-panel">
${WEEK_HEADER_HTML}
    <div class="tt-entry-bar" role="group" aria-label="New time entry">
      ${entryFieldsHtml('tt-entry')}
      <button id="tt-entry-add" class="tt-btn-add" type="button" aria-label="Add entry">
        <span data-lucide="plus" aria-hidden="true"></span>
        Add <kbd class="tt-kbd">Enter</kbd>
      </button>
      <p class="tt-entry-hint">
        <span><kbd class="tt-kbd">930</kbd> <kbd class="tt-kbd">90m</kbd> <kbd class="tt-kbd">1.5</kbd> shorthand</span>
        <span><kbd class="tt-kbd">Alt+↑/↓</kbd> ±15 min</span>
      </p>
    </div>
    <div class="tt-fill-chips" role="group" aria-label="Fill untracked gaps" hidden></div>
    <div class="tt-list-toolbar">
      <div class="tt-list-filter"></div>
      <span class="tt-entry-count" aria-label="Entry count" aria-live="polite"></span>
    </div>
    <section class="tt-entry-list" aria-label="Time entries"></section>
  </div>
`;

const ROW_ACTIONS = [
  { action: 'edit', icon: 'pencil', label: 'Edit entry', menuLabel: 'Edit' },
  { action: 'duplicate', icon: 'copy', label: 'Duplicate entry', menuLabel: 'Duplicate' },
  { action: 'delete', icon: 'trash-2', label: 'Delete entry', menuLabel: 'Delete' }
];

// Touch devices get the row actions as one ⋯ menu (CSS swaps the icon buttons for it).
const rowMenuHtml = () => `
      <div class="tt-row-menu" role="menu" aria-label="Entry actions">
        ${ROW_ACTIONS.map(({ action, icon, menuLabel }) => `
        <button type="button" class="tt-row-menu-item" role="menuitem" data-action="${action}">
          <span data-lucide="${icon}" aria-hidden="true"></span>${menuLabel}
        </button>`).join('')}
      </div>`;

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
  const projectName = project?.name ?? 'Unknown project';
  const isSelected = entry.id === view.selectedId;
  const isMenuOpen = entry.id === view.menuId;
  const range = escapeHtml(`${formatTime(startMs, prefs)} – ${formatTime(endMs, prefs)}`);
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
    <li class="tt-entry-row${isSelected ? ' is-selected' : ''}" ${attrs}${project ? ` style="--tt-project-color:${escapeHtml(project.color)};"` : ''}>
      <span class="tt-entry-desc${entry.description ? '' : ' tt-entry-desc-empty'}" data-rename title="Click to rename">${escapeHtml(descriptionText(entry))}</span>
      <button type="button" class="tt-entry-meta" data-action="edit-project" title="Open editor"
        aria-label="${escapeHtml([projectName, customer?.name].filter(Boolean).join(' · '))}, open editor">
        <span class="tt-entry-project">${project ? colorDotHtml(project.color) : ''}${escapeHtml(projectName)}</span>
        <span class="tt-entry-customer">${escapeHtml(customer?.name ?? '')}</span>
      </button>
      <button type="button" class="tt-entry-range" data-action="edit-times" title="Edit times" aria-label="${range}${plusDays > 0 ? ` +${plusDays}` : ''}, edit times"><span>${range}</span>${plusDays > 0 ? `<sup class="tt-entry-plus" title="Ends ${plusDays} day(s) later">+${plusDays}</sup>` : ''}</button>
      <span class="tt-entry-end">
        <span class="tt-entry-actions">
          ${ROW_ACTIONS.map(({ action, icon, label }) => `
          <button type="button" class="tt-entry-action" data-action="${action}" aria-label="${label}" title="${label}">
            <span data-lucide="${icon}" aria-hidden="true"></span>
          </button>`).join('')}
          <button type="button" class="tt-entry-action tt-entry-more" data-action="more" aria-label="More actions" title="More actions"
            aria-haspopup="menu" aria-expanded="${isMenuOpen}">
            <span data-lucide="ellipsis-vertical" aria-hidden="true"></span>
          </button>
        </span>
        <span class="tt-entry-duration">${formatDuration(endMs - startMs, prefs.durationFormat)}</span>
      </span>${isMenuOpen ? rowMenuHtml() : ''}
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

function entryListHtml(tt, prefs, groups, view, gaps, dayEntries) {
  if (tt.timeEntries.length === 0) return '<p class="tt-empty">No time entries yet.</p>';
  if (groups.length === 0) return '<p class="tt-empty">No entries match the filter.</p>';
  return groups.map((group) => {
    const heading = escapeHtml(group.heading);
    return `
      <div class="tt-day" data-day="${escapeHtml(group.key)}">
        <div class="tt-day-header">
          <h3 class="tt-day-heading">${heading}</h3>
          ${coverageBarHtml(dayCoverage(dayEntries.get(group.key), prefs, (entry) => projectById(tt, entry.projectId)?.color ?? 'var(--text-muted)'))}
          <span class="tt-day-total" aria-label="Total for ${heading}">${formatDuration(group.totalMs, prefs.durationFormat)}</span>
        </div>
        <ul class="tt-day-entries" aria-label="${heading}">
          ${dayRowsHtml(group.entries, gaps.filter((gap) => gap.dayKey === group.key), (entry) => entryRowHtml(entry, tt, prefs, view), prefs)}
        </ul>
      </div>`;
  }).join('');
}

const DISPLAY_PREF_KEYS = ['tz', 'dateFormat', 'timeFormat', 'durationFormat'];
const sameDisplayPrefs = (a, b) => DISPLAY_PREF_KEYS.every((key) => a[key] === b[key]);

export function mountTrackerPanel(container, { getPrefs, getSettings, onOpenCurrentWeek = () => {} }) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const isTouch = () => win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const bar = container.querySelector('.tt-entry-bar');
  const list = container.querySelector('.tt-entry-list');
  const count = container.querySelector('.tt-entry-count');
  const filter = mountEntryFilter(container.querySelector('.tt-list-filter'), {
    getTimeTracking: loadTimeTracking,
    onChange: () => refresh()
  });

  const fields = wireEntryFields(bar, {
    getPrefs,
    getTimeTracking: loadTimeTracking,
    beforeSubmit: () => refreshDefaultTimes(),
    onSubmit(result) {
      if (!saveSubmitted(result, addTimeEntry)) return;
      rememberLastUsedProject(result.entry.projectId);
      reset();
      // On touch, focusing Description would reopen the soft keyboard over the new row.
      if (isTouch()) doc.activeElement?.blur();
      else fields.focus();
    }
  });
  // Room for the soft keyboard; a button is left alone, or the scroll would move it under the tap.
  bar.addEventListener('focusin', (ev) => {
    if (isTouch() && ev.target.matches('input')) bar.scrollIntoView?.({ block: 'start' });
  });

  const currentPrefill = () => prefillProjectId(loadTimeTracking(), getSettings(), loadLastUsedProjectId());
  let lastPrefill = null;

  let defaultTimeValues = null;
  const sameTimeValues = (a, b) => Object.keys(a).every((key) => a[key] === b?.[key]);

  function reset() {
    const { now, tz } = getPrefs();
    lastPrefill = currentPrefill();
    fields.setEntry({ projectId: lastPrefill, ...newEntryTimes(loadTimeTracking().timeEntries, now, tz) });
    defaultTimeValues = fields.timeValues();
  }

  // An open page goes stale: untouched default times move to now; typed or filled ones stay.
  function refreshDefaultTimes() {
    if (!sameTimeValues(fields.timeValues(), defaultTimeValues)) return;
    const { now, tz } = getPrefs();
    const { startMs, endMs } = newEntryTimes(loadTimeTracking().timeEntries, now, tz);
    fields.setTimes(startMs, endMs);
    defaultTimeValues = fields.timeValues();
  }

  const onPageReturn = () => {
    if (doc.visibilityState !== 'hidden') refreshDefaultTimes();
  };
  const PAGE_RETURN_EVENTS = [[doc, 'visibilitychange'], [win, 'focus'], [win, 'pageshow']];
  for (const [target, type] of PAGE_RETURN_EVENTS) target.addEventListener(type, onPageReturn);

  // An untouched entry bar follows a changed prefill; a typed one is left alone.
  function followPrefill() {
    const prefill = currentPrefill();
    if (prefill === lastPrefill) return;
    if (fields.projectId() === lastPrefill) fields.setProject(prefill);
    lastPrefill = prefill;
  }

  const entryById = (id) => loadTimeTracking().timeEntries.find((e) => e.id === id);
  const rowOf = (id) => [...list.querySelectorAll('[data-entry-id]')].find((r) => r.dataset.entryId === id);
  const view = { selectedId: null, confirmingId: null, menuId: null };
  const rename = mountRowRename({
    rowOf,
    onDone(id, save, value) {
      const entry = entryById(id);
      if (save && entry) reportFailure(updateTimeEntry(id, { ...entry, description: value }));
      refresh();
    }
  });
  let visibleIds = [];
  let gaps = [];
  let displayedPrefs = null;
  const chipBox = container.querySelector('.tt-fill-chips');

  function redisplayOnFormatChange(prefs) {
    if (displayedPrefs && !sameDisplayPrefs(displayedPrefs, prefs)) {
      fields.redisplay();
      editor?.fields.redisplay();
    }
    displayedPrefs = prefs;
  }

  const weekStrip = mountWeekStrip(container, {
    getSettings,
    onOpenCurrentWeek,
    onSelectDay: (key) => list.querySelector(`[data-day="${key}"]`)?.scrollIntoView?.({ block: 'start' })
  });

  function refresh() {
    const tt = loadTimeTracking();
    const prefs = getPrefs();
    weekStrip.refresh(tt, prefs);
    redisplayOnFormatChange(prefs);
    followPrefill();
    filter.refresh();
    const activeFilter = filter.getFilter();
    const groups = groupEntriesByDay(filterEntries(tt, activeFilter), prefs);
    // A gap in a filtered list would hide other projects' entries: no gap rows, chips or f there.
    const isFiltered = Boolean(activeFilter.customerId || activeFilter.projectId);
    gaps = isFiltered ? [] : untrackedGaps(tt.timeEntries, prefs.tz);
    const dayEntries = new Map(groupEntriesByDay(tt.timeEntries, prefs).map((group) => [group.key, group.entries]));
    chipBox.innerHTML = fillChipsHtml(gaps, prefs);
    chipBox.hidden = chipBox.childElementCount === 0;
    visibleIds = groups.flatMap((group) => group.entries.map((e) => e.id));
    if (!visibleIds.includes(view.selectedId)) view.selectedId = null;
    if (!visibleIds.includes(view.confirmingId)) view.confirmingId = null;
    if (!visibleIds.includes(view.menuId)) view.menuId = null;
    fields.refreshProjects();
    count.textContent = `${visibleIds.length} ${visibleIds.length === 1 ? 'entry' : 'entries'}`;
    rename.beforeRender();
    list.innerHTML = entryListHtml(tt, prefs, groups, view, gaps, dayEntries);
    renderIcons(list);
    rename.afterRender();
    placeRowMenu();
  }

  // A row menu that would run under the bottom edge (on phones, under the pinned tab bar)
  // opens upward instead; re-placed on render, scroll and resize.
  function placeRowMenu() {
    const menu = list.querySelector('.tt-row-menu');
    const anchor = menu?.offsetParent;
    if (!anchor) return;
    const nav = doc.getElementById('tt-sidebar');
    const tabBarPinned = nav && win.getComputedStyle(nav).position === 'fixed';
    const visibleBottom = tabBarPinned ? nav.getBoundingClientRect().top : win.innerHeight;
    const { top, bottom } = anchor.getBoundingClientRect();
    const opensUp = rowMenuOpensUp({ anchorTop: top, anchorBottom: bottom, menuHeight: menu.offsetHeight, visibleBottom });
    menu.classList.toggle('tt-row-menu--up', opensUp);
  }
  const PLACEMENT_EVENTS = ['scroll', 'resize'];
  for (const type of PLACEMENT_EVENTS) win.addEventListener(type, placeRowMenu, { passive: true });

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

  function openEditor(id, focusField = 'description') {
    const entry = entryById(id);
    if (!entry || editor) return;
    const element = doc.createElement('div');
    element.id = 'tt-edit-modal';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'tt-edit-title');
    element.innerHTML = EDITOR_HTML;
    doc.body.appendChild(element);

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
    editorFields.focus(focusField);
  }

  function duplicate(id) {
    const result = duplicateTimeEntry(id, getPrefs().now);
    if (!reportFailure(result)) return;
    rememberLastUsedProject(result.timeEntry.projectId);
    select(result.timeEntry.id);
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

  function startRename(id) {
    const entry = entryById(id);
    if (!entry || rename.isActive() || editor || view.confirmingId) return;
    rename.start(id, entry.description);
    select(id);
  }

  function toggleMenu(id) {
    view.menuId = view.menuId === id ? null : id;
    refresh();
  }

  function closeMenu() {
    view.menuId = null;
    refresh();
  }

  const ROW_ACTION_HANDLERS = {
    edit: (id) => openEditor(id),
    'edit-project': (id) => openEditor(id, 'project'),
    'edit-times': (id) => openEditor(id, 'start'),
    duplicate,
    delete: askDelete,
    more: toggleMenu
  };

  // Fill: the gap's Date/Start/End go into the entry bar; Project and Description stay.
  function fillGap({ startMs, endMs }, { focus }) {
    fields.setTimes(startMs, endMs);
    if (focus) fields.focus();
    else bar.scrollIntoView?.({ block: 'nearest' });
  }

  const fillTapped = (button) => fillGap(gapOfFillButton(button), { focus: !isTouch() });

  chipBox.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.tt-fill-chip');
    if (chip) fillTapped(chip);
  });

  function fillGapBeforeSelected() {
    const entry = entryById(view.selectedId);
    const gap = entry && gapBefore(gaps, entry);
    if (gap) fillGap(gap, { focus: true });
  }

  list.addEventListener('click', (ev) => {
    const fillButton = ev.target.closest('.tt-gap-fill');
    if (fillButton) {
      fillTapped(fillButton);
      return;
    }
    const row = ev.target.closest('[data-entry-id]');
    if (!row || ev.target.closest('.tt-rename')) return;
    if (view.confirmingId) {
      const answer = ev.target.closest('[data-confirm]')?.dataset.confirm;
      if (answer === 'yes') confirmDelete();
      else if (answer === 'no') cancelDelete();
      return;
    }
    const id = row.dataset.entryId;
    const action = ev.target.closest('[data-action]')?.dataset.action;
    if (action !== 'more') view.menuId = null;
    select(id);
    if (ev.target.closest('[data-rename]')) startRename(id);
    else ROW_ACTION_HANDLERS[action]?.(id);
  });

  list.addEventListener('dblclick', (ev) => {
    const row = ev.target.closest('[data-entry-id]');
    if (row && !view.confirmingId && !ev.target.closest('[data-rename], .tt-rename')) openEditor(row.dataset.entryId);
  });

  container.querySelector('#tt-entry-add').addEventListener('click', () => fields.submit());

  // A tap outside the list closes an open row menu (the path survives the list re-rendering).
  const onDocumentClick = (ev) => {
    if (view.menuId && !ev.composedPath().includes(list)) closeMenu();
  };
  doc.addEventListener('click', onDocumentClick);

  reset();
  refresh();
  on(DATA_CHANGED, refresh);
  return {
    focusNewEntry: () => fields.focus(),
    focusFilter: () => filter.focus(),
    fillGapBeforeSelected,
    selectNext: () => moveSelection(1),
    selectPrev: () => moveSelection(-1),
    editSelected: () => view.selectedId && openEditor(view.selectedId),
    renameSelected: () => view.selectedId && startRename(view.selectedId),
    duplicateSelected: () => view.selectedId && duplicate(view.selectedId),
    deleteSelected: () => view.selectedId && askDelete(view.selectedId),
    confirmDelete,
    isEditing: () => editor !== null,
    isConfirming: () => view.confirmingId !== null,
    cancel() {
      if (view.confirmingId) cancelDelete();
      else if (view.menuId) closeMenu();
      else if (editor) closeEditor();
      else return false;
      return true;
    },
    unmount() {
      rename.beforeRender();
      closeEditor();
      off(DATA_CHANGED, refresh);
      doc.removeEventListener('click', onDocumentClick);
      for (const type of PLACEMENT_EVENTS) win.removeEventListener(type, placeRowMenu);
      for (const [target, type] of PAGE_RETURN_EVENTS) target.removeEventListener(type, onPageReturn);
      fields.unwire();
      filter.unmount();
    }
  };
}

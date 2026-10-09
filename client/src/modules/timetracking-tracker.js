import { loadTimeTracking } from './storage.js';
import { on, off, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { escapeHtml } from './security.js';
import { addTimeEntry, CRUD_ERROR } from './timetracking-crud.js';
import { showToast } from './timetracking-toast.js';
import { entryFieldsHtml, wireEntryFields } from './timetracking-entry-fields.js';
import { groupEntriesByDay, formatTime, formatDuration, plusDaysBetween } from './timetracking-time.js';

export const ENTRY_ERROR_MESSAGES = {
  [CRUD_ERROR.NO_PROJECT]: 'Select a project.',
  [CRUD_ERROR.ARCHIVED_PROJECT]: 'That project is archived.',
  [CRUD_ERROR.INVALID_TIME]: 'Enter a valid date and time.',
  [CRUD_ERROR.ZERO_DURATION]: 'Duration must be greater than zero.'
};

// Single seam for project prefill: default project (#170) and last-used project (#171) plug in here.
export function prefillProjectId() {
  return null;
}

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

function entryRowHtml(entry, tt, prefs) {
  const startMs = Date.parse(entry.start);
  const endMs = Date.parse(entry.end);
  const project = tt.projects.find((p) => p.id === entry.projectId);
  const customer = project && tt.customers.find((c) => c.id === project.customerId);
  const plusDays = plusDaysBetween(startMs, endMs, prefs.tz);
  return `
    <li class="tt-entry-row" data-entry-id="${escapeHtml(entry.id)}">
      <span class="tt-entry-desc${entry.description ? '' : ' tt-entry-desc-empty'}">${escapeHtml(entry.description || '(no description)')}</span>
      <span class="tt-entry-project"${project ? ` style="color:${escapeHtml(project.color)};"` : ''}>${escapeHtml(project?.name ?? 'Unknown project')}</span>
      <span class="tt-entry-customer">${escapeHtml(customer?.name ?? '')}</span>
      <span class="tt-entry-range"><span>${formatTime(startMs, prefs)} – ${formatTime(endMs, prefs)}</span>${plusDays > 0 ? `<sup class="tt-entry-plus" title="Ends ${plusDays} day(s) later">+${plusDays}</sup>` : ''}</span>
      <span class="tt-entry-duration">${formatDuration(endMs - startMs)}</span>
    </li>`;
}

function entryListHtml(tt, prefs) {
  if (tt.timeEntries.length === 0) return '<p class="tt-empty">No time entries yet.</p>';
  return groupEntriesByDay(tt.timeEntries, prefs).map((group) => {
    const heading = escapeHtml(group.heading);
    return `
      <div class="tt-day">
        <div class="tt-day-header">
          <h3 class="tt-day-heading">${heading}</h3>
          <span class="tt-day-total" aria-label="Total for ${heading}">${formatDuration(group.totalMs)}</span>
        </div>
        <ul class="tt-day-entries" aria-label="${heading}">
          ${group.entries.map((entry) => entryRowHtml(entry, tt, prefs)).join('')}
        </ul>
      </div>`;
  }).join('');
}

export function mountTrackerPanel(container, { getPrefs }) {
  container.innerHTML = PANEL_HTML;
  renderIcons(container);

  const bar = container.querySelector('.tt-entry-bar');
  const list = container.querySelector('.tt-entry-list');

  const fields = wireEntryFields(bar, {
    getPrefs,
    getTimeTracking: loadTimeTracking,
    onSubmit(result) {
      const saved = result.ok ? addTimeEntry(result.entry) : result;
      if (!saved.ok) {
        showToast(ENTRY_ERROR_MESSAGES[saved.reason]);
        return;
      }
      reset();
      fields.focus();
    }
  });

  function reset() {
    const now = Math.floor(getPrefs().now / 60000) * 60000;
    fields.setEntry({ projectId: prefillProjectId(), startMs: now, endMs: now });
  }

  function refresh() {
    fields.refreshProjects();
    list.innerHTML = entryListHtml(loadTimeTracking(), getPrefs());
  }

  container.querySelector('#tt-entry-add').addEventListener('click', () => fields.submit());

  reset();
  refresh();
  on(DATA_CHANGED, refresh);
  return {
    focusNewEntry: () => fields.focus(),
    unmount() {
      off(DATA_CHANGED, refresh);
      fields.unwire();
    }
  };
}

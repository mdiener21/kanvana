import { DEFAULT_APP_KEYBINDINGS, matchesKey } from './constants.js';
import { escapeHtml } from './security.js';
import { resolveLinkedFields, adjustLinkedField, describeEntryTimes } from './timetracking-time.js';
import { isProjectActive, projectById, customerById, CRUD_ERROR } from './timetracking-crud.js';

const { ttSubmitInline, ttAdjustUp, ttAdjustDown } = DEFAULT_APP_KEYBINDINGS;

const LINKED_FIELDS = ['date', 'start', 'end', 'duration'];
const ADJUSTABLE_FIELDS = ['start', 'end', 'duration'];
const ADJUST_STEP_MINUTES = 15;

// ── Project labels ─────────────────────────────────────────────────────────────

export function projectLabel(project, tt) {
  return `${customerById(tt, project.customerId)?.name ?? '?'} / ${project.name}`;
}

export function pickableProjects(tt) {
  return tt.projects.filter((p) => isProjectActive(p, tt));
}

// An exact label wins even when archived, so validation can name the real problem.
export function resolveProjectLabel(label, tt) {
  const query = String(label ?? '').trim().toLowerCase();
  if (!query) return null;
  const exact = tt.projects.find((p) => projectLabel(p, tt).toLowerCase() === query);
  if (exact) return exact.id;
  const matches = pickableProjects(tt).filter((p) => projectLabel(p, tt).toLowerCase().includes(query));
  return matches.length === 1 ? matches[0].id : null;
}

// ── Markup ─────────────────────────────────────────────────────────────────────

const fieldHtml = (prefix, field, label, inputHtml, head = '') => `
    <div class="tt-field tt-field-${field}">
      <div class="tt-field-head"><label class="tt-field-label" for="${prefix}-${field}">${label}</label>${head}</div>
      ${inputHtml}
    </div>`;

const textInput = (prefix, field, cls, attrs = '') =>
  `<input id="${prefix}-${field}" class="tt-input ${cls}" data-tt-field="${field}" type="text" autocomplete="off"${attrs}>`;

// Shared by the entry bar and the edit modal, so both show the same labelled fields.
export function entryFieldsHtml(prefix) {
  return `
    ${fieldHtml(prefix, 'description', 'Description',
      textInput(prefix, 'description', 'tt-entry-description', ' placeholder="What did you work on?" maxlength="500"'))}
    ${fieldHtml(prefix, 'project', 'Project', `
      <div class="tt-field-wrap">
        <span class="tt-color-dot tt-entry-project-dot" data-tt-project-dot aria-hidden="true" hidden></span>
        ${textInput(prefix, 'project', 'tt-entry-project', ` list="${prefix}-project-options" placeholder="Customer / Project"`)}
      </div>
      <datalist id="${prefix}-project-options"></datalist>`)}
    <div class="tt-time-block">
      ${fieldHtml(prefix, 'date', 'Date', textInput(prefix, 'date', 'tt-entry-date'))}
      ${fieldHtml(prefix, 'start', 'Start', textInput(prefix, 'start', 'tt-entry-time'))}
      <span class="tt-entry-arrow" aria-hidden="true">→</span>
      ${fieldHtml(prefix, 'end', 'End', textInput(prefix, 'end', 'tt-entry-time'),
        '<span class="tt-plus-day" data-tt-plus-day hidden>+1 day</span>')}
      ${fieldHtml(prefix, 'duration', 'Duration', textInput(prefix, 'duration', 'tt-entry-duration'))}
    </div>
  `;
}

// ── Behaviour ──────────────────────────────────────────────────────────────────

export function wireEntryFields(root, { getPrefs, getTimeTracking, onSubmit }) {
  const inputs = Object.fromEntries(
    [...root.querySelectorAll('[data-tt-field]')].map((input) => [input.dataset.ttField, input])
  );
  const plusDay = root.querySelector('[data-tt-plus-day]');
  const projectDot = root.querySelector('[data-tt-project-dot]');
  const projectOptions = root.querySelector('datalist');
  let lastValid = null;

  const typedValues = () => Object.fromEntries(LINKED_FIELDS.map((f) => [f, inputs[f].value]));

  function show(resolved) {
    lastValid = resolved;
    for (const f of LINKED_FIELDS) inputs[f].value = resolved.values[f];
    plusDay.hidden = resolved.plusDays < 1;
    plusDay.textContent = resolved.plusDays > 1 ? `+${resolved.plusDays} days` : '+1 day';
  }

  function showProjectDot() {
    const tt = getTimeTracking();
    const project = projectById(tt, resolveProjectLabel(inputs.project.value, tt));
    projectDot.hidden = !project;
    projectDot.style.background = project?.color ?? '';
  }

  function setProject(projectId) {
    const tt = getTimeTracking();
    const project = projectById(tt, projectId);
    inputs.project.value = project ? projectLabel(project, tt) : '';
    showProjectDot();
  }

  function normalise(field) {
    const resolved = resolveLinkedFields(typedValues(), field, getPrefs());
    if (resolved) show(resolved);
    else if (lastValid) show(lastValid);
  }

  function submit(field) {
    const changed = LINKED_FIELDS.includes(field) ? field : null;
    const resolved = resolveLinkedFields(typedValues(), changed, getPrefs());
    if (!resolved) {
      onSubmit({ ok: false, reason: CRUD_ERROR.INVALID_TIME });
      return;
    }
    show(resolved);
    onSubmit({
      ok: true,
      entry: {
        projectId: resolveProjectLabel(inputs.project.value, getTimeTracking()) ?? '',
        description: inputs.description.value,
        start: new Date(resolved.startMs).toISOString(),
        end: new Date(resolved.endMs).toISOString()
      }
    });
  }

  function onKeyDown(ev) {
    const field = ev.target.dataset?.ttField;
    if (!field) return;
    if (matchesKey(ev, ttSubmitInline)) {
      ev.preventDefault();
      submit(field);
      return;
    }
    if (!ADJUSTABLE_FIELDS.includes(field)) return;
    const step = matchesKey(ev, ttAdjustUp) ? ADJUST_STEP_MINUTES : matchesKey(ev, ttAdjustDown) ? -ADJUST_STEP_MINUTES : 0;
    if (!step) return;
    ev.preventDefault();
    const adjusted = adjustLinkedField(typedValues(), field, step, getPrefs());
    if (adjusted) show(adjusted);
  }

  const blurHandlers = LINKED_FIELDS.map((f) => [inputs[f], () => normalise(f)]);
  for (const [input, handler] of blurHandlers) input.addEventListener('blur', handler);
  root.addEventListener('keydown', onKeyDown);
  inputs.project.addEventListener('input', showProjectDot);

  return {
    setEntry({ description = '', projectId = null, startMs, endMs }) {
      inputs.description.value = description;
      setProject(projectId);
      show(describeEntryTimes(startMs, endMs, getPrefs()));
    },
    setProject,
    projectId: () => resolveProjectLabel(inputs.project.value, getTimeTracking()),
    redisplay() {
      if (lastValid) show(describeEntryTimes(lastValid.startMs, lastValid.endMs, getPrefs()));
    },
    refreshProjects() {
      const tt = getTimeTracking();
      projectOptions.innerHTML = pickableProjects(tt)
        .map((p) => `<option value="${escapeHtml(projectLabel(p, tt))}"></option>`)
        .join('');
    },
    focus() {
      inputs.description.focus();
    },
    submit,
    unwire() {
      for (const [input, handler] of blurHandlers) input.removeEventListener('blur', handler);
      root.removeEventListener('keydown', onKeyDown);
      inputs.project.removeEventListener('input', showProjectDot);
    }
  };
}

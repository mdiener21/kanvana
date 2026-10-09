import { beforeEach, describe, test, expect, vi } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import {
  initStorage, _resetStorageForTesting, _flushPersistsForTesting, loadGlobalSettings, loadTimeTracking
} from '../../../src/modules/storage.js';
import { scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';
import { on, off, EVENT_EMITTED } from '../../../src/modules/events.js';
import { addCustomer, addProject } from '../../../src/modules/timetracking-crud.js';
import {
  resolveTimeTrackingSettings, loadTimeTrackingSettings, saveTimeTrackingSettings, prefillProjectId
} from '../../../src/modules/timetracking-settings.js';
import { timeTrackingPrefs } from '../../../src/modules/timetracking-time.js';

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

beforeEach(async () => {
  resetLocalStorage();
  await deleteDB('kanvana-db');
  await initStorage();
});

describe('resolveTimeTrackingSettings (spec defaults and options)', () => {
  test('defaults: no default customer/project, DD.MM.YYYY, 24-hour, browser zone, h:mm', () => {
    expect(resolveTimeTrackingSettings(undefined)).toEqual({
      defaultCustomerId: null,
      defaultProjectId: null,
      dateFormat: 'DD.MM.YYYY',
      timeFormat: '24h',
      timezone: browserZone,
      durationFormat: 'h:mm'
    });
  });

  test('timezone falls back to Europe/Berlin when the browser reports none', () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: undefined });
    expect(resolveTimeTrackingSettings({}).timezone).toBe('Europe/Berlin');
    spy.mockRestore();
  });

  test('keeps valid choices', () => {
    const chosen = {
      defaultCustomerId: 'c1', defaultProjectId: 'p1', dateFormat: 'YYYY-MM-DD',
      timeFormat: '12h', timezone: 'America/New_York', durationFormat: 'decimal'
    };
    expect(resolveTimeTrackingSettings(chosen)).toEqual(chosen);
    expect(resolveTimeTrackingSettings({ dateFormat: 'MM/DD/YYYY' }).dateFormat).toBe('MM/DD/YYYY');
  });

  test('unknown options fall back to defaults', () => {
    const r = resolveTimeTrackingSettings({
      dateFormat: 'D/M/Y', timeFormat: '13h', timezone: 'Mars/Olympus', durationFormat: 'minutes', defaultProjectId: 42
    });
    expect(r).toMatchObject({
      dateFormat: 'DD.MM.YYYY', timeFormat: '24h', timezone: browserZone, durationFormat: 'h:mm', defaultProjectId: null
    });
  });
});

describe('timeTrackingPrefs maps settings to display preferences', () => {
  test('carries every display setting and now', () => {
    const settings = resolveTimeTrackingSettings({
      dateFormat: 'MM/DD/YYYY', timeFormat: '12h', timezone: 'UTC', durationFormat: 'decimal'
    });
    expect(timeTrackingPrefs(settings, 123)).toEqual({
      tz: 'UTC', dateFormat: 'MM/DD/YYYY', timeFormat: '12h', durationFormat: 'decimal', now: 123
    });
  });

  test('without settings uses the defaults', () => {
    expect(timeTrackingPrefs(undefined, 5)).toEqual({
      tz: browserZone, dateFormat: 'DD.MM.YYYY', timeFormat: '24h', durationFormat: 'h:mm', now: 5
    });
  });
});

describe('persistence in the global settings layer', () => {
  test('saving emits a global settings.updated event and lands in global settings', () => {
    const events = [];
    const listener = (ev) => events.push(ev.detail);
    on(EVENT_EMITTED, listener);
    saveTimeTrackingSettings({ dateFormat: 'YYYY-MM-DD' });
    off(EVENT_EMITTED, listener);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'settings.updated', scope: 'global', board_id: null });
    expect(events[0].payload.fields.timeTracking.dateFormat).toBe('YYYY-MM-DD');
    expect(loadGlobalSettings().timeTracking.dateFormat).toBe('YYYY-MM-DD');
    expect(loadTimeTrackingSettings().dateFormat).toBe('YYYY-MM-DD');
  });

  test('saved settings survive a session reset', async () => {
    saveTimeTrackingSettings({ timeFormat: '12h', durationFormat: 'decimal' });
    await _flushPersistsForTesting();
    _resetStorageForTesting();
    await initStorage();
    expect(loadTimeTrackingSettings()).toMatchObject({ timeFormat: '12h', durationFormat: 'decimal' });
  });

  test('a synced settings.updated event from another device is applied', () => {
    scheduleDomainEvent({
      type: 'settings.updated',
      scope: 'global',
      entityId: 'global',
      payload: { fields: { timeTracking: { timezone: 'Asia/Tokyo' } } }
    });
    expect(loadTimeTrackingSettings().timezone).toBe('Asia/Tokyo');
  });

  test('saving one setting keeps the others', () => {
    saveTimeTrackingSettings({ timeFormat: '12h' });
    saveTimeTrackingSettings({ dateFormat: 'MM/DD/YYYY' });
    expect(loadTimeTrackingSettings()).toMatchObject({ timeFormat: '12h', dateFormat: 'MM/DD/YYYY' });
  });
});

describe('default customer and project', () => {
  function seed() {
    const acme = addCustomer('Acme').customer;
    const beta = addCustomer('Beta').customer;
    const site = addProject(acme.id, 'Website').project;
    scheduleDomainEvent({
      type: 'project.created', scope: 'timetracking', entityId: 'p-old',
      payload: { project: { customerId: beta.id, name: 'Old', color: '#000', archived: true } }
    });
    const app = addProject(beta.id, 'App').project;
    return { acme, beta, site, app };
  }

  test('changing the default customer resets the project to its first active project', () => {
    const { acme, beta, site, app } = seed();
    saveTimeTrackingSettings({ defaultCustomerId: acme.id });
    expect(loadTimeTrackingSettings()).toMatchObject({ defaultCustomerId: acme.id, defaultProjectId: site.id });
    saveTimeTrackingSettings({ defaultCustomerId: beta.id });
    expect(loadTimeTrackingSettings()).toMatchObject({ defaultCustomerId: beta.id, defaultProjectId: app.id });
  });

  test('the default project can be changed within the default customer', () => {
    const { acme, site } = seed();
    const other = addProject(acme.id, 'Shop').project;
    saveTimeTrackingSettings({ defaultCustomerId: acme.id });
    saveTimeTrackingSettings({ defaultProjectId: other.id });
    expect(loadTimeTrackingSettings().defaultProjectId).toBe(other.id);
    expect(other.id).not.toBe(site.id);
  });

  test('clearing the default customer clears the project', () => {
    const { acme } = seed();
    saveTimeTrackingSettings({ defaultCustomerId: acme.id });
    saveTimeTrackingSettings({ defaultCustomerId: null });
    expect(loadTimeTrackingSettings()).toMatchObject({ defaultCustomerId: null, defaultProjectId: null });
  });

  test('prefillProjectId uses the default project while it is active', () => {
    const { acme, site } = seed();
    saveTimeTrackingSettings({ defaultCustomerId: acme.id });
    expect(prefillProjectId(loadTimeTracking(), loadTimeTrackingSettings())).toBe(site.id);
  });

  test('prefillProjectId is empty without a default or once the default is no longer active', () => {
    const { acme, site } = seed();
    expect(prefillProjectId(loadTimeTracking(), loadTimeTrackingSettings())).toBeNull();
    saveTimeTrackingSettings({ defaultCustomerId: acme.id });
    const tt = loadTimeTracking();
    const archived = { ...tt, projects: tt.projects.map((p) => (p.id === site.id ? { ...p, archived: true } : p)) };
    expect(prefillProjectId(archived, loadTimeTrackingSettings())).toBeNull();
  });
});

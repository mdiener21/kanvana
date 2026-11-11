import { describe, test, expect, beforeEach } from 'vitest';
import { deleteDB } from 'idb';
import { resetLocalStorage } from '../setup.js';
import { applyEvents, createProjectionState } from '../../../src/modules/reducer.js';
import { initStorage, loadGlobalSettings, loadTimeTracking } from '../../../src/modules/storage.js';
import { scheduleDomainEvent } from '../../../src/modules/event-sourcing/emitter.js';
import { on, off, EVENT_EMITTED } from '../../../src/modules/events.js';
import { addCustomer, addProject, addTimeEntry } from '../../../src/modules/timetracking-crud.js';
import { customerBalance, periodBalance } from '../../../src/modules/timetracking-balance.js';
import { periodOf } from '../../../src/modules/timetracking-report.js';
import { legacyWorkWeekMigration, migrateLegacyWorkWeek } from '../../../src/modules/timetracking-legacy-work-week.js';

const acme = { id: 'c1', name: 'Acme', color: '#000000', archived: false, weeklyHours: null, workdays: [1, 2, 3, 4, 5] };
const ttOf = (customers = [acme]) => ({ customers, projects: [], timeEntries: [] });
const LEGACY = { defaultCustomerId: 'c1', dateFormat: 'YYYY-MM-DD', weeklyHours: 38.5, workdays: [1, 2, 3, 4, 6] };
const CLEARED = { defaultCustomerId: 'c1', dateFormat: 'YYYY-MM-DD' };

const settingsClear = (timeTracking) => ({
  type: 'settings.updated', scope: 'global', entityId: 'timeTracking', payload: { fields: { timeTracking } }
});

// Emitter inputs -> stored events, so the migration's output can be fed back through the reducer.
const asEvents = (inputs) => inputs.map((input, i) => ({
  id: `e${i}`, type: input.type, hlc: { wallTime: 1000 + i, counter: 0, nodeId: 'n' }, at: '2026-01-01T00:00:00.000Z',
  actor: { type: 'human', id: null }, scope: input.scope, board_id: null, entity_id: input.entityId, payload: input.payload
}));

describe('legacyWorkWeekMigration', () => {
  test('legacy values plus a Default customer without Weekly hours: patch the Customer and clear the settings', () => {
    expect(legacyWorkWeekMigration(LEGACY, ttOf())).toEqual([
      {
        type: 'customer.updated', scope: 'timetracking', entityId: 'c1',
        payload: {
          fields: { weeklyHours: 38.5, workdays: [1, 2, 3, 4, 6] },
          before: { weeklyHours: null, workdays: [1, 2, 3, 4, 5] }
        }
      },
      settingsClear(CLEARED)
    ]);
  });

  test('legacy Weekly hours without Workdays move with the Mon–Fri default', () => {
    const [patch] = legacyWorkWeekMigration({ defaultCustomerId: 'c1', weeklyHours: 40 }, ttOf());
    expect(patch.payload.fields).toEqual({ weeklyHours: 40, workdays: [1, 2, 3, 4, 5] });
  });

  test('no Default customer: clear the settings only', () => {
    const { defaultCustomerId, ...noDefault } = LEGACY;
    expect(legacyWorkWeekMigration(noDefault, ttOf())).toEqual([settingsClear({ dateFormat: 'YYYY-MM-DD' })]);
  });

  test('a Default customer that is not in the Time Tracking state: clear the settings only', () => {
    expect(legacyWorkWeekMigration(LEGACY, ttOf([]))).toEqual([settingsClear(CLEARED)]);
  });

  test('a Default customer that already has Weekly hours: clear the settings only', () => {
    expect(legacyWorkWeekMigration(LEGACY, ttOf([{ ...acme, weeklyHours: 20 }]))).toEqual([settingsClear(CLEARED)]);
  });

  test('legacy Workdays alone, or Weekly hours switched off, only clear the settings', () => {
    expect(legacyWorkWeekMigration({ defaultCustomerId: 'c1', workdays: [1, 2] }, ttOf())).toEqual([
      settingsClear({ defaultCustomerId: 'c1' })
    ]);
    expect(legacyWorkWeekMigration({ defaultCustomerId: 'c1', weeklyHours: null }, ttOf())).toEqual([
      settingsClear({ defaultCustomerId: 'c1' })
    ]);
  });

  test('nothing legacy: no events', () => {
    expect(legacyWorkWeekMigration(CLEARED, ttOf())).toEqual([]);
    expect(legacyWorkWeekMigration(undefined, ttOf())).toEqual([]);
  });

  test('running it on its own output: no events', () => {
    const before = createProjectionState({ timeTracking: ttOf(), globalSettings: { timeTracking: LEGACY } });
    const after = applyEvents(before, asEvents(legacyWorkWeekMigration(LEGACY, before.timeTracking)));
    expect(after.globalSettings.timeTracking).toEqual(CLEARED);
    expect(after.timeTracking.customers[0]).toMatchObject({ weeklyHours: 38.5, workdays: [1, 2, 3, 4, 6] });
    expect(legacyWorkWeekMigration(after.globalSettings.timeTracking, after.timeTracking)).toEqual([]);
  });

  test('two devices running it on the same state emit the same events', () => {
    expect(legacyWorkWeekMigration(LEGACY, ttOf())).toEqual(legacyWorkWeekMigration(structuredClone(LEGACY), ttOf()));
  });
});

describe('migrateLegacyWorkWeek on a loaded read model', () => {
  const H = 60 * 60 * 1000;
  const opts = { now: Date.parse('2026-11-11T12:00:00Z'), tz: 'UTC' };
  const OCT = periodOf('month', { y: 2026, m: 10, d: 1 });
  let acmeId;

  beforeEach(async () => {
    resetLocalStorage();
    await deleteDB('kanvana-db');
    await initStorage();
    acmeId = addCustomer('Acme').customer.id;
    const globexId = addCustomer('Globex').customer.id;
    const website = addProject(acmeId, 'Website').project.id;
    const support = addProject(globexId, 'Support').project.id;
    addTimeEntry({ projectId: website, start: '2026-10-05T08:00:00Z', end: '2026-10-05T16:00:00Z' });
    addTimeEntry({ projectId: website, start: '2026-10-20T08:00:00Z', end: '2026-10-20T10:30:00Z' });
    addTimeEntry({ projectId: support, start: '2026-10-06T08:00:00Z', end: '2026-10-06T12:00:00Z' });
    scheduleDomainEvent({
      type: 'settings.updated', scope: 'global', entityId: 'timeTracking',
      payload: { fields: { timeTracking: { defaultCustomerId: acmeId, weeklyHours: 30, workdays: [1, 2, 3] } } }
    });
  });

  test('the Default customer keeps the same Balance as before the upgrade', async () => {
    // Before the upgrade the Balance was the Default customer's entries against the global Work week.
    const tt = loadTimeTracking();
    const projectIds = new Set(tt.projects.filter((p) => p.customerId === acmeId).map((p) => p.id));
    const before = periodBalance(
      tt.timeEntries.filter((e) => projectIds.has(e.projectId)), OCT, { weeklyHours: 30, workdays: [1, 2, 3] }, opts
    );
    expect(before).toEqual({ loggedMs: 10.5 * H, targetMs: 12 * 10 * H, balanceMs: 10.5 * H - 120 * H });

    await migrateLegacyWorkWeek();

    expect(customerBalance(loadTimeTracking(), acmeId, OCT, opts)).toEqual(before);
    expect(loadGlobalSettings().timeTracking).toEqual({ defaultCustomerId: acmeId });
  });

  test("emits through the normal emitter with the user's actor, and only once", async () => {
    const emitted = [];
    const listener = (ev) => emitted.push(ev.detail);
    on(EVENT_EMITTED, listener);
    await migrateLegacyWorkWeek();
    await migrateLegacyWorkWeek();
    off(EVENT_EMITTED, listener);
    expect(emitted.map((e) => [e.type, e.actor])).toEqual([
      ['customer.updated', { type: 'human', id: null }],
      ['settings.updated', { type: 'human', id: null }]
    ]);
  });
});

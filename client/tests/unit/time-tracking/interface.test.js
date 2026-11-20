import { describe, test, expect, vi } from 'vitest';
import { createTestTimeTracking } from '../../fixtures/time-tracking.js';

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const WEBSITE = { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false };
const ENTRY = { id: 'e1', projectId: 'p1', description: 'Standup', start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' };

const seeded = (seed = {}) => createTestTimeTracking({ customers: [ACME], projects: [WEBSITE], ...seed });

describe('Time Tracking interface (test adapter, real reducer)', () => {
  test('a command emits its event and the reducer shows it in the state', () => {
    const tt = seeded();
    const result = tt.addTimeEntry({ projectId: 'p1', description: ' Review ', start: ENTRY.start, end: ENTRY.end });
    expect(result.ok).toBe(true);
    expect(tt.emitted).toEqual([expect.objectContaining({ type: 'time_entry.created', scope: 'timetracking' })]);
    expect(tt.state().timeEntries).toEqual([expect.objectContaining({ id: result.timeEntry.id, description: 'Review' })]);
  });

  test('subscribers hear every change until they unsubscribe', () => {
    const tt = seeded();
    const listener = vi.fn();
    const unsubscribe = tt.subscribe(listener);
    tt.addCustomer('Beta');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    tt.addCustomer('Gamma');
    expect(listener).toHaveBeenCalledOnce();
  });

  test('a rejected command emits nothing', () => {
    const tt = seeded();
    expect(tt.addCustomer(' acme ')).toEqual({ ok: false, reason: 'DUPLICATE_NAME' });
    expect(tt.emitted).toEqual([]);
  });

  test('settings resolve from the stored ones, and saving them goes through the reducer', () => {
    const tt = seeded({ settings: { timezone: 'Asia/Tokyo', dateFormat: 'YYYY-MM-DD' } });
    expect(tt.settings()).toMatchObject({ timezone: 'Asia/Tokyo', dateFormat: 'YYYY-MM-DD', defaultCustomerId: null });
    expect(tt.prefs()).toMatchObject({ tz: 'Asia/Tokyo', dateFormat: 'YYYY-MM-DD' });
    tt.saveSettings({ defaultCustomerId: 'c1' });
    expect(tt.settings()).toMatchObject({ timezone: 'Asia/Tokyo', defaultCustomerId: 'c1', defaultProjectId: 'p1' });
  });

  test('device prefs stay on the device and emit nothing', () => {
    const tt = seeded();
    expect(tt.lastUsedProjectId()).toBeNull();
    tt.rememberLastUsedProject('p1');
    tt.rememberReportPeriodKind('month');
    expect(tt.lastUsedProjectId()).toBe('p1');
    expect(tt.reportPeriodKind()).toBe('month');
    expect(tt.emitted).toEqual([]);
  });

  test('a received event (another device) is folded like a local one, without counting as emitted', () => {
    const tt = seeded({ timeEntries: [ENTRY] });
    const listener = vi.fn();
    tt.subscribe(listener);
    tt.receive({ type: 'project.deleted', scope: 'timetracking', entityId: 'p1', payload: { project: WEBSITE } });
    // Guarded delete: the project is in use, so the reducer archives it instead.
    expect(tt.state().projects).toEqual([{ ...WEBSITE, archived: true }]);
    expect(listener).toHaveBeenCalledOnce();
    expect(tt.emitted).toEqual([]);
  });
});

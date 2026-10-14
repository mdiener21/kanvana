import { describe, test, expect } from 'vitest';
import { summarizeMonth, currentMonth, shiftMonth, monthLabel } from '../../../src/modules/timetracking-report.js';

const TZ = 'Europe/Berlin';
const H = 3600000;
const OCT = { y: 2026, m: 10 };
const NOV = { y: 2026, m: 11 };

const tt = {
  customers: [
    { id: 'c1', name: 'Acme', color: '#000' },
    { id: 'c2', name: 'Globex', color: '#111' }
  ],
  projects: [
    { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4' },
    { id: 'p2', customerId: 'c1', name: 'Backend', color: '#e91e63' },
    { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a' }
  ]
};

const entry = (id, projectId, start, end) => ({ id, projectId, description: '', start, end });

describe('summarizeMonth — Attribution', () => {
  // 31 Oct 22:00 → 1 Nov 02:00 Europe/Berlin (CET, UTC+1)
  const overnight = entry('overnight', 'p1', '2026-10-31T21:00:00.000Z', '2026-11-01T01:00:00.000Z');

  test('an entry from the last day of a month 22:00 to 02:00 next day counts entirely to the earlier month', () => {
    const october = summarizeMonth(tt, [overnight], OCT, TZ);
    expect(october.totalMs).toBe(4 * H);
    expect(october.entryCount).toBe(1);
    expect(october.days[30]).toMatchObject({ day: 31, totalMs: 4 * H });

    const november = summarizeMonth(tt, [overnight], NOV, TZ);
    expect(november.totalMs).toBe(0);
    expect(november.entryCount).toBe(0);
    expect(november.days[0].totalMs).toBe(0);
  });

  test('the month is taken from the start in the user timezone, not UTC', () => {
    const late = entry('late', 'p1', '2026-10-31T23:30:00.000Z', '2026-11-01T00:30:00.000Z');
    expect(summarizeMonth(tt, [late], NOV, TZ)).toMatchObject({ totalMs: H, entryCount: 1 });
    expect(summarizeMonth(tt, [late], OCT, TZ).entryCount).toBe(0);
    expect(summarizeMonth(tt, [late], OCT, 'UTC').entryCount).toBe(1);
  });
});

describe('summarizeMonth — totals and grouping', () => {
  const entries = [
    entry('a', 'p1', '2026-10-01T07:00:00.000Z', '2026-10-01T08:00:00.000Z'),
    entry('b', 'p2', '2026-10-01T09:00:00.000Z', '2026-10-01T09:30:00.000Z'),
    entry('c', 'p3', '2026-10-02T07:00:00.000Z', '2026-10-02T09:00:00.000Z'),
    entry('d', 'p1', '2026-10-15T07:00:00.000Z', '2026-10-15T07:45:00.000Z'),
    entry('other-month', 'p3', '2026-09-30T07:00:00.000Z', '2026-09-30T17:00:00.000Z')
  ];
  const s = summarizeMonth(tt, entries, OCT, TZ);

  test('KPIs: total duration, number of entries, number of projects in the month', () => {
    expect(s.totalMs).toBe(4.25 * H);
    expect(s.entryCount).toBe(4);
    expect(s.projectCount).toBe(3);
  });

  test('one day bucket per calendar day of the month, with per-project durations', () => {
    expect(s.days).toHaveLength(31);
    expect(s.days.map((d) => d.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(s.days[0]).toEqual({ day: 1, totalMs: 1.5 * H, byProject: { p1: H, p2: 0.5 * H } });
    expect(s.days[1]).toEqual({ day: 2, totalMs: 2 * H, byProject: { p3: 2 * H } });
    expect(s.days[2]).toEqual({ day: 3, totalMs: 0, byProject: {} });
    expect(summarizeMonth(tt, [], { y: 2028, m: 2 }, TZ).days).toHaveLength(29);
  });

  test('customers sorted by total, projects sorted by total within, with share of the month', () => {
    expect(s.customers.map((c) => [c.name, c.totalMs])).toEqual([
      ['Acme', 2.25 * H],
      ['Globex', 2 * H]
    ]);
    expect(s.customers[0].projects.map((p) => [p.name, p.totalMs, p.color])).toEqual([
      ['Website', 1.75 * H, '#03a9f4'],
      ['Backend', 0.5 * H, '#e91e63']
    ]);
    expect(s.customers[1].projects[0].share).toBeCloseTo(2 / 4.25);
  });

  test('customer subtotals add up to the grand total, project totals to their customer', () => {
    const sum = (xs) => xs.reduce((acc, x) => acc + x.totalMs, 0);
    expect(sum(s.customers)).toBe(s.totalMs);
    for (const customer of s.customers) expect(sum(customer.projects)).toBe(customer.totalMs);
    expect(sum(s.days)).toBe(s.totalMs);
  });

  test('projects list every project tracked in the month, sorted by total, for the chart legend', () => {
    expect(s.projects.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
  });

  test('equal totals fall back to name order', () => {
    const tied = summarizeMonth(tt, [
      entry('x', 'p3', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z'),
      entry('y', 'p1', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z')
    ], OCT, TZ);
    expect(tied.customers.map((c) => c.name)).toEqual(['Acme', 'Globex']);
  });

  test('an entry whose project no longer exists is kept under an unknown customer / project', () => {
    const ghost = summarizeMonth(tt, [entry('g', 'gone', '2026-10-05T07:00:00.000Z', '2026-10-05T08:00:00.000Z')], OCT, TZ);
    expect(ghost.totalMs).toBe(H);
    expect(ghost.customers).toMatchObject([{ name: 'Unknown customer', projects: [{ name: 'Unknown project' }] }]);
  });

  test('an empty month has zero totals and no rows', () => {
    const empty = summarizeMonth(tt, entries, { y: 2026, m: 12 }, TZ);
    expect(empty).toMatchObject({ totalMs: 0, entryCount: 0, projectCount: 0, customers: [], projects: [] });
  });
});

describe('month navigation helpers', () => {
  test('currentMonth is the month of now in the user timezone', () => {
    expect(currentMonth(Date.parse('2026-10-31T23:30:00.000Z'), TZ)).toEqual(NOV);
    expect(currentMonth(Date.parse('2026-10-31T23:30:00.000Z'), 'UTC')).toEqual(OCT);
  });

  test('shiftMonth steps across year boundaries', () => {
    expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth({ y: 2026, m: 1 }, -1)).toEqual({ y: 2025, m: 12 });
    expect(shiftMonth(OCT, 0)).toEqual(OCT);
  });

  test('monthLabel names the month and year', () => {
    expect(monthLabel(OCT)).toBe('October 2026');
    expect(monthLabel({ y: 2027, m: 1 })).toBe('January 2027');
  });
});

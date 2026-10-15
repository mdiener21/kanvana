import { describe, test, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/dom';
import { mountToBody } from '../setup.js';
import { mountEntryFilter } from '../../../src/modules/timetracking-filter.js';

const ACME = { id: 'c1', name: 'Acme', color: '#000000', archived: false };
const OLD_CO = { id: 'c2', name: 'Old Co', color: '#111111', archived: true };
const tt = {
  customers: [ACME, OLD_CO],
  projects: [
    { id: 'p1', customerId: 'c1', name: 'Website', color: '#03a9f4', archived: false },
    { id: 'p2', customerId: 'c1', name: 'Legacy', color: '#e91e63', archived: true },
    { id: 'p3', customerId: 'c2', name: 'Support', color: '#8bc34a', archived: false }
  ],
  timeEntries: []
};

let filter = null;
afterEach(() => { filter?.unmount(); filter = null; });

function mount(onChange = vi.fn()) {
  const host = mountToBody('<div id="host"></div>').querySelector('#host');
  filter = mountEntryFilter(host, { getTimeTracking: () => tt, onChange });
  return onChange;
}

const customerSelect = () => screen.getByLabelText('Filter by customer');
const projectSelect = () => screen.getByLabelText('Filter by project');
const optionLabels = (select) => [...select.querySelectorAll('option')].map((o) => o.textContent);
const choose = (select, value) => fireEvent.change(select, { target: { value } });

describe('entry filter controls (standalone, reusable)', () => {
  test('mount into any container with both selects defaulting to All', () => {
    mount();
    expect(customerSelect().value).toBe('');
    expect(projectSelect().value).toBe('');
    expect(filter.getFilter()).toEqual({ customerId: null, projectId: null });
  });

  test('archived customers and projects are listed and marked as archived', () => {
    mount();
    expect(optionLabels(customerSelect())).toEqual(['All customers', 'Acme', 'Old Co (archived)']);
    expect(optionLabels(projectSelect())).toEqual(['All projects', 'Website', 'Legacy (archived)', 'Support']);
    const groups = [...projectSelect().querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Acme', 'Old Co (archived)']);
  });

  test('choosing a customer limits the project options to that customer', () => {
    mount();
    choose(customerSelect(), 'c2');
    expect(optionLabels(projectSelect())).toEqual(['All projects', 'Support']);
    choose(customerSelect(), 'c1');
    expect(optionLabels(projectSelect())).toEqual(['All projects', 'Website', 'Legacy (archived)']);
  });

  test('choosing a customer clears an incompatible project, keeps a compatible one', () => {
    const onChange = mount();
    choose(projectSelect(), 'p1');
    expect(onChange).toHaveBeenLastCalledWith({ customerId: null, projectId: 'p1' });

    choose(customerSelect(), 'c1');
    expect(projectSelect().value).toBe('p1');
    expect(onChange).toHaveBeenLastCalledWith({ customerId: 'c1', projectId: 'p1' });

    choose(customerSelect(), 'c2');
    expect(projectSelect().value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith({ customerId: 'c2', projectId: null });
  });

  test('"All" resets each filter', () => {
    const onChange = mount();
    choose(customerSelect(), 'c1');
    choose(projectSelect(), 'p2');
    choose(projectSelect(), '');
    expect(onChange).toHaveBeenLastCalledWith({ customerId: 'c1', projectId: null });
    choose(customerSelect(), '');
    expect(onChange).toHaveBeenLastCalledWith({ customerId: null, projectId: null });
    expect(optionLabels(projectSelect())).toHaveLength(4);
  });

  test('focus() focuses the customer filter', () => {
    mount();
    filter.focus();
    expect(document.activeElement).toBe(customerSelect());
  });

  test('refresh() picks up renamed / removed data and drops a selection that no longer fits', () => {
    const onChange = mount();
    choose(customerSelect(), 'c2');
    choose(projectSelect(), 'p3');
    onChange.mockClear();
    const saved = tt.projects;
    tt.projects = saved.map((p) => (p.id === 'p3' ? { ...p, customerId: 'c1' } : p));
    try {
      filter.refresh();
      expect(projectSelect().value).toBe('');
      expect(filter.getFilter()).toEqual({ customerId: 'c2', projectId: null });
      expect(onChange).toHaveBeenCalledWith({ customerId: 'c2', projectId: null });
    } finally {
      tt.projects = saved;
    }
  });

  test('two instances on one page do not clash', () => {
    const host = mountToBody('<div id="a"></div><div id="b"></div>');
    const a = mountEntryFilter(host.querySelector('#a'), { getTimeTracking: () => tt, onChange: vi.fn() });
    const b = mountEntryFilter(host.querySelector('#b'), { getTimeTracking: () => tt, onChange: vi.fn() });
    fireEvent.change(within(host.querySelector('#a')).getByLabelText('Filter by customer'), { target: { value: 'c1' } });
    expect(a.getFilter().customerId).toBe('c1');
    expect(b.getFilter().customerId).toBeNull();
    a.unmount();
    b.unmount();
  });
});

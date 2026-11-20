import type { ActionItem, Incident } from '../model';
import { distinctSystems, filterIncidents, groupOpenActions, isFiltered, NO_FILTERS } from './log';

const NOW = new Date('2026-11-20T09:00:00.000Z');

const inc = (id: string, over: Partial<Incident>): Incident => ({
  id,
  title: `Incident ${id}`,
  system: 'Orders',
  severity: 'sev3',
  category: 'other',
  startedAt: '2026-11-10T08:00:00Z',
  detectedAt: null,
  resolvedAt: null,
  summary: null,
  rootCause: null,
  fix: null,
  prevention: null,
  status: 'open',
  reporterSub: 's',
  reporterName: 'R',
  createdAt: '2026-11-10T08:00:00Z',
  ...over,
});

const act = (id: string, over: Partial<ActionItem>): ActionItem => ({
  id,
  incidentId: 'a',
  title: `Action ${id}`,
  ownerName: 'Priya',
  dueDate: null,
  done: false,
  createdBySub: 's',
  createdAt: '2026-11-10T08:00:00Z',
  ...over,
});

describe('log filters', () => {
  const rows = [
    inc('a', { severity: 'sev1', category: 'schema_change', startedAt: '2026-11-01T08:00:00Z' }),
    inc('b', { system: 'orders ', status: 'resolved', startedAt: '2026-11-15T08:00:00Z' }),
    inc('c', { system: 'Finance', startedAt: '2026-10-01T08:00:00Z' }),
  ];

  it('sorts by start time, newest first', () => {
    expect(filterIncidents(rows, NO_FILTERS).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });

  it('filters by each field and by date range', () => {
    expect(filterIncidents(rows, { ...NO_FILTERS, severity: 'sev1' }).map((r) => r.id)).toEqual(['a']);
    expect(filterIncidents(rows, { ...NO_FILTERS, category: 'schema_change' }).map((r) => r.id)).toEqual(['a']);
    expect(filterIncidents(rows, { ...NO_FILTERS, system: 'Orders' }).map((r) => r.id)).toEqual(['b', 'a']);
    expect(filterIncidents(rows, { ...NO_FILTERS, status: 'resolved' }).map((r) => r.id)).toEqual(['b']);
    const ranged = { ...NO_FILTERS, from: '2026-10-15T00:00:00Z', to: '2026-11-10T00:00:00Z' };
    expect(filterIncidents(rows, ranged).map((r) => r.id)).toEqual(['a']);
    expect(isFiltered(ranged)).toBe(true);
  });

  it('lists distinct systems case-insensitively', () => {
    expect(distinctSystems(rows)).toEqual(['Finance', 'Orders']);
  });
});

describe('groupOpenActions', () => {
  it('groups open items by owner: owners with overdue items first, overdue items first', () => {
    const items = [
      act('1', { ownerName: 'Sam', dueDate: '2026-12-01T00:00:00Z' }),
      act('2', { ownerName: 'priya', dueDate: '2026-11-25T00:00:00Z' }),
      act('3', { ownerName: 'Priya', dueDate: '2026-11-01T00:00:00Z' }), // overdue
      act('4', { ownerName: 'Priya' }), // no due date: last
      act('5', { ownerName: 'Sam', done: true, dueDate: '2026-10-01T00:00:00Z' }), // done: hidden
      act('6', { ownerName: 'Alex', dueDate: '2026-11-21T00:00:00Z' }),
    ];
    const groups = groupOpenActions(items, [{ id: 'a', title: 'Orders failed' }], NOW);
    expect(groups.map((g) => g.owner)).toEqual(['priya', 'Alex', 'Sam']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['3', '2', '4']);
    expect(groups[0].overdue).toBe(1);
    expect(groups[0].items[0]).toMatchObject({ overdue: true, incidentTitle: 'Orders failed' });
    expect(groups.flatMap((g) => g.items).some((i) => i.id === '5')).toBe(false);
  });
});

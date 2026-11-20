import { FIXED_NOW } from '@x10/shared/test';

import type { Incident } from '../model';
import {
  busiestSlot,
  computeTrends,
  countByCategory,
  inRange,
  lastDays,
  localSlot,
  medianTtrByMonth,
  topSystems,
  utcMonth,
  weekdayHourMatrix,
} from './trends';

let n = 0;
function inc(over: Partial<Incident>): Incident {
  n += 1;
  return {
    id: `i${n}`,
    title: 'Something failed',
    system: 'A',
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
  };
}

describe('trends', () => {
  it('filters by an inclusive range', () => {
    const r = lastDays(FIXED_NOW, 10);
    const rows = [inc({ startedAt: r.from }), inc({ startedAt: '2026-11-01T00:00:00Z' }), inc({ startedAt: r.to })];
    expect(inRange(rows, r)).toHaveLength(2);
  });

  it('counts every category, zeros included', () => {
    const c = countByCategory([inc({ category: 'capacity' }), inc({ category: 'capacity' }), inc({ category: 'config' })]);
    expect(c).toHaveLength(8);
    expect(c.find((x) => x.category === 'capacity')?.count).toBe(2);
    expect(c.find((x) => x.category === 'permissions')?.count).toBe(0);
  });

  it('takes the median time to resolve per UTC month', () => {
    const rows = [
      inc({ startedAt: '2026-10-01T00:00:00Z', resolvedAt: '2026-10-01T01:00:00Z' }),
      inc({ startedAt: '2026-10-05T00:00:00Z', resolvedAt: '2026-10-05T03:00:00Z' }),
      inc({ startedAt: '2026-10-09T00:00:00Z', resolvedAt: '2026-10-09T05:00:00Z' }),
      inc({ startedAt: '2026-11-02T00:00:00Z', resolvedAt: '2026-11-02T00:30:00Z' }),
      inc({ startedAt: '2026-11-03T00:00:00Z' }), // open: ignored
      inc({ startedAt: '2026-09-30T23:30:00Z', resolvedAt: '2026-10-01T00:30:00Z' }), // September in UTC
    ];
    expect(medianTtrByMonth(rows)).toEqual([
      { month: '2026-09', label: 'Sep 2026', medianHours: 1, resolved: 1 },
      { month: '2026-10', label: 'Oct 2026', medianHours: 3, resolved: 3 },
      { month: '2026-11', label: 'Nov 2026', medianHours: 0.5, resolved: 1 },
    ]);
    expect(utcMonth('2026-12-31T23:59:00Z')).toBe('2026-12');
  });

  it('ranks the top systems, ties by name', () => {
    const rows = ['B', 'A', 'B', 'C', 'A', 'D', 'E', 'F', 'B'].map((s) => inc({ system: s }));
    expect(topSystems(rows, 3)).toEqual([
      { system: 'B', count: 3 },
      { system: 'A', count: 2 },
      { system: 'C', count: 1 },
    ]);
  });

  it('groups systems case- and space-insensitively and shows the most common spelling', () => {
    const rows = ['Orders ingest', 'orders  ingest ', 'Orders ingest', 'ORDERS INGEST', 'Finance', 'finance', ' '].map((s) =>
      inc({ system: s }),
    );
    expect(topSystems(rows)).toEqual([
      { system: 'Orders ingest', count: 4 },
      { system: 'Finance', count: 2 }, // tie between spellings: the first seen wins
    ]);
  });

  it('buckets the heatmap by local weekday (Monday first) and hour', () => {
    // Built from local time, so the test holds in any time zone.
    const monday9 = new Date(2026, 10, 16, 9, 15).toISOString(); // Mon 16 Nov 2026, 09:15 local
    const sunday23 = new Date(2026, 10, 15, 23, 59).toISOString();
    expect(localSlot(monday9)).toEqual({ weekday: 0, hour: 9 });
    expect(localSlot(sunday23)).toEqual({ weekday: 6, hour: 23 });
    const m = weekdayHourMatrix([inc({ startedAt: monday9 }), inc({ startedAt: monday9 }), inc({ startedAt: sunday23 })]);
    expect(m[0][9]).toBe(2);
    expect(m[6][23]).toBe(1);
    expect(m.flat().reduce((a, b) => a + b, 0)).toBe(3);
    expect(busiestSlot(m)).toEqual({ weekday: 'Mon', hour: '09', count: 2 });
  });

  it('returns empty charts for a range with no incidents', () => {
    const t = computeTrends([inc({ startedAt: '2026-01-01T00:00:00Z' })], lastDays(FIXED_NOW, 1));
    expect(t.total).toBe(0);
    expect(t.ttrByMonth).toEqual([]);
    expect(t.systems).toEqual([]);
    expect(t.medianTtrMinutes).toBeNull();
    expect(busiestSlot(t.heatmap)).toBeNull();
  });
});

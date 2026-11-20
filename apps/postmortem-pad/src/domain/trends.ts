/**
 * Pure trend calculations for the Trends page. Durations use UTC milliseconds; months are UTC calendar months;
 * the weekday × hour heatmap uses the viewer's local time (that is what "Monday morning" means to a reader).
 */
import { countBy } from '@x10/shared/data';
import { DAY, median, normKey, toMs } from '@x10/shared/lib';

import { categoryLabels, TOP_SYSTEMS } from '../config';
import { CATEGORIES, type Category, type Incident } from '../model';
import { timeToResolve } from './rules';

export interface DateRange {
  /** Inclusive start, ISO. */
  from: string;
  /** Inclusive end, ISO. */
  to: string;
}

/** The last `days` days up to `now`. */
export function lastDays(now: Date, days: number): DateRange {
  return { from: new Date(now.getTime() - days * DAY).toISOString(), to: now.toISOString() };
}

/** Incidents whose start time falls inside the range (inclusive). */
export function inRange(incidents: Incident[], range: DateRange): Incident[] {
  const a = toMs(range.from);
  const b = toMs(range.to);
  return incidents.filter((i) => {
    const t = toMs(i.startedAt);
    return t >= a && t <= b;
  });
}

export type CategoryCount = {
  category: Category;
  label: string;
  count: number;
}

/** Count per category, every category listed (zeros included), in the fixed category order. */
export function countByCategory(incidents: Incident[]): CategoryCount[] {
  const counts = countBy(incidents, (i) => i.category);
  return CATEGORIES.map((c) => ({ category: c, label: categoryLabels[c], count: counts[c] ?? 0 }));
}

export type MonthTtr = {
  /** "2026-09" (UTC). */
  month: string;
  /** "Sep 2026". */
  label: string;
  /** Median time to resolve in hours, one decimal. */
  medianHours: number;
  /** Resolved incidents in that month. */
  resolved: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UTC month key of an ISO timestamp, such as "2026-09". */
export function utcMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Median time to resolve per UTC month of the start time, for incidents that have a resolved time. */
export function medianTtrByMonth(incidents: Incident[]): MonthTtr[] {
  const byMonth = new Map<string, number[]>();
  for (const i of incidents) {
    const ttr = timeToResolve(i);
    if (ttr === null || ttr < 0) continue;
    const k = utcMonth(i.startedAt);
    byMonth.set(k, [...(byMonth.get(k) ?? []), ttr]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, mins]) => {
      const [y, m] = month.split('-').map(Number);
      return {
        month,
        label: `${MONTHS[m - 1]} ${y}`,
        medianHours: Math.round(((median(mins) ?? 0) / 60) * 10) / 10,
        resolved: mins.length,
      };
    });
}

export type SystemCount = {
  system: string;
  count: number;
}

/**
 * The systems with the most incidents (ties broken by name), at most `n`. Names are grouped case- and
 * space-insensitively ("Orders  Ingest" = "orders ingest"); each group shows its most common spelling
 * (on a tie, the spelling seen first).
 */
export function topSystems(incidents: Incident[], n = TOP_SYSTEMS): SystemCount[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const i of incidents) {
    const key = normKey(i.system);
    if (!key) continue;
    const g = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    const spelling = i.system.trim().replace(/\s+/g, ' ');
    g.count += 1;
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      let best = '';
      let bestN = 0;
      for (const [s, c] of g.spellings) if (c > bestN) [best, bestN] = [s, c];
      return { system: best, count: g.count };
    })
    .sort((a, b) => b.count - a.count || a.system.localeCompare(b.system))
    .slice(0, n);
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/** Monday-first weekday index (0 = Monday) and hour of the start time, in the viewer's local time. */
export function localSlot(iso: string): { weekday: number; hour: number } {
  const d = new Date(iso);
  return { weekday: (d.getDay() + 6) % 7, hour: d.getHours() };
}

/** 7 × 24 matrix of incident counts by local weekday (Monday first) and local hour of the start time. */
export function weekdayHourMatrix(incidents: Incident[]): number[][] {
  const m = WEEKDAYS.map(() => HOURS.map(() => 0));
  for (const i of incidents) {
    const { weekday, hour } = localSlot(i.startedAt);
    m[weekday][hour] += 1;
  }
  return m;
}

/** The busiest weekday/hour cell, for the chart summary. */
export function busiestSlot(matrix: number[][]): { weekday: string; hour: string; count: number } | null {
  let best: { weekday: string; hour: string; count: number } | null = null;
  matrix.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > 0 && (!best || v > best.count)) best = { weekday: WEEKDAYS[r], hour: HOURS[c], count: v };
    }),
  );
  return best;
}

export interface Trends {
  total: number;
  byCategory: CategoryCount[];
  ttrByMonth: MonthTtr[];
  systems: SystemCount[];
  heatmap: number[][];
  /** Median time to resolve over the whole range, in minutes. */
  medianTtrMinutes: number | null;
}

export function computeTrends(all: Incident[], range: DateRange): Trends {
  const rows = inRange(all, range);
  const ttrs = rows.map(timeToResolve).filter((x): x is number => x !== null && x >= 0);
  return {
    total: rows.length,
    byCategory: countByCategory(rows),
    ttrByMonth: medianTtrByMonth(rows),
    systems: topSystems(rows),
    heatmap: weekdayHourMatrix(rows),
    medianTtrMinutes: median(ttrs),
  };
}

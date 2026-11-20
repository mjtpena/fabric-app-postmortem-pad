/** Pure filtering and grouping for the Log and Actions screens. */
import { normKey, toMs } from '@x10/shared/lib';

import type { ActionItem, Category, Incident, Severity, Status } from '../model';
import { isOverdue } from './rules';

export interface LogFilters {
  severity: Severity | 'all';
  category: Category | 'all';
  /** Exact system name, or 'all'. */
  system: string;
  status: Status | 'all';
  /** ISO start of the range (inclusive) or null. */
  from: string | null;
  /** ISO end of the range (inclusive) or null. */
  to: string | null;
}

export const NO_FILTERS: LogFilters = { severity: 'all', category: 'all', system: 'all', status: 'all', from: null, to: null };

export function isFiltered(f: LogFilters): boolean {
  return (Object.keys(NO_FILTERS) as (keyof LogFilters)[]).some((k) => f[k] !== NO_FILTERS[k]);
}

/** Apply the Log filters and sort by start time, newest first. */
export function filterIncidents(rows: Incident[], f: LogFilters): Incident[] {
  const from = f.from ? toMs(f.from) : -Infinity;
  const to = f.to ? toMs(f.to) : Infinity;
  return rows
    .filter(
      (i) =>
        (f.severity === 'all' || i.severity === f.severity) &&
        (f.category === 'all' || i.category === f.category) &&
        (f.system === 'all' || normKey(i.system) === normKey(f.system)) &&
        (f.status === 'all' || i.status === f.status) &&
        toMs(i.startedAt) >= from &&
        toMs(i.startedAt) <= to,
    )
    .sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt));
}

/** Distinct system names, case-insensitively de-duplicated (first spelling wins), sorted. */
export function distinctSystems(rows: Pick<Incident, 'system'>[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const k = normKey(r.system);
    if (k && !seen.has(k)) seen.set(k, r.system.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export interface OpenAction extends ActionItem {
  incidentTitle: string;
  overdue: boolean;
}

export interface OwnerGroup {
  owner: string;
  items: OpenAction[];
  overdue: number;
}

/** Overdue first, then by due date (soonest first, no date last), then by title. */
export function compareActions(a: OpenAction, b: OpenAction): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const da = a.dueDate ? toMs(a.dueDate) : Infinity;
  const db = b.dueDate ? toMs(b.dueDate) : Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title);
}

/**
 * All open (not done) action items grouped by owner. Owners with overdue items come first (most overdue first),
 * then the rest by name. Owner names are matched case-insensitively.
 */
export function groupOpenActions(items: ActionItem[], incidents: Pick<Incident, 'id' | 'title'>[], now: Date): OwnerGroup[] {
  const titles = new Map(incidents.map((i) => [i.id, i.title]));
  const groups = new Map<string, OwnerGroup>();
  for (const a of items) {
    if (a.done) continue;
    const key = normKey(a.ownerName) || '(no owner)';
    const g = groups.get(key) ?? { owner: a.ownerName.trim() || 'No owner', items: [], overdue: 0 };
    const overdue = isOverdue(a, now);
    g.items.push({ ...a, incidentTitle: titles.get(a.incidentId) ?? 'Unknown incident', overdue });
    if (overdue) g.overdue += 1;
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) g.items.sort(compareActions);
  return out.sort((a, b) => b.overdue - a.overdue || a.owner.localeCompare(b.owner));
}

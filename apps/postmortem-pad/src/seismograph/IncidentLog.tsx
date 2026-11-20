/**
 * The accessible equivalent of the seismograph: every incident as a table, with the same filters as before
 * (severity, category, system, status, start range). It is also the printable record.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DAY, formatDate, formatDuration, fromDateInput, median, plural, toDateInput } from '@x10/shared/lib';
import { Button, EmptyState, FilterSelect, Input, Stat, StatStrip, TableWrap } from '@x10/shared/ui';

import { categoryLabels, severityLabels, statusLabels } from '../config';
import { AgingChip, SeverityChip, StatusChip } from '../components/chips';
import { CAT_VAR } from '../components/palette';
import { distinctSystems, filterIncidents, isFiltered, NO_FILTERS, type LogFilters } from '../domain/log';
import { isAging, isOverdue, openFor, timeToResolve } from '../domain/rules';
import { CATEGORIES, SEVERITIES, STATUSES, type ActionItem, type Incident } from '../model';

const startFmt = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function IncidentLog({
  incidents,
  actions,
  now,
  system,
  focusId,
}: {
  incidents: Incident[];
  actions: ActionItem[];
  now: Date;
  /** Pre-select a system (from the seismograph's "Show in the log"). */
  system?: string | null;
  focusId?: string | null;
}) {
  const [filters, setFilters] = useState<LogFilters>(() => (system ? { ...NO_FILTERS, system } : NO_FILTERS));
  useEffect(() => {
    if (system) setFilters((f) => ({ ...f, system }));
  }, [system]);
  const set = <K extends keyof LogFilters>(k: K, val: LogFilters[K]) => setFilters((f) => ({ ...f, [k]: val }));

  const systems = distinctSystems(incidents);
  const rows = filterIncidents(incidents, filters);
  const open = incidents.filter((i) => i.status === 'open');
  const aging = open.filter((i) => isAging(i, now));
  const recent = incidents.filter((i) => now.getTime() - new Date(i.startedAt).getTime() <= 90 * DAY);
  const ttr = median(recent.map(timeToResolve).filter((x): x is number => x !== null && x >= 0));
  const openActions = actions.filter((a) => !a.done);
  const overdue = openActions.filter((a) => isOverdue(a, now));

  return (
    <div data-testid="incident-log" className="[print-color-adjust:exact]">
      {/* Print header: the log printed as a document (screen chrome and filters are hidden by the kit's print classes). */}
      <div className="print-only mb-4 border-b border-line pb-3" data-testid="print-header">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Pipeline Postmortem Pad · incident log</div>
        <div className="mt-1 text-xs text-muted">
          Printed {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(now)} · {plural(rows.length, 'incident')}
          {isFiltered(filters) ? ` · filtered: ${filterSummary(filters)}` : ' · all incidents'}
        </div>
      </div>
      <StatStrip className="mb-6">
        <Stat label="Still trembling" value={open.length} tone={open.length ? 'warn' : 'ok'} hint={`${aging.length} aging (open over 7 days)`} />
        <Stat label="Tremors, 90 days" value={recent.length} hint="By start time" />
        <Stat label="Median time to resolve" value={formatDuration(ttr)} hint="Last 90 days" />
        <Stat
          label="Open aftershocks"
          value={openActions.length}
          tone={overdue.length ? 'bad' : undefined}
          hint={<Link to="/actions">{plural(overdue.length, 'overdue item')}</Link>}
        />
      </StatStrip>
      <div className="x-noprint no-scrollbar -mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
        <FilterSelect
          label="Severity"
          value={filters.severity}
          onChange={(x) => set('severity', x)}
          options={[{ value: 'all', label: 'All' }, ...SEVERITIES.map((s) => ({ value: s, label: severityLabels[s] }))]}
        />
        <FilterSelect
          label="Category"
          value={filters.category}
          onChange={(x) => set('category', x)}
          options={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }))]}
        />
        <FilterSelect
          label="System"
          value={filters.system}
          onChange={(x) => set('system', x)}
          options={[{ value: 'all', label: 'All' }, ...systems.map((s) => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(x) => set('status', x)}
          options={[{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: statusLabels[s] }))]}
        />
        <div className="x-control inline-flex h-10 items-center sm:h-8">
          <label htmlFor="log-from" className="whitespace-nowrap pl-2.5 pr-1.5 text-sm text-muted">
            Started from
          </label>
          <Input
            id="log-from"
            type="date"
            className="h-full border-0 bg-transparent shadow-none ring-0"
            value={toDateInput(filters.from)}
            onChange={(e) => set('from', fromDateInput(e.target.value))}
          />
        </div>
        <div className="x-control inline-flex h-10 items-center sm:h-8">
          <label htmlFor="log-to" className="whitespace-nowrap pl-2.5 pr-1.5 text-sm text-muted">
            Started to
          </label>
          <Input
            id="log-to"
            type="date"
            className="h-full border-0 bg-transparent shadow-none ring-0"
            value={toDateInput(filters.to)}
            onChange={(e) => {
              const start = fromDateInput(e.target.value);
              set('to', start ? new Date(new Date(start).getTime() + DAY - 1).toISOString() : null);
            }}
          />
        </div>
        {isFiltered(filters) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
      <p className="m-0 mb-2 mt-1 text-ui text-muted" aria-live="polite">
        Showing <span className="font-mono num">{rows.length}</span> of {plural(incidents.length, 'incident')}
      </p>
      {rows.length === 0 ? (
        <EmptyState bordered title="No incidents match these filters" action={<Button onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}>
          Widen the range or clear a filter.
        </EmptyState>
      ) : (
        <div data-testid="incident-table">
        {/* Phones: a divided list (no sideways scrolling). */}
        <ol className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0 md:hidden print:hidden" aria-label="Incidents">
          {rows.map((i) => {
            const ttrMin = timeToResolve(i);
            const openMin = openFor(i, now);
            return (
              <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-3">
                <SeverityChip severity={i.severity} className="mt-0.5" />
                <Link to={`/incidents/${i.id}`} className="font-medium leading-5 text-fg no-underline">
                  {i.title}
                </Link>
                <span />
                <span className="text-xs text-muted">
                  {i.system} · {categoryLabels[i.category]}
                </span>
                <span />
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <StatusChip status={i.status} />
                  <span className="font-mono text-muted num">{startFmt(i.startedAt)}</span>
                  <span className="font-mono num">{ttrMin !== null ? formatDuration(ttrMin) : openMin !== null ? <span className="text-warn-text">open {formatDuration(openMin)}</span> : '—'}</span>
                  <AgingChip incident={i} now={now} />
                </span>
              </li>
            );
          })}
        </ol>
        <TableWrap label="Incidents" className="hidden md:block print:block print:overflow-visible print:rounded-none print:border-0">
          <table className="x-table is-sticky">
            <thead>
              <tr>
                <th scope="col">Sev</th>
                <th scope="col">Incident</th>
                <th scope="col">Category</th>
                <th scope="col">Started</th>
                <th scope="col" className="num">
                  Duration
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const ttrMin = timeToResolve(i);
                const openMin = openFor(i, now);
                return (
                  <tr key={i.id} aria-selected={focusId === i.id || undefined} className={focusId === i.id ? 'bg-accent-2' : undefined}>
                    <td className="w-[1%]">
                      <SeverityChip severity={i.severity} />
                    </td>
                    <td className="min-w-[240px]">
                      <Link to={`/incidents/${i.id}`} className="font-medium text-fg no-underline hover:underline">
                        {i.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">{i.system}</div>
                    </td>
                    <td className="whitespace-nowrap text-ui">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ background: CAT_VAR[i.category] }} />
                        {categoryLabels[i.category]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-muted num">{startFmt(i.startedAt)}</td>
                    <td className="num whitespace-nowrap text-ui">
                      {ttrMin !== null ? formatDuration(ttrMin) : openMin !== null ? <span className="text-warn-text">open {formatDuration(openMin)}</span> : '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status={i.status} />
                        <AgingChip incident={i} now={now} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        </div>
      )}
    </div>
  );
}

/** "SEV2 · Schema change · Sales orders ingest · from 1 Nov 2026" for the printed header. */
function filterSummary(f: LogFilters): string {
  const parts: string[] = [];
  if (f.severity !== 'all') parts.push(severityLabels[f.severity]);
  if (f.category !== 'all') parts.push(categoryLabels[f.category]);
  if (f.system !== 'all') parts.push(f.system);
  if (f.status !== 'all') parts.push(statusLabels[f.status]);
  if (f.from) parts.push(`from ${formatDate(f.from)}`);
  if (f.to) parts.push(`to ${formatDate(f.to)}`);
  return parts.join(' · ');
}

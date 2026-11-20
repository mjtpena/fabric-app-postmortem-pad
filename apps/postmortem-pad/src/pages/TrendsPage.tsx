/**
 * Fault lines: where the ground keeps breaking. The weekday × hour fault map, the categories that keep recurring,
 * how recovery time moves month to month, and the systems that shake most, each with its own trace.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { SimpleLineChart } from '@x10/shared/charts';
import { useApp } from '@x10/shared/runtime';
import { DAY, formatDate, formatDuration, fromDateInput, normKey, plural, toDateInput, toMs, useAsync } from '@x10/shared/lib';
import { DataState, EmptyState, Input, PageHeader, Skeleton, Stat, StatStrip, cx } from '@x10/shared/ui';

import { TOP_SYSTEMS, TRENDS_DEFAULT_DAYS, TRENDS_PRESETS } from '../config';
import { CAT_VAR } from '../components/palette';
import { FaultMap } from '../faultlines/FaultMap';
import { listIncidents } from '../domain/incidents';
import { busiestSlot, computeTrends, inRange, lastDays, type DateRange } from '../domain/trends';
import type { Incident, Schema } from '../model';
import { MiniTrace } from '../seismograph/MiniTrace';

export function TrendsPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(() => listIncidents(store), [store]);
  const now = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<number | 'custom'>(TRENDS_DEFAULT_DAYS);
  const [range, setRange] = useState<DateRange>(() => lastDays(now, TRENDS_DEFAULT_DAYS));

  const choose = (days: number) => {
    setPreset(days);
    setRange(lastDays(new Date(), days));
  };

  return (
    <>
      <PageHeader
        title={<span className="x-serif text-[40px] font-normal leading-tight tracking-[-0.01em]">Fault lines</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Quick range" className="inline-flex items-center gap-0.5 rounded-lg bg-gray-3 p-0.5">
              {TRENDS_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={preset === d}
                  onClick={() => choose(d)}
                  className={cx(
                    'x-tap h-7 cursor-pointer rounded-md px-2.5 text-ui font-medium transition-colors',
                    preset === d ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]' : 'text-muted hover:text-fg',
                  )}
                >
                  Last {d} days
                </button>
              ))}
            </div>
            <DateField
              id="trends-from"
              label="From"
              value={toDateInput(range.from)}
              onChange={(v) => {
                setPreset('custom');
                setRange((r) => ({ ...r, from: v }));
              }}
            />
            <DateField
              id="trends-to"
              label="To"
              value={toDateInput(range.to)}
              onChange={(v) => {
                setPreset('custom');
                setRange((r) => ({ ...r, to: new Date(new Date(v).getTime() + DAY - 1).toISOString() }));
              }}
            />
          </div>
        }
      />
      <DataState
        state={state}
        skeleton={<TrendsSkeleton />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState title="No fault lines yet" action={<Link to="/new">Log an incident</Link>}>
            Patterns appear here once a few incidents are logged.
          </EmptyState>
        }
      >
        {(rows) => <TrendsBody rows={rows} range={range} />}
      </DataState>
    </>
  );
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (iso: string) => void }) {
  return (
    <div className="x-control inline-flex h-10 items-center sm:h-8">
      <label htmlFor={id} className="pl-2.5 pr-1 text-sm text-muted">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        className="h-full w-[9.5rem] border-0 bg-transparent shadow-none ring-0"
        value={value}
        onChange={(e) => {
          const v = fromDateInput(e.target.value);
          if (v) onChange(v);
        }}
      />
    </div>
  );
}

function TrendsBody({ rows, range }: { rows: Incident[]; range: DateRange }) {
  const t = computeTrends(rows, range);
  const empty = t.total === 0;
  const topCat = [...t.byCategory].sort((a, b) => b.count - a.count)[0];
  const busiest = busiestSlot(t.heatmap);
  const mondayMorning = t.heatmap[0].slice(6, 12).reduce((s, v) => s + v, 0);
  const maxCat = Math.max(1, ...t.byCategory.map((c) => c.count));
  const inRangeRows = inRange(rows, range);
  const end = new Date(range.to);
  const days = Math.max(1, (toMs(range.to) - toMs(range.from)) / DAY);

  return (
    <div data-testid="trends">
      <p className="m-0 mb-4 text-ui text-muted" aria-live="polite" data-testid="trends-range">
        {formatDate(range.from)} to {formatDate(range.to)}: {plural(t.total, 'incident')} by start time.
      </p>
      <StatStrip className="mb-8">
        <Stat label="Incidents" value={t.total} />
        <Stat label="Top category" value={empty ? '—' : topCat.label} hint={empty ? undefined : plural(topCat.count, 'incident')} />
        <Stat label="Median time to resolve" value={formatDuration(t.medianTtrMinutes)} hint="Resolved incidents only" />
        <Stat label="Monday 06:00–12:00" value={mondayMorning} hint={t.total ? `${Math.round((mondayMorning / t.total) * 100)}% of the range · local time` : 'Local time'} tone={t.total && mondayMorning / t.total >= 0.25 ? 'warn' : undefined} />
      </StatStrip>
      {empty && (
        <div className="mb-6">
          <EmptyState bordered compact title="No incidents in this range">
            Pick a longer range to see the fault lines.
          </EmptyState>
        </div>
      )}

      <section aria-labelledby="map-h" className="mb-10" data-testid="heatmap">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="map-h" className="m-0 text-lg font-semibold">
              When things break
            </h2>
            <p className="m-0 mt-0.5 text-ui text-muted">Start times by weekday and hour, in your local time.</p>
          </div>
          {busiest && (
            <p className="m-0 text-ui text-muted">
              Busiest: <span className="font-medium text-fg">{busiest.weekday} {busiest.hour}:00</span> · <span className="font-mono num">{busiest.count}</span>
            </p>
          )}
        </div>
        <FaultMap matrix={t.heatmap} total={t.total} />
        <p className="sr-only">
          {busiest
            ? `Busiest slot: ${busiest.weekday} ${busiest.hour}:00 with ${busiest.count}. Monday 06:00 to 12:00 has ${mondayMorning} of ${t.total}.`
            : 'No incidents in this range.'}
        </p>
      </section>

      <div className="mb-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <section aria-labelledby="cat-h" className="min-w-0">
          <h2 id="cat-h" className="m-0 mb-4 text-lg font-semibold">
            Recurring causes
          </h2>
          {empty ? (
            <p className="m-0 text-sm text-muted">No data for this range.</p>
          ) : (
            <ol className="m-0 list-none space-y-2.5 p-0" aria-label="Incidents by category">
              {[...t.byCategory]
                .sort((a, b) => b.count - a.count)
                .map((c) => (
                  <li key={c.category} className="grid grid-cols-[120px_minmax(0,1fr)_32px] items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_32px]">
                    <span className={cx('truncate text-ui', c.count ? 'text-fg' : 'text-faint')}>{c.label}</span>
                    <span className="relative h-2.5 overflow-hidden rounded-full bg-gray-3">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
                        style={{ width: `${(c.count / maxCat) * 100}%`, background: CAT_VAR[c.category] }}
                      />
                    </span>
                    <span className={cx('text-right font-mono text-ui num', c.count ? 'text-fg' : 'text-faint')}>{c.count}</span>
                  </li>
                ))}
            </ol>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-fg">Category counts as a table</summary>
            <table className="x-table is-compact mt-2" data-testid="category-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">
                    Incidents
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td>{c.label}</td>
                    <td className="num" data-testid={`category-count-${c.category}`}>
                      {c.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section aria-labelledby="ttr-h" className="min-w-0">
          <h2 id="ttr-h" className="sr-only">
            Recovery time
          </h2>
          <SimpleLineChart
            bare
            title="Median time to resolve per month (hours, UTC months)"
            data={t.ttrByMonth}
            xKey="label"
            series={[{ key: 'medianHours', label: 'Median hours' }]}
            yFormat={(v) => `${v} h`}
            summary={t.ttrByMonth.map((m) => `${m.label}: ${m.medianHours} hours over ${m.resolved} resolved`).join('; ') || 'No resolved incidents in this range.'}
          />
        </section>
      </div>

      <section aria-labelledby="sys-h">
        <h2 id="sys-h" className="m-0 mb-1 text-lg font-semibold">
          Systems that shake most
        </h2>
        <p className="m-0 mb-3 text-ui text-muted">Top {TOP_SYSTEMS}, each with its trace over the range. Select a tremor to open its black box.</p>
        {t.systems.length === 0 ? (
          <p className="m-0 text-sm text-muted">No data for this range.</p>
        ) : (
          <ol className="m-0 list-none divide-y divide-[var(--line)] border-y border-line p-0">
            {t.systems.map((s, k) => {
              const own = inRangeRows.filter((i) => normKey(i.system) === normKey(s.system));
              return (
                <li key={s.system} className="grid items-center gap-x-6 gap-y-1 py-3 md:grid-cols-[28px_220px_minmax(0,1fr)_48px]">
                  <span className="hidden font-mono text-xs text-faint md:block">{String(k + 1).padStart(2, '0')}</span>
                  <span className="flex items-baseline justify-between gap-3 md:block">
                    <span className="block truncate text-sm font-medium text-fg">{s.system}</span>
                    <span className="font-mono text-xs text-muted md:hidden">{s.count}</span>
                  </span>
                  <MiniTrace incidents={own} now={end} days={days} height={44} label={`${s.system}: ${plural(s.count, 'incident')}`} />
                  <span className="hidden text-right font-mono text-base font-semibold num md:block">{s.count}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function TrendsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton width={320} height={14} />
      <Skeleton height={86} />
      <Skeleton height={300} />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton height={220} />
        <Skeleton height={220} />
      </div>
    </div>
  );
}

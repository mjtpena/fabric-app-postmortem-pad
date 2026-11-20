/**
 * Aftershocks: every open follow-up from every incident, grouped by owner with overdue ones first, and a due-date
 * strip that shows how the open work is spread around today. Ticking one off is immediate, with Undo.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useApp } from '@x10/shared/runtime';
import { DAY, plural, toMs, useAction, useAsync } from '@x10/shared/lib';
import { Avatar, Badge, Checkbox, DataState, EmptyState, InlineError, PageHeader, Skeleton, Stat, StatStrip, Toast } from '@x10/shared/ui';

import { DueChip, SeverityChip } from '../components/chips';
import { listActionItems, listIncidents, setActionDone } from '../domain/incidents';
import { groupOpenActions, type OpenAction } from '../domain/log';
import type { Incident, Schema } from '../model';
import { useSize } from '../seismograph/useSize';

export function ActionsPage() {
  const { store } = useApp<Schema>();
  const state = useAsync(async () => {
    const [items, incidents] = await Promise.all([listActionItems(store), listIncidents(store)]);
    return { items, incidents };
  }, [store]);
  const now = useMemo(() => new Date(), [state.data]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ id: string; title: string } | null>(null);

  const done = useAction(async (id: string, value: boolean) => {
    await setActionDone(store, id, value);
    await state.reload();
  });
  const tick = (a: OpenAction) => {
    setHidden((h) => new Set(h).add(a.id));
    setToast({ id: a.id, title: a.title });
    void done.run(a.id, true).then(() => setHidden((h) => withoutId(h, a.id)));
  };
  const undo = (id: string) => {
    setHidden((h) => withoutId(h, id));
    void done.run(id, false);
  };

  return (
    <>
      <DataState
        state={state}
        skeleton={<ActionsSkeleton />}
        isEmpty={(d) => !d.items.some((a) => !a.done && !hidden.has(a.id))}
        empty={
          <>
            <PageHeader title={<span className="x-serif text-[40px] font-normal leading-tight">Aftershocks</span>} />
            <EmptyState title="No aftershocks open" action={<Link to="/">Back to the seismograph</Link>}>
              Every follow-up is done. New ones are added from an incident's black box.
            </EmptyState>
          </>
        }
      >
        {({ items, incidents }) => {
          const visible = items.filter((a) => !hidden.has(a.id));
          const groups = groupOpenActions(visible, incidents, now);
          const all = groups.flatMap((g) => g.items);
          const overdue = all.filter((a) => a.overdue).length;
          const week = all.filter((a) => !a.overdue && a.dueDate && toMs(a.dueDate) - now.getTime() <= 7 * DAY).length;
          const undated = all.filter((a) => !a.dueDate).length;
          const byId = new Map(incidents.map((i) => [i.id, i]));
          return (
            <>
              <PageHeader
                title={<span className="x-serif text-[40px] font-normal leading-tight">Aftershocks</span>}
                meta={
                  <span>
                    <span className="font-medium text-fg">{plural(all.length, 'open item')}</span> for {plural(groups.length, 'owner')}, {overdue} overdue
                  </span>
                }
              />
              <StatStrip className="mb-6">
                <Stat label="Open" value={all.length} />
                <Stat label="Overdue" value={overdue} tone={overdue ? 'bad' : 'ok'} />
                <Stat label="Due within 7 days" value={week} tone={week ? 'warn' : undefined} />
                <Stat label="No due date" value={undated} />
              </StatStrip>
              <DueStrip items={all} now={now} />
              <InlineError error={done.error} />
              <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-2">
                {groups.map((g) => (
                  <section key={g.owner} data-testid="owner-group" aria-label={`${g.owner}: ${plural(g.items.length, 'open item')}`}>
                    <header className="flex items-center gap-3 border-b border-line pb-3">
                      <Avatar name={g.owner} size="lg" />
                      <div className="min-w-0 flex-1">
                        <h2 className="m-0 truncate text-base font-semibold">{g.owner}</h2>
                        <p className="m-0 text-xs text-muted">{plural(g.items.length, 'item')}</p>
                      </div>
                      {g.overdue > 0 && (
                        <Badge tone="bad" variant="soft">
                          {g.overdue} overdue
                        </Badge>
                      )}
                    </header>
                    <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
                      {g.items.map((a) => (
                        <ActionRow key={a.id} a={a} incident={byId.get(a.incidentId)} now={now} onDone={() => tick(a)} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          );
        }}
      </DataState>
      <Toast
        message={toast ? `Done: ${toast.title}` : null}
        tone="ok"
        action={toast ? { label: 'Undo', onClick: () => undo(toast.id) } : undefined}
        onDone={() => setToast(null)}
      />
    </>
  );
}

function withoutId(s: Set<string>, id: string) {
  const n = new Set(s);
  n.delete(id);
  return n;
}

function ActionRow({ a, incident, now, onDone }: { a: OpenAction; incident?: Incident; now: Date; onDone: () => void }) {
  return (
    <li className="grid gap-1.5 py-3">
      <Checkbox label={<span className="font-medium text-fg">{a.title}</span>} checked={false} onChange={onDone} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-6 text-xs text-muted">
        <DueChip item={a} now={now} />
        <Link to={`/incidents/${a.incidentId}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-muted no-underline hover:text-fg">
          {incident && <SeverityChip severity={incident.severity} size="sm" />}
          <span className="truncate">{a.incidentTitle}</span>
        </Link>
      </div>
    </li>
  );
}

/** Open items on a line from 30 days ago to 30 days ahead; overdue ones left of today in red, undated ones apart. */
function DueStrip({ items, now }: { items: OpenAction[]; now: Date }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const H = 92;
  const span = 30;
  const undatedW = 64;
  const plotW = Math.max(100, w - undatedW - 40);
  const x = (ms: number) => {
    const d = (ms - now.getTime()) / DAY;
    return 22 + ((Math.max(-span, Math.min(span, d)) + span) / (2 * span)) * plotW;
  };
  const y0 = 54;
  const dated = items.filter((a) => a.dueDate);
  const undated = items.filter((a) => !a.dueDate);
  // Stack spikes that would overlap.
  const placed: { a: OpenAction; x: number; lift: number }[] = [];
  for (const a of [...dated].sort((p, q) => toMs(p.dueDate!) - toMs(q.dueDate!))) {
    const px = x(toMs(a.dueDate!));
    const lift = placed.filter((p) => Math.abs(p.x - px) < 7).length;
    placed.push({ a, x: px, lift });
  }
  const xToday = x(now.getTime());
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }} aria-label="Open items by due date" role="img">
      {w > 0 && (
        <svg width={w} height={H} aria-hidden="true">
          <rect x={22} y={y0 - 26} width={xToday - 22} height={34} rx={6} fill="color-mix(in oklab, var(--bad-solid) 6%, transparent)" />
          <line x1={22} x2={22 + plotW} y1={y0} y2={y0} stroke="var(--line-strong)" />
          {[-30, -14, -7, 7, 14, 30].map((d) => (
            <g key={d}>
              <line x1={x(now.getTime() + d * DAY)} x2={x(now.getTime() + d * DAY)} y1={y0 - 3} y2={y0 + 3} stroke="var(--line-strong)" />
              <text x={x(now.getTime() + d * DAY)} y={y0 + 18} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--muted)">
                {d > 0 ? `+${d}d` : `${d}d`}
              </text>
            </g>
          ))}
          <line x1={xToday} x2={xToday} y1={8} y2={y0 + 6} stroke="var(--accent-10)" strokeDasharray="2 3" />
          <text x={xToday} y={y0 + 18} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={600} fill="var(--brand-text)">
            TODAY
          </text>
          {placed.map(({ a, x: px, lift }) => {
            const h = 14 + lift * 7;
            return (
              <path
                key={a.id}
                d={`M${px - 3} ${y0}L${px} ${y0 - h}L${px + 3} ${y0}`}
                fill={a.overdue ? 'var(--bad-solid)' : 'var(--accent-9)'}
                stroke={a.overdue ? 'var(--bad-solid)' : 'var(--accent-10)'}
                strokeLinejoin="round"
              >
                <title>{`${a.title} · ${a.ownerName}`}</title>
              </path>
            );
          })}
          <g transform={`translate(${22 + plotW + 18} 0)`}>
            <line x1={0} x2={0} y1={y0 - 26} y2={y0 + 6} stroke="var(--line)" />
            {undated.map((a, k) => (
              <circle key={a.id} cx={14 + (k % 4) * 10} cy={y0 - 6 - Math.floor(k / 4) * 10} r={3.5} fill="none" stroke="var(--muted)" strokeWidth={1.4}>
                <title>{`${a.title} · ${a.ownerName} · no due date`}</title>
              </circle>
            ))}
            <text x={8} y={y0 + 18} className="font-mono" fontSize={10} fill="var(--muted)">
              no date
            </text>
          </g>
          <text x={22} y={12} className="font-mono" fontSize={10} fill="var(--muted)">
            OVERDUE ←
          </text>
          <text x={22 + plotW} y={12} textAnchor="end" className="font-mono" fontSize={10} fill="var(--muted)">
            → COMING UP
          </text>
        </svg>
      )}
    </div>
  );
}

function ActionsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton width={260} height={40} />
      <Skeleton height={86} />
      <Skeleton height={92} />
      <div className="grid gap-10 lg:grid-cols-2">
        {[0, 1].map((k) => (
          <div key={k} className="space-y-3">
            <Skeleton height={40} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </div>
        ))}
      </div>
    </div>
  );
}

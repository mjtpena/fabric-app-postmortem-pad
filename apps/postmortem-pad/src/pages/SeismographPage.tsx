/**
 * Home: the seismograph. Lenses re-colour the same tremors, Today focuses the drum on what needs attention, and the
 * view toggle swaps the drum for the incident log (the accessible list of the same data).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Keyboard, Plus, Printer, Rows3, ShieldCheck, Wrench } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { toMs, useAsync, usePolling } from '@x10/shared/lib';
import {
  Badge,
  Button,
  IconButton,
  Legend,
  LensBar,
  Skeleton,
  StageMessage,
  StagePage,
  TodayPanel,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { categoryLabels, severityLabels, statusLabels } from '../config';
import { CAT_VAR, SEV_VAR, STATUS_VAR, SYS_VARS, TTR_VAR } from '../components/palette';
import { listActionItems, listIncidents } from '../domain/incidents';
import {
  buildTracks,
  inWindow,
  isMine,
  openAftershocks,
  rankToday,
  readyForSignOff,
  STATUS_ORDER,
  trackKeyOf,
  ttrBucket,
  TTR_LABELS,
  WINDOW_DAYS,
  type LensKey,
  type Role,
  type Track,
  type TtrBucket,
} from '../domain/seismo';
import { CATEGORIES, SEVERITIES, type Incident, type Schema } from '../model';
import { IncidentLog } from '../seismograph/IncidentLog';
import { Seismogram, type Focus } from '../seismograph/Seismogram';
import { ShortcutsDialog } from '../seismograph/ShortcutsDialog';

const LENSES: LensOption<LensKey>[] = [
  {
    value: 'severity',
    label: 'Severity',
    swatch: 'linear-gradient(90deg, var(--sev1), var(--sev2), var(--sev3))',
    description: 'Colour by severity (amplitude always shows severity)',
  },
  {
    value: 'category',
    label: 'Category',
    swatch: 'conic-gradient(var(--indigo-9) 0 25%, var(--teal-9) 0 50%, var(--plum-9) 0 75%, var(--gold-9) 0)',
    description: 'Colour by root-cause category',
  },
  { value: 'system', label: 'System', swatch: 'conic-gradient(var(--indigo-9) 0 33%, var(--coral-9) 0 66%, var(--teal-9) 0)', description: 'One colour per trace' },
  { value: 'ttr', label: 'Time to resolve', swatch: 'linear-gradient(90deg, var(--green-9), var(--gold-9), var(--red-9))', description: 'How long each one took to fix' },
  { value: 'status', label: 'Open vs resolved', swatch: 'var(--accent-9)', description: 'Still trembling, resolved, or reviewed' },
];

export function SeismographPage() {
  const { store, me, isAdmin } = useApp<Schema>();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const data = useAsync(async () => {
    const [incidents, actions] = await Promise.all([listIncidents(store), listActionItems(store)]);
    return { incidents, actions };
  }, [store]);
  usePolling(data.reload, 15_000);

  const view: StageView = params.get('view') === 'list' ? 'list' : 'stage';
  const focusParam = params.get('focus');
  const systemParam = params.get('system');
  const [lens, setLens] = useState<LensKey>('severity');
  const [role, setRole] = useState<Role>(isAdmin ? 'lead' : 'engineer');
  const [help, setHelp] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

  const setParam = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  const setView = (v: StageView) => setParam({ view: v === 'list' ? 'list' : null });
  const focus: Focus = focusParam ? { kind: 'incident', id: focusParam } : systemParam ? { kind: 'system', key: systemParam } : null;
  const setFocus = (f: Focus) =>
    setParam({ focus: f?.kind === 'incident' ? f.id : null, system: f?.kind === 'system' ? f.key : null, logSystem: null });

  // Stable "now" per data load, so the drum does not drift between renders.
  const now = useMemo(() => new Date(), [data.data]);
  const derived = useMemo(() => {
    if (!data.data) return null;
    const { incidents, actions } = data.data;
    const windowed = inWindow(incidents, now);
    const tracks = buildTracks(windowed);
    const aftershocks = openAftershocks(actions, now);
    const mine = new Set(windowed.filter((i) => isMine(i, actions, me)).map((i) => i.id));
    const signoff = new Set(readyForSignOff(windowed, actions).map((i) => i.id));
    const order = tracks.flatMap((t) => t.incidents).sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt));
    return { incidents, actions, windowed, tracks, aftershocks, mine, signoff, order };
  }, [data.data, now, me]);

  const today = useMemo(() => (data.data ? rankToday(data.data.incidents, data.data.actions, now, role, me) : []), [data.data, now, role, me]);

  const step = (dir: 1 | -1) => {
    if (!derived?.order.length) return;
    const idx = focus?.kind === 'incident' ? derived.order.findIndex((i) => i.id === focus.id) : -1;
    const next = idx < 0 ? (dir === 1 ? 0 : derived.order.length - 1) : (idx + dir + derived.order.length) % derived.order.length;
    setFocus({ kind: 'incident', id: derived.order[next].id });
  };

  useHotkeys({
    escape: () => setFocus(null),
    '[': () => view === 'stage' && step(-1),
    ']': () => view === 'stage' && step(1),
    n: () => navigate('/new'),
    'shift+?': () => setHelp(true),
  });

  const focusedIncident = focus?.kind === 'incident' ? derived?.windowed.find((i) => i.id === focus.id) : undefined;
  const focusedTrack = derived?.tracks.find((t) => (focus?.kind === 'system' ? t.key === focus.key : focusedIncident ? t.key === trackKeyOf(focusedIncident, derived.tracks) : false));

  const legend = derived ? legendFor(lens, derived) : [];
  const todayItems: TodayItem[] = today.map((p) => ({
    id: p.id,
    title: p.title,
    severity: p.tone,
    value: p.value,
    unit: p.unit,
    lens: LENSES.find((l) => l.value === p.lens)?.label,
    meta: <span className="truncate">{p.meta}</span>,
  }));
  const activeToday = today.find((p) => (p.focus.kind === 'incident' ? focus?.kind === 'incident' && focus.id === p.focus.id : focus?.kind === 'system' && focus.key === p.focus.key))?.id ?? null;

  const open = derived?.windowed.filter((i) => i.status === 'open').length ?? 0;

  const roleSwitch = (
    <ViewAsSwitch<Role>
      value={role}
      onChange={setRole}
      options={[
        { value: 'lead', label: 'Lead', icon: <ShieldCheck /> },
        { value: 'engineer', label: 'Engineer', icon: <Wrench /> },
      ]}
    />
  );

  const topRight = (
    <div className="x-noprint flex flex-wrap items-center gap-2">
      {desktop && view === 'stage' && roleSwitch}
      <Button variant="primary" icon={<Plus />} onClick={() => navigate('/new')} title="Log an incident (N)" className={view === 'stage' ? 'rounded-full!' : undefined}>
        Log incident
      </Button>
      <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Seismograph" listLabel="Log" stageIcon={<Activity />} listIcon={<Rows3 />} />
      {desktop && (
        <IconButton
          label="Keyboard shortcuts (?)"
          icon={<Keyboard />}
          onClick={() => setHelp(true)}
          variant={view === 'stage' ? 'ghost' : 'secondary'}
          className={view === 'stage' ? 'x-glass rounded-full!' : undefined}
        />
      )}
      {view === 'list' && (
        <Button icon={<Printer />} onClick={() => window.print()} title="Print the log as a document">
          Print
        </Button>
      )}
    </div>
  );

  let stage;
  if (data.error && !data.data) {
    stage = (
      <StageMessage icon={<AlertTriangle />} title="The seismograph could not load" action={<Button onClick={() => void data.reload()}>Retry</Button>}>
        {data.error.message}
      </StageMessage>
    );
  } else if (!derived) {
    stage = <DrumSkeleton />;
  } else if (derived.tracks.length === 0) {
    stage = (
      <StageMessage
        icon={<Activity />}
        title={`All quiet for ${WINDOW_DAYS} days`}
        action={
          <Button variant="primary" icon={<Plus />} onClick={() => navigate('/new')}>
            Log an incident
          </Button>
        }
      >
        When a pipeline or notebook fails, log it and it appears here as a tremor on its system's trace.
      </StageMessage>
    );
  } else {
    stage = (
      <Seismogram
        tracks={derived.tracks}
        now={now}
        lens={lens}
        role={role}
        aftershocks={derived.aftershocks}
        mine={derived.mine}
        signoff={derived.signoff}
        focus={focus}
        onFocus={setFocus}
        onShowSystemInLog={(system) => setParam({ view: 'list', logSystem: system, system: null, focus: null })}
      />
    );
  }

  return (
    <>
      <StagePage
        label="Seismograph of the last 90 days"
        view={view}
        breadcrumb={
          view === 'list'
            ? [{ label: 'Seismograph', onClick: () => setView('stage') }, { label: 'Incident log' }]
            : [
                { label: 'Seismograph', onClick: () => setFocus(null) },
                { label: focusedTrack ? focusedTrack.label : 'All systems' },
              ]
        }
        title={view === 'list' ? 'Incident log' : <span className="x-serif text-[30px] font-normal leading-9 tracking-[-0.01em]">The seismograph</span>}
        meta={
          derived ? (
            view === 'list' ? (
              <span className="num">Every failure the team has logged, newest first</span>
            ) : (
              <>
                <span className="num">
                  <span className="font-mono">{derived.windowed.length}</span> tremors · <span className="font-mono">{derived.tracks.length}</span> systems · <span className="font-mono">{WINDOW_DAYS}</span> days
                </span>
                {open > 0 && (
                  <Badge tone="warn" pulse>
                    <span className="font-mono">{open}</span>&nbsp;still trembling
                  </Badge>
                )}
              </>
            )
          ) : (
            <Skeleton width={180} height={14} />
          )
        }
        topRight={topRight}
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} />}
        legend={derived && (!desktop || !sideOpen) && <Legend title={LENSES.find((l) => l.value === lens)?.label} items={legend} collapsible defaultOpen={desktop} />}
        bottomRight={desktop ? undefined : roleSwitch}
        side={
          <>
          <TodayPanel
            bare
            items={todayItems}
            date={new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(now)}
            activeId={activeToday}
            empty="Nothing is trembling. Enjoy the quiet."
            onSelect={(it) => {
              const p = today.find((x) => x.id === it.id);
              if (!p) return;
              setLens(p.lens);
              setView('stage');
              setFocus(p.focus);
            }}
          />
          {derived && (
            <div className="mx-1 mt-4 border-t border-line px-2 pt-4">
              <Legend bare title={`Key · ${LENSES.find((l) => l.value === lens)?.label}`} items={legend} />
              <ul className="x-legend-label m-0 mt-3 list-none space-y-1.5 p-0 text-faint">
                <li>Height · severity</li>
                <li>Ring length · time to resolve</li>
                <li>Small spikes · open aftershocks</li>
              </ul>
            </div>
          )}
          </>
        }
        sideCount={today.length}
        sideOpen={sideOpen}
        onSideOpenChange={setSideOpen}
        list={
          derived ? (
            <IncidentLog incidents={derived.incidents} actions={derived.actions} now={now} system={params.get('logSystem')} focusId={focusParam} />
          ) : (
            <div role="status" aria-label="Loading" className="space-y-3">
              <Skeleton height={84} />
              <Skeleton height={32} width="60%" />
              {Array.from({ length: 6 }, (_, k) => (
                <Skeleton key={k} height={44} />
              ))}
            </div>
          )
        }
        stage={stage}
        background="radial-gradient(120% 90% at 30% 20%, var(--paper) 0%, var(--paper-2) 100%)"
      >
      </StagePage>
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ legend */

function legendFor(lens: LensKey, d: { windowed: Incident[]; tracks: Track[] }): LegendItem[] {
  const rows = d.windowed;
  const count = (pred: (r: Incident) => boolean) => rows.filter(pred).length;
  if (lens === 'severity')
    return SEVERITIES.map((s) => ({ label: severityLabels[s], color: SEV_VAR[s], shape: 'line', value: count((r) => r.severity === s) }));
  if (lens === 'category')
    return CATEGORIES.filter((c) => count((r) => r.category === c) > 0).map((c) => ({
      label: categoryLabels[c],
      color: CAT_VAR[c],
      shape: 'line',
      value: count((r) => r.category === c),
    }));
  if (lens === 'system') return d.tracks.map((t, k) => ({ label: t.label, color: SYS_VARS[k % SYS_VARS.length], shape: 'line', value: t.incidents.length }));
  if (lens === 'ttr')
    return (Object.keys(TTR_LABELS) as TtrBucket[]).map((b) => ({ label: TTR_LABELS[b], color: TTR_VAR[b], shape: 'line', value: count((r) => ttrBucket(r) === b) }));
  return STATUS_ORDER.map((s) => ({ label: s === 'open' ? 'Still trembling' : statusLabels[s], color: STATUS_VAR[s], shape: 'line', value: count((r) => r.status === s) }));
}

/* ------------------------------------------------------------------ loading */

function DrumSkeleton() {
  return (
    <div role="status" aria-label="Loading the seismograph" className="absolute inset-y-0 left-0 flex w-[calc(100%-var(--side-w,0px))] flex-col justify-center gap-12 px-6 md:pl-[244px] md:pr-[84px]">
      {Array.from({ length: 6 }, (_, k) => (
        <div key={k} className="x-skeleton h-[2px] w-full rounded-full" />
      ))}
    </div>
  );
}

/**
 * The flight recorder for one incident: started → detected → resolved on a proportional tape, the incident's own
 * tremor drawn along it (loud while undetected, decaying while it is being fixed, calm once resolved, still
 * trembling when open), and the durations between each mark. The casing is amber, as real flight recorders are.
 */
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Circle, Lock, Square } from 'lucide-react';

import { formatDuration, toMs } from '@x10/shared/lib';
import { cx, useReducedMotion } from '@x10/shared/ui';

import { SEV_VAR } from '../components/palette';
import { minutesFromTo } from '../domain/rules';
import { hash, rng, SEV_AMP } from '../domain/seismo';
import type { Incident } from '../model';

type PhaseKey = 'undetected' | 'fixing' | 'open' | 'calm';

interface Phase {
  key: PhaseKey;
  label: string;
  minutes: number | null;
  /** Share of the tape, 0..1. */
  share: number;
}

/** Recorder clock: 24-hour, like a flight recorder, so three readouts fit side by side on a phone. */
const timeFmt = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const dayFmt = (ms: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);

/** "T+3h 10m" from the start. */
function tPlus(minutes: number | null) {
  if (minutes === null) return '';
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const r = m % 60;
  if (d) return `T+${d}d ${h}h`;
  return `T+${h ? `${h}h ` : ''}${r}m`;
}

export function recorderPhases(i: Incident, now: Date): Phase[] {
  const open = i.status === 'open';
  const end = open ? now.toISOString() : (i.resolvedAt ?? now.toISOString());
  const ttd = minutesFromTo(i.startedAt, i.detectedAt);
  const total = Math.max(1, minutesFromTo(i.startedAt, end) ?? 1);
  const raw: Phase[] = [];
  if (ttd !== null && ttd <= total) {
    raw.push({ key: 'undetected', label: 'Undetected', minutes: ttd, share: ttd / total });
    raw.push({ key: open ? 'open' : 'fixing', label: open ? 'Still open' : 'Detect to resolve', minutes: total - ttd, share: (total - ttd) / total });
  } else {
    raw.push({ key: open ? 'open' : 'undetected', label: open ? 'Open, detection not recorded' : 'Detection not recorded', minutes: total, share: 1 });
  }
  // Keep every phase readable: at least 22% of the tape, then reserve the calm tail.
  const clamped = raw.map((p) => ({ ...p, share: raw.length > 1 ? Math.min(0.72, Math.max(0.28, p.share)) : 1 }));
  const sum = clamped.reduce((s, p) => s + p.share, 0);
  const tape = 0.88;
  const out = clamped.map((p) => ({ ...p, share: (p.share / sum) * tape }));
  out.push({ key: 'calm', label: open ? 'Now' : 'Resolved', minutes: null, share: 1 - tape });
  return out;
}

const W = 1000;
const H = 120;
const Y0 = H / 2;

function wavePath(phases: Phase[], amp: number, seed: number, t: number): string {
  const r = rng(seed);
  let x = 0;
  let sign = 1;
  let d = `M0 ${Y0}`;
  for (const p of phases) {
    const x1 = x;
    const x2 = x + p.share * W;
    for (let px = x1 + 4; px < x2; px += 5.5) {
      const u = (px - x1) / Math.max(1, x2 - x1);
      let a = 0;
      if (p.key === 'undetected') a = amp * (0.55 + 0.45 * Math.min(1, u * 3));
      else if (p.key === 'fixing') a = amp * (0.9 * Math.exp(-2.6 * u) + 0.04);
      else if (p.key === 'open') a = amp * (0.5 + 0.18 * Math.sin(px * 0.05 + t * 2.4));
      else a = phases.some((q) => q.key === 'open') ? amp * 0.42 * (0.6 + 0.4 * Math.sin(px * 0.3 + t * 7)) : 0.6;
      const jitter = 0.55 + 0.45 * r();
      d += `L${px.toFixed(1)} ${(Y0 - sign * a * jitter).toFixed(1)}`;
      sign = -sign;
    }
    x = x2;
  }
  return `${d}L${W} ${Y0}`;
}

export function BlackBox({ incident: i, now }: { incident: Incident; now: Date }) {
  const reduced = useReducedMotion();
  const phases = useMemo(() => recorderPhases(i, now), [i, now]);
  const open = i.status === 'open';
  const amp = (H / 2 - 8) * SEV_AMP[i.severity];
  const seed = hash(i.id);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!open || reduced) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 70) return;
      last = ts;
      pathRef.current?.setAttribute('d', wavePath(phases, amp, seed, ts / 1000));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, reduced, phases, amp, seed]);

  const start = toMs(i.startedAt);
  const marks: { label: string; at: number | null; delta: number | null; note?: string }[] = [
    { label: 'Started', at: start, delta: 0 },
    {
      label: 'Detected',
      at: i.detectedAt ? toMs(i.detectedAt) : null,
      delta: minutesFromTo(i.startedAt, i.detectedAt),
      note: 'Not recorded',
    },
    open
      ? { label: 'Now', at: now.getTime(), delta: minutesFromTo(i.startedAt, now.toISOString()), note: 'Still open' }
      : { label: 'Resolved', at: i.resolvedAt ? toMs(i.resolvedAt) : null, delta: minutesFromTo(i.startedAt, i.resolvedAt), note: 'Not resolved' },
  ];
  const ttd = minutesFromTo(i.startedAt, i.detectedAt);
  const ttr = open ? minutesFromTo(i.startedAt, now.toISOString()) : minutesFromTo(i.startedAt, i.resolvedAt);
  const d2r = minutesFromTo(i.detectedAt, open ? now.toISOString() : i.resolvedAt);
  const sev = SEV_VAR[i.severity];

  let acc = 0;
  const bounds = phases.slice(0, -1).map((p) => (acc += p.share));

  return (
    <section
      aria-label="Black box: incident timeline"
      data-testid="timeline"
      className="overflow-hidden rounded-2xl"
      style={{ boxShadow: '0 0 0 2px var(--accent-9), var(--shadow-1)', ['--hatch' as string]: sev } as CSSProperties}
    >
      {/* casing */}
      <div className="flex items-center justify-between gap-3 bg-accent-9 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-contrast">
        <span className="truncate">Black box · flight recorder</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {open ? (
            <>
              <Circle aria-hidden="true" className={cx('size-2.5 fill-current', !reduced && 'pm-blink')} /> Recording
            </>
          ) : i.status === 'reviewed' ? (
            <>
              <Lock aria-hidden="true" className="size-3" /> Sealed
            </>
          ) : (
            <>
              <Square aria-hidden="true" className="size-2.5 fill-current" /> Stopped
            </>
          )}
        </span>
      </div>

      <div className="bg-surface-sunken px-4 pt-4 pb-5 sm:px-6">
        {/* readouts */}
        <ol className="m-0 grid list-none grid-cols-3 gap-3 p-0">
          {marks.map((m, k) => (
            <li key={m.label} className={cx('min-w-0', k === 2 && 'text-right', k === 1 && 'text-center sm:text-left')}>
              <div className="x-legend-label text-muted">{m.label}</div>
              {m.at !== null ? (
                <>
                  <div className="mt-1 font-mono text-[24px] font-semibold leading-7 tracking-[-0.02em] text-fg num sm:text-[30px]">{timeFmt(m.at)}</div>
                  <div className="mt-0.5 truncate text-xs text-muted">{dayFmt(m.at)}</div>
                  {k > 0 && <div className="mt-0.5 font-mono text-[11px] text-faint num">{tPlus(m.delta)}</div>}
                </>
              ) : (
                <div className="mt-1 text-sm font-medium text-faint">{m.note}</div>
              )}
            </li>
          ))}
        </ol>

        {/* tape */}
        <div className="relative mt-4 h-[120px] overflow-hidden rounded-lg bg-[var(--paper)] ring-1 ring-inset ring-line">
          <div className="absolute inset-0 flex">
            {phases.map((p) => (
              <div
                key={p.key}
                className={cx('h-full', p.key === 'undetected' && 'pm-hatch')}
                style={{
                  width: `${p.share * 100}%`,
                  background:
                    p.key === 'fixing' || p.key === 'open'
                      ? 'color-mix(in oklab, var(--accent-9) 10%, transparent)'
                      : p.key === 'calm' && !open
                        ? 'color-mix(in oklab, var(--ok-solid) 8%, transparent)'
                        : undefined,
                }}
              />
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
            {bounds.map((b, k) => (
              <line key={k} x1={b * W} x2={b * W} y1={0} y2={H} stroke="var(--paper-ink)" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={k === bounds.length - 1 && open ? '3 3' : undefined} />
            ))}
            <path ref={pathRef} d={wavePath(phases, amp, seed, 0)} fill="none" stroke={sev} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* mark heads */}
          {[0, ...bounds].map((b, k) => (
            <span key={k} aria-hidden="true" className="absolute top-1.5 size-2 -translate-x-1/2 rounded-full ring-2 ring-[var(--paper)]" style={{ left: `calc(${b * 100}% + ${k === 0 ? 6 : 0}px)`, background: k === 0 ? sev : 'var(--paper-ink)' }} />
          ))}
        </div>

        {/* phase durations */}
        <div className="mt-2 flex">
          {phases.map((p) => (
            <div key={p.key} className={cx('min-w-0 pr-2', p.key === 'calm' && 'text-right')} style={{ width: `${p.share * 100}%` }}>
              {p.key !== 'calm' && (
                <>
                  <div className="x-legend-label truncate text-muted">{p.label}</div>
                  <div className={cx('font-mono text-sm font-semibold num', p.key === 'undetected' ? 'text-fg' : 'text-fg')}>{formatDuration(p.minutes)}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* flight data */}
        <dl className="m-0 mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Readout label="Time to detect" value={formatDuration(ttd)} />
          <Readout label={open ? 'Since detection' : 'Detect to resolve'} value={formatDuration(d2r)} />
          <Readout label={open ? 'Open for' : 'Time to resolve'} value={formatDuration(ttr)} strong tone={open ? 'warn' : undefined} />
        </dl>
      </div>
    </section>
  );
}

function Readout({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'warn' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx('m-0 mt-1 font-mono num', strong ? 'text-lg font-semibold' : 'text-base font-medium', tone === 'warn' ? 'text-warn-text' : 'text-fg')}>{value}</dd>
    </div>
  );
}

/**
 * The seismograph centrepiece: one trace per system across the last 90 days, drawn in SVG at 1:1 pixels.
 * A tremor starts where an incident started; its amplitude is the severity and its ring-down is the time to resolve.
 * Open incidents keep trembling up to the stylus; small spikes after a tremor are its open action items.
 * Animation (open tails, the styluses) runs in one rAF loop that writes path data directly; reduced motion stops it.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';

import { DAY, formatDuration, toMs } from '@x10/shared/lib';
import { Badge, IconButton, LinkButton, cx, useIsDesktop, useReducedMotion } from '@x10/shared/ui';

import { categoryLabels, statusLabels } from '../config';
import { AgingChip, SeverityChip } from '../components/chips';
import { CAT_VAR, SEV_VAR, STATUS_VAR, SYS_VARS, TTR_VAR } from '../components/palette';
import { openFor, timeToResolve } from '../domain/rules';
import {
  baselinePoints,
  hash,
  ringPx,
  SEV_AMP,
  summariseTrack,
  tailPoints,
  toPath,
  tremorPoints,
  ttrBucket,
  WINDOW_DAYS,
  type LensKey,
  type Role,
  type Track,
} from '../domain/seismo';
import type { ActionItem, Incident } from '../model';
import { useSize } from './useSize';

export type Focus = { kind: 'incident'; id: string } | { kind: 'system'; key: string } | null;

export interface SeismogramProps {
  tracks: Track[];
  now: Date;
  lens: LensKey;
  role: Role;
  /** Open action items per incident (aftershocks). */
  aftershocks: Map<string, { overdue: boolean; item: ActionItem }[]>;
  /** Incident ids that are the viewer's own (engineer view dims the rest). */
  mine: Set<string>;
  /** Incident ids ready for a lead's sign-off (lead view marks them). */
  signoff: Set<string>;
  focus: Focus;
  onFocus: (f: Focus) => void;
  onShowSystemInLog: (system: string) => void;
}

/* ------------------------------------------------------------------ helpers */

export function lensColor(lens: LensKey, i: Incident, trackIndex: number): string {
  if (lens === 'severity') return SEV_VAR[i.severity];
  if (lens === 'category') return CAT_VAR[i.category];
  if (lens === 'system') return SYS_VARS[trackIndex % SYS_VARS.length];
  if (lens === 'ttr') return TTR_VAR[ttrBucket(i)];
  return STATUS_VAR[i.status];
}

const shortDate = (ms: number) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(ms);
const cursorDate = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

interface Geo {
  w: number;
  h: number;
  desktop: boolean;
  padL: number;
  padT: number;
  plotW: number;
  plotH: number;
  rowH: number;
  half: number;
  xNow: number;
  start: number;
  nowMs: number;
  scale: number;
  x: (ms: number) => number;
  y: (k: number) => number;
}

function geometry(w: number, h: number, desktop: boolean, n: number, now: Date): Geo {
  const padL = desktop ? 244 : 14;
  const padR = desktop ? 84 : 46;
  // Phones: the kit's Today button sits in the stage's top-right corner (12–56 px), so the drum starts below it
  // and the date axis and NOW label move under the plot.
  const padT = desktop ? 136 : 68;
  const padB = desktop ? 104 : 76;
  const plotW = Math.max(120, w - padL - padR);
  const plotH = Math.max(120, h - padT - padB);
  const rowH = plotH / Math.max(1, n);
  const half = Math.max(8, Math.min(rowH * 0.44, 38));
  const nowMs = now.getTime();
  const start = nowMs - WINDOW_DAYS * DAY;
  const xNow = padL + plotW;
  return {
    w,
    h,
    desktop,
    padL,
    padT,
    plotW,
    plotH,
    rowH,
    half,
    xNow,
    start,
    nowMs,
    scale: Math.min(1.25, Math.max(0.55, plotW / 700)),
    x: (ms) => padL + ((Math.max(start, Math.min(nowMs, ms)) - start) / (nowMs - start)) * plotW,
    y: (k) => padT + rowH * (k + 0.5),
  };
}

/** Geometry of one tremor, shared by drawing, hit-testing and the focus overlay. */
function tremorGeo(g: Geo, i: Incident, k: number) {
  const x0 = g.x(toMs(i.startedAt));
  const y0 = g.y(k);
  const amp = g.half * SEV_AMP[i.severity];
  const open = i.status === 'open';
  const len = Math.min(ringPx(open ? null : timeToResolve(i), g.scale), Math.max(6, g.xNow - x0 - 2));
  return { x0, y0, amp, len, open };
}

/* ------------------------------------------------------------------ component */

export function Seismogram({ tracks, now, lens, role, aftershocks, mine, signoff, focus, onFocus, onShowSystemInLog }: SeismogramProps) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const g = useMemo(() => geometry(size.w, size.h, desktop, tracks.length, now), [size.w, size.h, desktop, tracks.length, now]);

  // Static paths (memoised per geometry): the burst of each tremor and each baseline.
  const shapes = useMemo(() => {
    const m = new Map<string, string>();
    tracks.forEach((t, k) => {
      for (const i of t.incidents) {
        const { x0, y0, amp, len } = tremorGeo(g, i, k);
        m.set(i.id, toPath(tremorPoints(x0, y0, amp, len, hash(i.id))));
      }
    });
    return m;
  }, [tracks, g]);
  const baselines = useMemo(() => tracks.map((t, k) => toPath(baselinePoints(g.padL, g.xNow - 12, g.y(k), hash(t.key)))), [tracks, g]);

  // Live elements written by the animation loop.
  const live = useRef(new Map<string, SVGPathElement | SVGCircleElement | null>());
  const setLive = (key: string) => (el: SVGPathElement | SVGCircleElement | null) => {
    live.current.set(key, el);
  };

  const stylusAmp = (t: Track) => {
    const open = t.incidents.filter((i) => i.status === 'open');
    if (!open.length) return 0;
    return Math.max(...open.map((i) => g.half * SEV_AMP[i.severity])) * 0.32;
  };

  useEffect(() => {
    if (reduced || !size.w) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 60) return;
      last = ts;
      const t = ts / 1000;
      tracks.forEach((tr, k) => {
        const y0 = g.y(k);
        for (const i of tr.incidents) {
          if (i.status !== 'open') continue;
          const el = live.current.get(`tail-${i.id}`);
          if (!el) continue;
          const { x0, amp, len } = tremorGeo(g, i, k);
          el.setAttribute('d', toPath(tailPoints(x0 + len, g.xNow, y0, amp * 0.32, hash(i.id), t)));
        }
        const a = stylusAmp(tr);
        const wob = a ? Math.sin(t * 11 + k * 1.7) * a * 0.9 + Math.sin(t * 23 + k) * a * 0.25 : Math.sin(t * 2.2 + k) * 0.7;
        const tipY = y0 + wob;
        const arm = live.current.get(`arm-${k}`);
        const tip = live.current.get(`tip-${k}`);
        const ink = live.current.get(`ink-${k}`);
        const px = g.xNow + (g.desktop ? 34 : 26);
        const py = y0 - (g.desktop ? 20 : 14);
        arm?.setAttribute('d', `M${px} ${py}L${g.xNow} ${tipY.toFixed(1)}`);
        tip?.setAttribute('cy', tipY.toFixed(1));
        if (ink && !a) {
          let d = `M${g.xNow - 12} ${y0}`;
          for (let x = g.xNow - 10; x < g.xNow; x += 2) d += `L${x} ${(y0 + Math.sin(t * 6 + x * 1.3 + k) * 0.8).toFixed(1)}`;
          ink.setAttribute('d', `${d}L${g.xNow} ${tipY.toFixed(1)}`);
        }
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, g, tracks]);

  const focusedIncident = focus?.kind === 'incident' ? tracks.flatMap((t, k) => t.incidents.map((i) => ({ i, k }))).find((x) => x.i.id === focus.id) : undefined;
  const focusedTrackIndex = focus?.kind === 'system' ? tracks.findIndex((t) => t.key === focus.key) : -1;
  const hovered = hover && hover !== focusedIncident?.i.id ? tracks.flatMap((t, k) => t.incidents.map((i) => ({ i, k }))).find((x) => x.i.id === hover) : undefined;

  /* ---------------------------------------------------------------- paper (grid and axis) */
  const paper = useMemo(() => {
    if (!size.w) return null;
    const lines: ReactNode[] = [];
    const labels: ReactNode[] = [];
    const pxDay = g.plotW / WINDOW_DAYS;
    const d0 = new Date(g.start);
    d0.setHours(0, 0, 0, 0);
    let lastLabel = -Infinity;
    const minGap = g.desktop ? 64 : 58;
    for (let ms = d0.getTime() + DAY; ms <= g.nowMs; ms += DAY) {
      const d = new Date(ms);
      // Keep local midnight across DST changes.
      if (d.getHours() !== 0) d.setHours(0, 0, 0, 0);
      const x = g.x(d.getTime());
      const monday = d.getDay() === 1;
      if (!monday && (!g.desktop || pxDay < 5)) continue;
      lines.push(
        <line
          key={ms}
          x1={x}
          x2={x}
          y1={g.padT - 6}
          y2={g.padT + g.plotH}
          stroke={monday ? 'var(--paper-grid-strong)' : 'var(--paper-grid)'}
          strokeWidth={1}
        />,
      );
      if (monday && x - lastLabel >= minGap && g.xNow - x > (g.desktop ? 40 : 64)) {
        lastLabel = x;
        labels.push(
          <text key={`l${ms}`} x={x + 4} y={g.desktop ? g.padT - 12 : g.padT + g.plotH + 18} className="font-mono" fontSize={10} fill="var(--paper-ink-muted)">
            {g.desktop ? `Mon ${shortDate(d.getTime())}` : shortDate(d.getTime())}
          </text>,
        );
      }
    }
    return (
      <>
        {lines}
        {labels}
        <line x1={g.xNow} x2={g.xNow} y1={g.padT - (g.desktop ? 22 : 8)} y2={g.padT + g.plotH + (g.desktop ? 6 : 8)} stroke="var(--accent-9)" strokeWidth={1} strokeDasharray="2 3" />
        <text x={g.xNow} y={g.desktop ? g.padT - 26 : g.padT + g.plotH + 18} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={600} fill="var(--brand-text)">
          NOW
        </text>
        {g.desktop && (
          <text x={g.padL} y={g.padT + g.plotH + 22} className="font-mono" fontSize={10} fill="var(--paper-ink-muted)">
            {WINDOW_DAYS} days ago
          </text>
        )}
      </>
    );
  }, [g, size.w]);

  return (
    <div ref={ref} className="absolute inset-y-0 left-0 w-[calc(100%-var(--side-w,0px))] select-none" data-testid="seismograph">
      {size.w > 0 && (
        <>
          <svg width={g.w} height={g.h} className="absolute inset-0" aria-hidden="true">
            {paper}
          </svg>
          <svg
            width={g.w}
            height={g.h}
            className={cx('absolute inset-0', !reduced && 'pm-reveal')}
            role="group"
            aria-label={`Seismogram of the last ${WINDOW_DAYS} days: ${tracks.reduce((s, t) => s + t.incidents.length, 0)} incidents on ${tracks.length} systems`}
          >
            {focusedTrackIndex >= 0 && (
              <rect
                x={g.desktop ? 12 : 0}
                y={g.y(focusedTrackIndex) - g.rowH / 2}
                width={g.xNow + (g.desktop ? 60 : 40) - (g.desktop ? 12 : 0)}
                height={g.rowH}
                rx={10}
                fill="color-mix(in oklab, var(--accent-9) 9%, transparent)"
                stroke="color-mix(in oklab, var(--accent-9) 35%, transparent)"
              />
            )}
            {tracks.map((t, k) => {
              const y0 = g.y(k);
              const dimTrack = focusedTrackIndex >= 0 && focusedTrackIndex !== k;
              const sAmp = stylusAmp(t);
              const px = g.xNow + (g.desktop ? 34 : 26);
              const py = y0 - (g.desktop ? 20 : 14);
              return (
                <g key={t.key} className="pm-track" opacity={dimTrack ? 0.32 : 1} data-track={t.label}>
                  {/* label */}
                  <g
                    role="button"
                    tabIndex={0}
                    className="pm-tremor"
                    aria-label={`${t.label}: ${t.incidents.length} incidents, ${t.open} open. Focus this trace.`}
                    onClick={() => onFocus(focusedTrackIndex === k ? null : { kind: 'system', key: t.key })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onFocus(focusedTrackIndex === k ? null : { kind: 'system', key: t.key });
                      }
                    }}
                  >
                    {g.desktop ? (
                      <>
                        <rect className="pm-hit" x={20} y={y0 - 20} width={g.padL - 40} height={40} rx={8} fill="transparent" />
                        {lens === 'system' && <circle cx={30} cy={y0 - 6} r={4} fill={SYS_VARS[k % SYS_VARS.length]} />}
                        <text x={lens === 'system' ? 40 : 28} y={y0 - 2} fontSize={13} fontWeight={600} fill="var(--paper-ink)">
                          {truncate(t.label, lens === 'system' ? 27 : 29)}
                        </text>
                        <text x={lens === 'system' ? 40 : 28} y={y0 + 14} fontSize={11} className="font-mono" fill="var(--paper-ink-muted)">
                          {t.incidents.length} tremor{t.incidents.length === 1 ? '' : 's'}
                          {t.open ? ` · ${t.open} open` : ''}
                        </text>
                      </>
                    ) : (
                      <>
                        <rect className="pm-hit" x={g.padL - 4} y={y0 - g.rowH / 2 + 2} width={Math.min(200, g.plotW)} height={14} rx={4} fill="transparent" />
                        <text x={g.padL} y={y0 - g.rowH / 2 + 12} fontSize={10} className="font-mono" fill="var(--paper-ink-muted)" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {truncate(t.label, 30)} · {t.incidents.length}
                        </text>
                      </>
                    )}
                  </g>

                  {/* the quiet baseline, then fresh ink near the stylus */}
                  <path d={baselines[k]} fill="none" stroke="var(--paper-ink-muted)" strokeOpacity={0.55} strokeWidth={1} />
                  {!sAmp && <path ref={setLive(`ink-${k}`)} d={`M${g.xNow - 12} ${y0}L${g.xNow} ${y0}`} fill="none" stroke="var(--paper-ink-muted)" strokeWidth={1} />}

                  {/* tremors */}
                  {t.incidents.map((i) => {
                    const { x0, amp, len, open } = tremorGeo(g, i, k);
                    const color = lensColor(lens, i, k);
                    const focused = focusedIncident?.i.id === i.id;
                    const dim = (role === 'engineer' && !mine.has(i.id)) || (focusedIncident && !focused);
                    const shocks = aftershocks.get(i.id) ?? [];
                    const shockH = Math.max(4, amp * 0.38);
                    const top = Math.max(amp, 9) + 5;
                    const right = x0 + len + (shocks.length ? 6 + shocks.length * 6 : 0) + 4;
                    const label = `${i.severity.toUpperCase()} ${i.title}. ${i.system}, ${categoryLabels[i.category]}. ${statusLabels[i.status]}${
                      open ? `, open for ${formatDuration(openFor(i, now))}` : `, resolved in ${formatDuration(timeToResolve(i))}`
                    }${shocks.length ? `, ${shocks.length} open action item${shocks.length === 1 ? '' : 's'}` : ''}.`;
                    return (
                      <g
                        key={i.id}
                        role="button"
                        tabIndex={0}
                        className="pm-tremor"
                        aria-label={label}
                        aria-pressed={focused}
                        data-incident={i.id}
                        opacity={dim ? (role === 'engineer' && !mine.has(i.id) ? 0.22 : 0.4) : 1}
                        style={{ transition: 'opacity 200ms' }}
                        onMouseEnter={() => setHover(i.id)}
                        onMouseLeave={() => setHover((h) => (h === i.id ? null : h))}
                        onFocus={() => setHover(i.id)}
                        onBlur={() => setHover((h) => (h === i.id ? null : h))}
                        onClick={() => onFocus(focused ? null : { kind: 'incident', id: i.id })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onFocus(focused ? null : { kind: 'incident', id: i.id });
                          }
                        }}
                      >
                        <rect className="pm-hit" x={x0 - 6} y={y0 - top} width={Math.max(14, right - x0 + 6)} height={top * 2} rx={6} fill="transparent" />
                        {open && (
                          <path
                            ref={setLive(`tail-${i.id}`)}
                            d={toPath(tailPoints(x0 + len, g.xNow, y0, amp * 0.32, hash(i.id), 0))}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.25}
                            strokeLinejoin="round"
                            className="pm-trace"
                          />
                        )}
                        <path d={shapes.get(i.id)} fill="none" stroke={color} strokeWidth={focused ? 2.4 : 1.6} strokeLinejoin="round" className="pm-trace" />
                        {shocks.map((s, j) => {
                          const sx = x0 + len + 6 + j * 6;
                          return (
                            <path
                              key={s.item.id}
                              d={`M${sx} ${y0}L${sx + 1.5} ${y0 - shockH}L${sx + 3} ${y0 + shockH * 0.5}L${sx + 4.5} ${y0}`}
                              fill="none"
                              stroke={s.overdue ? 'var(--bad-solid)' : 'var(--paper-ink-muted)'}
                              strokeWidth={s.overdue ? 1.6 : 1.2}
                              strokeLinejoin="round"
                            />
                          );
                        })}
                        {role === 'lead' && signoff.has(i.id) && (
                          <rect
                            x={x0 + 2}
                            y={y0 - amp - 13}
                            width={7}
                            height={7}
                            transform={`rotate(45 ${x0 + 5.5} ${y0 - amp - 9.5})`}
                            fill="var(--paper)"
                            stroke="var(--accent-10)"
                            strokeWidth={1.6}
                          >
                            <title>Ready for sign-off</title>
                          </rect>
                        )}
                      </g>
                    );
                  })}

                  {/* stylus: pivot, arm and inked tip at "now" */}
                  <path ref={setLive(`arm-${k}`)} d={`M${px} ${py}L${g.xNow} ${y0}`} stroke="var(--paper-ink-muted)" strokeWidth={1.25} fill="none" />
                  <circle cx={px} cy={py} r={3} fill="var(--paper)" stroke="var(--paper-ink-muted)" strokeWidth={1.25} />
                  {sAmp > 0 && <circle cx={g.xNow} cy={y0} r={7} fill="var(--accent-9)" opacity={0.18} className={reduced ? undefined : 'pm-blink'} />}
                  <circle ref={setLive(`tip-${k}`)} cx={g.xNow} cy={y0} r={sAmp ? 3 : 2.4} fill={sAmp ? 'var(--accent-9)' : 'var(--paper-ink-muted)'} />
                </g>
              );
            })}

            {/* focus cursor: a vertical line through the drum at the moment the incident started */}
            {focusedIncident &&
              (() => {
                const { x0, y0, amp } = tremorGeo(g, focusedIncident.i, focusedIncident.k);
                const label = cursorDate(toMs(focusedIncident.i.startedAt));
                const lw = label.length * 6.4 + 16;
                const lx = Math.min(Math.max(x0 - lw / 2, 4), g.w - lw - 4);
                return (
                  <g pointerEvents="none">
                    <line x1={x0} x2={x0} y1={g.padT - 4} y2={g.padT + g.plotH} stroke="var(--accent-10)" strokeWidth={1} strokeDasharray="3 3" />
                    <rect x={lx} y={g.padT + g.plotH + 8} width={lw} height={20} rx={6} fill="var(--accent-9)" />
                    <text x={lx + lw / 2} y={g.padT + g.plotH + 22} textAnchor="middle" className="font-mono" fontSize={10.5} fontWeight={600} fill="var(--accent-contrast)">
                      {label}
                    </text>
                    <circle cx={x0 + 4} cy={y0} r={amp + 9} fill="none" stroke="var(--accent-10)" strokeWidth={1.5} className={reduced ? undefined : 'pm-blink'} />
                  </g>
                );
              })()}
          </svg>

          {hovered && !focusedIncident && <HoverTip g={g} i={hovered.i} k={hovered.k} now={now} />}
          {focusedIncident && (
            <IncidentCard g={g} i={focusedIncident.i} k={focusedIncident.k} now={now} shocks={aftershocks.get(focusedIncident.i.id) ?? []} onClose={() => onFocus(null)} />
          )}
          {focusedTrackIndex >= 0 && (
            <SystemCard g={g} t={tracks[focusedTrackIndex]} k={focusedTrackIndex} onClose={() => onFocus(null)} onShowInLog={onShowSystemInLog} />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ overlays */

function HoverTip({ g, i, k, now }: { g: Geo; i: Incident; k: number; now: Date }) {
  const { x0, y0, amp } = tremorGeo(g, i, k);
  const left = Math.min(Math.max(x0, 130), g.w - 130);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-max max-w-[260px] -translate-x-1/2 -translate-y-full rounded-lg bg-inverse px-2.5 py-2 text-xs text-on-inverse shadow-1"
      style={{ left, top: y0 - Math.max(amp, 10) - 10 }}
    >
      <div className="flex items-center gap-1.5">
        <SeverityChip severity={i.severity} size="sm" />
        <span className="font-mono text-[10.5px] opacity-75">{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(toMs(i.startedAt))}</span>
      </div>
      <div className="mt-1 text-[12.5px] font-medium leading-4">{i.title}</div>
      <div className="mt-0.5 opacity-75">
        {i.status === 'open' ? `Open for ${formatDuration(openFor(i, now))}` : `Resolved in ${formatDuration(timeToResolve(i))}`}
      </div>
    </div>
  );
}

function cardPosition(g: Geo, x: number, y: number, width: number, height: number) {
  // Phones: a full-width card on the half of the drum away from the tremor, so the tremor stays visible.
  // (Top cards start below the kit's Today button.)
  if (!g.desktop) return y < g.h / 2 ? ({ left: 8, right: 8, bottom: 8 } as const) : ({ left: 8, right: 8, top: 64 } as const);
  const roomRight = x + 22 + width < g.w - 12;
  const left = roomRight ? x + 22 : Math.max(12, x - 22 - width);
  const top = Math.min(Math.max(y - 64, g.padT - 30), g.h - height - 76);
  return { left, top, width } as const;
}

function IncidentCard({
  g,
  i,
  k,
  now,
  shocks,
  onClose,
}: {
  g: Geo;
  i: Incident;
  k: number;
  now: Date;
  shocks: { overdue: boolean; item: ActionItem }[];
  onClose: () => void;
}) {
  const { x0, y0, len } = tremorGeo(g, i, k);
  const pos = cardPosition(g, x0 + len, y0, 330, 230);
  const overdue = shocks.filter((s) => s.overdue).length;
  return (
    <div
      className="x-glass absolute z-20 animate-x-in p-4"
      style={pos}
      data-testid="focus-card"
      role="region"
      aria-label={`Incident: ${i.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityChip severity={i.severity} label />
          <Badge tone={i.status === 'open' ? 'warn' : i.status === 'reviewed' ? 'ok' : 'info'} pulse={i.status === 'open'}>
            {statusLabels[i.status]}
          </Badge>
          <AgingChip incident={i} now={now} />
        </div>
        <IconButton size="sm" label="Close" icon={<X />} onClick={onClose} className="-mr-1.5 -mt-1.5" />
      </div>
      <h2 className="x-serif m-0 mt-2.5 text-[24px] leading-[1.15] text-fg">{i.title}</h2>
      <div className="mt-1.5 text-ui text-muted">
        {i.system} · {categoryLabels[i.category]}
      </div>
      <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-ui">
        <dt className="text-muted">{i.status === 'open' ? 'Open for' : 'Time to resolve'}</dt>
        <dd className="m-0 text-right font-mono num">{formatDuration(i.status === 'open' ? openFor(i, now) : timeToResolve(i))}</dd>
        <dt className="text-muted">Aftershocks</dt>
        <dd className={cx('m-0 text-right font-mono num', overdue > 0 && 'text-bad-text')}>
          {shocks.length ? `${shocks.length} open${overdue ? ` · ${overdue} late` : ''}` : 'none open'}
        </dd>
      </dl>
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-faint">Esc to close · [ ] step</span>
        <LinkButton to={`/incidents/${i.id}`} variant="primary" size="sm" iconRight={<ArrowRight />}>
          Open black box
        </LinkButton>
      </div>
    </div>
  );
}

function SystemCard({ g, t, k, onClose, onShowInLog }: { g: Geo; t: Track; k: number; onClose: () => void; onShowInLog: (system: string) => void }) {
  const s = summariseTrack(t);
  const y0 = g.y(k);
  const pos = g.desktop
    ? { left: g.padL + 16, top: y0 + g.rowH / 2 + 6 > g.h - 240 ? Math.max(g.padT - 30, y0 - g.rowH / 2 - 186) : y0 + g.rowH / 2 + 6, width: 340 }
    : y0 < g.h / 2
      ? { left: 8, right: 8, bottom: 8 }
      : { left: 8, right: 8, top: 64 };
  return (
    <div className="x-glass absolute z-20 animate-x-in p-4" style={pos} data-testid="system-card" role="region" aria-label={`System: ${t.label}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="x-legend-label text-muted">Trace · last {WINDOW_DAYS} days</span>
        <IconButton size="sm" label="Close" icon={<X />} onClick={onClose} className="-mr-1.5 -mt-1.5" />
      </div>
      <h2 className="x-serif m-0 mt-1 text-[24px] leading-tight text-fg">{t.label}</h2>
      <dl className="m-0 mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <div>
          <dt className="text-xs text-muted">Tremors</dt>
          <dd className="m-0 mt-0.5 font-mono text-lg font-semibold num">{s.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Still open</dt>
          <dd className={cx('m-0 mt-0.5 font-mono text-lg font-semibold num', s.open > 0 && 'text-warn-text')}>{s.open}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Median TTR</dt>
          <dd className="m-0 mt-0.5 font-mono text-lg font-semibold num">{s.medianTtrMinutes === null ? '—' : formatDuration(s.medianTtrMinutes).replace(' min', 'm')}</dd>
        </div>
      </dl>
      {s.topCategory && (
        <p className="m-0 mt-2.5 text-ui text-muted">
          Top cause: <span className="font-medium text-fg">{categoryLabels[s.topCategory.category]}</span>{' '}
          <span className="font-mono num">× {s.topCategory.count}</span>
        </p>
      )}
      <div className="mt-3.5 flex justify-end">
        <button
          type="button"
          onClick={() => onShowInLog(t.label)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-ui font-medium text-brand-text hover:bg-accent-3"
        >
          Show in the log <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

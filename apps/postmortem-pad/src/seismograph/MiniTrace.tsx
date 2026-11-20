/**
 * One system's trace on its own: the same encodings as the big drum (amplitude = severity, ring-down = time to
 * resolve, open incidents tremble to "now"), small enough for a row, the Black box and the form preview.
 */
import { DAY, toMs } from '@x10/shared/lib';

import { SEV_VAR } from '../components/palette';
import { timeToResolve } from '../domain/rules';
import { baselinePoints, hash, ringPx, SEV_AMP, tailPoints, toPath, tremorPoints, WINDOW_DAYS } from '../domain/seismo';
import type { Incident } from '../model';
import { useSize } from './useSize';

type MiniIncident = Pick<Incident, 'id' | 'title' | 'severity' | 'status' | 'startedAt' | 'resolvedAt'>;

export function MiniTrace({
  incidents,
  now,
  highlightId,
  height = 56,
  days = WINDOW_DAYS,
  label,
  links = true,
}: {
  incidents: MiniIncident[];
  now: Date;
  highlightId?: string | null;
  height?: number;
  days?: number;
  /** Accessible name for the trace. */
  label: string;
  /** Each tremor links to its Black box. */
  links?: boolean;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const padR = 14;
  const plotW = Math.max(40, w - padR - 4);
  const y0 = height / 2;
  const half = height * 0.42;
  const start = now.getTime() - days * DAY;
  const x = (ms: number) => 2 + ((Math.max(start, Math.min(now.getTime(), ms)) - start) / (now.getTime() - start)) * plotW;
  const xNow = 2 + plotW;
  const scale = Math.min(1, Math.max(0.5, plotW / 700));
  const anyOpen = incidents.some((i) => i.status === 'open');

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="group" aria-label={label} className="absolute inset-0 overflow-visible">
          <path d={toPath(baselinePoints(2, xNow, y0, hash(label), 0.35))} fill="none" stroke="var(--paper-ink-muted)" strokeOpacity={0.5} strokeWidth={1} />
          {incidents.map((i) => {
            const x0 = x(toMs(i.startedAt));
            const amp = half * SEV_AMP[i.severity];
            const open = i.status === 'open';
            const len = Math.min(ringPx(open ? null : timeToResolve(i), scale), Math.max(6, xNow - x0 - 1));
            const hl = i.id === highlightId;
            const dim = highlightId && !hl;
            const body = (
              <g opacity={dim ? 0.45 : 1}>
                {hl && <circle cx={x0 + 4} cy={y0} r={amp + 6} fill="color-mix(in oklab, var(--accent-9) 16%, transparent)" stroke="var(--accent-10)" strokeWidth={1.25} />}
                {open && <path d={toPath(tailPoints(x0 + len, xNow, y0, amp * 0.3, hash(i.id), 0))} fill="none" stroke={SEV_VAR[i.severity]} strokeWidth={1.1} />}
                <path d={toPath(tremorPoints(x0, y0, amp, len, hash(i.id)))} fill="none" stroke={SEV_VAR[i.severity]} strokeWidth={hl ? 2 : 1.4} strokeLinejoin="round" />
                <rect x={x0 - 4} y={y0 - Math.max(amp, 8) - 2} width={len + 8} height={Math.max(amp, 8) * 2 + 4} fill="transparent" />
              </g>
            );
            return links && !hl && i.id !== 'preview' ? (
              <a key={i.id} href={`#/incidents/${i.id}`} aria-label={`${i.severity.toUpperCase()} ${i.title}`}>
                <title>{i.title}</title>
                {body}
              </a>
            ) : (
              <g key={i.id}>
                <title>{i.title}</title>
                {body}
              </g>
            );
          })}
          <circle cx={xNow} cy={y0} r={2.6} fill={anyOpen ? 'var(--accent-9)' : 'var(--paper-ink-muted)'} />
        </svg>
      )}
    </div>
  );
}

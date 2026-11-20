/**
 * Weekday × hour heat map of incident start times (viewer's local time), drawn as a fault map: amber intensity per
 * cell, row and column totals, and the Monday-morning band called out when it carries the load.
 */
import { cx } from '@x10/shared/ui';

import { HOURS, WEEKDAYS } from '../domain/trends';
import { useSize } from '../seismograph/useSize';

export function FaultMap({ matrix, total, className }: { matrix: number[][]; total: number; className?: string }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const narrow = w < 640;
  const labelW = narrow ? 34 : 48;
  const totalW = narrow ? 26 : 44;
  const top = 22;
  const cellW = Math.max(8, (w - labelW - totalW) / 24);
  const cellH = narrow ? 24 : 34;
  const gap = narrow ? 1.5 : 3;
  const gridH = cellH * 7;
  const colBarsH = narrow ? 26 : 40;
  const h = top + gridH + 10 + colBarsH + 18;
  const max = Math.max(1, ...matrix.flat());
  const colTotals = HOURS.map((_, c) => matrix.reduce((s, row) => s + row[c], 0));
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const maxCol = Math.max(1, ...colTotals);
  const mondayMorning = matrix[0].slice(6, 12).reduce((s, v) => s + v, 0);
  const showBand = total > 0 && mondayMorning / total >= 0.25;
  const x = (c: number) => labelW + c * cellW;
  const y = (r: number) => top + r * cellH;

  return (
    <div ref={ref} className={cx('relative w-full', className)} style={{ height: h }}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Incidents by weekday and hour started: ${total} in range${showBand ? `, ${mondayMorning} on Monday between 06:00 and 12:00` : ''}.`}>
          {HOURS.map((hh, c) =>
            c % (narrow ? 6 : 3) === 0 ? (
              <text key={hh} x={x(c) + 1} y={top - 8} className="font-mono" fontSize={10} fill="var(--muted)">
                {hh}
                {narrow ? '' : ':00'}
              </text>
            ) : null,
          )}
          {WEEKDAYS.map((d, r) => (
            <g key={d}>
              <text x={0} y={y(r) + cellH / 2 + 4} className="font-mono" fontSize={narrow ? 10 : 11} fill={r === 0 && showBand ? 'var(--text)' : 'var(--muted)'} fontWeight={r === 0 && showBand ? 600 : 400}>
                {narrow ? d.slice(0, 2) : d}
              </text>
              {matrix[r].map((v, c) => {
                const k = v / max;
                return (
                  <g key={c}>
                    <rect
                      x={x(c) + gap / 2}
                      y={y(r) + gap / 2}
                      width={cellW - gap}
                      height={cellH - gap}
                      rx={narrow ? 2 : 4}
                      fill={v ? `color-mix(in oklab, var(--accent-9) ${Math.round(18 + k * 82)}%, var(--surface))` : 'var(--gray-3)'}
                    >
                      <title>{`${d} ${HOURS[c]}:00–${HOURS[c]}:59 · ${v} incident${v === 1 ? '' : 's'}`}</title>
                    </rect>
                    {v > 0 && cellW >= 22 && (
                      <text
                        x={x(c) + cellW / 2}
                        y={y(r) + cellH / 2 + 4}
                        textAnchor="middle"
                        className="font-mono"
                        fontSize={11}
                        fontWeight={600}
                        fill={k > 0.45 ? 'var(--accent-contrast)' : 'var(--text)'}
                        pointerEvents="none"
                      >
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={w - 2} y={y(r) + cellH / 2 + 4} textAnchor="end" className="font-mono" fontSize={11} fill={rowTotals[r] ? 'var(--text)' : 'var(--faint)'}>
                {rowTotals[r]}
              </text>
            </g>
          ))}
          {showBand && (
            <rect
              x={x(6) - 1}
              y={y(0) - 1}
              width={cellW * 6 + 2}
              height={cellH + 2}
              rx={6}
              fill="none"
              stroke="var(--accent-11)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              data-testid="monday-band"
            />
          )}
          {colTotals.map((v, c) => {
            const bh = (v / maxCol) * colBarsH;
            return (
              <rect key={c} x={x(c) + gap / 2} y={top + gridH + 10 + colBarsH - bh} width={cellW - gap} height={Math.max(v ? 2 : 1, bh)} rx={1.5} fill={v ? 'var(--accent-9)' : 'var(--gray-4)'} opacity={v ? 0.85 : 1}>
                <title>{`${HOURS[c]}:00 · ${v} incident${v === 1 ? '' : 's'}`}</title>
              </rect>
            );
          })}
          <text x={0} y={h - 2} className="font-mono" fontSize={10} fill="var(--muted)">
            by hour
          </text>
          <text x={w - 2} y={top - 8} textAnchor="end" className="font-mono" fontSize={10} fill="var(--muted)">
            total
          </text>
        </svg>
      )}
      {total === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="x-glass rounded-full! px-3 py-1.5 text-sm text-muted">No data for this range.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Live preview beside the incident form: the tremor this incident will draw on its system's trace (amplitude from
 * the severity you pick), and the severity scale with the chosen one lit.
 */
import { cx } from '@x10/shared/ui';

import { severityHelp } from '../config';
import type { IncidentInput } from '../domain/rules';
import { SEVERITIES, type Incident } from '../model';
import { MiniTrace } from '../seismograph/MiniTrace';
import { SeverityChip } from './chips';

export function TremorPreview({ value, incidents, now }: { value: IncidentInput; incidents: Incident[]; now: Date }) {
  const preview =
    value.severity && value.startedAt
      ? [
          ...incidents,
          { id: 'preview', title: value.title || 'This incident', severity: value.severity, status: 'open' as const, startedAt: value.startedAt, resolvedAt: null },
        ]
      : incidents;
  return (
    <div className="sticky top-[calc(var(--header-h)+24px)] space-y-6">
      <section aria-label="Preview on the seismograph">
        <div className="x-legend-label text-muted">On the seismograph</div>
        <div className="mt-2 rounded-xl bg-[var(--paper)] px-3 pt-3 pb-2 ring-1 ring-inset ring-line">
          <div className="mb-1 truncate font-mono text-[11px] uppercase tracking-[0.04em] text-muted">{value.system.trim() || 'Your system'}</div>
          <MiniTrace incidents={preview} now={now} highlightId={value.severity ? 'preview' : null} height={70} days={30} label="Preview of the new tremor" links={false} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
            <span>30 days ago</span>
            <span>now</span>
          </div>
        </div>
        <p className="m-0 mt-2 text-xs text-muted">{value.severity ? 'It keeps trembling until it is resolved.' : 'Pick a severity to see its tremor.'}</p>
      </section>
      <section aria-label="Severity scale">
        <div className="x-legend-label text-muted">Severity scale</div>
        <ul className="m-0 mt-2 list-none space-y-1 p-0">
          {SEVERITIES.map((s) => (
            <li key={s} className={cx('flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors', value.severity === s ? 'bg-accent-3' : 'opacity-75')}>
              <SeverityChip severity={s} size="sm" className="mt-0.5" />
              <span className="text-ui leading-5 text-fg">{severityHelp[s]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

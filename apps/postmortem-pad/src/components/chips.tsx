import { DAY, formatDate, toMs } from '@x10/shared/lib';
import { Badge, cx, type Tone } from '@x10/shared/ui';

import { severityHelp, severityLabels, statusLabels } from '../config';
import type { ActionItem, Incident, Severity, Status } from '../model';
import { isAging, isOverdue } from '../domain/rules';
import { SEV_NAME } from './palette';

const statusTone: Record<Status, Tone> = { open: 'warn', resolved: 'info', reviewed: 'ok' };

/**
 * Severity as a strong colour: a solid block with the SEV code (SEV4 is a quiet outline). `label` adds the plain
 * name ("Critical"). Colour is never the only signal: the code is always there.
 */
export function SeverityChip({ severity, label, size = 'md', className }: { severity: Severity; label?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sz =
    size === 'lg' ? 'h-8 px-2.5 text-sm gap-2' : size === 'sm' ? 'h-[18px] px-1.5 text-[10px] gap-1' : 'h-[22px] px-1.5 text-[11px] gap-1.5';
  return (
    <span
      title={severityHelp[severity]}
      className={cx('inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-mono font-semibold tracking-[0.02em]', sz, className)}
      style={
        severity === 'sev4'
          ? { background: 'var(--sev4-soft)', color: 'var(--sev4-fg)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }
          : { background: `var(--${severity})`, color: `var(--${severity}-fg)` }
      }
    >
      {severityLabels[severity]}
      {label && <span className="font-sans font-medium tracking-normal opacity-85">{SEV_NAME[severity]}</span>}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <Badge tone={statusTone[status]} pulse={status === 'open'}>
      {statusLabels[status]}
    </Badge>
  );
}

/** "Aging · 12 d" for an open incident older than the aging threshold; nothing otherwise. */
export function AgingChip({ incident, now }: { incident: Pick<Incident, 'startedAt' | 'status'>; now: Date }) {
  if (!isAging(incident, now)) return null;
  const days = Math.floor((now.getTime() - toMs(incident.startedAt)) / DAY);
  return (
    <Badge tone="bad" variant="soft" title="Open for more than a week">
      Aging · <span className="font-mono num">{days} d</span>
    </Badge>
  );
}

export function DueChip({ item, now }: { item: Pick<ActionItem, 'dueDate' | 'done'>; now: Date }) {
  if (item.done) return <Badge tone="ok">Done</Badge>;
  if (!item.dueDate) return <Badge tone="neutral">No due date</Badge>;
  if (isOverdue(item, now)) return <Badge tone="bad">Overdue · due {formatDate(item.dueDate)}</Badge>;
  return <Badge tone="info">Due {formatDate(item.dueDate)}</Badge>;
}

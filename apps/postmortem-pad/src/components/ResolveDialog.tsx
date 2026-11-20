import { useEffect, useId, useState } from 'react';

import { fromLocalInput, toLocalInput } from '@x10/shared/lib';
import { Button, Dialog, Field, InlineError, Input, TextArea } from '@x10/shared/ui';

import { checklistTemplates } from '../config';
import { IncidentValidationError, toInput, type ResolveInput } from '../domain/incidents';
import { validateIncident, type IncidentErrors } from '../domain/rules';
import { limits, type Incident } from '../model';
import { BlamelessHint } from './BlamelessHint';

/** Resolve an open incident: resolved time, root cause and fix are all required (rule 2). */
export function ResolveDialog({
  open,
  onClose,
  incident,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  incident: Incident;
  onSubmit: (r: ResolveInput) => Promise<void>;
}) {
  const init = (): ResolveInput => ({
    resolvedAt: incident.resolvedAt ?? new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(),
    rootCause: incident.rootCause ?? checklistTemplates[incident.category],
    fix: incident.fix ?? '',
  });
  const [v, setV] = useState<ResolveInput>(init);
  const [errors, setErrors] = useState<IncidentErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    if (open) {
      setV(init());
      setErrors({});
      setFailure(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const check = (next: ResolveInput) => validateIncident({ ...toInput(incident), ...next, status: 'resolved' }, new Date());

  const submit = async () => {
    const e = check(v);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(v);
      onClose();
    } catch (err) {
      if (err instanceof IncidentValidationError) setErrors(err.fields);
      else setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const other = Object.entries(errors)
    .filter(([k, m]) => m && !['resolvedAt', 'rootCause', 'fix'].includes(k))
    .map(([, m]) => m);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark resolved"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={submit}>
            Mark resolved
          </Button>
        </>
      }
    >
      <p className="mt-0 text-sm text-muted">Resolving needs three facts: when it was fixed, why it happened and what fixed it.</p>
      <Field label="Resolved at" htmlFor={`${id}-at`} required error={errors.resolvedAt} hint="Your local time.">
        <Input id={`${id}-at`} type="datetime-local" value={toLocalInput(v.resolvedAt)} onChange={(e) => setV({ ...v, resolvedAt: fromLocalInput(e.target.value) })} invalid={!!errors.resolvedAt} />
      </Field>
      <Field label="Root cause" htmlFor={`${id}-rc`} required error={errors.rootCause} counter={{ value: v.rootCause.length, max: limits.narrative.max }}>
        <TextArea id={`${id}-rc`} rows={5} value={v.rootCause} onChange={(e) => setV({ ...v, rootCause: e.target.value })} invalid={!!errors.rootCause} />
      </Field>
      <div className="-mt-3 mb-4">
        <BlamelessHint text={v.rootCause} />
      </div>
      <Field label="Fix" htmlFor={`${id}-fix`} required error={errors.fix} counter={{ value: v.fix.length, max: limits.narrative.max }}>
        <TextArea id={`${id}-fix`} rows={3} value={v.fix} onChange={(e) => setV({ ...v, fix: e.target.value })} invalid={!!errors.fix} />
      </Field>
      <div className="-mt-3 mb-2">
        <BlamelessHint text={v.fix} />
      </div>
      {other.map((m) => (
        <InlineError key={m} error={m} />
      ))}
      <InlineError error={failure} />
    </Dialog>
  );
}

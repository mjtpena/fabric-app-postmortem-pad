import { useEffect, useId, useState } from 'react';

import { fromDateInput, toDateInput } from '@x10/shared/lib';
import { Button, Dialog, Field, InlineError, Input } from '@x10/shared/ui';

import { ActionValidationError, type ActionInput } from '../domain/incidents';
import { validateActionItem } from '../domain/rules';
import { limits } from '../model';

type Errs = Partial<Record<keyof ActionInput, string>>;

/** Add or edit an action item. */
export function ActionItemDialog({
  open,
  onClose,
  initial,
  owners,
  title,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  initial: ActionInput;
  owners: string[];
  title: string;
  submitLabel: string;
  onSubmit: (v: ActionInput) => Promise<void>;
}) {
  const [v, setV] = useState<ActionInput>(initial);
  const [errors, setErrors] = useState<Errs>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    if (open) {
      setV(initial);
      setErrors({});
      setFailure(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const e = validateActionItem(v);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(v);
      onClose();
    } catch (err) {
      if (err instanceof ActionValidationError) setErrors(err.fields);
      else setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={submit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Action" htmlFor={`${id}-title`} required error={errors.title} counter={{ value: v.title.length, max: limits.actionTitle.max }} hint="Start with a verb: Add, Alert, Document…">
          <Input id={`${id}-title`} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} invalid={!!errors.title} autoComplete="off" />
        </Field>
        <Field label="Owner" htmlFor={`${id}-owner`} required error={errors.ownerName} counter={{ value: v.ownerName.length, max: limits.ownerName.max }}>
          <Input id={`${id}-owner`} value={v.ownerName} list={`${id}-owners`} onChange={(e) => setV({ ...v, ownerName: e.target.value })} invalid={!!errors.ownerName} autoComplete="off" />
          <datalist id={`${id}-owners`}>
            {owners.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label="Due date" htmlFor={`${id}-due`} error={errors.dueDate} hint="Optional. Overdue the day after.">
          <Input id={`${id}-due`} type="date" value={toDateInput(v.dueDate)} onChange={(e) => setV({ ...v, dueDate: fromDateInput(e.target.value) })} />
        </Field>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      <InlineError error={failure} />
    </Dialog>
  );
}

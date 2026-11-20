import { useId, useState, type ReactNode } from 'react';

import { fromLocalInput, toLocalInput, useAction } from '@x10/shared/lib';
import { ChevronDown } from 'lucide-react';

import { Button, Field, InlineError, Input, Select, TextArea, cx } from '@x10/shared/ui';

import { categoryLabels, checklistTemplates, severityHelp, severityLabels, statusLabels } from '../config';
import { IncidentValidationError } from '../domain/incidents';
import {
  isBlankRootCause,
  rootCauseAfterCategoryChange,
  validateIncident,
  type IncidentErrors,
  type IncidentInput,
} from '../domain/rules';
import { CATEGORIES, limits, SEVERITIES, type Category, type Severity } from '../model';
import { BlamelessHint } from './BlamelessHint';

const DETAIL_FIELDS: (keyof IncidentInput)[] = ['detectedAt', 'resolvedAt', 'summary', 'rootCause', 'fix', 'prevention', 'status'];

/**
 * Incident form: the five quick fields up front, everything else in a collapsible "Add details now" section.
 * Validation runs on submit and then live while the person fixes the fields.
 */
export function IncidentForm({
  initial,
  systems,
  submitLabel,
  detailsInitiallyOpen,
  lockedStatus,
  onSubmit,
  onCancel,
  aside,
}: {
  initial: IncidentInput;
  systems: string[];
  submitLabel: string;
  detailsInitiallyOpen?: boolean;
  /** Shown instead of the status select (for a reviewed incident, whose status only a lead changes). */
  lockedStatus?: ReactNode;
  onSubmit: (v: IncidentInput) => Promise<void>;
  onCancel?: () => void;
  /** Right column on wide screens (a live preview of the tremor); receives the current values. */
  aside?: (v: IncidentInput) => ReactNode;
}) {
  const [v, setV] = useState<IncidentInput>(initial);
  const [errors, setErrors] = useState<IncidentErrors>({});
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState(!!detailsInitiallyOpen);
  const id = useId();
  const f = (name: string) => `${id}-${name}`;

  const set = <K extends keyof IncidentInput>(key: K, value: IncidentInput[K]) => {
    const next = { ...v, [key]: value };
    setV(next);
    if (tried) setErrors(validateIncident(next, new Date()));
  };

  const onCategory = (cat: Category | '') => {
    const next = { ...v, category: cat, rootCause: rootCauseAfterCategoryChange(v.rootCause, v.category, cat) };
    setV(next);
    if (tried) setErrors(validateIncident(next, new Date()));
  };

  const save = useAction(async () => {
    setTried(true);
    const e = validateIncident(v, new Date());
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      if (DETAIL_FIELDS.some((k) => e[k])) setOpen(true);
      return;
    }
    try {
      await onSubmit(v);
    } catch (err) {
      if (err instanceof IncidentValidationError) {
        setErrors(err.fields);
        if (DETAIL_FIELDS.some((k) => err.fields[k])) setOpen(true);
        return;
      }
      throw err;
    }
  });

  const templateUntouched =
    !!v.category && !!v.rootCause.trim() && isBlankRootCause(v.rootCause, v.category);

  const narrative = (key: 'summary' | 'rootCause' | 'fix' | 'prevention', label: string, hint?: ReactNode, extra?: ReactNode) => (
    <div>
      <Field
        label={label}
        htmlFor={f(key)}
        error={errors[key]}
        hint={hint}
        counter={{ value: v[key].length, max: limits.narrative.max }}
      >
        <TextArea
          id={f(key)}
          value={v[key]}
          rows={key === 'rootCause' ? 5 : 3}
          onChange={(e) => set(key, e.target.value)}
          invalid={!!errors[key]}
          aria-describedby={`${f(key)}-blame`}
        />
      </Field>
      <div className="-mt-3 mb-4">
        <BlamelessHint text={key === 'rootCause' && templateUntouched ? '' : v[key]} id={`${f(key)}-blame`} />
        {extra}
      </div>
    </div>
  );

  return (
    <form
      noValidate
      className={cx('grid gap-x-12 gap-y-6', aside && 'lg:grid-cols-[minmax(0,1fr)_320px]')}
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <div className="min-w-0">
      <section aria-labelledby={f('basics')} className="pb-2">
        <h2 id={f('basics')} className="x-legend-label m-0 mb-4 text-muted">
          The basics · five fields
        </h2>
        <Field
          label="Title"
          htmlFor={f('title')}
          required
          error={errors.title}
          hint="What failed, in one line."
          counter={{ value: v.title.length, max: limits.incidentTitle.max }}
        >
          <Input id={f('title')} value={v.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} autoComplete="off" />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="System" htmlFor={f('system')} required error={errors.system} hint="Pipeline, notebook or dataflow name.">
            <Input
              id={f('system')}
              value={v.system}
              list={f('systems')}
              onChange={(e) => set('system', e.target.value)}
              invalid={!!errors.system}
              autoComplete="off"
              maxLength={limits.system.max + 20}
            />
            <datalist id={f('systems')}>
              {systems.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Start time" htmlFor={f('startedAt')} required error={errors.startedAt} hint="Your local time.">
            <Input
              id={f('startedAt')}
              type="datetime-local"
              value={toLocalInput(v.startedAt)}
              onChange={(e) => set('startedAt', fromLocalInput(e.target.value))}
              invalid={!!errors.startedAt}
            />
          </Field>
          <Field
            label="Severity"
            htmlFor={f('severity')}
            required
            error={errors.severity}
            hint={v.severity ? severityHelp[v.severity] : undefined}
          >
            <Select id={f('severity')} value={v.severity} onChange={(e) => set('severity', e.target.value as Severity | '')} invalid={!!errors.severity}>
              <option value="">Choose…</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {severityLabels[s]}: {severityHelp[s].split(':')[0]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Category"
            htmlFor={f('category')}
            required
            error={errors.category}
            hint={v.category ? 'A root-cause checklist for this category is ready under details.' : undefined}
          >
            <Select id={f('category')} value={v.category} onChange={(e) => onCategory(e.target.value as Category | '')} invalid={!!errors.category}>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="border-t border-line pt-4 pb-2">
        <button
          type="button"
          className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-0 py-1 text-left text-fg"
          aria-expanded={open}
          aria-controls={f('details')}
          onClick={() => setOpen((o) => !o)}
        >
          <span>
            <span className="block text-base font-semibold">Add details now</span>
            <span className="block text-ui text-muted">Timeline, transcript and status. Optional: add them later from the black box.</span>
          </span>
          <ChevronDown aria-hidden="true" className={cx('size-4 text-muted transition-transform duration-[160ms] group-hover:text-fg', open && 'rotate-180')} />
        </button>
        <div id={f('details')} hidden={!open} className="mt-4">
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Detected at" htmlFor={f('detectedAt')} error={errors.detectedAt} hint="When someone noticed.">
              <Input
                id={f('detectedAt')}
                type="datetime-local"
                value={toLocalInput(v.detectedAt)}
                onChange={(e) => set('detectedAt', fromLocalInput(e.target.value))}
                invalid={!!errors.detectedAt}
              />
            </Field>
            <Field label="Resolved at" htmlFor={f('resolvedAt')} error={errors.resolvedAt} hint="When data was right again.">
              <Input
                id={f('resolvedAt')}
                type="datetime-local"
                value={toLocalInput(v.resolvedAt)}
                onChange={(e) => set('resolvedAt', fromLocalInput(e.target.value))}
                invalid={!!errors.resolvedAt}
              />
            </Field>
            {lockedStatus ? (
              <div className="mb-4">
                <div className="mb-1 text-sm font-semibold">Status</div>
                {lockedStatus}
              </div>
            ) : (
              <Field label="Status" htmlFor={f('status')} error={errors.status} hint="Resolved needs a resolved time, root cause and fix.">
                <Select id={f('status')} value={v.status} onChange={(e) => set('status', e.target.value as IncidentInput['status'])}>
                  <option value="open">{statusLabels.open}</option>
                  <option value="resolved">{statusLabels.resolved}</option>
                </Select>
              </Field>
            )}
          </div>
          {narrative('summary', 'Summary', 'What happened and who or what was affected.')}
          {narrative(
            'rootCause',
            'Root cause',
            v.category ? undefined : 'Pick a category to get a short checklist here.',
            templateUntouched ? (
              <p className="m-0 mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="checklist-note">
                Checklist for {categoryLabels[v.category as Category]}. Answer or replace the questions; an untouched
                checklist is not saved.
                <Button size="sm" variant="ghost" onClick={() => set('rootCause', '')}>
                  Clear checklist
                </Button>
              </p>
            ) : v.category && !v.rootCause.trim() ? (
              <p className="m-0 mt-1.5 text-xs">
                <Button size="sm" variant="ghost" onClick={() => set('rootCause', checklistTemplates[v.category as Category])}>
                  Insert checklist
                </Button>
              </p>
            ) : null,
          )}
          {narrative('fix', 'Fix', 'What restored the data or the job.')}
          {narrative('prevention', 'Prevention', 'What would stop it, or catch it sooner, next time.')}
        </div>
      </section>

      {tried && Object.values(errors).some(Boolean) && (
        <InlineError error={`Check ${Object.values(errors).filter(Boolean).length === 1 ? 'the highlighted field' : 'the highlighted fields'} above.`} />
      )}
      <InlineError error={save.error} />
      {/* Bottom-anchored on phones, inline on wider screens. */}
      <div
        className="sticky z-20 -mx-4 mt-4 flex items-center gap-2 border-t border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none [&>button]:flex-1 sm:[&>button]:flex-none"
        style={{ bottom: 'var(--x-bottom-inset)' }}
      >
        <Button type="submit" variant="primary" size="lg" busy={save.pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      </div>
      {aside && <aside className="hidden min-w-0 lg:block">{aside(v)}</aside>}
    </form>
  );
}

/**
 * Black box: one incident as a flight recorder (started → detected → resolved with the durations between), the
 * transcript with blameless prompts beside the words they flag, its trace on the seismograph, and its aftershocks.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pencil, Plus, RotateCcw, ShieldCheck, Check } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { formatDateTime, normKey, plural, useAction, useAsync } from '@x10/shared/lib';
import {
  Avatar,
  Breadcrumb,
  Button,
  Checkbox,
  ConfirmDialog,
  DataState,
  EmptyState,
  IconButton,
  InlineError,
  Skeleton,
  Toast,
  cx,
} from '@x10/shared/ui';

import { categoryLabels } from '../config';
import { ActionItemDialog } from '../components/ActionItemDialog';
import { AgingChip, DueChip, SeverityChip, StatusChip } from '../components/chips';
import { CAT_VAR } from '../components/palette';
import { ResolveDialog } from '../components/ResolveDialog';
import { BlackBox } from '../blackbox/BlackBox';
import { Transcript } from '../blackbox/Transcript';
import {
  addActionItem,
  getIncidentDetail,
  isLead,
  listIncidents,
  markReviewed,
  ownerSuggestions,
  reopenIncident,
  resolveIncident,
  setActionDone,
  updateActionItem,
} from '../domain/incidents';
import { isOverdue, reviewBlocker } from '../domain/rules';
import { inWindow, WINDOW_DAYS } from '../domain/seismo';
import type { ActionItem, Schema } from '../model';
import { MiniTrace } from '../seismograph/MiniTrace';

export function IncidentDetailPage() {
  const { id = '' } = useParams();
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(params.get('saved') ? 'Incident saved.' : null);
  const state = useAsync(async () => {
    const [detail, owners, all] = await Promise.all([getIncidentDetail(store, id), ownerSuggestions(store), listIncidents(store)]);
    return { ...detail, owners, all };
  }, [store, id]);
  const now = useMemo(() => new Date(), [state.data]);
  const [resolving, setResolving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  // Optimistic ticks: the checkbox flips at once; the reload confirms it.
  const [pendingDone, setPendingDone] = useState<Record<string, boolean>>({});

  const reopen = useAction(async () => {
    await reopenIncident(store, me, id);
    await state.reload();
    setToast('Incident reopened. It trembles again on the seismograph.');
  });
  const toggle = useAction(async (item: ActionItem, done: boolean) => {
    setPendingDone((p) => ({ ...p, [item.id]: done }));
    try {
      await setActionDone(store, item.id, done);
      await state.reload();
    } finally {
      setPendingDone((p) => {
        const { [item.id]: _, ...rest } = p;
        void _;
        return rest;
      });
    }
  });

  return (
    <>
      <DataState state={state} skeleton={<DetailSkeleton />}>
        {({ incident, actions, owners, all }) => {
          const lead = isLead(me);
          const canEdit = lead || incident.status !== 'reviewed';
          const blocker = reviewBlocker(incident, actions.length, lead);
          const sameSystem = inWindow(all, now).filter((i) => normKey(i.system) === normKey(incident.system));
          const openItems = actions.filter((a) => !a.done);
          const lateItems = openItems.filter((a) => isOverdue(a, now));

          const actionsBar = (
            <>
              {canEdit && (
                <Button icon={<Pencil />} onClick={() => navigate(`/incidents/${id}/edit`)}>
                  Edit
                </Button>
              )}
              {(incident.status === 'resolved' || (incident.status === 'reviewed' && lead)) && (
                <Button icon={<RotateCcw />} busy={reopen.pending} onClick={() => void reopen.run()}>
                  Reopen
                </Button>
              )}
              {incident.status === 'open' && (
                <Button variant="primary" icon={<Check />} onClick={() => setResolving(true)}>
                  Mark resolved
                </Button>
              )}
              {lead && incident.status !== 'reviewed' && (
                <Button
                  variant={blocker ? 'secondary' : 'primary'}
                  icon={<ShieldCheck />}
                  disabled={!!blocker}
                  aria-describedby={blocker ? 'review-blocker' : undefined}
                  onClick={() => setReviewing(true)}
                >
                  Mark reviewed
                </Button>
              )}
            </>
          );

          return (
            <article className="pb-20 sm:pb-0">
              <Breadcrumb
                className="mb-5"
                items={[
                  { label: 'Seismograph', to: `/?focus=${incident.id}` },
                  { label: incident.system, to: `/?view=list&logSystem=${encodeURIComponent(incident.system)}` },
                  { label: 'Black box' },
                ]}
              />

              <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 max-w-[820px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <SeverityChip severity={incident.severity} label size="lg" />
                    <span data-testid="incident-status">
                      <StatusChip status={incident.status} />
                    </span>
                    <AgingChip incident={incident} now={now} />
                  </div>
                  <h1 className="x-serif m-0 mt-3 text-[34px] leading-[1.08] text-fg sm:text-[46px]">{incident.title}</h1>
                  <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
                    <span className="font-medium text-fg">{incident.system}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ background: CAT_VAR[incident.category] }} />
                      {categoryLabels[incident.category]}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={incident.reporterName} size="xs" /> Reported by {incident.reporterName}
                    </span>
                    <span>Logged {formatDateTime(incident.createdAt)}</span>
                  </p>
                </div>
                <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex">{actionsBar}</div>
              </header>

              <InlineError error={reopen.error} />
              {incident.status === 'reviewed' && !lead && (
                <p className="m-0 mb-4 text-ui text-muted" data-testid="reviewed-note">
                  Reviewed and sealed by a lead. Only a lead can edit or reopen it.
                </p>
              )}
              {incident.status !== 'reviewed' && (
                <p id="review-blocker" className="m-0 mb-4 flex items-center gap-2 text-ui text-muted" data-testid="review-note">
                  <ShieldCheck aria-hidden="true" className="size-3.5 text-faint" />
                  {lead
                    ? blocker
                      ? `Review: ${blocker}`
                      : 'Ready for sign-off: resolved, with action items.'
                    : 'A lead marks this reviewed once it is resolved and has at least one action item.'}
                </p>
              )}

              <BlackBox incident={incident} now={now} />

              <section aria-labelledby="fault-h" className="mt-8 grid items-center gap-x-8 gap-y-2 border-y border-line py-4 md:grid-cols-[200px_minmax(0,1fr)]">
                <div>
                  <h2 id="fault-h" className="x-legend-label m-0 text-muted">
                    Same fault line
                  </h2>
                  <p className="m-0 mt-1 text-ui text-fg">
                    <span className="font-mono num">{sameSystem.length}</span> tremor{sameSystem.length === 1 ? '' : 's'} on this system in {WINDOW_DAYS} days
                  </p>
                </div>
                <MiniTrace incidents={sameSystem} now={now} highlightId={incident.id} height={64} label={`${incident.system}: last ${WINDOW_DAYS} days`} />
              </section>

              <div className="mt-6">
                <Transcript incident={incident} canEdit={canEdit} />
              </div>

              <section aria-labelledby="aftershocks-h" className="mt-8">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <h2 id="aftershocks-h" className="m-0 text-lg font-semibold">
                      Aftershocks <span className="font-mono text-base font-normal text-muted num">{actions.length}</span>
                    </h2>
                    <p className="m-0 mt-0.5 text-ui text-muted">
                      {plural(openItems.length, 'open follow-up')}
                      {lateItems.length > 0 && <span className="text-bad-text"> · {lateItems.length} overdue</span>}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setAdding(true)}>
                    Add action item
                  </Button>
                </div>
                {actions.length === 0 ? (
                  <EmptyState
                    compact
                    bordered
                    title="No aftershocks yet"
                    action={
                      <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                        Add the first one
                      </Button>
                    }
                  >
                    What would stop this happening again, or catch it sooner? A lead needs one before sign-off.
                  </EmptyState>
                ) : (
                  <ul className="m-0 list-none divide-y divide-[var(--line)] p-0" data-testid="action-items">
                    {actions.map((a) => {
                      const done = pendingDone[a.id] ?? a.done;
                      return (
                        <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_180px_200px_auto]">
                          <Checkbox
                            label={<span className={cx('transition-colors', done ? 'text-muted line-through' : 'font-medium text-fg')}>{a.title}</span>}
                            checked={done}
                            disabled={a.id in pendingDone}
                            onChange={(d) => void toggle.run(a, d)}
                          />
                          <span className="order-3 col-span-2 flex items-center gap-2 pl-6 text-ui text-muted sm:order-none sm:col-span-1 sm:pl-0">
                            <Avatar name={a.ownerName} size="xs" />
                            <span className="truncate">{a.ownerName}</span>
                          </span>
                          <span className="order-4 col-span-2 pl-6 sm:order-none sm:col-span-1 sm:pl-0">
                            <DueChip item={{ ...a, done }} now={now} />
                          </span>
                          <IconButton size="sm" label={`Edit action item: ${a.title}`} icon={<Pencil />} onClick={() => setEditing(a)} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                <InlineError error={toggle.error} />
              </section>

              {/* Phones: the actions sit at the bottom, above the tab bar; the primary one takes the width. */}
              <div
                className="fixed inset-x-0 z-20 flex items-center gap-2 border-t border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:hidden"
                style={{ bottom: 'var(--x-bottom-inset)' }}
              >
                {canEdit && <IconButton label="Edit" icon={<Pencil />} variant="secondary" size="lg" onClick={() => navigate(`/incidents/${id}/edit`)} />}
                {(incident.status === 'resolved' || (incident.status === 'reviewed' && lead)) && (
                  <Button size="lg" icon={<RotateCcw />} busy={reopen.pending} onClick={() => void reopen.run()}>
                    Reopen
                  </Button>
                )}
                {incident.status === 'open' && (
                  <Button size="lg" variant="primary" icon={<Check />} className="flex-1" onClick={() => setResolving(true)}>
                    Mark resolved
                  </Button>
                )}
                {lead && incident.status !== 'reviewed' && !blocker && (
                  <Button size="lg" variant="primary" icon={<ShieldCheck />} className="flex-1" onClick={() => setReviewing(true)}>
                    Mark reviewed
                  </Button>
                )}
              </div>

              <ResolveDialog
                open={resolving}
                onClose={() => setResolving(false)}
                incident={incident}
                onSubmit={async (r) => {
                  await resolveIncident(store, me, id, r);
                  await state.reload();
                  setToast('Resolved. The recorder has stopped.');
                }}
              />
              <ConfirmDialog
                open={reviewing}
                onClose={() => setReviewing(false)}
                title="Mark reviewed"
                confirmLabel="Mark reviewed"
                body={
                  <p className="m-0">
                    Seals this black box: the team has reviewed the postmortem and its {plural(actions.length, 'action item')}. Only a
                    lead can change the status afterwards.
                  </p>
                }
                onConfirm={async () => {
                  await markReviewed(store, me, id);
                  await state.reload();
                  setToast('Reviewed and sealed.');
                }}
              />
              <ActionItemDialog
                open={adding}
                onClose={() => setAdding(false)}
                title="Add action item"
                submitLabel="Add action item"
                owners={owners}
                initial={{ title: '', ownerName: '', dueDate: null }}
                onSubmit={async (v) => {
                  await addActionItem(store, me, id, v);
                  await state.reload();
                  setToast('Aftershock added.');
                }}
              />
              <ActionItemDialog
                open={!!editing}
                onClose={() => setEditing(null)}
                title="Edit action item"
                submitLabel="Save"
                owners={owners}
                initial={editing ? { title: editing.title, ownerName: editing.ownerName, dueDate: editing.dueDate } : { title: '', ownerName: '', dueDate: null }}
                onSubmit={async (v) => {
                  if (!editing) return;
                  await updateActionItem(store, editing.id, v);
                  await state.reload();
                }}
              />
            </article>
          );
        }}
      </DataState>
      <Toast
        message={toast}
        tone="ok"
        onDone={() => {
          setToast(null);
          if (params.get('saved')) setParams({}, { replace: true });
        }}
      />
    </>
  );
}

function DetailSkeleton(): ReactNode {
  return (
    <div className="space-y-4">
      <Skeleton width={220} height={14} />
      <Skeleton width={140} height={30} />
      <Skeleton width="70%" height={44} />
      <Skeleton width="45%" height={14} />
      <Skeleton height={300} className="mt-6 rounded-2xl" />
      <Skeleton height={64} />
    </div>
  );
}


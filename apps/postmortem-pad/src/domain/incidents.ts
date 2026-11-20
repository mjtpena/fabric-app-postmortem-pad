/**
 * Data access for incidents and action items. Components call these, never the store directly.
 * Permission and rule checks live here so they hold in demo mode and in Fabric alike.
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { toMs } from '@x10/shared/lib';

import type { ActionItem, Incident, Schema } from '../model';
import {
  reviewBlocker,
  storedRootCause,
  validateActionItem,
  validateIncident,
  type IncidentErrors,
  type IncidentInput,
} from './rules';

type Store = DataStore<Schema>;

export const isLead = (me: Person) => me.isAdmin === true;

function firstError(e: Record<string, string | undefined>): string | null {
  return Object.values(e).find(Boolean) ?? null;
}

/** Thrown when an incident form fails validation; carries every field message for inline display. */
export class IncidentValidationError extends RuleError {
  constructor(readonly fields: IncidentErrors) {
    super(firstError(fields) ?? 'Check the highlighted fields.');
  }
}

const clean = (s: string) => (s.trim() ? s.trim() : null);

/** The stored shape of the editable incident fields (never includes reporter or creation columns). */
function editableFields(v: IncidentInput) {
  return {
    title: v.title.trim(),
    system: v.system.trim(),
    severity: v.severity as Incident['severity'],
    category: v.category as Incident['category'],
    startedAt: v.startedAt!,
    detectedAt: v.detectedAt,
    resolvedAt: v.resolvedAt,
    summary: clean(v.summary),
    rootCause: storedRootCause(v.rootCause, v.category),
    fix: clean(v.fix),
    prevention: clean(v.prevention),
    status: v.status,
  };
}

/** Form values for an existing incident. */
export function toInput(i: Incident): IncidentInput {
  return {
    title: i.title,
    system: i.system,
    severity: i.severity,
    category: i.category,
    startedAt: i.startedAt,
    detectedAt: i.detectedAt,
    resolvedAt: i.resolvedAt,
    summary: i.summary ?? '',
    rootCause: i.rootCause ?? '',
    fix: i.fix ?? '',
    prevention: i.prevention ?? '',
    status: i.status,
  };
}

/** Empty quick-form values, start time defaulting to now. */
export function blankInput(now: Date): IncidentInput {
  return {
    title: '',
    system: '',
    severity: '',
    category: '',
    startedAt: new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString(),
    detectedAt: null,
    resolvedAt: null,
    summary: '',
    rootCause: '',
    fix: '',
    prevention: '',
    status: 'open',
  };
}

/* ------------------------------------------------------------------ reads */

export async function listIncidents(store: Store): Promise<Incident[]> {
  const rows = await store.repo('Incident').list({ orderBy: { field: 'startedAt', dir: 'desc' } });
  return rows.sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt));
}

export async function listActionItems(store: Store): Promise<ActionItem[]> {
  return store.repo('ActionItem').list();
}

export interface IncidentDetail {
  incident: Incident;
  actions: ActionItem[];
}

export async function getIncidentDetail(store: Store, id: string): Promise<IncidentDetail> {
  const incident = await store.repo('Incident').get(id);
  if (!incident) throw new NotFoundError('Incident', id);
  const actions = await store.repo('ActionItem').list({ where: { incidentId: id } });
  actions.sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
  return { incident, actions };
}

/* ------------------------------------------------------------------ incident writes */

export async function createIncident(store: Store, me: Person, input: IncidentInput, now = new Date()): Promise<Incident> {
  if (input.status === 'reviewed') throw new RuleError('A new incident cannot start as reviewed.');
  const errors = validateIncident(input, now);
  if (firstError(errors)) throw new IncidentValidationError(errors);
  return store.repo('Incident').create({
    ...editableFields(input),
    reporterSub: me.sub,
    reporterName: me.displayName,
    createdAt: now.toISOString(),
  });
}

/**
 * Save edits. Any signed-in engineer may edit an open or resolved incident (it is a team record). A reviewed incident
 * is a signed-off record: only a lead may edit or reopen it. Status rules: open ↔ resolved for anyone; into
 * "reviewed" only for a lead, only from resolved, and only once an action item exists.
 */
export async function updateIncident(
  store: Store,
  me: Person,
  id: string,
  input: IncidentInput,
  now = new Date(),
): Promise<Incident> {
  const prev = await store.repo('Incident').get(id);
  if (!prev) throw new NotFoundError('Incident', id);
  if (prev.status === 'reviewed' && !isLead(me)) {
    throw new PermissionError('This incident is reviewed. Only a lead can edit or reopen it.');
  }
  if (input.status !== prev.status) {
    if (input.status === 'reviewed') {
      const count = (await store.repo('ActionItem').list({ where: { incidentId: id } })).length;
      const block = reviewBlocker(prev, count, isLead(me));
      if (block) throw isLead(me) ? new RuleError(block) : new PermissionError(block);
    }
  }
  const errors = validateIncident(input, now);
  if (firstError(errors)) throw new IncidentValidationError(errors);
  return store.repo('Incident').update(id, editableFields(input));
}

export interface ResolveInput {
  resolvedAt: string | null;
  rootCause: string;
  fix: string;
}

/** Mark resolved with the three facts rule 2 requires. */
export async function resolveIncident(store: Store, me: Person, id: string, r: ResolveInput, now = new Date()) {
  const prev = await store.repo('Incident').get(id);
  if (!prev) throw new NotFoundError('Incident', id);
  if (prev.status !== 'open') throw new RuleError('Only an open incident can be resolved.');
  return updateIncident(store, me, id, { ...toInput(prev), ...r, status: 'resolved' }, now);
}

/** Back to open (for example the fix did not hold). Clears the resolved time. */
export async function reopenIncident(store: Store, me: Person, id: string, now = new Date()) {
  const prev = await store.repo('Incident').get(id);
  if (!prev) throw new NotFoundError('Incident', id);
  if (prev.status === 'open') throw new RuleError('This incident is already open.');
  return updateIncident(store, me, id, { ...toInput(prev), resolvedAt: null, status: 'open' }, now);
}

/** Lead only: mark a resolved incident reviewed once at least one action item exists. */
export async function markReviewed(store: Store, me: Person, id: string, now = new Date()) {
  const prev = await store.repo('Incident').get(id);
  if (!prev) throw new NotFoundError('Incident', id);
  return updateIncident(store, me, id, { ...toInput(prev), status: 'reviewed' }, now);
}

/* ------------------------------------------------------------------ action items */

export interface ActionInput {
  title: string;
  ownerName: string;
  dueDate: string | null;
}

export class ActionValidationError extends RuleError {
  constructor(readonly fields: Partial<Record<keyof ActionInput, string>>) {
    super(firstError(fields) ?? 'Check the highlighted fields.');
  }
}

export async function addActionItem(
  store: Store,
  me: Person,
  incidentId: string,
  input: ActionInput,
  now = new Date(),
): Promise<ActionItem> {
  const incident = await store.repo('Incident').get(incidentId);
  if (!incident) throw new NotFoundError('Incident', incidentId);
  const errors = validateActionItem(input);
  if (firstError(errors)) throw new ActionValidationError(errors);
  return store.repo('ActionItem').create({
    incidentId,
    title: input.title.trim(),
    ownerName: input.ownerName.trim(),
    dueDate: input.dueDate,
    done: false,
    createdBySub: me.sub,
    createdAt: now.toISOString(),
  });
}

export async function updateActionItem(store: Store, id: string, input: ActionInput): Promise<ActionItem> {
  const errors = validateActionItem(input);
  if (firstError(errors)) throw new ActionValidationError(errors);
  return store.repo('ActionItem').update(id, {
    title: input.title.trim(),
    ownerName: input.ownerName.trim(),
    dueDate: input.dueDate,
  });
}

export async function setActionDone(store: Store, id: string, done: boolean): Promise<ActionItem> {
  return store.repo('ActionItem').update(id, { done });
}

/** Names to suggest for action-item owners: people who use the app plus owners already used. */
export async function ownerSuggestions(store: Store): Promise<string[]> {
  const [people, items] = await Promise.all([store.repo('Person').list(), store.repo('ActionItem').list()]);
  const names = new Set<string>([...people.map((p) => p.displayName), ...items.map((a) => a.ownerName)]);
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Pure rules for incidents and action items. No store access here, so everything is unit-tested directly.
 * All duration maths uses UTC milliseconds (daylight-saving changes cannot skew a duration).
 */
import { checkText, DAY, MINUTE, toMs } from '@x10/shared/lib';

import { AGING_DAYS, blamelessWords, checklistTemplates, FUTURE_TOLERANCE_MINUTES } from '../config';
import {
  CATEGORIES,
  limits,
  SEVERITIES,
  type ActionItem,
  type Category,
  type Incident,
  type Severity,
  type Status,
} from '../model';

/* ------------------------------------------------------------------ durations */

/** Whole minutes from `from` to `to`, or null when either is missing or invalid. */
export function minutesFromTo(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = toMs(from);
  const b = toMs(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MINUTE);
}

/** Time to detect: detectedAt − startedAt, in minutes. */
export function timeToDetect(i: Pick<Incident, 'startedAt' | 'detectedAt'>): number | null {
  return minutesFromTo(i.startedAt, i.detectedAt);
}

/** Time to resolve: resolvedAt − startedAt, in minutes. */
export function timeToResolve(i: Pick<Incident, 'startedAt' | 'resolvedAt'>): number | null {
  return minutesFromTo(i.startedAt, i.resolvedAt);
}

/** Minutes an open incident has been open so far (null when it is not open). */
export function openFor(i: Pick<Incident, 'startedAt' | 'status'>, now: Date): number | null {
  if (i.status !== 'open') return null;
  return minutesFromTo(i.startedAt, now.toISOString());
}

/** An open incident that started more than AGING_DAYS ago. */
export function isAging(i: Pick<Incident, 'startedAt' | 'status'>, now: Date, days = AGING_DAYS): boolean {
  return i.status === 'open' && now.getTime() - toMs(i.startedAt) > days * DAY;
}

/**
 * An action item is overdue when it is not done and its due day has fully passed. The due date is stored as the
 * start of the chosen day, so "due 3 Nov" becomes overdue once 24 hours after that start have passed.
 */
export function isOverdue(a: Pick<ActionItem, 'dueDate' | 'done'>, now: Date): boolean {
  if (a.done || !a.dueDate) return false;
  return now.getTime() >= toMs(a.dueDate) + DAY;
}

/* ------------------------------------------------------------------ validation */

/** The editable fields of an incident, as a form holds them. Dates are ISO strings or null. */
export interface IncidentInput {
  title: string;
  system: string;
  severity: Severity | '';
  category: Category | '';
  startedAt: string | null;
  detectedAt: string | null;
  resolvedAt: string | null;
  summary: string;
  rootCause: string;
  fix: string;
  prevention: string;
  status: Status;
}

export type IncidentErrors = Partial<Record<keyof IncidentInput, string>>;

/** True when the text is empty or is still exactly the untouched checklist template of the category. */
export function isBlankRootCause(text: string | null | undefined, category: Category | '' | null): boolean {
  const v = (text ?? '').trim();
  if (!v) return true;
  return !!category && v === checklistTemplates[category].trim();
}

/**
 * Validate an incident against the entity limits and the rules:
 * - the quick form needs only title, system, severity, category and start time;
 * - detected and resolved times cannot be earlier than the start (or resolved earlier than detected);
 * - status resolved (or reviewed) needs a resolved time, a root cause and a fix.
 */
export function validateIncident(v: IncidentInput, now: Date): IncidentErrors {
  const e: IncidentErrors = {};
  const t = checkText(v.title, { ...limits.incidentTitle, label: 'Title' });
  if (t) e.title = t;
  const s = checkText(v.system, { ...limits.system, label: 'System' });
  if (s) e.system = s;
  if (!v.severity || !SEVERITIES.includes(v.severity)) e.severity = 'Choose a severity.';
  if (!v.category || !CATEGORIES.includes(v.category)) e.category = 'Choose a category.';

  const start = v.startedAt ? toMs(v.startedAt) : NaN;
  if (Number.isNaN(start)) e.startedAt = 'Enter when the failure started.';
  else if (start > now.getTime() + FUTURE_TOLERANCE_MINUTES * MINUTE) e.startedAt = 'The start time is in the future.';

  if (v.detectedAt) {
    const d = toMs(v.detectedAt);
    if (Number.isNaN(d)) e.detectedAt = 'Enter a valid time.';
    else if (!Number.isNaN(start) && d < start) e.detectedAt = 'Detected time cannot be earlier than the start time.';
  }
  if (v.resolvedAt) {
    const r = toMs(v.resolvedAt);
    if (Number.isNaN(r)) e.resolvedAt = 'Enter a valid time.';
    else if (!Number.isNaN(start) && r < start) e.resolvedAt = 'Resolved time cannot be earlier than the start time.';
    else if (v.detectedAt && !e.detectedAt && r < toMs(v.detectedAt))
      e.resolvedAt = 'Resolved time cannot be earlier than the detected time.';
  }

  for (const key of ['summary', 'rootCause', 'fix', 'prevention'] as const) {
    const label = { summary: 'Summary', rootCause: 'Root cause', fix: 'Fix', prevention: 'Prevention' }[key];
    const msg = checkText(v[key], { ...limits.narrative, optional: true, label });
    if (msg) e[key] = msg;
  }

  if (v.status === 'resolved' || v.status === 'reviewed') {
    if (!v.resolvedAt && !e.resolvedAt) e.resolvedAt = 'Add the resolved time to resolve this incident.';
    if (!e.rootCause && isBlankRootCause(v.rootCause, v.category))
      e.rootCause = 'Add a root cause to resolve this incident (the checklist alone does not count).';
    if (!e.fix && !v.fix.trim()) e.fix = 'Add the fix to resolve this incident.';
  }
  return e;
}

export function validateActionItem(v: { title: string; ownerName: string; dueDate: string | null }) {
  const e: Partial<Record<'title' | 'ownerName' | 'dueDate', string>> = {};
  const t = checkText(v.title, { ...limits.actionTitle, label: 'Action' });
  if (t) e.title = t;
  const o = checkText(v.ownerName, { ...limits.ownerName, label: 'Owner' });
  if (o) e.ownerName = o;
  if (v.dueDate && Number.isNaN(toMs(v.dueDate))) e.dueDate = 'Enter a valid date.';
  return e;
}

/* ------------------------------------------------------------------ status */

/**
 * Why the viewer cannot mark this incident reviewed, or null when they can.
 * Only a lead (Person.isAdmin) may, only for a resolved incident, and only once an action item exists.
 */
export function reviewBlocker(i: Pick<Incident, 'status'>, actionCount: number, isLead: boolean): string | null {
  if (!isLead) return 'Only a lead can mark an incident reviewed.';
  if (i.status === 'reviewed') return 'This incident is already reviewed.';
  if (i.status !== 'resolved') return 'Resolve the incident before the review.';
  if (actionCount < 1) return 'Add at least one action item before marking it reviewed.';
  return null;
}

/* ------------------------------------------------------------------ blameless nudge */

export interface BlameHit {
  term: string;
  suggestion: string;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Words or phrases from the blameless list found in `text` (whole words, any case, any spacing between words).
 * A shorter term inside a longer match ("forgot" in "forgot to") is reported once, as the longer term.
 */
export function findBlameWords(text: string | null | undefined, words = blamelessWords): BlameHit[] {
  const out: BlameHit[] = [];
  for (const k of findBlameSpans(text, words)) if (!out.some((h) => h.term === k.hit.term)) out.push(k.hit);
  return out;
}

export interface BlameSpan {
  /** Start offset in the text (inclusive). */
  start: number;
  /** End offset (exclusive). */
  end: number;
  hit: BlameHit;
}

/**
 * Every flagged span in `text`, in order, with its exact offsets (so the UI can highlight the words it flags).
 * A shorter term inside a longer match is dropped in favour of the longer one.
 */
export function findBlameSpans(text: string | null | undefined, words = blamelessWords): BlameSpan[] {
  const src = text ?? '';
  if (!src.trim()) return [];
  const spans: BlameSpan[] = [];
  for (const w of words) {
    const pattern = w.term.trim().split(/\s+/).map(escapeRe).join('\\s+');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of src.matchAll(re)) {
      spans.push({ start: m.index, end: m.index + m[0].length, hit: w });
    }
  }
  const kept = spans.filter(
    (s) => !spans.some((o) => o !== s && o.start <= s.start && o.end >= s.end && o.end - o.start > s.end - s.start),
  );
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/* ------------------------------------------------------------------ checklist */

/**
 * The root-cause text after the category changes from `prev` to `next`: the new checklist when the field is empty or
 * still holds the previous untouched checklist; otherwise the text as typed (never overwrite someone's words).
 */
export function rootCauseAfterCategoryChange(current: string, prev: Category | '', next: Category | ''): string {
  const untouched = !current.trim() || (!!prev && current.trim() === checklistTemplates[prev].trim());
  if (!untouched) return current;
  return next ? checklistTemplates[next] : '';
}

/** Root cause as it should be stored: null for empty text or an untouched checklist. */
export function storedRootCause(text: string, category: Category | ''): string | null {
  return isBlankRootCause(text, category) ? null : text.trim();
}

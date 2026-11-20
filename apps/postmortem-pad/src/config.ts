/**
 * Product rules and wording that a team may want to tune. Plain data, no React: the About page and the domain
 * functions both read from here.
 */
import type { Category, Severity, Status } from './model';

/** An open incident older than this many days gets an "Aging" chip. */
export const AGING_DAYS = 7;

/** The Trends page opens on this many days back from now. */
export const TRENDS_DEFAULT_DAYS = 90;

/** Quick range presets on the Trends page. */
export const TRENDS_PRESETS = [30, 90, 120] as const;

/** How many systems the "top systems" chart shows. */
export const TOP_SYSTEMS = 5;

/** A start time later than this many minutes past now is rejected (allows for small clock drift). */
export const FUTURE_TOLERANCE_MINUTES = 5;

export const severityLabels: Record<Severity, string> = {
  sev1: 'SEV1',
  sev2: 'SEV2',
  sev3: 'SEV3',
  sev4: 'SEV4',
};

export const severityHelp: Record<Severity, string> = {
  sev1: 'Critical: a key report or downstream system is down or wrong',
  sev2: 'Major: data late or partly wrong for many users',
  sev3: 'Minor: one job failed, a retry or workaround exists',
  sev4: 'Low: cosmetic or caught before anyone noticed',
};

export const categoryLabels: Record<Category, string> = {
  schema_change: 'Schema change',
  upstream_late: 'Upstream late',
  capacity: 'Capacity',
  code_bug: 'Code bug',
  config: 'Configuration',
  permissions: 'Permissions',
  data_quality: 'Data quality',
  other: 'Other',
};

export const statusLabels: Record<Status, string> = {
  open: 'Open',
  resolved: 'Resolved',
  reviewed: 'Reviewed',
};

/**
 * Blameless nudge. A word or phrase in this list, found as a whole word (case-insensitive) in the summary, root
 * cause, fix or prevention text, shows a gentle hint. It never blocks saving.
 * Each entry carries a system-focused rewording idea.
 */
export const blamelessWords: { term: string; suggestion: string }[] = [
  { term: 'forgot to', suggestion: 'Describe the missing step: "The release checklist had no step for …"' },
  { term: 'forgot', suggestion: 'Describe the missing reminder or check: "Nothing prompted us to …"' },
  { term: 'forgotten', suggestion: 'Describe the missing reminder or check: "Nothing prompted us to …"' },
  { term: 'forget', suggestion: 'Describe the missing reminder or check: "Nothing prompted us to …"' },
  { term: 'careless', suggestion: 'Say what made the mistake easy to make: "The two settings look alike because …"' },
  { term: 'carelessly', suggestion: 'Say what made the mistake easy to make: "The two settings look alike because …"' },
  { term: 'sloppy', suggestion: 'Name the check that was missing: "No review step covers …"' },
  { term: 'stupid', suggestion: 'Describe the decision and what information was available at the time.' },
  { term: 'dumb', suggestion: 'Describe the decision and what information was available at the time.' },
  { term: 'lazy', suggestion: 'Describe the time pressure or tooling gap: "The manual step takes 20 minutes, so …"' },
  { term: 'fault', suggestion: 'Describe what in the system allowed this: "The pipeline accepted … without checking …"' },
  { term: 'blame', suggestion: 'Describe what in the system allowed this: "The pipeline accepted … without checking …"' },
  { term: 'blamed', suggestion: 'Describe what in the system allowed this: "The pipeline accepted … without checking …"' },
  { term: 'human error', suggestion: 'Ask what made the error possible: which guard rail, default or alert was missing?' },
  { term: 'should have known', suggestion: 'Say what information was missing or hard to find at the time.' },
  { term: 'incompetent', suggestion: 'Describe the knowledge gap and where the knowledge should live (runbook, docs).' },
];

/**
 * Root-cause checklist per category. Choosing a category pre-fills this into root cause when the field is empty or
 * still holds the previous untouched template. An untouched template is never saved as the root cause.
 */
export const checklistTemplates: Record<Category, string> = {
  schema_change: [
    '- Which upstream change (table, column, type)?',
    '- Who made it, and were we notified?',
    '- How was it detected?',
    '- Which contract or check would have caught it earlier?',
  ].join('\n'),
  upstream_late: [
    '- Which upstream source or job was late, and by how much?',
    '- Is there an agreed delivery time (SLA) for it?',
    '- Did our schedule wait, retry or fail fast?',
  ].join('\n'),
  capacity: [
    '- Which resource ran out (memory, CU, concurrency, storage)?',
    '- What changed in volume or workload?',
    '- Was there a limit alert, and did it fire in time?',
  ].join('\n'),
  code_bug: [
    '- Which code path failed, and on what input?',
    '- When was it introduced, and why did tests not catch it?',
    '- Which test would catch it next time?',
  ].join('\n'),
  config: [
    '- Which setting was wrong (connection, parameter, schedule)?',
    '- How did it change, and was the change reviewed?',
    '- Where should this setting be validated?',
  ].join('\n'),
  permissions: [
    '- Which identity lost or lacked access, to what?',
    '- What changed (expiry, role removal, new item)?',
    '- Who owns that identity, and is it documented?',
  ].join('\n'),
  data_quality: [
    '- Which rule did the data break (nulls, duplicates, ranges)?',
    '- Where did the bad data enter?',
    '- Which check would stop it before it reaches reports?',
  ].join('\n'),
  other: ['- What happened, in order?', '- What made it possible?', '- What would have caught it sooner?'].join('\n'),
};

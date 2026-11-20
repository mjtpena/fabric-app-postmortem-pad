/**
 * Pure maths behind the seismograph: which incidents fall in the window, one trace per system, how big each tremor
 * is, how long it rings, and the ranked "Today" list. No React and no DOM here, so everything is unit-tested.
 *
 * Encodings (every mark maps to data):
 * - one trace per system, time left to right over the last 90 days, "now" at the stylus;
 * - a tremor starts where the incident started; its amplitude is the severity;
 * - its ring-down length is the time to resolve (log scale); an open incident keeps trembling up to the stylus;
 * - small spikes after a tremor are its open action items (aftershocks), red when overdue.
 */
import { DAY, HOUR, median, normKey, toMs } from '@x10/shared/lib';

import { categoryLabels } from '../config';
import type { ActionItem, Category, Incident, Severity, Status } from '../model';
import { isAging, isOverdue, timeToResolve } from './rules';

export const WINDOW_DAYS = 90;

export type LensKey = 'severity' | 'category' | 'system' | 'ttr' | 'status';
export type Role = 'lead' | 'engineer';

/* ------------------------------------------------------------------ window and tracks */

export function windowStartMs(now: Date, days = WINDOW_DAYS): number {
  return now.getTime() - days * DAY;
}

/** Incidents that started inside the window, plus open incidents that started before it (they still tremble). */
export function inWindow(incidents: Incident[], now: Date, days = WINDOW_DAYS): Incident[] {
  const a = windowStartMs(now, days);
  const b = now.getTime();
  return incidents.filter((i) => {
    const t = toMs(i.startedAt);
    return t <= b && (t >= a || i.status === 'open');
  });
}

export interface Track {
  /** normKey of the system, or OTHER_KEY. */
  key: string;
  /** Most common spelling of the system name. */
  label: string;
  /** Oldest first. */
  incidents: Incident[];
  open: number;
}

export const OTHER_KEY = '__other';

/**
 * One trace per system (names grouped ignoring case and spacing), noisiest first, then by name. Beyond `max`
 * systems the quietest ones share a final "Other systems" trace so the drum stays readable.
 */
export function buildTracks(incidents: Incident[], max = 8): Track[] {
  const groups = new Map<string, { spellings: Map<string, number>; rows: Incident[] }>();
  for (const i of incidents) {
    const key = normKey(i.system);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), rows: [] as Incident[] };
    const spelling = i.system.trim().replace(/\s+/g, ' ');
    g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
    g.rows.push(i);
    groups.set(key, g);
  }
  const tracks: Track[] = [...groups.entries()].map(([key, g]) => {
    let label = '';
    let best = 0;
    for (const [s, c] of g.spellings) if (c > best) [label, best] = [s, c];
    const rows = [...g.rows].sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt));
    return { key, label, incidents: rows, open: rows.filter((r) => r.status === 'open').length };
  });
  tracks.sort((a, b) => b.incidents.length - a.incidents.length || a.label.localeCompare(b.label));
  if (tracks.length <= max) return tracks;
  const keep = tracks.slice(0, max - 1);
  const rest = tracks.slice(max - 1);
  const rows = rest.flatMap((t) => t.incidents).sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt));
  keep.push({ key: OTHER_KEY, label: `Other systems (${rest.length})`, incidents: rows, open: rows.filter((r) => r.status === 'open').length });
  return keep;
}

/** The track an incident sits on. */
export function trackKeyOf(i: Pick<Incident, 'system'>, tracks: Track[]): string | null {
  const k = normKey(i.system);
  if (tracks.some((t) => t.key === k)) return k;
  return tracks.some((t) => t.key === OTHER_KEY) ? OTHER_KEY : null;
}

/* ------------------------------------------------------------------ shape */

/** Amplitude as a share of the half track height. */
export const SEV_AMP: Record<Severity, number> = { sev1: 1, sev2: 0.72, sev3: 0.48, sev4: 0.28 };

/** Ring-down length in px for a time to resolve (log scale, so a 20 h recovery does not swallow the drum). */
export function ringPx(ttrMinutes: number | null, scale = 1): number {
  const m = ttrMinutes === null ? 60 : Math.max(0, ttrMinutes);
  return (12 + 7 * Math.log2(1 + m / 20)) * scale;
}

/** FNV-1a, stable across runs, used to give each tremor its own irregular shape. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Pt = [number, number];

/**
 * A jagged seismic burst starting at x0 on baseline y0: a sharp attack, then an exponential ring-down over `len` px.
 * Points alternate above and below the baseline every half period, like a real drum trace.
 */
export function tremorPoints(x0: number, y0: number, amp: number, len: number, seed: number): Pt[] {
  const r = rng(seed);
  const half = 2 + r() * 0.6;
  const pts: Pt[] = [[x0 - 2, y0]];
  let sign = r() > 0.5 ? 1 : -1;
  for (let d = 0.6; d <= len; d += half) {
    const attack = 1 - Math.exp(-d / 2.2);
    const decay = Math.exp((-3.2 * d) / len);
    const jitter = 0.55 + 0.45 * r();
    pts.push([x0 + d, y0 - sign * amp * attack * decay * jitter]);
    sign = -sign;
  }
  pts.push([x0 + len + 1.5, y0]);
  return pts;
}

/**
 * The sustained tremble of an open incident, from the end of its first burst to the stylus. `phase` animates it
 * (the shape breathes; positions never move, so time stays honest).
 */
export function tailPoints(x1: number, x2: number, y0: number, amp: number, seed: number, phase = 0): Pt[] {
  if (x2 <= x1) return [];
  const r = rng(seed ^ 0x9e3779b9);
  const pts: Pt[] = [[x1, y0]];
  let sign = 1;
  let k = 0;
  for (let x = x1 + 1.2; x < x2; x += 2.3) {
    const wobble = 0.5 + 0.5 * Math.sin(k * 0.9 + phase * 3.1 + r() * 6.28);
    pts.push([x, y0 - sign * amp * (0.35 + 0.65 * wobble)]);
    sign = -sign;
    k++;
  }
  pts.push([x2, y0]);
  return pts;
}

/** The quiet baseline: a faint hand-drawn wobble so an empty trace still reads as a live instrument. */
export function baselinePoints(x1: number, x2: number, y0: number, seed: number, amp = 0.45): Pt[] {
  const r = rng(seed);
  const pts: Pt[] = [];
  for (let x = x1; x < x2; x += 3) pts.push([x, y0 + (r() - 0.5) * 2 * amp]);
  pts.push([x2, y0]);
  return pts;
}

export function toPath(pts: Pt[]): string {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  return d;
}

/* ------------------------------------------------------------------ lens buckets */

export type TtrBucket = 'fast' | 'medium' | 'slow' | 'slowest' | 'open';

export const TTR_LABELS: Record<TtrBucket, string> = {
  fast: 'Under 2 h',
  medium: '2 to 6 h',
  slow: '6 to 12 h',
  slowest: 'Over 12 h',
  open: 'Still open',
};

export function ttrBucket(i: Pick<Incident, 'startedAt' | 'resolvedAt' | 'status'>): TtrBucket {
  const ttr = timeToResolve(i);
  if (ttr === null || i.status === 'open') return 'open';
  if (ttr < 120) return 'fast';
  if (ttr < 360) return 'medium';
  if (ttr < 720) return 'slow';
  return 'slowest';
}

/* ------------------------------------------------------------------ aftershocks and sign-off */

/** Open action items per incident id, with overdue ones first. */
export function openAftershocks(actions: ActionItem[], now: Date): Map<string, { overdue: boolean; item: ActionItem }[]> {
  const m = new Map<string, { overdue: boolean; item: ActionItem }[]>();
  for (const a of actions) {
    if (a.done) continue;
    const list = m.get(a.incidentId) ?? [];
    list.push({ overdue: isOverdue(a, now), item: a });
    m.set(a.incidentId, list);
  }
  for (const list of m.values()) list.sort((a, b) => Number(b.overdue) - Number(a.overdue));
  return m;
}

/** Resolved incidents a lead can sign off now (rule 3: resolved and at least one action item). */
export function readyForSignOff(incidents: Incident[], actions: ActionItem[]): Incident[] {
  const withActions = new Set(actions.map((a) => a.incidentId));
  return incidents
    .filter((i) => i.status === 'resolved' && withActions.has(i.id))
    .sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt));
}

/** An incident is "mine" when I reported it or own one of its open action items. */
export function isMine(i: Incident, actions: ActionItem[], me: { sub: string; displayName: string }): boolean {
  if (i.reporterSub === me.sub) return true;
  const name = normKey(me.displayName);
  return actions.some((a) => a.incidentId === i.id && !a.done && normKey(a.ownerName) === name);
}

/* ------------------------------------------------------------------ today */

/** "45m", "26h", "12d": compact durations for big Today numbers. */
export function compactDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / (24 * 60))}d`;
}

const SEV_RANK: Record<Severity, number> = { sev1: 1, sev2: 2, sev3: 3, sev4: 4 };

export interface TodayPick {
  id: string;
  /** What the item focuses on the seismograph. */
  focus: { kind: 'incident'; id: string } | { kind: 'system'; key: string };
  lens: LensKey;
  title: string;
  tone: 'bad' | 'warn' | 'info';
  value: string | number;
  unit: string;
  meta: string;
}

/**
 * The three to five things that need attention now, ranked:
 * 1. the most severe open incident (SEV1 or SEV2), 2. the oldest aging open incident, 3. overdue aftershocks
 * (for an engineer: their own open ones), 4. the noisiest system of the window, 5. for a lead the incidents ready for
 * sign-off; for an engineer the slowest recovery of the window.
 */
export function rankToday(
  all: Incident[],
  actions: ActionItem[],
  now: Date,
  role: Role,
  me: { sub: string; displayName: string },
): TodayPick[] {
  const picks: TodayPick[] = [];
  const used = new Set<string>();
  const open = all.filter((i) => i.status === 'open');
  const nowMs = now.getTime();
  const openMin = (i: Incident) => (nowMs - toMs(i.startedAt)) / 60000;

  const severe = open
    .filter((i) => i.severity === 'sev1' || i.severity === 'sev2')
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || toMs(b.startedAt) - toMs(a.startedAt))[0];
  if (severe) {
    used.add(severe.id);
    picks.push({
      id: `severe-${severe.id}`,
      focus: { kind: 'incident', id: severe.id },
      lens: 'severity',
      title: severe.title,
      tone: severe.severity === 'sev1' ? 'bad' : 'warn',
      value: compactDuration(openMin(severe)),
      unit: 'still open',
      meta: `${severe.severity.toUpperCase()} · ${severe.system}`,
    });
  }

  const aging = open.filter((i) => isAging(i, now) && !used.has(i.id)).sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt))[0];
  if (aging) {
    used.add(aging.id);
    picks.push({
      id: `aging-${aging.id}`,
      focus: { kind: 'incident', id: aging.id },
      lens: 'status',
      title: aging.title,
      tone: 'bad',
      value: Math.floor(openMin(aging) / (24 * 60)),
      unit: 'days open',
      meta: `Aging · ${aging.system}`,
    });
  }

  const byId = new Map(all.map((i) => [i.id, i]));
  const live = actions.filter((a) => !a.done && byId.has(a.incidentId));
  if (role === 'lead') {
    const overdue = live.filter((a) => isOverdue(a, now)).sort((a, b) => toMs(a.dueDate!) - toMs(b.dueDate!));
    if (overdue.length) {
      const worst = overdue[0];
      picks.push({
        id: 'overdue',
        focus: { kind: 'incident', id: worst.incidentId },
        lens: 'status',
        title: `${overdue.length} aftershock${overdue.length === 1 ? '' : 's'} overdue`,
        tone: 'bad',
        value: overdue.length,
        unit: 'overdue',
        meta: `Oldest: ${worst.ownerName}`,
      });
    }
  } else {
    const name = normKey(me.displayName);
    const mine = live
      .filter((a) => normKey(a.ownerName) === name)
      .sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)) || (a.dueDate ? toMs(a.dueDate) : Infinity) - (b.dueDate ? toMs(b.dueDate) : Infinity));
    if (mine.length) {
      const late = mine.filter((a) => isOverdue(a, now)).length;
      picks.push({
        id: 'mine',
        focus: { kind: 'incident', id: mine[0].incidentId },
        lens: 'status',
        title: `${mine.length} aftershock${mine.length === 1 ? '' : 's'} on you`,
        tone: late ? 'bad' : 'info',
        value: mine.length,
        unit: late ? `${late} overdue` : 'open',
        meta: mine[0].title,
      });
    }
  }

  const windowed = inWindow(all, now);
  const loudest = buildTracks(windowed, Infinity)[0];
  if (loudest && loudest.incidents.length >= 3) {
    const counts = new Map<Category, number>();
    for (const i of loudest.incidents) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    const [topCat, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    picks.push({
      id: `system-${loudest.key}`,
      focus: { kind: 'system', key: loudest.key },
      lens: 'category',
      title: `${loudest.label} keeps shaking`,
      tone: loudest.incidents.length >= 5 ? 'warn' : 'info',
      value: loudest.incidents.length,
      unit: `in ${WINDOW_DAYS} days`,
      meta: `${topN} × ${categoryLabels[topCat].toLowerCase()}`,
    });
  }

  if (role === 'lead') {
    const ready = readyForSignOff(all, actions);
    if (ready.length) {
      picks.push({
        id: 'signoff',
        focus: { kind: 'incident', id: ready[0].id },
        lens: 'status',
        title: `${ready.length} ready for sign-off`,
        tone: 'info',
        value: ready.length,
        unit: 'to review',
        meta: ready[0].title,
      });
    }
  } else {
    const slowest = windowed
      .filter((i) => i.status !== 'open' && timeToResolve(i) !== null)
      .sort((a, b) => (timeToResolve(b) ?? 0) - (timeToResolve(a) ?? 0))[0];
    if (slowest) {
      picks.push({
        id: `slowest-${slowest.id}`,
        focus: { kind: 'incident', id: slowest.id },
        lens: 'ttr',
        title: slowest.title,
        tone: 'info',
        value: compactDuration(timeToResolve(slowest)!),
        unit: 'to resolve',
        meta: `Slowest recovery · ${slowest.system}`,
      });
    }
  }
  return picks.slice(0, 5);
}

/* ------------------------------------------------------------------ system summary */

export interface SystemSummary {
  count: number;
  open: number;
  topCategory: { category: Category; count: number } | null;
  medianTtrMinutes: number | null;
}

export function summariseTrack(t: Track): SystemSummary {
  const counts = new Map<Category, number>();
  for (const i of t.incidents) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const ttrs = t.incidents.map(timeToResolve).filter((x): x is number => x !== null && x >= 0);
  return {
    count: t.incidents.length,
    open: t.open,
    topCategory: top ? { category: top[0], count: top[1] } : null,
    medianTtrMinutes: median(ttrs),
  };
}

/** Statuses in display order for the open/resolved lens. */
export const STATUS_ORDER: Status[] = ['open', 'resolved', 'reviewed'];

/** Hours elapsed, for labels. */
export const hoursSince = (iso: string, now: Date) => (now.getTime() - toMs(iso)) / HOUR;

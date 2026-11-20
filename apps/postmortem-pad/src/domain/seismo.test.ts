import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type Incident } from '../model';
import { seed } from '../seed';
import { listActionItems, listIncidents } from './incidents';
import { findBlameSpans, findBlameWords } from './rules';
import {
  buildTracks,
  compactDuration,
  hash,
  inWindow,
  isMine,
  OTHER_KEY,
  rankToday,
  readyForSignOff,
  ringPx,
  summariseTrack,
  tailPoints,
  toPath,
  tremorPoints,
  ttrBucket,
} from './seismo';

async function load() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  return { incidents: await listIncidents(store), actions: await listActionItems(store) };
}

const inc = (p: Partial<Incident>): Incident => ({
  id: p.id ?? 'x',
  title: 'Title of incident',
  system: 'Alpha',
  severity: 'sev3',
  category: 'other',
  startedAt: '2026-11-01T10:00:00.000Z',
  detectedAt: null,
  resolvedAt: null,
  summary: null,
  rootCause: null,
  fix: null,
  prevention: null,
  status: 'open',
  reporterSub: 'demo-lead',
  reporterName: 'Morgan Lee',
  createdAt: '2026-11-01T10:00:00.000Z',
  ...p,
});

describe('window and tracks', () => {
  it('keeps the last 90 days plus older incidents that are still open', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const rows = [
      inc({ id: 'a', startedAt: '2026-11-10T00:00:00Z', status: 'resolved' }),
      inc({ id: 'b', startedAt: '2026-07-01T00:00:00Z', status: 'resolved' }),
      inc({ id: 'c', startedAt: '2026-07-01T00:00:00Z', status: 'open' }),
      inc({ id: 'd', startedAt: '2026-12-01T00:00:00Z', status: 'open' }),
    ];
    expect(inWindow(rows, now).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('groups systems ignoring case and spacing, noisiest first, merging the tail into "Other systems"', () => {
    const rows = [
      inc({ id: '1', system: 'Orders  ingest' }),
      inc({ id: '2', system: 'orders ingest' }),
      inc({ id: '3', system: 'orders ingest' }),
      inc({ id: '4', system: 'Beta' }),
      inc({ id: '5', system: 'Gamma' }),
      inc({ id: '6', system: 'Delta' }),
    ];
    const tracks = buildTracks(rows, 3);
    expect(tracks.map((t) => t.label)).toEqual(['orders ingest', 'Beta', 'Other systems (2)']);
    expect(tracks[0].incidents).toHaveLength(3);
    expect(tracks[2].key).toBe(OTHER_KEY);
    expect(tracks[2].incidents.map((i) => i.id).sort()).toEqual(['5', '6']);
  });

  it('builds six traces from the seed with Sales orders ingest the noisiest', async () => {
    const { incidents } = await load();
    const tracks = buildTracks(inWindow(incidents, FIXED_NOW));
    expect(tracks).toHaveLength(6);
    expect(tracks[0].label).toBe('Sales orders ingest');
    expect(tracks[0].incidents).toHaveLength(6);
    expect(tracks.reduce((s, t) => s + t.incidents.length, 0)).toBe(24);
    expect(tracks.reduce((s, t) => s + t.open, 0)).toBe(4);
    const summary = summariseTrack(tracks[0]);
    expect(summary.topCategory).toEqual({ category: 'schema_change', count: 5 });
  });
});

describe('shapes', () => {
  it('rings longer for slower recoveries, on a log scale', () => {
    expect(ringPx(10)).toBeLessThan(ringPx(60));
    expect(ringPx(60)).toBeLessThan(ringPx(1100));
    expect(ringPx(1100)).toBeLessThan(60);
  });

  it('draws a deterministic tremor that starts and ends on the baseline, within its amplitude', () => {
    const a = tremorPoints(100, 50, 20, 30, hash('id-1'));
    const b = tremorPoints(100, 50, 20, 30, hash('id-1'));
    expect(toPath(a)).toBe(toPath(b));
    expect(a[0][1]).toBe(50);
    expect(a[a.length - 1][1]).toBe(50);
    for (const [, y] of a) expect(Math.abs(y - 50)).toBeLessThanOrEqual(20);
    expect(toPath(tremorPoints(100, 50, 20, 30, hash('id-2')))).not.toBe(toPath(a));
  });

  it('a tail spans exactly to the stylus and is empty when there is no room', () => {
    const t = tailPoints(10, 80, 40, 6, 1, 0.5);
    expect(t[0][0]).toBe(10);
    expect(t[t.length - 1][0]).toBe(80);
    expect(tailPoints(80, 80, 40, 6, 1)).toEqual([]);
  });

  it('buckets time to resolve', () => {
    const at = (min: number) => new Date(Date.parse('2026-11-01T10:00:00Z') + min * 60000).toISOString();
    expect(ttrBucket(inc({ status: 'resolved', resolvedAt: at(90) }))).toBe('fast');
    expect(ttrBucket(inc({ status: 'resolved', resolvedAt: at(200) }))).toBe('medium');
    expect(ttrBucket(inc({ status: 'resolved', resolvedAt: at(600) }))).toBe('slow');
    expect(ttrBucket(inc({ status: 'reviewed', resolvedAt: at(1100) }))).toBe('slowest');
    expect(ttrBucket(inc({ status: 'open' }))).toBe('open');
  });

  it('formats compact durations', () => {
    expect(compactDuration(45)).toBe('45m');
    expect(compactDuration(26 * 60)).toBe('26h');
    expect(compactDuration(12 * 24 * 60)).toBe('12d');
  });
});

describe('today', () => {
  it('ranks the lead view from the seed', async () => {
    const { incidents, actions } = await load();
    const picks = rankToday(incidents, actions, FIXED_NOW, 'lead', { sub: 'demo-lead', displayName: 'Morgan Lee' });
    expect(picks.map((p) => p.id.split('-')[0])).toEqual(['severe', 'aging', 'overdue', 'system', 'signoff']);
    expect(picks[0].title).toBe('Customer 360 notebook ran out of memory on the merge step');
    expect(picks[1].title).toBe('Finance refresh shows a stale-data banner after success');
    expect(picks[2]).toMatchObject({ title: '3 aftershocks overdue', value: 3 });
    const worst = incidents.find((i) => i.id === (picks[2].focus as { id: string }).id);
    expect(worst?.title).toBe('Orders ingest failed on a widened order id');
    expect(picks[3]).toMatchObject({ title: 'Sales orders ingest keeps shaking', value: 6, focus: { kind: 'system', key: 'sales orders ingest' } });
    expect(picks[4].title).toBe('2 ready for sign-off');
    expect(readyForSignOff(incidents, actions)[0].title).toBe('Orders ingest dropped the discount column');
  });

  it('ranks the engineer view around their own aftershocks', async () => {
    const { incidents, actions } = await load();
    const picks = rankToday(incidents, actions, FIXED_NOW, 'engineer', { sub: 'demo-priya', displayName: 'Priya Nair' });
    const mine = picks.find((p) => p.id === 'mine');
    expect(mine).toMatchObject({ title: '3 aftershocks on you', unit: '1 overdue', tone: 'bad' });
    expect(picks.some((p) => p.id.startsWith('slowest'))).toBe(true);
    expect(picks.length).toBeLessThanOrEqual(5);
  });

  it('knows which incidents are mine', async () => {
    const { incidents, actions } = await load();
    const priya = { sub: 'demo-priya', displayName: 'priya  nair' };
    const mine = incidents.filter((i) => isMine(i, actions, priya));
    expect(mine.length).toBeGreaterThan(3);
    // Reported by someone else, but Priya owns its open staging-table follow-up.
    const row19 = incidents.find((i) => i.title === 'Orders ingest loaded columns into the wrong fields')!;
    expect(row19.reporterSub).not.toBe('demo-priya');
    expect(isMine(row19, actions, priya)).toBe(true);
  });
});

describe('blameless spans', () => {
  it('returns the exact offsets of every flagged phrase, preferring the longer match', () => {
    const text = 'The team forgot to announce it. Nobody is to blame, but someone forgot.';
    const spans = findBlameSpans(text);
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(['forgot to', 'blame', 'forgot']);
    expect(findBlameWords(text).map((h) => h.term)).toEqual(['forgot to', 'blame', 'forgot']);
  });
});

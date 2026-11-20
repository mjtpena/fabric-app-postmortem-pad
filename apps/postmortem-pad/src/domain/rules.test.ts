import { checklistTemplates } from '../config';
import {
  findBlameWords,
  isAging,
  isBlankRootCause,
  isOverdue,
  minutesFromTo,
  openFor,
  reviewBlocker,
  rootCauseAfterCategoryChange,
  storedRootCause,
  timeToDetect,
  timeToResolve,
  validateActionItem,
  validateIncident,
  type IncidentInput,
} from './rules';

const NOW = new Date('2026-11-20T09:00:00.000Z');

const base = (over: Partial<IncidentInput> = {}): IncidentInput => ({
  title: 'Orders ingest failed',
  system: 'Sales orders ingest',
  severity: 'sev2',
  category: 'schema_change',
  startedAt: '2026-11-19T08:00:00.000Z',
  detectedAt: null,
  resolvedAt: null,
  summary: '',
  rootCause: '',
  fix: '',
  prevention: '',
  status: 'open',
  ...over,
});

describe('durations', () => {
  it('computes time to detect and resolve in minutes', () => {
    const i = { startedAt: '2026-11-19T08:00:00Z', detectedAt: '2026-11-19T08:25:00Z', resolvedAt: '2026-11-19T11:10:00Z' };
    expect(timeToDetect(i)).toBe(25);
    expect(timeToResolve(i)).toBe(190);
    expect(timeToDetect({ ...i, detectedAt: null })).toBeNull();
    expect(timeToResolve({ ...i, resolvedAt: null })).toBeNull();
    expect(minutesFromTo('nonsense', i.resolvedAt)).toBeNull();
  });

  it('uses exact elapsed time across daylight-saving changes (UTC ms)', () => {
    // Europe springs forward at 01:00 UTC on 29 Mar 2026; the US falls back at 06:00 UTC on 1 Nov 2026.
    expect(timeToResolve({ startedAt: '2026-03-29T00:30:00Z', resolvedAt: '2026-03-29T03:30:00Z' })).toBe(180);
    expect(timeToResolve({ startedAt: '2026-11-01T05:00:00Z', resolvedAt: '2026-11-01T08:00:00Z' })).toBe(180);
    // The same instants written with offsets either side of the change.
    expect(timeToResolve({ startedAt: '2026-03-29T00:30:00+00:00', resolvedAt: '2026-03-29T05:30:00+02:00' })).toBe(180);
  });

  it('flags open incidents older than 7 days as aging', () => {
    expect(isAging({ status: 'open', startedAt: '2026-11-12T08:00:00Z' }, NOW)).toBe(true);
    expect(isAging({ status: 'open', startedAt: '2026-11-14T08:00:00Z' }, NOW)).toBe(false);
    expect(isAging({ status: 'resolved', startedAt: '2026-10-01T08:00:00Z' }, NOW)).toBe(false);
    expect(openFor({ status: 'open', startedAt: '2026-11-20T08:00:00Z' }, NOW)).toBe(60);
    expect(openFor({ status: 'resolved', startedAt: '2026-11-20T08:00:00Z' }, NOW)).toBeNull();
  });

  it('marks action items overdue once the due day has passed and they are not done', () => {
    expect(isOverdue({ done: false, dueDate: '2026-11-18T00:00:00Z' }, NOW)).toBe(true);
    expect(isOverdue({ done: false, dueDate: '2026-11-20T00:00:00Z' }, NOW)).toBe(false); // due today
    expect(isOverdue({ done: true, dueDate: '2026-11-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isOverdue({ done: false, dueDate: null }, NOW)).toBe(false);
  });
});

describe('validateIncident', () => {
  it('accepts the five-field quick form', () => {
    expect(validateIncident(base(), NOW)).toEqual({});
  });

  it('requires the quick fields with entity limits', () => {
    const e = validateIncident(base({ title: 'abc', system: '', severity: '', category: '', startedAt: null }), NOW);
    expect(e.title).toMatch(/at least 5/);
    expect(e.system).toMatch(/required/);
    expect(e.severity).toBeTruthy();
    expect(e.category).toBeTruthy();
    expect(e.startedAt).toBeTruthy();
    expect(validateIncident(base({ title: 'x'.repeat(121) }), NOW).title).toMatch(/120/);
    expect(validateIncident(base({ summary: 'x'.repeat(1001) }), NOW).summary).toMatch(/1000/);
  });

  it('rejects resolved or detected earlier than started, and a future start', () => {
    expect(validateIncident(base({ resolvedAt: '2026-11-19T07:00:00Z' }), NOW).resolvedAt).toMatch(/earlier than the start/);
    expect(validateIncident(base({ detectedAt: '2026-11-19T07:59:00Z' }), NOW).detectedAt).toMatch(/earlier than the start/);
    expect(
      validateIncident(base({ detectedAt: '2026-11-19T10:00:00Z', resolvedAt: '2026-11-19T09:00:00Z' }), NOW).resolvedAt,
    ).toMatch(/detected/);
    expect(validateIncident(base({ startedAt: '2026-11-20T10:00:00Z' }), NOW).startedAt).toMatch(/future/);
  });

  it('blocks resolving without a resolved time, root cause and fix', () => {
    const e = validateIncident(base({ status: 'resolved' }), NOW);
    expect(e.rootCause).toMatch(/root cause/i);
    expect(e.fix).toBeTruthy();
    expect(e.resolvedAt).toBeTruthy();
    const ok = validateIncident(
      base({ status: 'resolved', resolvedAt: '2026-11-19T10:00:00Z', rootCause: 'Column renamed upstream.', fix: 'Remapped.' }),
      NOW,
    );
    expect(ok).toEqual({});
  });

  it('does not accept the untouched checklist as a root cause', () => {
    const e = validateIncident(
      base({ status: 'resolved', resolvedAt: '2026-11-19T10:00:00Z', rootCause: checklistTemplates.schema_change, fix: 'Remapped.' }),
      NOW,
    );
    expect(e.rootCause).toMatch(/checklist/);
  });

  it('never fails on blame words (the hint does not block saving)', () => {
    expect(validateIncident(base({ summary: 'Someone forgot to update the mapping.' }), NOW)).toEqual({});
  });
});

describe('blameless nudge', () => {
  it('finds "forgot to" as one hit, in any case', () => {
    const hits = findBlameWords('The on-call engineer FORGOT TO update the mapping.');
    expect(hits.map((h) => h.term)).toEqual(['forgot to']);
    expect(hits[0].suggestion).toBeTruthy();
  });

  it('matches whole words only and lists several distinct terms', () => {
    expect(findBlameWords('The default value was faulty')).toEqual([]);
    expect(findBlameWords('')).toEqual([]);
    expect(findBlameWords('Careless change, and it was lazy. Careless again.').map((h) => h.term)).toEqual(['careless', 'lazy']);
    expect(findBlameWords('Pure human   error').map((h) => h.term)).toEqual(['human error']);
    expect(findBlameWords('Not my fault; nobody to blame').map((h) => h.term)).toEqual(['fault', 'blame']);
  });
});

describe('category checklist', () => {
  it('fills an empty root cause and swaps an untouched checklist', () => {
    const a = rootCauseAfterCategoryChange('', '', 'schema_change');
    expect(a).toBe(checklistTemplates.schema_change);
    expect(rootCauseAfterCategoryChange(a, 'schema_change', 'capacity')).toBe(checklistTemplates.capacity);
    expect(rootCauseAfterCategoryChange(a, 'schema_change', '')).toBe('');
  });

  it('never overwrites edited text', () => {
    const edited = `${checklistTemplates.schema_change}\nThe source renamed a column.`;
    expect(rootCauseAfterCategoryChange(edited, 'schema_change', 'config')).toBe(edited);
  });

  it('stores an untouched checklist as null', () => {
    expect(storedRootCause(checklistTemplates.config, 'config')).toBeNull();
    expect(storedRootCause('  Real cause ', 'config')).toBe('Real cause');
    expect(isBlankRootCause('   ', 'other')).toBe(true);
  });
});

describe('review and action items', () => {
  it('only lets a lead review a resolved incident with an action item', () => {
    expect(reviewBlocker({ status: 'resolved' }, 1, false)).toMatch(/Only a lead/);
    expect(reviewBlocker({ status: 'open' }, 1, true)).toMatch(/Resolve/);
    expect(reviewBlocker({ status: 'resolved' }, 0, true)).toMatch(/action item/);
    expect(reviewBlocker({ status: 'reviewed' }, 2, true)).toMatch(/already/);
    expect(reviewBlocker({ status: 'resolved' }, 1, true)).toBeNull();
  });

  it('validates action items with the entity limits', () => {
    expect(validateActionItem({ title: 'ab', ownerName: '', dueDate: null })).toMatchObject({
      title: expect.stringMatching(/at least 3/),
      ownerName: expect.stringMatching(/required/),
    });
    expect(validateActionItem({ title: 'Add a check', ownerName: 'Priya', dueDate: '2026-12-01T00:00:00Z' })).toEqual({});
  });
});

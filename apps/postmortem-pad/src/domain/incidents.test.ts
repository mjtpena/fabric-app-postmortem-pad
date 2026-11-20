import { PermissionError, RuleError } from '@x10/shared/data';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { checklistTemplates } from '../config';
import { defs } from '../model';
import { seed, SEED_ACTIONS, SEED_INCIDENTS, SEED_SYSTEMS, seedStart } from '../seed';
import {
  addActionItem,
  blankInput,
  createIncident,
  getIncidentDetail,
  IncidentValidationError,
  listActionItems,
  listIncidents,
  markReviewed,
  reopenIncident,
  resolveIncident,
  setActionDone,
  toInput,
  updateIncident,
} from './incidents';
import { groupOpenActions } from './log';
import { isOverdue } from './rules';
import { computeTrends, lastDays } from './trends';

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const people = await store.repo('Person').list();
  const bySub = (sub: string) => people.find((p) => p.sub === sub)!;
  return { store, lead: bySub('demo-lead'), priya: bySub('demo-priya'), sam: bySub('demo-sam') };
}

const quick = () => ({
  ...blankInput(FIXED_NOW),
  title: 'Nightly orders load failed',
  system: 'Sales orders ingest',
  severity: 'sev2' as const,
  category: 'schema_change' as const,
});

describe('seed', () => {
  it('inserts 30 incidents across 6 systems and 12 action items, covering every status', async () => {
    const { store } = await setup();
    const incidents = await listIncidents(store);
    const actions = await listActionItems(store);
    expect(incidents).toHaveLength(30);
    expect(new Set(incidents.map((i) => i.system)).size).toBe(6);
    expect(actions).toHaveLength(12);
    expect(new Set(incidents.map((i) => i.status))).toEqual(new Set(['open', 'resolved', 'reviewed']));
    // All within the last 120 days, none in the future.
    for (const i of incidents) {
      const age = FIXED_NOW.getTime() - new Date(i.startedAt).getTime();
      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThanOrEqual(120 * 86_400_000);
    }
    // Every resolved/reviewed incident satisfies rule 2; every reviewed one has an action item (rule 3).
    for (const i of incidents.filter((x) => x.status !== 'open')) {
      expect(i.resolvedAt && i.rootCause && i.fix).toBeTruthy();
      if (i.status === 'reviewed') expect(actions.some((a) => a.incidentId === i.id)).toBe(true);
    }
    // Edge cases: aging open incidents and overdue action items exist.
    expect(actions.filter((a) => isOverdue(a, FIXED_NOW)).length).toBe(3);
  });

  it('shows the patterns: schema changes dominate one system, and Monday mornings are busiest', async () => {
    const { store } = await setup();
    const incidents = await listIncidents(store);
    const orders = incidents.filter((i) => i.system === SEED_SYSTEMS[0]);
    expect(orders).toHaveLength(9);
    expect(orders.filter((i) => i.category === 'schema_change')).toHaveLength(6);
    const mondayMorning = incidents.filter((i) => {
      const d = new Date(i.startedAt);
      return d.getDay() === 1 && d.getHours() >= 7 && d.getHours() < 10;
    });
    expect(mondayMorning).toHaveLength(14);
  });

  it('is deterministic for a given clock', () => {
    const a = SEED_INCIDENTS.map((r) => seedStart(FIXED_NOW, r).toISOString());
    const b = SEED_INCIDENTS.map((r) => seedStart(FIXED_NOW, r).toISOString());
    expect(a).toEqual(b);
    expect(SEED_ACTIONS).toHaveLength(12);
  });

  it('acceptance 4: Trends match a hand count of the seed for the last 90 days', async () => {
    const { store } = await setup();
    const t = computeTrends(await listIncidents(store), lastDays(FIXED_NOW, 90));
    const count = (c: string) => t.byCategory.find((x) => x.category === c)?.count;
    // Hand count from the table in src/seed.ts (rows 1–24 are within 90 days).
    expect(count('schema_change')).toBe(6); // rows 3, 5, 10, 14, 17, 19
    expect(count('upstream_late')).toBe(3); // rows 7, 11, 12
    expect(count('data_quality')).toBe(3); // rows 2, 15, 23
    expect(t.total).toBe(24);
    expect(t.systems[0]).toEqual({ system: 'Sales orders ingest', count: 6 }); // rows 3, 5, 7, 10, 14, 19
    expect(t.systems[1]).toEqual({ system: 'Customer 360 notebook', count: 5 }); // rows 1, 8, 13, 20, 24
    // The 120-day view adds the six older rows.
    const all = computeTrends(await listIncidents(store), lastDays(FIXED_NOW, 125));
    expect(all.total).toBe(30);
    expect(all.byCategory.find((x) => x.category === 'schema_change')?.count).toBe(7);
  });
});

describe('incident flows', () => {
  it('acceptance 1: saves the five-field quick form as the reporter', async () => {
    const { store, priya } = await setup();
    const created = await createIncident(store, priya, quick(), FIXED_NOW);
    expect(created).toMatchObject({ status: 'open', reporterSub: 'demo-priya', reporterName: 'Priya Nair', rootCause: null });
    expect((await listIncidents(store))[0].id).toBe(created.id);
  });

  it('never stores the untouched checklist as the root cause', async () => {
    const { store, priya } = await setup();
    const created = await createIncident(store, priya, { ...quick(), rootCause: checklistTemplates.schema_change }, FIXED_NOW);
    expect(created.rootCause).toBeNull();
  });

  it('acceptance 3: blame words never block saving', async () => {
    const { store, sam } = await setup();
    const created = await createIncident(store, sam, { ...quick(), summary: 'We forgot to update the mapping.' }, FIXED_NOW);
    expect(created.summary).toBe('We forgot to update the mapping.');
  });

  it('rejects resolved earlier than started', async () => {
    const { store, sam } = await setup();
    const bad = { ...quick(), resolvedAt: new Date(FIXED_NOW.getTime() - 3_600_000).toISOString() };
    await expect(createIncident(store, sam, bad, FIXED_NOW)).rejects.toBeInstanceOf(IncidentValidationError);
  });

  it('acceptance 2: resolving without a root cause is blocked with a field message', async () => {
    const { store, sam } = await setup();
    const created = await createIncident(store, sam, quick(), FIXED_NOW);
    const later = new Date(FIXED_NOW.getTime() + 3_600_000);
    const err = await resolveIncident(store, sam, created.id, { resolvedAt: later.toISOString(), rootCause: '', fix: 'Remapped.' }, later).catch((e) => e);
    expect(err).toBeInstanceOf(IncidentValidationError);
    expect((err as IncidentValidationError).fields.rootCause).toMatch(/root cause/i);
    const ok = await resolveIncident(
      store,
      sam,
      created.id,
      { resolvedAt: later.toISOString(), rootCause: 'The source renamed a column.', fix: 'Remapped.' },
      later,
    );
    expect(ok.status).toBe('resolved');
  });

  it('lets any engineer edit, but only a lead reviews, and only with an action item', async () => {
    const { store, lead, priya, sam } = await setup();
    const created = await createIncident(store, priya, quick(), FIXED_NOW);
    const later = new Date(FIXED_NOW.getTime() + 7_200_000);
    // Sam (not the reporter) can fill in the story and resolve it.
    await resolveIncident(store, sam, created.id, { resolvedAt: later.toISOString(), rootCause: 'Renamed column.', fix: 'Remapped.' }, later);
    await expect(markReviewed(store, sam, created.id, later)).rejects.toBeInstanceOf(PermissionError);
    await expect(markReviewed(store, lead, created.id, later)).rejects.toThrow(/action item/);
    await addActionItem(store, sam, created.id, { title: 'Add a schema check', ownerName: 'Sam Taylor', dueDate: null }, later);
    const reviewed = await markReviewed(store, lead, created.id, later);
    expect(reviewed.status).toBe('reviewed');
    // A reviewed incident is signed off: engineers cannot edit or reopen it; a lead can.
    const { incident } = await getIncidentDetail(store, created.id);
    const typo = { ...toInput(incident), title: 'Nightly orders load failed (renamed column)' };
    await expect(updateIncident(store, sam, created.id, typo, later)).rejects.toBeInstanceOf(PermissionError);
    await expect(updateIncident(store, priya, created.id, typo, later)).rejects.toBeInstanceOf(PermissionError);
    await expect(reopenIncident(store, sam, created.id, later)).rejects.toBeInstanceOf(PermissionError);
    expect((await updateIncident(store, lead, created.id, typo, later)).title).toBe(typo.title);
    const reopened = await reopenIncident(store, lead, created.id, later);
    expect(reopened).toMatchObject({ status: 'open', resolvedAt: null });
    // The reporter columns never change on edit.
    expect(reopened.reporterSub).toBe('demo-priya');
  });

  it('cannot create an incident straight into reviewed', async () => {
    const { store, lead } = await setup();
    await expect(createIncident(store, lead, { ...quick(), status: 'reviewed' }, FIXED_NOW)).rejects.toBeInstanceOf(RuleError);
  });

  it('adds action items and lists open ones by owner, overdue first', async () => {
    const { store, lead } = await setup();
    const [first] = await listIncidents(store);
    await expect(addActionItem(store, lead, first.id, { title: 'x', ownerName: '', dueDate: null }, FIXED_NOW)).rejects.toBeInstanceOf(RuleError);
    const item = await addActionItem(store, lead, first.id, { title: 'Add memory alerts', ownerName: 'Sam Taylor', dueDate: null }, FIXED_NOW);
    expect(item).toMatchObject({ done: false, createdBySub: 'demo-lead' });
    const groups = groupOpenActions(await listActionItems(store), await listIncidents(store), FIXED_NOW);
    expect(groups.reduce((s, g) => s + g.items.length, 0)).toBe(8); // 7 open seed items + 1
    expect(groups[0].overdue).toBeGreaterThan(0);
    await setActionDone(store, item.id, true);
    const after = groupOpenActions(await listActionItems(store), await listIncidents(store), FIXED_NOW);
    expect(after.reduce((s, g) => s + g.items.length, 0)).toBe(7);
  });
});

import type { DataStore } from '@x10/shared/data';
import { DAY, HOUR, MINUTE } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import type { Category, Schema, Severity, Status } from './model';

/**
 * Fictional seed: 30 incidents over the last 120 days across 6 made-up systems, and 12 action items.
 * Fully deterministic (no randomness), so the Trends numbers can be hand-counted from the table below.
 *
 * Visible patterns:
 * - "Sales orders ingest" has 9 incidents, 6 of them schema changes (7 schema changes overall).
 * - 14 of 30 incidents start on a Monday between 07:00 and 10:00 (viewer's local time).
 *
 * Hand count for the default "last 90 days" Trends view (rows 1–24; rows 25–30 are 96+ days old):
 * schema_change 6, upstream_late 3, capacity 3, code_bug 3, config 2, permissions 2, data_quality 3, other 2.
 */

interface SeedIncident {
  /** Days before now (a Monday row moves back to the Monday on or before that day). */
  d: number;
  /** Start on a Monday morning (local time). */
  mon?: boolean;
  /** Local start time "HH:MM". */
  at: string;
  sys: number;
  cat: Category;
  sev: Severity;
  status: Status;
  /** Minutes from start to detection (null = not recorded). */
  ttd: number | null;
  /** Minutes from start to resolution (null = still open). */
  ttr: number | null;
  title: string;
  summary?: string;
  rootCause?: string;
  fix?: string;
  prevention?: string;
}

export const SEED_SYSTEMS = [
  'Sales orders ingest',
  'Customer 360 notebook',
  'Finance daily refresh',
  'Clickstream lakehouse load',
  'Inventory sync dataflow',
  'Marketing attribution model',
];

export const SEED_INCIDENTS: SeedIncident[] = [
  // ---- last 90 days (rows 1–24)
  {
    d: 1, at: '14:20', sys: 1, cat: 'capacity', sev: 'sev2', status: 'open', ttd: 25, ttr: null,
    title: 'Customer 360 notebook ran out of memory on the merge step',
    summary: 'The afternoon run stopped at the merge into the customer table. Downstream dashboards still show yesterday.',
  },
  {
    d: 3, at: '02:10', sys: 3, cat: 'data_quality', sev: 'sev3', status: 'open', ttd: 300, ttr: null,
    title: 'Duplicate session rows in the clickstream load',
    summary: 'Session counts doubled for one region overnight. Found by an analyst comparing two reports.',
  },
  {
    d: 10, mon: true, at: '08:05', sys: 0, cat: 'schema_change', sev: 'sev2', status: 'open', ttd: 40, ttr: null,
    title: 'Orders ingest failed after a source column was renamed',
    summary: 'The copy activity failed with a missing column error. The source team forgot to announce the rename. A manual mapping keeps the data flowing for now.',
  },
  {
    d: 20, at: '16:45', sys: 2, cat: 'other', sev: 'sev4', status: 'open', ttd: null, ttr: null,
    title: 'Finance refresh shows a stale-data banner after success',
    summary: 'The refresh succeeds but the report banner still says the data is stale. Cosmetic, under investigation.',
  },
  {
    d: 6, mon: true, at: '07:40', sys: 0, cat: 'schema_change', sev: 'sev1', status: 'resolved', ttd: 20, ttr: 190,
    title: 'Orders ingest dropped the discount column',
    summary: 'Revenue figures were overstated in the morning sales report for about three hours.',
    rootCause: 'The source system split discount into two columns. Our mapping is by position, so the load silently skipped it.',
    fix: 'Remapped the columns by name and reloaded the morning batch.',
    prevention: 'Fail the load when the source column list differs from the expected list.',
  },
  {
    d: 12, at: '11:00', sys: 4, cat: 'config', sev: 'sev3', status: 'resolved', ttd: 60, ttr: 95,
    title: 'Inventory sync pointed at the test warehouse',
    rootCause: 'A deployment parameter kept its test value because the production parameter file had no entry for it.',
    fix: 'Added the production value and re-ran the sync.',
    prevention: 'Deployment check that every parameter has a production value.',
  },
  {
    d: 15, mon: true, at: '08:30', sys: 0, cat: 'upstream_late', sev: 'sev3', status: 'resolved', ttd: 45, ttr: 120,
    title: 'Orders extract arrived two hours late',
    rootCause: 'The upstream weekend batch overran. Our schedule starts at a fixed time and does not wait for the file.',
    fix: 'Re-ran the ingest once the extract landed.',
  },
  {
    d: 17, mon: true, at: '09:10', sys: 1, cat: 'code_bug', sev: 'sev2', status: 'reviewed', ttd: 30, ttr: 240,
    title: 'Dedupe cell removed valid customers with a null key',
    summary: 'About 2% of customers disappeared from the segment table for one morning.',
    rootCause: 'The dedupe logic treated all null keys as one customer. The case had no test.',
    fix: 'Excluded null keys from the dedupe and restored the rows from the previous snapshot.',
    prevention: 'Unit test for null keys; row-count check before and after the dedupe.',
  },
  {
    d: 22, at: '19:30', sys: 5, cat: 'permissions', sev: 'sev3', status: 'resolved', ttd: 600, ttr: 720,
    title: 'Attribution model lost access to the campaign lakehouse',
    rootCause: 'The workspace identity was removed from a group during a clean-up. Nothing records which jobs depend on it.',
    fix: 'Restored the group membership and re-ran the model.',
  },
  {
    d: 26, mon: true, at: '07:15', sys: 0, cat: 'schema_change', sev: 'sev2', status: 'reviewed', ttd: 15, ttr: 150,
    title: 'Orders ingest failed on a widened order id',
    rootCause: 'The source changed the order id from int to bigint. Our staging table still used int.',
    fix: 'Widened the staging column and reloaded.',
    prevention: 'Ask for schema change notices in the source team change channel.',
  },
  {
    d: 29, at: '05:15', sys: 2, cat: 'upstream_late', sev: 'sev3', status: 'resolved', ttd: 90, ttr: 210,
    title: 'Finance refresh ran before the ledger export finished',
    rootCause: 'The ledger export was slower at month end. The refresh runs on a fixed schedule.',
    fix: 'Triggered a second refresh after the export.',
  },
  {
    d: 33, mon: true, at: '09:45', sys: 3, cat: 'upstream_late', sev: 'sev3', status: 'resolved', ttd: 30, ttr: 100,
    title: 'Clickstream files from the web tier landed late',
    rootCause: 'A web tier deployment paused the file export for 90 minutes.',
    fix: 'Re-ran the hourly load for the missing window.',
  },
  {
    d: 36, at: '13:40', sys: 1, cat: 'capacity', sev: 'sev2', status: 'resolved', ttd: 10, ttr: 80,
    title: 'Customer 360 notebook throttled during quarter-end',
    rootCause: 'Quarter-end jobs from other teams used the shared capacity at the same time.',
    fix: 'Moved the run to an off-peak slot.',
  },
  {
    d: 40, mon: true, at: '08:10', sys: 0, cat: 'schema_change', sev: 'sev2', status: 'resolved', ttd: 25, ttr: 170,
    title: 'Orders ingest rejected a new status value',
    rootCause: 'The source added an order status value that our validation list did not include.',
    fix: 'Added the value to the list and replayed the rejected rows.',
  },
  {
    d: 43, at: '22:05', sys: 4, cat: 'data_quality', sev: 'sev4', status: 'resolved', ttd: 900, ttr: 1100,
    title: 'Negative stock levels in the inventory sync',
    rootCause: 'Returns were booked before the matching sale, which the sync did not expect.',
    fix: 'Clamped the derived stock level at zero and flagged the rows for review.',
  },
  {
    d: 47, at: '10:30', sys: 2, cat: 'permissions', sev: 'sev3', status: 'reviewed', ttd: 20, ttr: 60,
    title: 'Finance refresh failed after a service principal secret expired',
    rootCause: 'The secret expiry date was not tracked anywhere the team looks.',
    fix: 'Rotated the secret and re-ran the refresh.',
    prevention: 'Expiry reminder 30 days ahead; owner documented in the runbook.',
  },
  {
    d: 50, mon: true, at: '07:50', sys: 4, cat: 'schema_change', sev: 'sev2', status: 'resolved', ttd: 35, ttr: 140,
    title: 'Inventory sync broke on a renamed warehouse code field',
    rootCause: 'The supplier feed renamed a field in a minor release without notice.',
    fix: 'Updated the mapping and reloaded.',
  },
  {
    d: 54, at: '03:50', sys: 3, cat: 'capacity', sev: 'sev3', status: 'resolved', ttd: 120, ttr: 260,
    title: 'Clickstream load hit the concurrency limit overnight',
    rootCause: 'A backfill job and the nightly load ran at the same time.',
    fix: 'Paused the backfill and re-ran the nightly load.',
  },
  {
    d: 58, mon: true, at: '08:20', sys: 0, cat: 'schema_change', sev: 'sev1', status: 'reviewed', ttd: 10, ttr: 300,
    title: 'Orders ingest loaded columns into the wrong fields',
    summary: 'Quantities and prices were swapped in the sales model for one morning.',
    rootCause: 'Two source columns swapped places. The mapping was positional, so the load succeeded with wrong data.',
    fix: 'Switched to name-based mapping and reloaded the day.',
    prevention: 'Name-based mapping everywhere; a staging table with range checks before publishing.',
  },
  {
    d: 61, at: '15:15', sys: 1, cat: 'other', sev: 'sev4', status: 'resolved', ttd: null, ttr: 90,
    title: 'Customer 360 notebook output landed in the wrong folder',
    rootCause: 'A folder path was edited by hand during a demo session.',
    fix: 'Moved the files and restored the path parameter.',
  },
  {
    d: 65, mon: true, at: '09:00', sys: 2, cat: 'config', sev: 'sev2', status: 'resolved', ttd: 15, ttr: 75,
    title: 'Finance refresh used the wrong fiscal calendar',
    rootCause: 'A shared parameter changed for another report and this refresh read the same value.',
    fix: 'Gave the refresh its own parameter and refreshed again.',
  },
  {
    d: 69, at: '09:20', sys: 5, cat: 'code_bug', sev: 'sev3', status: 'reviewed', ttd: 180, ttr: 400,
    title: 'Attribution model failed after a library upgrade',
    rootCause: 'The environment picked up a new major version of a library with a changed function signature.',
    fix: 'Pinned the previous version and re-ran.',
    prevention: 'Pin library versions in the environment definition.',
  },
  {
    d: 72, at: '23:40', sys: 3, cat: 'data_quality', sev: 'sev3', status: 'resolved', ttd: 480, ttr: 600,
    title: 'Bot traffic inflated clickstream sessions',
    rootCause: 'A new crawler did not match the existing bot filter list.',
    fix: 'Added the crawler pattern and reprocessed the day.',
  },
  {
    d: 76, mon: true, at: '08:45', sys: 1, cat: 'code_bug', sev: 'sev2', status: 'resolved', ttd: 20, ttr: 210,
    title: 'Customer 360 notebook wrote duplicate rows on retry',
    rootCause: 'The write step appended instead of merging, so an automatic retry wrote the batch twice.',
    fix: 'Changed the write to a merge on the customer key and removed the duplicates.',
  },
  // ---- older than 90 days (rows 25–30): only visible with the 120-day range
  {
    d: 96, at: '12:10', sys: 0, cat: 'upstream_late', sev: 'sev3', status: 'reviewed', ttd: 30, ttr: 110,
    title: 'Orders extract delayed by a source outage',
    rootCause: 'The source database was down for maintenance with no notice to consumers.',
    fix: 'Re-ran the ingest after the source came back.',
    prevention: 'Freshness check that alerts when the extract is more than an hour late.',
  },
  {
    d: 99, mon: true, at: '07:30', sys: 0, cat: 'config', sev: 'sev3', status: 'resolved', ttd: 45, ttr: 90,
    title: 'Orders ingest schedule disabled after a migration',
    rootCause: 'The migration script created schedules in a disabled state by default.',
    fix: 'Enabled the schedule and ran the missed load.',
  },
  {
    d: 103, at: '08:30', sys: 2, cat: 'upstream_late', sev: 'sev3', status: 'resolved', ttd: 120, ttr: 240,
    title: 'Finance refresh waited on a late exchange-rate file',
    rootCause: 'The rate provider published late on a public holiday.',
    fix: 'Used the previous day rates, then refreshed again when the file arrived.',
  },
  {
    d: 106, mon: true, at: '09:30', sys: 1, cat: 'data_quality', sev: 'sev4', status: 'reviewed', ttd: 200, ttr: 500,
    title: 'Customer 360 notebook produced blank postcodes',
    rootCause: 'An address clean-up rule removed postcodes with a leading zero.',
    fix: 'Fixed the rule to treat postcodes as text and re-ran the notebook.',
    prevention: 'Row-count and blank-rate checks after the clean-up step.',
  },
  {
    d: 110, at: '17:00', sys: 4, cat: 'other', sev: 'sev4', status: 'resolved', ttd: 60, ttr: 180,
    title: 'Inventory sync alert emails went to an old list',
    rootCause: 'The alert list was never updated after a team change.',
    fix: 'Pointed alerts at the team channel.',
  },
  {
    d: 113, mon: true, at: '08:00', sys: 0, cat: 'schema_change', sev: 'sev2', status: 'reviewed', ttd: 20, ttr: 260,
    title: 'Orders ingest failed on a new nullable column',
    rootCause: 'A new nullable column arrived in the middle of the file layout and shifted the positional mapping.',
    fix: 'Updated the mapping and reloaded.',
    prevention: 'Add the orders source to the schema watch list.',
  },
];

interface SeedAction {
  /** 1-based row in SEED_INCIDENTS. */
  row: number;
  title: string;
  /** Index into the action owners list below. */
  owner: number;
  /** Due in this many days from today (negative = past), or null for no due date. */
  due: number | null;
  done: boolean;
}

/** Owners: the three personas, plus one more teammate who has not opened the app yet. */
const EXTRA_OWNER = 'Jordan Kim';

export const SEED_ACTIONS: SeedAction[] = [
  { row: 3, title: 'Add a schema contract check before the orders copy activity', owner: 1, due: 5, done: false },
  { row: 5, title: 'Alert on column-count drift in the orders source', owner: 2, due: -4, done: false },
  { row: 8, title: 'Add a unit test for the null-key branch in the dedupe cell', owner: 2, due: -10, done: true },
  { row: 10, title: 'Ask the source team to announce renames in their change channel', owner: 0, due: -12, done: false },
  { row: 11, title: 'Move the finance refresh after the ledger export window', owner: 1, due: 10, done: false },
  { row: 16, title: 'Document the service principal that owns the finance workspace', owner: 0, due: -30, done: true },
  { row: 19, title: 'Map source columns by name instead of position', owner: 1, due: -20, done: true },
  { row: 19, title: 'Add a staging table so a bad load never reaches the report', owner: 1, due: -2, done: false },
  { row: 22, title: 'Pin library versions in the attribution environment', owner: 3, due: 14, done: false },
  { row: 25, title: 'Add a freshness check on the orders extract', owner: 2, due: -60, done: true },
  { row: 28, title: 'Add a row-count reconciliation after the address clean-up', owner: 3, due: null, done: false },
  { row: 30, title: 'Add the orders source to the schema watch list', owner: 0, due: -80, done: true },
];

/** Start time of a seed row: `d` days back at the local time given; Monday rows move back to that week's Monday. */
export function seedStart(now: Date, row: Pick<SeedIncident, 'd' | 'mon' | 'at'>): Date {
  const [h, m] = row.at.split(':').map(Number);
  const t = new Date(now.getTime() - row.d * DAY);
  if (row.mon) t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  t.setHours(h, m, 0, 0);
  // Never in the future (or within the last hour).
  while (t.getTime() > now.getTime() - HOUR) t.setDate(t.getDate() - (row.mon ? 7 : 1));
  return t;
}

/** Local midnight `days` from today. */
function dueDay(now: Date, days: number): string {
  const t = new Date(now.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + days);
  return t.toISOString();
}

/** Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row). */
export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const people = ctx.people;
  const owners = [...people.map((p) => p.displayName), EXTRA_OWNER];
  const incidents = store.repo('Incident');
  const ids: string[] = [];
  for (const [n, r] of SEED_INCIDENTS.entries()) {
    const start = seedStart(ctx.now, r);
    const at = (mins: number | null) => (mins === null ? null : new Date(start.getTime() + mins * MINUTE).toISOString());
    const reporter = people[n % people.length];
    const created = new Date(Math.min(ctx.now.getTime(), start.getTime() + (r.ttd ?? 30) * MINUTE + 15 * MINUTE));
    const row = await incidents.create({
      title: r.title,
      system: SEED_SYSTEMS[r.sys],
      severity: r.sev,
      category: r.cat,
      startedAt: start.toISOString(),
      detectedAt: at(r.ttd),
      resolvedAt: at(r.ttr),
      summary: r.summary ?? null,
      rootCause: r.rootCause ?? null,
      fix: r.fix ?? null,
      prevention: r.prevention ?? null,
      status: r.status,
      reporterSub: reporter.sub,
      reporterName: reporter.displayName,
      createdAt: created.toISOString(),
    });
    ids.push(row.id);
  }
  const actions = store.repo('ActionItem');
  for (const [n, a] of SEED_ACTIONS.entries()) {
    const creator = people[n % people.length];
    const incidentStart = seedStart(ctx.now, SEED_INCIDENTS[a.row - 1]);
    await actions.create({
      incidentId: ids[a.row - 1],
      title: a.title,
      ownerName: owners[a.owner],
      dueDate: a.due === null ? null : dueDay(ctx.now, a.due),
      done: a.done,
      createdBySub: creator.sub,
      createdAt: new Date(Math.min(ctx.now.getTime(), incidentStart.getTime() + DAY)).toISOString(),
    });
  }
}

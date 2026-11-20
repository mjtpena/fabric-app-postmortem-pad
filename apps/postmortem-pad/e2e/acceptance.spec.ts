import { expect, test } from '@playwright/test';

import { openApp, watchConsole } from '@x10/shared/e2e';

/** Label text, allowing the required-field asterisk. */
const field = (name: string) => new RegExp(`^${name}\\s*\\*?$`);

test('AC1: the quick form saves with five fields in under 30 seconds', async ({ page }) => {
  await openApp(page, '/new');
  const started = Date.now();
  await page.getByLabel(field('Title')).pressSequentially('Clickstream load timed out', { delay: 20 });
  await page.getByLabel(field('System')).pressSequentially('Clickstream lakehouse load', { delay: 20 });
  await page.getByLabel(field('Severity')).selectOption('sev2');
  await page.getByLabel(field('Category')).selectOption('capacity');
  // Start time defaults to now (the fifth field).
  await expect(page.getByLabel(field('Start time'))).not.toHaveValue('');
  await page.getByRole('button', { name: 'Save incident' }).click();
  await expect(page.getByRole('heading', { name: 'Clickstream load timed out' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000);
});

test('AC1: missing quick fields show inline messages', async ({ page }) => {
  await openApp(page, '/new');
  await page.getByRole('button', { name: 'Save incident' }).click();
  await expect(page.getByText('Title is required.')).toBeVisible();
  await expect(page.getByText('Choose a severity.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Log an incident' })).toBeVisible();
});

test('AC2: resolving without a root cause is blocked with an inline message', async ({ page }) => {
  await openApp(page, '/?view=list');
  await page.getByRole('link', { name: 'Duplicate session rows in the clickstream load' }).click();
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark resolved' });
  // The root cause starts as the untouched category checklist, which does not count.
  await dialog.getByLabel(field('Fix')).fill('Removed the duplicates and reloaded the day.');
  await dialog.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(dialog.getByText(/Add a root cause to resolve this incident/)).toBeVisible();
  await dialog.getByLabel(field('Root cause')).fill('');
  await dialog.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(dialog.getByText(/Add a root cause to resolve this incident/)).toBeVisible();
  // Writing a root cause lets it through.
  await dialog.getByLabel(field('Root cause')).fill('A retry re-sent the same file and the load appended it.');
  await dialog.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('incident-status')).toHaveText(/Resolved/);
});

test('AC3: the blameless hint appears for "forgot to" and does not block saving', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/new');
  await page.getByLabel(field('Title')).fill('Finance refresh used last month rates');
  await page.getByLabel(field('System')).fill('Finance daily refresh');
  await page.getByLabel(field('Severity')).selectOption('sev3');
  await page.getByLabel(field('Category')).selectOption('config');
  await page.getByRole('button', { name: /Add details now/ }).click();
  // The category pre-filled its checklist into root cause.
  await expect(page.getByLabel(field('Root cause'))).toHaveValue(/Which setting was wrong/);
  await page.getByLabel(field('Summary')).fill('The engineer forgot to switch the rate parameter.');
  const hint = page.getByTestId('blameless-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('forgot to');
  await expect(page.getByRole('status').filter({ hasText: 'Blameless tip' })).toBeVisible();
  await page.getByRole('button', { name: 'Save incident' }).click();
  await expect(page.getByRole('heading', { name: 'Finance refresh used last month rates' })).toBeVisible();
  await expect(page.getByText('The engineer forgot to switch the rate parameter.')).toBeVisible();
  consoleWatch.assertClean();
});

test('AC4: Trends category counts match the hand count of the seed', async ({ page }) => {
  await openApp(page, '/trends');
  await expect(page.getByTestId('trends-range')).toContainText('24 incidents');
  await page.getByText('Category counts as a table').click();
  // Hand count from src/seed.ts, rows 1–24 (last 90 days).
  await expect(page.getByTestId('category-count-schema_change')).toHaveText('6');
  await expect(page.getByTestId('category-count-upstream_late')).toHaveText('3');
  await expect(page.getByTestId('category-count-data_quality')).toHaveText('3');
  await page.getByRole('button', { name: 'Last 120 days' }).click();
  await expect(page.getByTestId('trends-range')).toContainText('30 incidents');
  await expect(page.getByTestId('category-count-schema_change')).toHaveText('7');
});

test('Trends: a short range shows empty charts', async ({ page }) => {
  await openApp(page, '/trends');
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  await page.getByLabel(field('From')).fill(d);
  await page.getByLabel(field('To')).fill(d);
  await expect(page.getByText('No incidents in this range', { exact: true })).toBeVisible();
  await expect(page.getByText('No data for this range.').first()).toBeVisible();
});

test('only a lead sees "Mark reviewed"; engineers see the rule instead', async ({ page }) => {
  await openApp(page, '/?view=list', 'demo-sam');
  await page.getByRole('link', { name: 'Orders ingest dropped the discount column' }).click();
  await expect(page.getByTestId('review-note')).toContainText('A lead marks this reviewed');
  await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);

  await openApp(page, '/?view=list', 'demo-lead');
  await page.getByRole('link', { name: 'Orders ingest dropped the discount column' }).click();
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await page.getByRole('dialog', { name: 'Mark reviewed' }).getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByTestId('incident-status')).toHaveText(/Reviewed/);
});

test('a reviewed incident is locked for engineers but editable by the lead', async ({ page }) => {
  await openApp(page, '/?view=list', 'demo-priya');
  await page.getByRole('link', { name: 'Orders ingest failed on a widened order id' }).click();
  await expect(page.getByTestId('reviewed-note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reopen' })).toHaveCount(0);

  await openApp(page, '/?view=list', 'demo-lead');
  await page.getByRole('link', { name: 'Orders ingest failed on a widened order id' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible();
});

test('Actions lists open items by owner with overdue first, and ticking one removes it', async ({ page }) => {
  await openApp(page, '/actions');
  const groups = page.getByTestId('owner-group');
  await expect(groups.first()).toContainText('overdue');
  await expect(page.getByText('7 open items')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Alert on column-count drift in the orders source' }).click();
  await expect(page.getByText('6 open items')).toBeVisible();
});

test('Log filters narrow the table', async ({ page }) => {
  await openApp(page, '/?view=list');
  await page.getByLabel(field('Category')).selectOption('schema_change');
  await page.getByLabel(field('System')).selectOption('Sales orders ingest');
  await expect(page.getByText('Showing 6 of 30 incidents')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByText('Showing 30 of 30 incidents')).toBeVisible();
});

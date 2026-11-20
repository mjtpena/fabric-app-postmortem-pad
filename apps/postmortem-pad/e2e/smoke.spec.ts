import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

/** Label text, allowing the required-field asterisk. */
const field = (name: string) => new RegExp(`^${name}\\s*\\*?$`);

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByTestId('seismograph')).toBeVisible();
  await assertNoHorizontalScroll(page);
  await page.getByRole('radio', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incident log' })).toBeVisible();
  await expect(page.getByTestId('incident-table')).toBeVisible();
  await assertNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Log incident' }).click();
  await expect(page.getByRole('heading', { name: 'Log an incident' })).toBeVisible();
  await page.getByLabel(field('Title')).fill('Smoke test: nightly load failed');
  await page.getByLabel(field('System')).fill('Smoke test system');
  await page.getByLabel(field('Severity')).selectOption('sev3');
  await page.getByLabel(field('Category')).selectOption('config');
  await page.getByRole('button', { name: 'Save incident' }).click();

  await expect(page.getByRole('heading', { name: 'Smoke test: nightly load failed' })).toBeVisible();
  // Back to the seismograph, focused on the new tremor at the stylus.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Seismograph' }).click();
  await expect(page.getByTestId('focus-card')).toContainText('Smoke test: nightly load failed');
  await page.getByRole('radio', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Smoke test: nightly load failed' })).toBeVisible();
  await assertNoHorizontalScroll(page);

  for (const path of ['/trends', '/actions', '/about']) {
    await openApp(page, path);
    await expect(page.locator('main h1')).toBeVisible();
    await assertNoHorizontalScroll(page);
  }
  consoleWatch.assertClean();
});

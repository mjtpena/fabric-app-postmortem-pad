import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** The Today list: the side panel on desktop, a bottom sheet behind a button on phones. */
async function today(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: /^Today/ }).click();
    return page.getByRole('dialog', { name: 'Today' });
  }
  return page.getByRole('complementary', { name: 'Today' });
}

const tremors = (page: Page) => page.locator('[data-incident]');

test('the seismograph draws one trace per system and a tremor per incident in the last 90 days', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await expect(page.getByTestId('seismograph')).toBeVisible();
  await expect(tremors(page)).toHaveCount(24);
  await expect(page.locator('[data-track]')).toHaveCount(6);
  await expect(page.locator('[data-track="Sales orders ingest"] [data-incident]')).toHaveCount(6);
  // Accessible names carry the data, not just the picture.
  await expect(page.getByRole('button', { name: /^SEV1 Orders ingest dropped the discount column/ })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('lenses re-colour the same tremors, by click and by number key', async ({ page }) => {
  await openApp(page, '/');
  const path = page.locator('[data-incident] path.pm-trace').first();
  await expect(path).toHaveAttribute('stroke', /--sev[1-4]/);
  await page.getByRole('radio', { name: /^Category/ }).click();
  await expect(page.getByRole('radio', { name: /^Category/ })).toHaveAttribute('aria-checked', 'true');
  await expect(path).not.toHaveAttribute('stroke', /--sev/);
  await page.keyboard.press('4');
  await expect(page.getByRole('radio', { name: /^Time to resolve/ })).toHaveAttribute('aria-checked', 'true');
  await expect(tremors(page)).toHaveCount(24);
});

test('a Today item focuses its incident on the drum and switches to its lens', async ({ page }) => {
  await openApp(page, '/');
  await (await today(page)).getByRole('button', { name: /ran out of memory/ }).click();
  const card = page.getByTestId('focus-card');
  await expect(card).toContainText('Customer 360 notebook ran out of memory on the merge step');
  await expect(page.getByRole('radio', { name: /^Severity/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/focus=/);
  await card.getByRole('link', { name: 'Open black box' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
});

test('a Today system item focuses a whole trace', async ({ page }) => {
  await openApp(page, '/');
  await (await today(page)).getByRole('button', { name: /keeps shaking/ }).click();
  await expect(page.getByTestId('system-card')).toContainText('Sales orders ingest');
  await expect(page.getByRole('radio', { name: /^Category/ })).toHaveAttribute('aria-checked', 'true');
});

test('keyboard: ] steps through tremors, Escape clears, ? opens the cheat sheet', async ({ page }) => {
  await openApp(page, '/');
  await expect(tremors(page)).toHaveCount(24);
  await page.keyboard.press(']');
  await expect(page.getByTestId('focus-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('focus-card')).toHaveCount(0);
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('view as engineer ranks your own aftershocks', async ({ page }) => {
  await openApp(page, '/', 'demo-priya');
  await expect((await today(page)).getByText('3 aftershocks on you')).toBeVisible();
});

test('the list view shows the same incidents as the drum', async ({ page }) => {
  await openApp(page, '/');
  await expect(tremors(page)).toHaveCount(24);
  const ids = await tremors(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-incident')));
  await page.getByRole('radio', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incident log' })).toBeVisible();
  for (const id of ids) await expect(page.locator(`a[href="#/incidents/${id}"]:visible`)).toHaveCount(1);
  await page.keyboard.press('l');
  await expect(page.getByTestId('seismograph')).toBeVisible();
});

test('without WebGL and with reduced motion the drum still draws (it is SVG), without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nowebgl#/');
  await expect(page.getByTestId('seismograph')).toBeVisible();
  await expect(tremors(page)).toHaveCount(24);
  await expect(page.locator('svg.pm-reveal')).toHaveCount(0);
});

test('the incident log prints as a clean document', async ({ page }) => {
  await openApp(page, '/?view=list');
  await expect(page.getByTestId('incident-table')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log incident' })).toBeHidden();
  await expect(page.getByLabel(/^Category/)).toBeHidden();
  // Every row prints in the table, on any page width, with nothing clipped by the immersive shell.
  await expect(page.locator('[data-testid="incident-table"] table tbody tr')).toHaveCount(30);
  await expect(page.locator('[data-testid="incident-table"] table')).toBeVisible();
});

test('About: the anatomy diagram fits the page without sideways scrolling', async ({ page }) => {
  await openApp(page, '/about');
  const fig = page.getByTestId('anatomy');
  await expect(fig).toBeVisible();
  const overflow = await fig.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await assertNoHorizontalScroll(page);
});

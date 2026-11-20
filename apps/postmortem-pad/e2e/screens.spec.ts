/**
 * Screenshot set for the redesign review (docs/redesign/). Skipped in the normal run; record with
 *   SHOTS=1 npx playwright test e2e/screens.spec.ts --project=desktop
 * (the spec sets its own viewports and colour schemes, so one project is enough).
 */
import { expect, test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

const OUT = 'docs/redesign';
const SIZES = [
  { tag: 'desktop', width: 1280, height: 800 },
  { tag: 'mobile', width: 390, height: 844 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.skip(!process.env.SHOTS, 'Set SHOTS=1 to record the redesign screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function settle(page: Page, ms = 1400) {
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`${size.tag} ${theme}`, async ({ page }) => {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(`${size.tag}-${theme}`)) test.skip();
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: theme });
      const tag = `${size.tag}-${theme}`;

      await openApp(page, '/');
      await expect(page.getByTestId('seismograph')).toBeVisible();
      await settle(page);
      await shot(page, `01-seismograph-severity-${tag}`);

      await page.getByRole('radio', { name: /Category/ }).click();
      await settle(page, 500);
      await shot(page, `02-seismograph-category-${tag}`);

      await page.getByRole('radio', { name: /Time to resolve/ }).click();
      await settle(page, 500);
      await shot(page, `03-seismograph-ttr-${tag}`);

      // Today: focus the first item (opens the sheet on phones).
      if (size.tag === 'mobile') await page.getByRole('button', { name: /^Today/ }).click();
      const today = size.tag === 'mobile' ? page.getByRole('dialog') : page.getByRole('complementary', { name: 'Today' });
      await today.getByRole('button', { name: /ran out of memory/ }).click();
      await settle(page, 700);
      await shot(page, `04-seismograph-today-focus-${tag}`);

      await openApp(page, '/?system=sales%20orders%20ingest');
      await settle(page);
      await shot(page, `05-seismograph-system-focus-${tag}`);

      await openApp(page, '/?view=list');
      await expect(page.getByTestId('incident-table')).toBeVisible();
      await settle(page, 400);
      await shot(page, `06-incident-log-${tag}`);
      if (theme === 'light') {
        await page.emulateMedia({ media: 'print', colorScheme: 'light' });
        await page.screenshot({ path: `${OUT}/06b-incident-log-print-${size.tag}.png`, fullPage: true });
        await page.emulateMedia({ media: 'screen', colorScheme: theme });
      }

      await page.getByRole('link', { name: 'Orders ingest failed after a source column was renamed' }).click();
      await expect(page.getByTestId('timeline')).toBeVisible();
      await settle(page, 900);
      await shot(page, `07-black-box-open-${tag}`);
      await page.screenshot({ path: `${OUT}/07b-black-box-open-full-${tag}.png`, fullPage: true });

      await openApp(page, '/?view=list');
      await page.getByRole('link', { name: 'Orders ingest dropped the discount column' }).click();
      await expect(page.getByTestId('timeline')).toBeVisible();
      await settle(page, 900);
      await shot(page, `08-black-box-resolved-${tag}`);

      await openApp(page, '/trends');
      await expect(page.getByTestId('heatmap')).toBeVisible();
      await settle(page, 900);
      await shot(page, `09-fault-lines-${tag}`);
      await page.screenshot({ path: `${OUT}/09b-fault-lines-full-${tag}.png`, fullPage: true });

      await openApp(page, '/actions');
      await expect(page.getByTestId('owner-group').first()).toBeVisible();
      await settle(page, 500);
      await shot(page, `10-aftershocks-${tag}`);

      await openApp(page, '/new');
      await settle(page, 500);
      await shot(page, `11-log-incident-${tag}`);

      await openApp(page, '/about');
      await settle(page, 400);
      await shot(page, `12-about-${tag}`);

      await openApp(page, '/?nowebgl');
      await settle(page);
      await shot(page, `13-seismograph-nowebgl-${tag}`);
    });
  }
}

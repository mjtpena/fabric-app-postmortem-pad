/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/** First persona = the lead (admin) and the default viewer. The two engineers show the non-lead rules. */
export const personas: Persona[] = [
  { sub: 'demo-lead', name: 'Morgan Lee', email: 'morgan@example.com', isAdmin: true, role: 'Lead' },
  { sub: 'demo-priya', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'Engineer' },
  { sub: 'demo-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Engineer' },
];

export const config: AppConfig<Schema> = {
  appId: 'postmortem-pad',
  title: 'Pipeline Postmortem Pad',
  tagline: 'Log it in two minutes, learn from it for years.',
  defs,
  personas,
  seed,
  accent: 'amber',
  // A seismogram burst: a flat trace, one sharp tremor, then quiet again.
  logoPaths: ['M2 12h5l1.5-4 2.5 10 2.5-14 2.5 11 1.5-3h4.5'],
  // Phone tab-bar icons are added in main.tsx so this file stays JSX-free.
  nav: [
    { to: '/', label: 'Seismograph', end: true },
    { to: '/trends', label: 'Fault lines' },
    { to: '/actions', label: 'Aftershocks' },
    { to: '/about', label: 'About' },
  ],
};

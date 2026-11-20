import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Plane, Waves } from 'lucide-react';

import { PageHeader } from '@x10/shared/ui';

import {
  AGING_DAYS,
  blamelessWords,
  categoryLabels,
  checklistTemplates,
  FUTURE_TOLERANCE_MINUTES,
  severityHelp,
  TOP_SYSTEMS,
  TRENDS_DEFAULT_DAYS,
} from '../config';
import { SeverityChip } from '../components/chips';
import { CAT_VAR } from '../components/palette';
import { hash, tailPoints, toPath, tremorPoints } from '../domain/seismo';
import { CATEGORIES, SEVERITIES } from '../model';

export function AboutPage() {
  return (
    <div className="max-w-[960px]">
      <PageHeader
        title={<span className="x-serif text-[44px] font-normal leading-tight">About Postmortem Pad</span>}
        subtitle="Log it in two minutes, learn from it for years."
      />

      <Block title="How to read the seismograph">
        <p className="m-0 mb-5 max-w-[68ch] text-base leading-7 text-fg">
          Every pipeline or notebook failure is a tremor on its system's trace, across the last 90 days. The drum makes
          repeat offenders, slow recoveries and open work visible at a glance; the{' '}
          <Link to="/?view=list" className="text-brand-text">
            incident log
          </Link>{' '}
          holds the same data as a table.
        </p>
        <Anatomy />
      </Block>

      <Block title="The tools">
        <ul className="m-0 grid list-none gap-6 p-0 sm:grid-cols-3">
          <Tool icon={<Waves />} name="Fault lines" to="/trends">
            Which causes keep coming back, how recovery time moves, the systems that shake most, and when failures start.
          </Tool>
          <Tool icon={<Plane />} name="Black box" to="/?view=list">
            One incident as a flight recorder: started, detected, resolved, the time between, and its transcript.
          </Tool>
          <Tool icon={<ListChecks />} name="Aftershocks" to="/actions">
            Open action items by owner, overdue first, until every follow-up is done.
          </Tool>
        </ul>
      </Block>

      <Block title="Severity">
        <ul className="m-0 list-none space-y-2.5 p-0">
          {SEVERITIES.map((s) => (
            <li key={s} className="flex items-start gap-3">
              <SeverityChip severity={s} label className="mt-px" />
              <span className="text-sm text-fg">{severityHelp[s].split(': ')[1]}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Rules">
        <ol className="m-0 list-decimal space-y-2 pl-5 text-sm leading-6 text-fg marker:font-mono marker:text-faint">
          <li>Only title (5–120 characters), system, severity, category and start time are required to save.</li>
          <li>
            Detected and resolved times cannot be earlier than the start time. A start time more than {FUTURE_TOLERANCE_MINUTES} minutes in the
            future is rejected.
          </li>
          <li>Resolved needs a resolved time, a root cause and a fix. An untouched checklist does not count as a root cause.</li>
          <li>Only a lead can mark an incident reviewed, once it is resolved and has an action item. After that only a lead can edit or reopen it.</li>
          <li>An open incident older than {AGING_DAYS} days is aging. An action item is overdue once its due day has passed.</li>
          <li>Durations use exact elapsed time (UTC), so daylight-saving changes never skew them.</li>
          <li>
            Fault lines open on the last {TRENDS_DEFAULT_DAYS} days and rank the top {TOP_SYSTEMS} systems. Months are UTC months; the heat map
            uses your local time.
          </li>
        </ol>
      </Block>

      <Block title="Blameless wording">
        <p className="m-0 mb-3 max-w-[68ch] text-sm leading-6 text-fg">
          While you write, these words show a polite prompt with a system-focused rewording, beside the exact words it flags. It never
          blocks saving.
        </p>
        <p className="m-0 flex flex-wrap gap-1.5">
          {blamelessWords.map((w) => (
            <span key={w.term} className="pm-flag text-ui">
              {w.term}
            </span>
          ))}
        </p>
      </Block>

      <Block title="Root-cause checklists">
        <dl className="m-0 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <div key={c}>
              <dt className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: CAT_VAR[c] }} />
                {categoryLabels[c]}
              </dt>
              <dd className="m-0 mt-1 whitespace-pre-line text-ui leading-5 text-muted">{checklistTemplates[c]}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title="Privacy and audience">
        <p className="m-0 max-w-[68ch] text-sm leading-6 text-fg">
          Sign-in uses Fabric (Microsoft Entra ID). Everyone who can open the app can read every incident, so write for the whole team and
          keep personal details out. The app stores your display name and email to show who reported an incident.
        </p>
        <p className="m-0 mt-3 text-xs text-faint">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Tool({ icon, name, to, children }: { icon: ReactNode; name: string; to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="group block text-fg no-underline">
        <span className="grid size-9 place-items-center rounded-lg bg-accent-3 text-accent-11 [&_svg]:size-4">{icon}</span>
        <span className="mt-3 block text-sm font-semibold group-hover:underline">{name}</span>
        <span className="mt-1 block text-ui leading-5 text-muted">{children}</span>
      </Link>
    </li>
  );
}

/** One annotated trace that explains every mark on the drum. */
function Anatomy() {
  const y = 70;
  const sev1 = toPath(tremorPoints(60, y, 46, 40, hash('anatomy-a')));
  const sev3 = toPath(tremorPoints(250, y, 22, 26, hash('anatomy-b')));
  const open = toPath(tremorPoints(430, y, 33, 22, hash('anatomy-c')));
  const tail = toPath(tailPoints(452, 600, y, 11, hash('anatomy-c'), 0.4));
  const label = (x: number, ly: number, text: string, anchor: 'start' | 'middle' | 'end' = 'start') => (
    <text x={x} y={ly} textAnchor={anchor} className="font-mono max-sm:hidden" fontSize={11} fill="var(--muted)">
      {text}
    </text>
  );
  return (
    <figure className="m-0 rounded-xl bg-[var(--paper)] p-3 ring-1 ring-inset ring-line sm:p-4" data-testid="anatomy">
      <svg viewBox="0 0 660 150" className="h-auto w-full" role="img" aria-label="Anatomy of a trace: height is severity, ring length is time to resolve, a trembling tail means still open, small spikes are open action items, a diamond means ready for sign-off.">
        <line x1={10} x2={610} y1={y} y2={y} stroke="var(--paper-ink-muted)" strokeOpacity={0.5} />
        <path d={sev1} fill="none" stroke="var(--sev1)" strokeWidth={1.6} />
        <path d={sev3} fill="none" stroke="var(--sev3)" strokeWidth={1.6} />
        {[0, 1].map((k) => (
          <path key={k} d={`M${282 + k * 7} ${y}L${283.5 + k * 7} ${y - 9}L${285 + k * 7} ${y + 4}L${286.5 + k * 7} ${y}`} fill="none" stroke={k ? 'var(--paper-ink-muted)' : 'var(--bad-solid)'} strokeWidth={1.4} />
        ))}
        <rect x={432} y={y - 47} width={7} height={7} transform={`rotate(45 435.5 ${y - 43.5})`} fill="var(--paper)" stroke="var(--accent-10)" strokeWidth={1.6} />
        <path d={open} fill="none" stroke="var(--sev2)" strokeWidth={1.6} />
        <path d={tail} fill="none" stroke="var(--sev2)" strokeWidth={1.2} />
        <line x1={600} x2={600} y1={20} y2={120} stroke="var(--accent-9)" strokeDasharray="2 3" />
        <circle cx={600} cy={y} r={3} fill="var(--accent-9)" />
        <line x1={600} x2={630} y1={y} y2={y - 20} stroke="var(--paper-ink-muted)" />
        <circle cx={630} cy={y - 20} r={3} fill="var(--paper)" stroke="var(--paper-ink-muted)" />
        {label(60, 16, 'height · severity')}
        {label(60, 140, 'ring length · time to resolve')}
        {label(240, 16, 'spikes · open action items')}
        {label(270, 140, 'red spike = overdue')}
        {label(445, 16, '◇ ready for sign-off')}
        {label(455, 140, 'tail · still open')}
        {label(612, 16, 'now', 'middle')}
        {/* Phones: numbered markers instead of labels (the labels would be too small to read); the key is below. */}
        {MARKS.map((m) => (
          <g key={m.n} className="sm:hidden">
            <circle cx={m.x} cy={m.y} r={13} fill="var(--accent-9)" />
            <text x={m.x} y={m.y + 5.5} textAnchor="middle" className="font-mono" fontSize={16} fontWeight={700} fill="var(--accent-contrast)">
              {m.n}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">Anatomy of a trace</figcaption>
      <ol className="m-0 mt-3 grid list-none gap-1.5 border-t border-line p-0 pt-3 sm:hidden">
        {MARKS.map((m) => (
          <li key={m.n} className="flex items-center gap-2.5 text-ui text-fg">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-9 font-mono text-[11px] font-bold text-accent-contrast">{m.n}</span>
            {m.text}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Numbered markers for the phone layout of the anatomy diagram. */
const MARKS = [
  { n: 1, x: 30, y: 30, text: 'Height · severity' },
  { n: 2, x: 120, y: 112, text: 'Ring length · time to resolve' },
  { n: 3, x: 300, y: 42, text: 'Spikes · open action items (red = overdue)' },
  { n: 4, x: 410, y: 22, text: 'Diamond · ready for sign-off' },
  { n: 5, x: 530, y: 108, text: 'Tail · still open' },
  { n: 6, x: 632, y: 112, text: 'Now · the stylus' },
];

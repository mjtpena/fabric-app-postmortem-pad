/**
 * The incident's narrative as a transcript: each part in reading width, the exact words the blameless prompt flags
 * highlighted in place, and the prompt itself in the margin beside them (under the paragraph on phones).
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cx } from '@x10/shared/ui';

import { findBlameSpans, findBlameWords } from '../domain/rules';
import type { Incident } from '../model';

const PARTS: [keyof Pick<Incident, 'summary' | 'rootCause' | 'fix' | 'prevention'>, string][] = [
  ['summary', 'Summary'],
  ['rootCause', 'Root cause'],
  ['fix', 'Fix'],
  ['prevention', 'Prevention'],
];

/** The text with every flagged span wrapped in a <mark>. */
export function Highlighted({ text }: { text: string }) {
  const spans = findBlameSpans(text);
  if (!spans.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  spans.forEach((s, k) => {
    if (s.start > at) out.push(<Fragment key={`t${k}`}>{text.slice(at, s.start)}</Fragment>);
    out.push(
      <mark key={`m${k}`} className="pm-flag" title={s.hit.suggestion}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}

/** The margin note for a paragraph: which words point at a person, and a system-focused way to say it. */
export function BlamelessNote({ text, className }: { text: string; className?: string }) {
  const hits = findBlameWords(text);
  if (!hits.length) return null;
  return (
    <div role="note" aria-label="Blameless prompt" className={cx('border-l-2 border-accent-9 pl-3', className)} data-testid="blameless-note">
      <div className="x-legend-label text-brand-text">Blameless prompt</div>
      <ul className="m-0 mt-1.5 list-none space-y-2 p-0">
        {hits.map((h) => (
          <li key={h.term} className="text-ui leading-5 text-muted">
            <span className="pm-flag font-medium text-fg">{h.term}</span> points at a person. {h.suggestion}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Transcript({ incident, canEdit }: { incident: Incident; canEdit: boolean }) {
  return (
    <section aria-labelledby="transcript-h">
      <h2 id="transcript-h" className="m-0 mb-1 text-lg font-semibold">
        Transcript
      </h2>
      <div className="divide-y divide-[var(--line)]">
        {PARTS.map(([key, label]) => {
          const text = incident[key];
          return (
            <div key={key} className="grid gap-x-8 gap-y-2 py-5 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,250px)]">
              <h3 className="x-legend-label m-0 pt-1 text-muted">{label}</h3>
              <div className="min-w-0">
                {text ? (
                  <p className="m-0 max-w-[68ch] whitespace-pre-wrap break-words text-base leading-7 text-fg">
                    <Highlighted text={text} />
                  </p>
                ) : (
                  <p className="m-0 text-sm text-faint">
                    Not written yet.
                    {canEdit && (
                      <>
                        {' '}
                        <Link to={`/incidents/${incident.id}/edit`} className="text-brand-text">
                          Add it
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
              {text ? <BlamelessNote text={text} /> : <span className="hidden lg:block" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

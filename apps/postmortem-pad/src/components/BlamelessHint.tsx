import { findBlameWords } from '../domain/rules';

/**
 * Gentle, non-blocking nudge toward blameless wording, shown right under the field while typing. Always rendered as
 * a polite live region so screen readers hear it when it appears; it is a note, never an error, and never stops saving.
 */
export function BlamelessHint({ text, id }: { text: string; id?: string }) {
  const hits = findBlameWords(text);
  return (
    <div role="status" aria-live="polite" id={id}>
      {hits.length > 0 && (
        <div className="mt-2 animate-x-in border-l-2 border-accent-9 py-0.5 pl-3 text-ui leading-5 text-muted" data-testid="blameless-hint">
          <span className="x-legend-label mr-1.5 text-brand-text">Blameless tip</span>
          {hits.map((h, k) => (
            <span key={h.term}>
              {k > 0 && ', '}
              <span className="pm-flag font-medium text-fg">{h.term}</span>
            </span>
          ))}{' '}
          {hits.length === 1 ? 'points' : 'point'} at a person. {hits[0].suggestion} <span className="text-faint">You can still save.</span>
        </div>
      )}
    </div>
  );
}

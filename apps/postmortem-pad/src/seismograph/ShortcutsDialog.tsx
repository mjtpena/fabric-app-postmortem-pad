import { Dialog, Kbd } from '@x10/shared/ui';

const KEYS: [string[], string][] = [
  [['1', '–', '5'], 'Switch lens: severity, category, system, time to resolve, open or resolved'],
  [['V'], 'View as lead or engineer'],
  [['L'], 'Seismograph or incident log'],
  [['['], 'Previous tremor'],
  [[']'], 'Next tremor'],
  [['Enter'], 'Focus the tremor or trace under the keyboard'],
  [['Esc'], 'Clear the focus'],
  [['N'], 'Log a new incident'],
  [['?'], 'This cheat sheet'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 divide-y divide-[var(--line)]">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-fg">{what}</dt>
            <dd className="m-0 flex shrink-0 items-center gap-1">
              {keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

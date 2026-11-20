/**
 * Colour encodings shared by the seismograph, the Black box, Fault lines and Aftershocks, so a colour means the same
 * thing on every screen. CSS variable strings only (both themes come from the tokens).
 */
import type { Category, Severity, Status } from '../model';
import type { TtrBucket } from '../domain/seismo';

export const SEV_VAR: Record<Severity, string> = {
  sev1: 'var(--sev1)',
  sev2: 'var(--sev2)',
  sev3: 'var(--sev3)',
  sev4: 'var(--sev4)',
};

export const SEV_NAME: Record<Severity, string> = {
  sev1: 'Critical',
  sev2: 'Major',
  sev3: 'Minor',
  sev4: 'Low',
};

export const CAT_VAR: Record<Category, string> = {
  schema_change: 'var(--indigo-9)',
  upstream_late: 'var(--teal-9)',
  capacity: 'var(--plum-9)',
  code_bug: 'var(--coral-9)',
  config: 'var(--blue-9)',
  permissions: 'var(--violet-9)',
  data_quality: 'var(--gold-9)',
  other: 'var(--gray-9)',
};

/** One colour per trace, in track order. */
export const SYS_VARS = [
  'var(--indigo-9)',
  'var(--teal-9)',
  'var(--plum-9)',
  'var(--coral-9)',
  'var(--blue-9)',
  'var(--gold-9)',
  'var(--violet-9)',
  'var(--gray-9)',
];

export const TTR_VAR: Record<TtrBucket, string> = {
  fast: 'var(--green-9)',
  medium: 'var(--gold-9)',
  slow: 'var(--ember-9)',
  slowest: 'var(--red-9)',
  open: 'var(--world-ink)',
};

export const STATUS_VAR: Record<Status, string> = {
  open: 'var(--accent-9)',
  resolved: 'var(--blue-9)',
  reviewed: 'var(--green-9)',
};

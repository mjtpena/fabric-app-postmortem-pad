/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the @text decorators on the entities. */
export const limits = {
  incidentTitle: { min: 5, max: 120 },
  system: { min: 2, max: 100 },
  narrative: { max: 1000 },
  reporterName: { min: 1, max: 100 },
  actionTitle: { min: 3, max: 150 },
  ownerName: { min: 1, max: 100 },
} as const;

export const SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  'schema_change',
  'upstream_late',
  'capacity',
  'code_bug',
  'config',
  'permissions',
  'data_quality',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['open', 'resolved', 'reviewed'] as const;
export type Status = (typeof STATUSES)[number];

export interface Incident {
  id: string;
  title: string;
  system: string;
  severity: Severity;
  category: Category;
  startedAt: string;
  detectedAt: string | null;
  resolvedAt: string | null;
  summary: string | null;
  rootCause: string | null;
  fix: string | null;
  prevention: string | null;
  status: Status;
  reporterSub: string;
  reporterName: string;
  createdAt: string;
}

export interface ActionItem {
  id: string;
  incidentId: string;
  title: string;
  ownerName: string;
  dueDate: string | null;
  done: boolean;
  createdBySub: string;
  createdAt: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Incident: Incident;
  ActionItem: ActionItem;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Incident: {
    name: 'Incident',
    fields: {
      id: 'uuid',
      title: 'text',
      system: 'text',
      severity: 'set',
      category: 'set',
      startedAt: 'date',
      detectedAt: 'date',
      resolvedAt: 'date',
      summary: 'text',
      rootCause: 'text',
      fix: 'text',
      prevention: 'text',
      status: 'set',
      reporterSub: 'text',
      reporterName: 'text',
      createdAt: 'date',
    },
  },
  ActionItem: {
    name: 'ActionItem',
    fields: {
      id: 'uuid',
      incidentId: 'uuid',
      title: 'text',
      ownerName: 'text',
      dueDate: 'date',
      done: 'bool',
      createdBySub: 'text',
      createdAt: 'date',
    },
  },
};

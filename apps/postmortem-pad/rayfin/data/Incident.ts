import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A pipeline or notebook failure and its postmortem.
 * - Everyone signed in reads incidents (blameless, team-wide learning).
 * - Create: only as yourself (reporterSub must equal the caller's sub claim).
 * - Update: any signed-in engineer (it is a shared team record: whoever fixes it writes the root cause), but nobody can
 *   rewrite who reported it or when it was logged. Marking "reviewed" is lead-only and enforced in src/domain
 *   (there is no admin claim; see README "Known limits").
 * - Delete: not granted to anyone through the API. Postmortems are kept.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.reporterSub),
})
@role('authenticated', 'update', {
  exclude: ['reporterSub', 'reporterName', 'createdAt'],
})
export class Incident {
  @uuid() id!: string;
  @text({ min: 5, max: 120 }) title!: string;
  @text({ min: 2, max: 100 }) system!: string;
  @set('sev1', 'sev2', 'sev3', 'sev4') severity!: 'sev1' | 'sev2' | 'sev3' | 'sev4';
  @set('schema_change', 'upstream_late', 'capacity', 'code_bug', 'config', 'permissions', 'data_quality', 'other')
  category!: 'schema_change' | 'upstream_late' | 'capacity' | 'code_bug' | 'config' | 'permissions' | 'data_quality' | 'other';
  @date() startedAt!: Date;
  @date({ optional: true }) detectedAt?: Date;
  @date({ optional: true }) resolvedAt?: Date;
  @text({ max: 1000, optional: true }) summary?: string;
  @text({ max: 1000, optional: true }) rootCause?: string;
  @text({ max: 1000, optional: true }) fix?: string;
  @text({ max: 1000, optional: true }) prevention?: string;
  @set('open', 'resolved', 'reviewed') status!: 'open' | 'resolved' | 'reviewed';
  @text({ min: 1, max: 255 }) reporterSub!: string;
  @text({ min: 1, max: 100 }) reporterName!: string;
  @date() createdAt!: Date;
}

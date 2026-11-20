import { boolean, date, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * A follow-up from an incident. Plain id column to the incident (no @one/@many).
 * - Everyone signed in reads.
 * - Create: any signed-in user, stamped as themselves (createdBySub must equal the caller's sub claim).
 * - Update: any signed-in user (team follow-ups: whoever finishes it ticks it off), but the parent incident, creator and
 *   creation time cannot be changed, so an item cannot be moved to another incident.
 * - Delete: not granted. Items are closed by ticking them done.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.createdBySub),
})
@role('authenticated', 'update', {
  exclude: ['incidentId', 'createdBySub', 'createdAt'],
})
export class ActionItem {
  @uuid() id!: string;
  @uuid() incidentId!: string;
  @text({ min: 3, max: 150 }) title!: string;
  @text({ min: 1, max: 100 }) ownerName!: string;
  @date({ optional: true }) dueDate?: Date;
  @boolean() done!: boolean;
  @text({ min: 1, max: 255 }) createdBySub!: string;
  @date() createdAt!: Date;
}

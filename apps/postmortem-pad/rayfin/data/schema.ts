import { ActionItem } from './ActionItem.js';
import { AppMarker } from './AppMarker.js';
import { Incident } from './Incident.js';
import { Person } from './Person.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Incident: Incident;
  ActionItem: ActionItem;
};

export const schema = [Person, AppMarker, Incident, ActionItem];

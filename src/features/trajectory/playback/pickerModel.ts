import type { EventDef } from '@/domain/playback/library';

export type PickerTab = 'all' | 'bad' | 'good' | 'personal' | 'region' | 'mine' | 'favourites';

/** Events that play out in Taiwan or the region (PRD Playback UX, picker tabs). */
export const REGION_EVENTS = new Set([
  'blockade',
  'strait_conflict',
  'decoupling',
  'tw_housing',
  'asian_currency',
  'twd_surge',
  'yen_collapse',
  'earthquake',
  'semis_supercycle',
  'japan_revival',
]);

export const MAX_SCHEDULED = 3;

/** The events a tab lists, in library order. */
export function eventsForTab(
  tab: PickerTab,
  all: readonly EventDef[],
  favourites: readonly string[],
): EventDef[] {
  switch (tab) {
    case 'bad':
    case 'good':
      return all.filter((e) => e.palette === tab && e.group !== 'custom');
    case 'personal':
      return all.filter((e) => e.palette === 'personal');
    case 'region':
      return all.filter((e) => REGION_EVENTS.has(e.id));
    case 'mine':
      return all.filter((e) => e.group === 'custom');
    case 'favourites':
      return favourites.map((id) => all.find((e) => e.id === id)).filter((e): e is EventDef => !!e);
    default:
      return [...all];
  }
}

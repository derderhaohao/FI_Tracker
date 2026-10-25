import type { Severity, Story } from '@/domain/entities';
import { BACKDROPS, COMBOS } from '@/domain/playback/library';
import { resolveTiming, type PlaybackPath, type PlaybackStory } from '@/domain/playback/engine';
import { newId } from '@/db/repo';
import { t } from '@/i18n';
import { plainLine, SHAPES } from './plain';

export interface StoryCard {
  id: string;
  name: string;
  line: string;
  shape: string;
  story: (normal: PlaybackPath) => PlaybackStory;
}

const BACKDROP_ORDER = ['normal', 'lucky_decade', 'unlucky_decade', 'lost_decades'];

/** Story cards in order (PX-2): backdrops, one-tap combinations, then saved stories. */
export function storyCards(saved: readonly Story[]): StoryCard[] {
  const backdrops = BACKDROP_ORDER.map((id) => BACKDROPS.find((b) => b.id === id)).filter(
    (b): b is (typeof BACKDROPS)[number] => !!b,
  );
  return [
    ...backdrops.map((b) => ({
      id: b.id,
      name: b.id === 'normal' ? t('Normal markets') : b.name,
      line: plainLine(b.id, b.story),
      shape: SHAPES[b.id] ?? SHAPES.normal,
      story: (): PlaybackStory => ({ backdrop: b.id, events: [], behaviour: { kind: 'keep' } }),
    })),
    ...COMBOS.map((c) => ({
      id: c.id,
      name: c.name,
      line: plainLine(c.id),
      shape: SHAPES[c.id] ?? SHAPES.saved,
      story: (normal: PlaybackPath): PlaybackStory => ({
        backdrop: 'normal',
        behaviour: { kind: 'keep' },
        events: c.events.map((e) => ({
          uid: newId(),
          eventId: e.id,
          start: resolveTiming(e.start, normal.startAge, normal.retireMonth, normal.months),
          severity: 'typical' as Severity,
          source: 'scheduled' as const,
        })),
      }),
    })),
    ...saved.map((s) => ({
      id: `saved:${s.id}`,
      name: s.name,
      line: t('Your saved story · {length} events', { length: s.events.length }),
      shape: SHAPES.saved,
      story: (): PlaybackStory => ({
        backdrop: s.backdrop,
        events: s.events,
        behaviour: s.behaviour,
        noiseSeed: s.noiseSeed,
      }),
    })),
  ];
}

import { Wrench } from 'lucide-react';
import type { Story } from '@/domain/entities';
import type { PlaybackPath, PlaybackStory } from '@/domain/playback/engine';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { storyCards } from './stories';

function Shape({ points }: { points: string }) {
  return (
    <svg viewBox="0 0 100 28" className="h-5 w-16 shrink-0" aria-hidden preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Step 1, Pick a story (PX-2). Normal is pre-selected so Play works straight away. */
export function StoryCards({
  saved,
  selected,
  normal,
  onPick,
  onBuild,
}: {
  saved: readonly Story[];
  selected: string;
  normal: PlaybackPath;
  onPick: (id: string, story: PlaybackStory) => void;
  onBuild: () => void;
}) {
  const cards = storyCards(saved);
  return (
    <div
      role="radiogroup"
      aria-label={t('Stories')}
      className="flex snap-x gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={selected === c.id}
          className={cn(
            'flex w-56 shrink-0 snap-start items-start gap-2 rounded-md border p-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:w-auto',
            selected === c.id ? 'border-primary bg-surface-2' : 'hover:bg-surface-2',
          )}
          onClick={() => onPick(c.id, c.story(normal))}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {c.name}
              {selected === c.id && <span className="ml-1 text-primary">✓</span>}
            </span>
            <span className="block text-xs text-muted-foreground">{c.line}</span>
          </span>
          <span className={cn('mt-1', selected === c.id ? 'text-primary' : 'text-subtle')}>
            <Shape points={c.shape} />
          </span>
        </button>
      ))}
      <button
        type="button"
        className="flex w-56 shrink-0 snap-start items-center gap-2 rounded-md border border-dashed p-2 text-left text-sm hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:w-auto"
        onClick={onBuild}
      >
        <Wrench className="size-4 shrink-0" aria-hidden />
        <span>
          <span className="block font-medium">{t('Build your own')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('Your own market event, in Advanced')}
          </span>
        </span>
      </button>
    </div>
  );
}

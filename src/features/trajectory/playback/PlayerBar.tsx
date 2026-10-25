import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import type { ScrubTick, Speed } from './playerModel';

/**
 * The player bar (PX-8): Restart, Play/Pause as the primary button, the scrubber with ticks
 * at each event and milestone, Slow / Normal / Fast, and a "⋯" menu with the rest.
 */
export function PlayerBar({
  month,
  months,
  playing,
  reduced,
  speed,
  ticks,
  canUndo,
  hasLive,
  onToggle,
  onRestart,
  onJump,
  onSpeed,
  onUndo,
  onClearLive,
}: {
  month: number;
  months: number;
  playing: boolean;
  reduced: boolean;
  speed: Speed;
  ticks: ScrubTick[];
  canUndo: boolean;
  hasLive: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onJump: (m: number) => void;
  onSpeed: (s: Speed) => void;
  onUndo: () => void;
  onClearLive: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);
  const item = (label: string, action: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50"
      onClick={() => {
        action();
        setMenu(false);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="ghost" aria-label={t('Restart')} onClick={onRestart}>
        <RotateCcw />
      </Button>
      <Button
        className="h-10 px-5 text-base"
        aria-label={playing ? t('Pause') : t('Play')}
        disabled={reduced}
        onClick={onToggle}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? t('Pause') : t('Play')}
      </Button>
      <div className="relative min-w-40 flex-1">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-3 -translate-y-1/2" aria-hidden>
          {ticks.map((x, i) => (
            <span
              key={`${x.kind}-${x.month}-${i}`}
              className={cn(
                'absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded',
                x.kind === 'event'
                  ? 'bg-critical'
                  : x.kind === 'runOut'
                    ? 'bg-critical opacity-60'
                    : x.kind === 'stop'
                      ? 'bg-foreground'
                      : 'bg-subtle',
              )}
              style={{ left: `${(x.month / Math.max(1, months)) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          aria-label={t('Playhead month')}
          min={0}
          max={months}
          step={1}
          value={month}
          onChange={(e) => onJump(Number(e.target.value))}
          className="relative w-full accent-[var(--primary)]"
        />
      </div>
      <div className="hidden sm:block">
        <Segmented
          label={t('Speed')}
          value={speed}
          onChange={onSpeed}
          options={[
            { value: 'slow', label: t('Slow') },
            { value: 'normal', label: t('Normal') },
            { value: 'fast', label: t('Fast') },
          ]}
        />
      </div>
      <div className="relative" ref={menuRef}>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('More playback actions')}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <MoreHorizontal />
        </Button>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 bottom-full z-30 mb-1 w-52 rounded-md border bg-surface p-1 shadow-lg"
          >
            <div className="sm:hidden">
              {(['slow', 'normal', 'fast'] as Speed[]).map((x) =>
                item(
                  `${speed === x ? '✓ ' : ''}${x === 'slow' ? t('Slow') : x === 'normal' ? t('Normal') : t('Fast')}`,
                  () => onSpeed(x),
                ),
              )}
            </div>
            {item(t('Back one year'), () => onJump(month - 12))}
            {item(t('Back one month'), () => onJump(month - 1))}
            {item(t('Forward one month'), () => onJump(month + 1))}
            {item(t('Forward one year'), () => onJump(month + 12))}
            {item(t('Skip to end'), () => onJump(months))}
            {item(t('Undo last event'), onUndo, !canUndo)}
            {item(t('Clear live events'), onClearLive, !hasLive)}
            <p className="px-3 pt-1 pb-0.5 text-[11px] text-subtle">
              {t('Keys: Space plays, ← → move a month, Shift a year, Ctrl+Z undoes.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

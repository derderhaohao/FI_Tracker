import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import type { Milestone } from '@/domain/playback/analysis';
import type { PlaybackPath } from '@/domain/playback/engine';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { ICONS } from './icons';
import { assignLanes, monthAt, plotInsets } from './trackModel';

export interface TrackChip {
  uid: string;
  month: number;
  name: string;
  icon: string;
  tone: 'good' | 'bad' | 'personal';
  /** Scheduled chips can be dragged; live ones were fired at a moment. */
  live: boolean;
  /** What the event does, shown when the chip is opened. */
  detail: string;
}

/**
 * The event timeline under the chart, on the chart's age axis (PX-5, PX-11): one chip per
 * scheduled or fired event, milestone labels, and "+ Add event". Scheduled chips drag to a
 * new start month, or move with the arrow keys (Shift = a year).
 */
export function EventTrack({
  path,
  chips,
  milestones,
  onAdd,
  onMove,
  onRemove,
  onGo,
  yearOf,
}: {
  path: PlaybackPath;
  chips: TrackChip[];
  milestones: Milestone[];
  onAdd: () => void;
  onMove: (uid: string, month: number) => void;
  onRemove: (chip: TrackChip) => void;
  onGo: (month: number) => void;
  /** Calendar year of a month, for the drag label. */
  yearOf: (month: number) => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ uid: string; month: number; moved: boolean }>();
  const [open, setOpen] = useState<string>();
  const { left, right } = plotInsets();
  const plot = Math.max(1, width - left - right);
  const xOf = (m: number) => left + (m / path.months) * plot;
  const ageOf = (m: number) => Math.floor(path.startAge + m / 12);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const label = (c: TrackChip) => `${c.name} · ${ageOf(drag?.uid === c.uid ? drag.month : c.month)}`;
  const chipWidth = (c: TrackChip) => Math.min(170, 34 + label(c).length * 6.4);
  const placed = chips.map((c) => {
    const m = drag?.uid === c.uid ? drag.month : c.month;
    const w = chipWidth(c);
    const x = Math.max(left, Math.min(width - w, xOf(m) - 8));
    return { c, m, x, w };
  });
  const lanes = assignLanes(placed.map((p) => ({ x: p.x, width: p.w })));
  const rows = Math.max(1, ...lanes.map((l) => l + 1));
  // Milestone labels on one line, left aligned at their age; one that would overlap shows as a tick.
  const marks = milestones
    .filter((x) => x.kind !== 'eventStart' && x.kind !== 'eventEnd')
    .sort((a, b) => a.month - b.month);
  const markLabels: boolean[] = [];
  let labelEnd = -Infinity;
  for (const x of marks) {
    const at = xOf(x.month);
    const fits = at >= labelEnd + 4 && at + 8 + x.label.length * 6 <= width + 2;
    if (fits) labelEnd = at + 8 + x.label.length * 6;
    markLabels.push(fits);
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, c: TrackChip) => {
    if (c.live || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ uid: c.uid, month: c.month, moved: false });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const m = Math.min(path.months - 1, monthAt(e.clientX - box.left, left, plot, path.months));
    if (m !== drag.month) setDrag({ ...drag, month: m, moved: true });
  };
  const onPointerUp = (c: TrackChip) => {
    if (!drag) return;
    if (drag.moved) onMove(c.uid, drag.month);
    else setOpen(open === c.uid ? undefined : c.uid);
    setDrag(undefined);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, c: TrackChip) => {
    if (e.key === 'Escape') setOpen(undefined);
    if (c.live || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 12 : 1);
    onMove(c.uid, Math.max(0, Math.min(path.months - 1, c.month + step)));
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 self-start px-2"
        title={
          chips.some((c) => !c.live)
            ? t('Drag a chip, or focus it and use the arrow keys, to move it.')
            : undefined
        }
        onClick={onAdd}
      >
        <Plus aria-hidden /> {t('Add event')}
      </Button>
      <div
        ref={ref}
        role="group"
        aria-label={t('Event timeline')}
        className="relative"
        style={{ height: (chips.length ? rows * 30 : 0) + 18 }}
      >
        {placed.map(({ c, m, x }, i) => {
          const Icon = ICONS[c.icon] ?? Sparkles;
          return (
            <div key={c.uid} className="absolute" style={{ left: x, top: lanes[i] * 30 }}>
              <button
                type="button"
                data-chip
                aria-label={
                  c.live
                    ? t('{name}, fired live at age {age}', { name: c.name, age: ageOf(m) })
                    : t('{name}, scheduled at age {age}', { name: c.name, age: ageOf(m) })
                }
                aria-expanded={open === c.uid}
                className={cn(
                  'flex h-7 touch-none items-center gap-1 rounded-full border bg-surface px-2 text-xs whitespace-nowrap shadow-sm select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  c.tone === 'good' ? 'border-good' : c.tone === 'bad' ? 'border-critical' : 'border-primary',
                  !c.live && 'cursor-grab',
                  drag?.uid === c.uid && 'cursor-grabbing ring-2 ring-ring',
                )}
                onPointerDown={(e) => onPointerDown(e, c)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(c)}
                onClick={(e) => {
                  // Pointer users toggle on pointer up; keyboard users press Enter or Space.
                  if (e.detail === 0) setOpen(open === c.uid ? undefined : c.uid);
                }}
                onKeyDown={(e) => onKey(e, c)}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span>{label(c)}</span>
                {c.live && <span className="rounded bg-surface-2 px-1 text-xs">{t('live')}</span>}
              </button>
              {drag?.uid === c.uid && drag.moved && (
                <span className="absolute -top-6 left-0 rounded bg-foreground px-1.5 py-0.5 text-xs whitespace-nowrap text-background">
                  {t('Age {age} · {year}', { age: ageOf(drag.month), year: yearOf(drag.month) })}
                </span>
              )}
              {open === c.uid && (
                <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-md border bg-surface p-2 text-xs shadow-lg">
                  <p>{c.detail}</p>
                  <div className="mt-1.5 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onRemove(c);
                        setOpen(undefined);
                      }}
                    >
                      {t('Remove')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onGo(c.month);
                        setOpen(undefined);
                      }}
                    >
                      {t('Go there')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {marks.map((x, i) => (
          <button
            key={`${x.kind}-${x.month}`}
            type="button"
            title={x.label}
            aria-label={t('{label}, age {age}', { label: x.label, age: ageOf(x.month) })}
            className={cn(
              'absolute bottom-0 h-4 border-l pl-1 text-xs leading-4 whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              x.kind === 'runOut' && 'border-critical text-critical',
            )}
            style={{ left: xOf(x.month) }}
            onClick={() => onGo(x.month)}
          >
            {markLabels[i] ? x.label : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

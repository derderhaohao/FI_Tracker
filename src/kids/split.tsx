import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '@/i18n';
import { JAR_COLORS } from './art/palette';
import type { Jar, Split } from './math';

const JARS: Jar[] = ['spend', 'save', 'grow'];

/**
 * The split as one three-part bar with two handles (UI-23): the first moves the line between
 * Spend and Savings, the second the line between Savings and Grow. Tab to a handle and use the
 * arrow keys to move it one coin of every 10; or drag it.
 */
export function SplitEditor({ split, onChange }: { split: Split; onChange: (s: Split) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const first = split.spend;
  const second = split.spend + split.save;
  const set = (a: number, b: number) => onChange({ spend: a, save: b - a, grow: 100 - b });
  const move = (handle: 0 | 1, to: number) => {
    const v = Math.round(Math.max(0, Math.min(100, to)) / 10) * 10;
    if (handle === 0) set(Math.min(v, second), second);
    else set(first, Math.max(v, first));
  };
  const onKey = (handle: 0 | 1) => (e: KeyboardEvent<HTMLDivElement>) => {
    const now = handle === 0 ? first : second;
    const step = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10 }[e.key];
    if (step !== undefined) move(handle, now + step);
    else if (e.key === 'Home') move(handle, 0);
    else if (e.key === 'End') move(handle, 100);
    else return;
    e.preventDefault();
  };
  const at = (e: PointerEvent) => {
    const r = bar.current?.getBoundingClientRect();
    return r ? ((e.clientX - r.left) / r.width) * 100 : 0;
  };
  const handleProps = (handle: 0 | 1) => {
    const value = handle === 0 ? first : second;
    return {
      role: 'slider',
      tabIndex: 0,
      'aria-label': handle === 0 ? t('Between Spend and Savings') : t('Between Savings and Grow'),
      'aria-valuemin': handle === 0 ? 0 : first,
      'aria-valuemax': handle === 0 ? second : 100,
      'aria-valuenow': value,
      'aria-valuetext': t('Spend {a} · Savings {b} · Grow {c} of every 10 coins', {
        a: split.spend / 10,
        b: split.save / 10,
        c: split.grow / 10,
      }),
      onKeyDown: onKey(handle),
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => e.currentTarget.setPointerCapture(e.pointerId),
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(handle, at(e));
      },
      className:
        'absolute top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full focus-visible:outline-none [&:focus-visible>span]:ring-4 [&:focus-visible>span]:ring-ring',
      style: { left: `${value}%` },
    } as const;
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="px-6">
        <div ref={bar} className="relative h-12">
          <div className="absolute inset-x-0 top-1/2 flex h-8 -translate-y-1/2 overflow-hidden rounded-full border-2">
            {JARS.map((j) => (
              <div key={j} style={{ width: `${split[j]}%`, background: JAR_COLORS[j] }} />
            ))}
          </div>
          {([0, 1] as const).map((h) => (
            <div key={h} {...handleProps(h)}>
              <span className="block size-7 rounded-full border-4 border-white bg-foreground shadow-md" />
            </div>
          ))}
        </div>
      </div>
      <p className="font-semibold" data-testid="split-words">
        {t('Spend {a} · Savings {b} · Grow {c} of every 10 coins', {
          a: split.spend / 10,
          b: split.save / 10,
          c: split.grow / 10,
        })}
      </p>
    </div>
  );
}

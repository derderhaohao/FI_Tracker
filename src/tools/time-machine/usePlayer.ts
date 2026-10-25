import { useCallback, useEffect, useRef, useState } from 'react';

export type Speed = 'slow' | 'normal' | 'fast';
/** Months played per second; Normal is one year a second (TM-10). */
export const MONTHS_PER_SECOND: Record<Speed, number> = { slow: 6, normal: 12, fast: 36 };

/**
 * Month-by-month playback over points 0..months. The animation runs in requestAnimationFrame and
 * updates React state at most ~15 times a second. `onAdvance(from, to)` hears each step.
 */
export function usePlayer(months: number, reduced: boolean, onAdvance?: (from: number, to: number) => void) {
  const [pos, setPos] = useState(months);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [shownMonths, setShownMonths] = useState(months);
  const ref = useRef(months);
  const advance = useRef(onAdvance);
  useEffect(() => {
    advance.current = onAdvance;
  }, [onAdvance]);

  // A new scenario shows its whole result; Play then starts from the beginning.
  if (shownMonths !== months) {
    setShownMonths(months);
    setPos(months);
    setPlaying(false);
  }
  useEffect(() => {
    ref.current = pos;
  }, [pos]);

  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let last = performance.now();
    let painted = last;
    const tick = (now: number) => {
      const before = Math.floor(ref.current);
      ref.current = Math.min(months, ref.current + ((now - last) / 1000) * MONTHS_PER_SECOND[speed]);
      last = now;
      const after = Math.floor(ref.current);
      if (after !== before) advance.current?.(before, after);
      if (ref.current >= months) {
        setPos(months);
        setPlaying(false);
        return;
      }
      if (now - painted > 66) {
        setPos(after);
        painted = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, speed, months]);

  const jump = useCallback(
    (p: number) => {
      const v = Math.max(0, Math.min(months, Math.round(p)));
      ref.current = v;
      setPos(v);
    },
    [months],
  );
  const toggle = useCallback(() => {
    if (reduced) return;
    setPlaying((p) => {
      if (!p && ref.current >= months) {
        ref.current = 0;
        setPos(0);
      }
      return !p;
    });
  }, [reduced, months]);

  return { pos, playing, speed, setSpeed, jump, toggle, setPlaying };
}

import { useCallback, useState } from 'react';

const KEY = 'fi-tracker-play-hints';
type HintId = 'story' | 'events' | 'play';

function readDismissed(): HintId[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as HintId[]) : [];
  } catch {
    return [];
  }
}

/** First-visit pointers (PX-14): each shows until dismissed or used, once per device. */
export function useHints() {
  const [dismissed, setDismissed] = useState<HintId[]>(readDismissed);
  const dismiss = useCallback((id: HintId) => {
    setDismissed((d) => {
      if (d.includes(id)) return d;
      const next = [...d, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: the hint comes back next visit.
      }
      return next;
    });
  }, []);
  const show = useCallback((id: HintId) => !dismissed.includes(id), [dismissed]);
  return { show, dismiss };
}

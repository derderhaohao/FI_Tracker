import { useSyncExternalStore } from 'react';

/**
 * Beginner / Pro (PRD Part D, KD-1): Pro is the FI Tracker; Beginner is the kids' space. The
 * choice is kept per device, like the language. Undefined until someone picks on a first visit.
 */
export type Mode = 'pro' | 'beginner';

const KEY = 'fi-tracker-mode';

function read(): Mode | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pro' || v === 'beginner' ? v : undefined;
  } catch {
    return undefined;
  }
}

let current: Mode | undefined = typeof window !== 'undefined' ? read() : undefined;
const listeners = new Set<() => void>();

export function getMode(): Mode | undefined {
  return current;
}

export function setMode(mode: Mode): void {
  if (mode === current) return;
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // The choice lasts for this visit only.
  }
  for (const l of listeners) l();
}

export function useMode(): Mode | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

import { create } from 'zustand';

export const MAX_COMPARE = 5;

export type LabView = 'simple' | 'advanced';

/** Per-viewer conveniences kept in localStorage; the app works without it. */
function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** Transient UI state only; everything persistent lives in IndexedDB. */
interface UiState {
  valueMode: 'real' | 'nominal';
  setValueMode: (m: 'real' | 'nominal') => void;
  selectedScenarioId?: string;
  selectScenario: (id?: string) => void;
  /** Scenario id → color slot. A slot stays with its scenario while others are added or removed. */
  compare: Record<string, number>;
  toggleCompare: (id: string) => void;
  setCompare: (ids: string[]) => void;
  mcRuns: number;
  setMcRuns: (n: number) => void;
  mcSeed: number;
  setMcSeed: (n: number) => void;
  /** Strategy Lab: Simple (default) or Advanced view (PRD R9). */
  labView: LabView;
  setLabView: (v: LabView) => void;
  /** Strategy Lab starter card (PRD R1): auto = shown until the first custom what-if. */
  labStarter: 'auto' | 'shown' | 'dismissed';
  setLabStarter: (v: 'shown' | 'dismissed') => void;
}

export const useUi = create<UiState>((set) => ({
  valueMode: 'real',
  setValueMode: (valueMode) => set({ valueMode }),
  selectedScenarioId: undefined,
  selectScenario: (selectedScenarioId) => set({ selectedScenarioId }),
  compare: {},
  toggleCompare: (id) =>
    set((s) => {
      if (id in s.compare) {
        const next = { ...s.compare };
        delete next[id];
        return { compare: next };
      }
      const used = new Set(Object.values(s.compare));
      if (used.size >= MAX_COMPARE) return s;
      let slot = 0;
      while (used.has(slot)) slot++;
      return { compare: { ...s.compare, [id]: slot } };
    }),
  setCompare: (ids) =>
    set({ compare: Object.fromEntries(ids.slice(0, MAX_COMPARE).map((id, i) => [id, i])) }),
  mcRuns: 1000,
  setMcRuns: (mcRuns) => set({ mcRuns }),
  mcSeed: 42,
  setMcSeed: (mcSeed) => set({ mcSeed }),
  labView: stored('fi-tracker-lab-view', ['simple', 'advanced'] as const, 'simple'),
  setLabView: (labView) => {
    store('fi-tracker-lab-view', labView);
    set({ labView });
  },
  labStarter: stored('fi-tracker-lab-starter', ['auto', 'shown', 'dismissed'] as const, 'auto'),
  setLabStarter: (labStarter) => {
    store('fi-tracker-lab-starter', labStarter);
    set({ labStarter });
  },
}));

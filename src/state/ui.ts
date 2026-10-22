import { create } from 'zustand';

export const MAX_COMPARE = 5;

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
}));

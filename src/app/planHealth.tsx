import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { planStatus, type PlanStatus } from '@/domain/planStatus';
import { HEALTH_RUNS, HEALTH_SEED, monteCarloWorker, signature } from '@/lib/mcWorker';
import { useAppData } from './data';

export interface PlanHealth {
  /** Simulated futures for the plan today; undefined while the first run is going. */
  summary?: MonteCarloSummary;
  status?: PlanStatus;
  /** True while the result is older than the data. */
  pending: boolean;
  error?: string;
}

const Ctx = createContext<PlanHealth>({ pending: true });

/**
 * Runs the simulated futures for "your plan today" once for the whole app, so the
 * Dashboard, Projection, Goal and Strategy Lab all show the same status (product review,
 * issue 1). Same runs and seed as the Lab's defaults.
 */
export function PlanHealthProvider({ children }: { children: ReactNode }) {
  const { baselineInput, accounts } = useAppData();
  const sig = signature(baselineInput, HEALTH_RUNS, HEALTH_SEED);
  const [state, setState] = useState<{ sig?: string; summary?: MonteCarloSummary; error?: string }>({});

  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      monteCarloWorker()
        .run([baselineInput], { runs: HEALTH_RUNS, seed: HEALTH_SEED })
        .then(([summary]) => !cancelled && setState({ sig, summary }))
        .catch((e: unknown) => !cancelled && setState((s) => ({ ...s, error: String(e) })));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig captures the input
  }, [sig, accounts.length]);

  const value: PlanHealth = {
    summary: state.summary,
    status: state.summary ? planStatus(state.summary.successRate) : undefined,
    pending: state.sig !== sig,
    error: state.error,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanHealth(): PlanHealth {
  return useContext(Ctx);
}

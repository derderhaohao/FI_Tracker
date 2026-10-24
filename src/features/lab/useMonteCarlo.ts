import { useCallback, useRef, useState } from 'react';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import { monteCarloWorker, signature } from '@/lib/mcWorker';

export { monteCarloWorker, signature };

export interface StoredResult {
  summary: MonteCarloSummary;
  signature: string;
}

export function useMonteCarlo() {
  const [results, setResults] = useState<Record<string, StoredResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  const run = useCallback(
    async (jobs: { id: string; input: ProjectionInput }[], runs: number, seed: number) => {
      if (jobs.length === 0) return;
      const ticket = ++latest.current;
      setRunning(true);
      setError(undefined);
      try {
        const summaries = await monteCarloWorker().run(
          jobs.map((j) => j.input),
          { runs, seed },
        );
        setResults((prev) => {
          const next = { ...prev };
          jobs.forEach(
            (j, i) => (next[j.id] = { summary: summaries[i], signature: signature(j.input, runs, seed) }),
          );
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (ticket === latest.current) setRunning(false);
      }
    },
    [],
  );

  return { results, running, error, run };
}

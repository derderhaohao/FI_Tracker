import { useCallback, useEffect, useRef, useState } from 'react';
import { wrap, type Remote } from 'comlink';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';
import type { MonteCarloWorkerApi } from '@/workers/montecarlo.worker';

/** Cheap FNV-1a hash of the input, to tell whether a stored result is stale. */
export function signature(input: ProjectionInput, runs: number, seed: number): string {
  const text = JSON.stringify(input) + `|${runs}|${seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface StoredResult {
  summary: MonteCarloSummary;
  signature: string;
}

export function useMonteCarlo() {
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Remote<MonteCarloWorkerApi> | null>(null);
  const [results, setResults] = useState<Record<string, StoredResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  const run = useCallback(
    async (jobs: { id: string; input: ProjectionInput }[], runs: number, seed: number) => {
      if (!apiRef.current) {
        workerRef.current = new Worker(new URL('../../workers/montecarlo.worker.ts', import.meta.url), {
          type: 'module',
        });
        apiRef.current = wrap<MonteCarloWorkerApi>(workerRef.current);
      }
      setRunning(true);
      setError(undefined);
      try {
        const summaries = await apiRef.current.run(
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
        setRunning(false);
      }
    },
    [],
  );

  return { results, running, error, run };
}

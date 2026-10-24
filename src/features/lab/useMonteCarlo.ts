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

let shared: { worker: Worker; api: Remote<MonteCarloWorkerApi> } | undefined;

/** One Monte Carlo worker for the page; created on first use. */
export function monteCarloWorker(): Remote<MonteCarloWorkerApi> {
  if (!shared) {
    const worker = new Worker(new URL('../../workers/montecarlo.worker.ts', import.meta.url), {
      type: 'module',
    });
    shared = { worker, api: wrap<MonteCarloWorkerApi>(worker) };
  }
  return shared.api;
}

export function useMonteCarlo() {
  const [results, setResults] = useState<Record<string, StoredResult>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  useEffect(
    () => () => {
      shared?.worker.terminate();
      shared = undefined;
    },
    [],
  );

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

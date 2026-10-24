import { wrap, type Remote } from 'comlink';
import type { ProjectionInput } from '@/domain/projection';
import type { MonteCarloWorkerApi } from '@/workers/montecarlo.worker';

let shared: { worker: Worker; api: Remote<MonteCarloWorkerApi> } | undefined;

/** One Monte Carlo worker for the whole app; created on first use. */
export function monteCarloWorker(): Remote<MonteCarloWorkerApi> {
  if (!shared) {
    const worker = new Worker(new URL('../workers/montecarlo.worker.ts', import.meta.url), {
      type: 'module',
    });
    shared = { worker, api: wrap<MonteCarloWorkerApi>(worker) };
  }
  return shared.api;
}

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

/** Runs and seed behind the plan status shown on every page. */
export const HEALTH_RUNS = 1000;
export const HEALTH_SEED = 42;

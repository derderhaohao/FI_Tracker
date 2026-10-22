import { expose } from 'comlink';
import { runMonteCarlo, type MonteCarloOptions, type MonteCarloSummary } from '@/domain/montecarlo/runner';
import type { ProjectionInput } from '@/domain/projection';

/** Runs Monte Carlo off the main thread so the UI stays responsive. */
const api = {
  run(inputs: ProjectionInput[], options: MonteCarloOptions): MonteCarloSummary[] {
    return inputs.map((input) => runMonteCarlo(input, options));
  },
};

export type MonteCarloWorkerApi = typeof api;

expose(api);

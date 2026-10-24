import { expose } from 'comlink';
import { runMonteCarlo, type MonteCarloOptions, type MonteCarloSummary } from '@/domain/montecarlo/runner';
import { monteCarloChance, solveLever, type SolveLever, type SolveResult } from '@/domain/montecarlo/solve';
import type { ProjectionInput } from '@/domain/projection';
import { referenceChecks, type ReferenceCheck } from '@/domain/referenceChecks';

/** Runs Monte Carlo off the main thread so the UI stays responsive. */
const api = {
  run(inputs: ProjectionInput[], options: MonteCarloOptions): MonteCarloSummary[] {
    return inputs.map((input) => runMonteCarlo(input, options));
  },
  /** Chance the money lasts for each input, for quick what-if variants. */
  chances(inputs: ProjectionInput[], options: MonteCarloOptions): number[] {
    return inputs.map((input) => runMonteCarlo(input, options).successRate);
  },
  solve(
    input: ProjectionInput,
    levers: SolveLever[],
    target: number,
    stop: number,
    options: MonteCarloOptions,
  ): SolveResult[] {
    const chance = monteCarloChance(options);
    return levers.map((lever) => solveLever(input, lever, target, stop, chance));
  },
  checks(input: ProjectionInput): ReferenceCheck[] {
    return referenceChecks(input);
  },
};

export type MonteCarloWorkerApi = typeof api;

expose(api);

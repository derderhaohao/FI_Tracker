import { DRAWS_PER_YEAR, N_ASSETS, prepare, simulate, type ProjectionInput } from '../projection';
import { cholesky, correlate } from './cholesky';
import { lognormalReturn, mulberry32, normalSource, runSeed } from './rng';

export interface MonteCarloOptions {
  runs: number;
  seed: number;
}

export interface MonteCarloSummary {
  runs: number;
  seed: number;
  ages: number[];
  /** Investable net worth (real TWD) per age. */
  p10: number[];
  p40: number[];
  p50: number[];
  p60: number[];
  p90: number[];
  /** Share of runs where liquid investable stays above zero to the horizon age. */
  successRate: number;
  /** Share of runs that reach FI at all. */
  fiRate: number;
  /** Median age the money runs out, over the runs where it does. */
  depletionAgeP50?: number;
  fiAgeP10?: number;
  fiAgeP50?: number;
  fiAgeP90?: number;
  fiAgeDistribution: { age: number; share: number }[];
  balanceAtHorizonP50: number;
  /** Every run's investable at the horizon and lowest investable, sorted (for ranking a story). */
  horizonSorted: number[];
  lowestSorted: number[];
  /** Median of the lowest spending ratio (withdrawal rules that cut spending). */
  minSpendingRatioP50: number;
  elapsedMs: number;
}

export const MAX_RUNS = 10_000;

function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Monte Carlo over the shared step function (LAB-4). Run i always draws the same
 * normals from (seed, i), whatever the scenario, so scenarios compared with one seed
 * share their random numbers (common random numbers).
 */
export function runMonteCarlo(input: ProjectionInput, options: MonteCarloOptions): MonteCarloSummary {
  const started = performance.now();
  const runs = Math.max(1, Math.min(MAX_RUNS, Math.floor(options.runs)));
  const prep = prepare(input);
  const years = prep.years;
  const L = cholesky(input.correlations);
  const z = new Float64Array(DRAWS_PER_YEAR);
  const zAssets = new Float64Array(N_ASSETS);
  const correlated = new Float64Array(N_ASSETS);
  const means = input.assets.map((a) => a.expectedReturn + input.returnShift);
  const sds = input.assets.map((a) => a.volatility);

  const paths = new Float64Array(runs * (years + 1));
  const fiAges: number[] = [];
  const depletionAges: number[] = [];
  const horizon = new Float64Array(runs);
  const lowest = new Float64Array(runs);
  const minSpending = new Float64Array(runs);
  let successes = 0;

  for (let r = 0; r < runs; r++) {
    const normal = normalSource(mulberry32(runSeed(options.seed, r)));
    const result = simulate(
      prep,
      (_k, d) => {
        for (let i = 0; i < DRAWS_PER_YEAR; i++) z[i] = normal();
        for (let i = 0; i < N_ASSETS; i++) zAssets[i] = z[i];
        correlate(L, zAssets, correlated);
        for (let i = 0; i < N_ASSETS; i++) d.nominal[i] = lognormalReturn(means[i], sds[i], correlated[i]);
        d.inflation = input.inflation + input.inflationVolatility * z[N_ASSETS];
        d.fx = input.fxDrift + input.fxVolatility * z[N_ASSETS + 1];
      },
      false,
    );
    paths.set(result.investable, r * (years + 1));
    if (result.success) successes += 1;
    else if (result.depletionAge !== undefined) depletionAges.push(result.depletionAge);
    if (result.fiAge !== undefined) fiAges.push(result.fiAge);
    horizon[r] = result.balanceAtHorizon;
    let low = Infinity;
    for (const v of result.investable) if (v < low) low = v;
    lowest[r] = low;
    minSpending[r] = result.minSpendingRatio;
  }

  const ages: number[] = [];
  const p10: number[] = [];
  const p40: number[] = [];
  const p50: number[] = [];
  const p60: number[] = [];
  const p90: number[] = [];
  const column = new Float64Array(runs);
  for (let k = 0; k <= years; k++) {
    for (let r = 0; r < runs; r++) column[r] = paths[r * (years + 1) + k];
    column.sort();
    ages.push(input.startAge + k);
    p10.push(percentile(column, 0.1));
    p40.push(percentile(column, 0.4));
    p50.push(percentile(column, 0.5));
    p60.push(percentile(column, 0.6));
    p90.push(percentile(column, 0.9));
  }

  fiAges.sort((a, b) => a - b);
  depletionAges.sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const a of fiAges) counts.set(a, (counts.get(a) ?? 0) + 1);
  horizon.sort();
  lowest.sort();
  minSpending.sort();

  return {
    runs,
    seed: options.seed,
    ages,
    p10,
    p40,
    p50,
    p60,
    p90,
    successRate: successes / runs,
    fiRate: fiAges.length / runs,
    depletionAgeP50: depletionAges.length ? percentile(depletionAges, 0.5) : undefined,
    fiAgeP10: fiAges.length ? percentile(fiAges, 0.1) : undefined,
    fiAgeP50: fiAges.length ? percentile(fiAges, 0.5) : undefined,
    fiAgeP90: fiAges.length ? percentile(fiAges, 0.9) : undefined,
    fiAgeDistribution: [...counts.entries()].map(([age, count]) => ({ age, share: count / runs })),
    balanceAtHorizonP50: percentile(horizon, 0.5),
    horizonSorted: Array.from(horizon),
    lowestSorted: Array.from(lowest),
    minSpendingRatioP50: percentile(minSpending, 0.5),
    elapsedMs: performance.now() - started,
  };
}

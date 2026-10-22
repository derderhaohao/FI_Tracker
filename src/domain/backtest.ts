import { ASSET_CLASSES, type AssetClass } from './entities';
import { US_HISTORY } from './history/usHistory';
import { N_ASSETS, prepare, simulate, type ProjectionInput } from './projection';

/**
 * Historical backtest (LAB-7): replays real annual return sequences through the same
 * yearly step function as the projection and Monte Carlo, once per starting year.
 *
 * History covers US stocks, US 10-year Treasuries and US CPI. Equity classes follow
 * stocks and bonds follow Treasuries; classes without a series (cash, property,
 * other) keep the assumption set's real return on top of historical inflation.
 * FX follows the assumption set's drift.
 */

export interface HistoricalYear {
  year: number;
  stocks: number;
  bonds: number;
  inflation: number;
}

export const HISTORY: readonly HistoricalYear[] = US_HISTORY.map(([year, stocks, bonds, inflation]) => ({
  year,
  stocks,
  bonds,
  inflation,
}));

const SERIES: Partial<Record<AssetClass, 'stocks' | 'bonds'>> = {
  tw_equity: 'stocks',
  us_equity: 'stocks',
  global_equity: 'stocks',
  bond: 'bonds',
};

export interface BacktestRun {
  startYear: number;
  success: boolean;
  fiAge?: number;
  retireAge?: number;
  depletionAge?: number;
  balanceAtHorizon: number;
  minSpendingRatio: number;
  investable: Float64Array;
}

export interface BacktestSummary {
  /** Number of starting years tested. */
  runs: number;
  firstYear: number;
  lastYear: number;
  /** True when sequences wrap around to the start of the data (horizon longer than the data). */
  wrapped: boolean;
  successRate: number;
  fiRate: number;
  ages: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  /** Failed or lowest-ending starting years first. */
  worst: BacktestRun[];
  medianFiAge?: number;
}

function percentile(sorted: ArrayLike<number>, p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Runs the projection once from each historical starting year. */
export function runBacktest(
  input: ProjectionInput,
  history: readonly HistoricalYear[] = HISTORY,
): BacktestSummary {
  const prep = prepare(input);
  const years = prep.years;
  const wrapped = years > history.length;
  const starts = wrapped ? history.length : history.length - years + 1;
  const realExpected = input.assets.map(
    (a) => (1 + a.expectedReturn + input.returnShift) / (1 + input.inflation) - 1,
  );

  const runs: BacktestRun[] = [];
  for (let s = 0; s < starts; s++) {
    const result = simulate(
      prep,
      (k, d) => {
        const h = history[(s + k) % history.length];
        for (let i = 0; i < N_ASSETS; i++) {
          const series = SERIES[ASSET_CLASSES[i]];
          d.nominal[i] = series
            ? h[series] + input.returnShift
            : (1 + realExpected[i]) * (1 + h.inflation) - 1;
        }
        d.inflation = h.inflation;
        d.fx = input.fxDrift;
      },
      false,
    );
    runs.push({
      startYear: history[s].year,
      success: result.success,
      fiAge: result.fiAge,
      retireAge: result.retireAge,
      depletionAge: result.depletionAge,
      balanceAtHorizon: result.balanceAtHorizon,
      minSpendingRatio: result.minSpendingRatio,
      investable: result.investable,
    });
  }

  const ages: number[] = [];
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  const column = new Float64Array(runs.length);
  for (let k = 0; k <= years; k++) {
    runs.forEach((r, i) => (column[i] = r.investable[k]));
    column.sort();
    ages.push(input.startAge + k);
    p10.push(percentile(column, 0.1));
    p50.push(percentile(column, 0.5));
    p90.push(percentile(column, 0.9));
  }
  const fiAges = runs.flatMap((r) => (r.fiAge === undefined ? [] : [r.fiAge])).sort((a, b) => a - b);
  const worst = [...runs].sort(
    (a, b) =>
      Number(a.success) - Number(b.success) ||
      (a.depletionAge ?? 999) - (b.depletionAge ?? 999) ||
      a.balanceAtHorizon - b.balanceAtHorizon,
  );

  return {
    runs: runs.length,
    firstYear: runs[0]?.startYear ?? history[0].year,
    lastYear: runs.at(-1)?.startYear ?? history[0].year,
    wrapped,
    successRate: runs.filter((r) => r.success).length / Math.max(1, runs.length),
    fiRate: fiAges.length / Math.max(1, runs.length),
    ages,
    p10,
    p50,
    p90,
    worst: worst.slice(0, 5),
    medianFiAge: fiAges.length ? percentile(fiAges, 0.5) : undefined,
  };
}

/** Annualised geometric mean of a series, for sanity checks and display. */
export function geometricMean(values: readonly number[]): number {
  const log = values.reduce((s, v) => s + Math.log(1 + v), 0);
  return Math.exp(log / values.length) - 1;
}

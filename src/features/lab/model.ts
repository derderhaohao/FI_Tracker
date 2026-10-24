import { ASSET_CLASSES, type Scenario } from '@/domain/entities';
import { buildProjectionInput, BASELINE_SPEC, type ScenarioSpec } from '@/domain/baseline';
import { HISTORY, runBacktest, type BacktestSummary, type HistoricalYear } from '@/domain/backtest';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { medianReturn } from '@/domain/montecarlo/rng';
import { prepare, runProjection, type ProjectionInput, type ProjectionResult } from '@/domain/projection';
import { assumptionSetFor, type AppData } from '@/app/data';
import { dateAfterYears } from '@/lib/format';
import { chanceDots, lastsSentence, planStatus, STATUS_LABELS, type PlanStatus } from '@/domain/planStatus';

/**
 * Pure helpers behind the Strategy Lab's plain-language view (PRD R3–R6): the verdict,
 * the "vs your plan" comparison, the note when the two lenses disagree, and checks that a
 * scenario's name matches what it does.
 */

/** Id of the built-in row that always mirrors live data. */
export const TODAY_ID = '__today';
export const TODAY_NAME = 'Your plan today';

export interface LabRow {
  id: string;
  name: string;
  /** Undefined for the built-in "Your plan today" row. */
  scenario?: Scenario;
  spec: ScenarioSpec;
  input: ProjectionInput;
  result: ProjectionResult;
  fiTargets: number[];
  backtest: BacktestSummary;
}

export function evaluateRow(data: AppData, scenario?: Scenario): LabRow {
  const spec: ScenarioSpec = scenario ?? BASELINE_SPEC;
  const assumptions = assumptionSetFor(data, scenario?.assumptionSetId ?? data.activeAssumptions.id);
  const input = buildProjectionInput(data, assumptions, spec, data.ctx);
  return {
    id: scenario?.id ?? TODAY_ID,
    name: scenario?.name ?? TODAY_NAME,
    scenario,
    spec,
    input,
    result: runProjection(input),
    fiTargets: Array.from(prepare(input).required),
    backtest: runBacktest(input),
  };
}

/** Age the plan stops work: the set age, or the typical-path FI age. */
export function stopAge(result: ProjectionResult): number | undefined {
  return result.retireAge ?? result.fiAge;
}

/** "Nov 2037" for the stop-work age, from the as-of date. */
export function stopDate(
  input: ProjectionInput,
  result: ProjectionResult,
  asOfDate: string,
): string | undefined {
  if (input.retireAtAge === undefined && result.yearsToFi !== undefined)
    return dateAfterYears(asOfDate, result.yearsToFi);
  const age = stopAge(result);
  return age === undefined ? undefined : dateAfterYears(asOfDate, Math.max(0, age - input.startAge));
}

/** Spending while working, as the projection applies it in the first year. */
export function spendingNow(input: ProjectionInput): number {
  return input.savingsRate !== undefined
    ? input.annualIncome * (1 - input.savingsRate)
    : input.currentSpending;
}

/** Savings per year while working (before 勞退 changes). */
export function annualSavings(input: ProjectionInput): number {
  return input.annualIncome - spendingNow(input);
}

/** Share of take-home pay saved; undefined without income. */
export function savingsRateOf(input: ProjectionInput): number | undefined {
  return input.annualIncome > 0 ? annualSavings(input) / input.annualIncome : undefined;
}

export type Tier = PlanStatus;
export { STATUS_LABELS as TIER_LABELS, planStatus as tierOf, chanceDots as outOfTen };

export interface Verdict {
  /** "You could stop working at 49 (Nov 2037)." */
  stop: string;
  /** "In 6 of 10 simulated futures your money lasts to 95; …" */
  lasts?: string;
  /** "You reach your target in every simulation; the risk comes after you stop." */
  reach?: string;
  tier?: Tier;
}

export function verdict(
  row: Pick<LabRow, 'input' | 'result'>,
  asOfDate: string,
  mc?: MonteCarloSummary,
): Verdict {
  const { input, result } = row;
  const age = stopAge(result);
  const date = stopDate(input, result, asOfDate);
  const stop =
    age === undefined
      ? `On the typical path your investments do not reach your target before ${input.horizonAge}.`
      : input.retireAtAge !== undefined
        ? `You plan to stop working at ${age} (${date}).`
        : `You could stop working at ${age} (${date}).`;
  if (!mc) return { stop };
  const lasts = lastsSentence(mc.successRate, input.horizonAge, mc.depletionAgeP50);
  let reach: string | undefined;
  if (input.retireAtAge === undefined) {
    if (mc.fiRate >= 0.95)
      reach =
        mc.successRate < 0.95
          ? 'You reach your target in nearly every simulation; the risk comes after you stop.'
          : 'You reach your target in nearly every simulation.';
    else reach = `You reach your target in ${chanceDots(mc.fiRate)} of 10 simulations.`;
  }
  return { stop, lasts, reach, tier: planStatus(mc.successRate) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface Difference {
  /** "+4 yrs work · +6 pts" */
  short: string;
  /** "Safer mainly because you work 4 more years, so the money must last 42 years instead of 46." */
  cause?: string;
}

interface Driver {
  /** +1 makes the plan safer, −1 riskier. */
  direction: 1 | -1;
  text: string;
}

function drivers(base: LabRow, other: LabRow): Driver[] {
  const out: Driver[] = [];
  const h = other.input.horizonAge;
  const a = stopAge(base.result);
  const b = stopAge(other.result);
  if (a !== undefined && b !== undefined && a !== b) {
    const more = b > a;
    out.push({
      direction: more ? 1 : -1,
      text: `you ${more ? `work ${plural(b - a, 'more year')}` : `stop ${plural(a - b, 'year')} earlier`}, so the money must last ${h - b} years instead of ${h - a}`,
    });
  }
  const fa = base.input.fiSpending;
  const fb = other.input.fiSpending;
  if (fa > 0 && Math.abs(fb - fa) / fa >= 0.02) {
    const p = Math.round((Math.abs(fb - fa) / fa) * 100);
    out.push({
      direction: fb < fa ? 1 : -1,
      text: `you spend ${p}% ${fb < fa ? 'less' : 'more'} each year after you stop`,
    });
  }
  if (other.input.crash && !base.input.crash)
    out.push({
      direction: -1,
      text: `markets fall ${Math.round(other.input.crash.drop * 100)}% just after you stop, when your savings are largest`,
    });
  const pa = base.input.barista?.annual ?? 0;
  const pb = other.input.barista?.annual ?? 0;
  if (pa !== pb)
    out.push({
      direction: pb > pa ? 1 : -1,
      text:
        pb > pa
          ? 'part-time income covers part of your spending after you stop'
          : 'there is less part-time income after you stop',
    });
  const ea = base.input.events.reduce((s, e) => s + e.amount, 0);
  const eb = other.input.events.reduce((s, e) => s + e.amount, 0);
  if (ea !== eb)
    out.push({
      direction: eb > ea ? 1 : -1,
      text: eb < ea ? 'of the one-off costs' : 'of the one-off money coming in',
    });
  const sa = annualSavings(base.input);
  const sb = annualSavings(other.input);
  if (Math.abs(sb - sa) >= 12_000)
    out.push({
      direction: sb > sa ? 1 : -1,
      text: `you save ${sb > sa ? 'more' : 'less'} each year while working`,
    });
  if (other.input.swr !== base.input.swr)
    out.push({
      direction: other.input.swr < base.input.swr ? 1 : -1,
      text: `your yearly draw rate is ${(other.input.swr * 100).toFixed(1)}% instead of ${(base.input.swr * 100).toFixed(1)}%`,
    });
  if (other.input.returnShift !== base.input.returnShift)
    out.push({
      direction: other.input.returnShift > base.input.returnShift ? 1 : -1,
      text: `the scenario assumes ${other.input.returnShift > base.input.returnShift ? 'higher' : 'lower'} market returns`,
    });
  if (other.input.withdrawalRule.kind !== base.input.withdrawalRule.kind)
    out.push({ direction: 1, text: 'spending adjusts to markets after you stop' });
  if (JSON.stringify(other.input.allocation) !== JSON.stringify(base.input.allocation))
    out.push({ direction: 1, text: 'your investment mix is different' });
  return out;
}

/**
 * "vs your plan" for a scenario (R5): work-years and chance differences, plus a cause line
 * when the chance differs by 5 points or more.
 */
export function explainDifference(
  base: LabRow,
  other: LabRow,
  baseChance?: number,
  otherChance?: number,
): Difference {
  const parts: string[] = [];
  const a = stopAge(base.result);
  const b = stopAge(other.result);
  if (a !== undefined && b !== undefined && a !== b)
    parts.push(`${b > a ? '+' : '−'}${plural(Math.abs(b - a), 'yr')} work`);
  let points: number | undefined;
  if (baseChance !== undefined && otherChance !== undefined) {
    points = Math.round((otherChance - baseChance) * 100);
    if (points !== 0) parts.push(`${points > 0 ? '+' : '−'}${Math.abs(points)} pts`);
  }
  const short = parts.length ? parts.join(' · ') : 'Same';
  if (points === undefined || Math.abs(points) < 5) return { short };
  const direction = points > 0 ? 1 : -1;
  const all = drivers(base, other);
  const main = all.find((d) => d.direction === direction);
  const word = direction > 0 ? 'Safer' : 'Riskier';
  if (!main) return { short, cause: `${word} because of the combined changes.` };
  const against = all.find((d) => d.direction !== direction);
  const cause = `${word} mainly because ${main.text}${against && all.indexOf(against) < all.indexOf(main) ? `, even though ${against.text}` : ''}.`;
  return { short, cause };
}

const SERIES: Record<string, 'stocks' | 'bonds' | undefined> = {
  tw_equity: 'stocks',
  us_equity: 'stocks',
  global_equity: 'stocks',
  bond: 'bonds',
};

/** Typical (median) real return of the plan's mix under its assumptions, before fees. */
export function assumedRealReturn(input: ProjectionInput): number {
  let r = 0;
  input.allocation.forEach((w, i) => {
    const a = input.assets[i];
    r +=
      w *
      ((1 + medianReturn(a.expectedReturn + input.returnShift, a.volatility)) / (1 + input.inflation) - 1);
  });
  return r;
}

/** Real geometric return of the same mix, rebalanced yearly, over the historical data. */
export function historicalRealReturn(
  input: ProjectionInput,
  history: readonly HistoricalYear[] = HISTORY,
): number {
  const realExpected = input.assets.map(
    (a) => (1 + a.expectedReturn + input.returnShift) / (1 + input.inflation) - 1,
  );
  let log = 0;
  for (const h of history) {
    let nominal = 0;
    input.allocation.forEach((w, i) => {
      const s = SERIES[ASSET_CLASSES[i]];
      nominal += w * (s ? h[s] + input.returnShift : (1 + realExpected[i]) * (1 + h.inflation) - 1);
    });
    log += Math.log((1 + nominal) / (1 + h.inflation));
  }
  return Math.exp(log / history.length) - 1;
}

/**
 * "Why these differ" (R4): when the simulated and past-markets chances differ by more than
 * 10 points, names the assumption that drives it.
 */
export function whyLensesDiffer(
  input: ProjectionInput,
  simulated: number,
  past: number,
  history: readonly HistoricalYear[] = HISTORY,
): string | undefined {
  const gap = past - simulated;
  if (Math.abs(gap) <= 0.1) return undefined;
  const assumed = assumedRealReturn(input);
  const historical = historicalRealReturn(input, history);
  const fmt = (v: number) => `${(v * 100).toFixed(1)}%`;
  const years = `${history[0].year}–${history.at(-1)!.year}`;
  if (Math.abs(historical - assumed) >= 0.005) {
    const kinder = historical > assumed ? 'Past markets look kinder' : 'Simulated futures look kinder';
    const cause =
      historical > assumed
        ? 'Simulated futures use your assumptions, so they grow less.'
        : 'Your assumptions are more optimistic than history.';
    return `${kinder} because of returns: over ${years} your mix grew about ${fmt(historical)} a year after inflation, while your assumptions give it about ${fmt(assumed)} in a typical year. ${cause}`;
  }
  return gap > 0
    ? 'Returns are similar in both, but the random sequences in the simulations include more long bad stretches than past markets had.'
    : 'Returns are similar in both, but past markets had longer bad stretches (such as the 1960s–70s) than most simulated futures.';
}

/**
 * Warns when a scenario's name suggests the opposite of what it does (R6), e.g. a
 * "Saving rate 20%" scenario that saves less than today's 23.2%.
 */
export function nameCheck(name: string, today: LabRow, row: LabRow): string | undefined {
  const o = row.scenario?.overrides;
  const todayRate = savingsRateOf(today.input);
  const pctText = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;
  if (o?.savingsRate !== undefined && todayRate !== undefined && o.savingsRate < todayRate - 0.0005)
    return `${pctText(o.savingsRate)} is less than you save today (${pctText(todayRate)}), so this scenario saves less, not more.`;
  const n = name.toLowerCase();
  const sa = annualSavings(today.input);
  const sb = annualSavings(row.input);
  if (/sav/.test(n) && /more|higher|increase|raise|extra|boost/.test(n) && sb < sa - 1)
    return 'The name says save more, but this scenario saves less than you do today.';
  if (/sav/.test(n) && /less|lower|cut|reduce/.test(n) && sb > sa + 1)
    return 'The name says save less, but this scenario saves more than you do today.';
  const a = stopAge(today.result);
  const b = stopAge(row.result);
  if (a !== undefined && b !== undefined) {
    if (/(retire|stop).*(earl)/.test(n) && b > a)
      return `The name says stop earlier, but this scenario stops at ${b}, later than today's ${a}.`;
    if (/(retire|stop).*(later|late)/.test(n) && b < a)
      return `The name says stop later, but this scenario stops at ${b}, earlier than today's ${a}.`;
  }
  return undefined;
}

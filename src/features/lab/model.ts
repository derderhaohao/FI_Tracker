import { ASSET_CLASSES, type Scenario } from '@/domain/entities';
import { buildProjectionInput, BASELINE_SPEC, type ScenarioSpec } from '@/domain/baseline';
import { HISTORY, runBacktest, type BacktestSummary, type HistoricalYear } from '@/domain/backtest';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { medianReturn } from '@/domain/montecarlo/rng';
import { prepare, runProjection, type ProjectionInput, type ProjectionResult } from '@/domain/projection';
import { assumptionSetFor, type AppData } from '@/app/data';
import { dateAfterYears } from '@/lib/format';
import { chanceDots, lastsSentence, planStatus, STATUS_LABELS, type PlanStatus } from '@/domain/planStatus';
import { t, tn } from '@/i18n';

/**
 * Pure helpers behind the Strategy Lab's plain-language view (PRD R3–R6): the verdict,
 * the "vs your plan" comparison, the note when the two lenses disagree, and checks that a
 * scenario's name matches what it does.
 */

/** Id of the built-in row that always mirrors live data. */
export const TODAY_ID = '__today';
export const TODAY_NAME = t('Your plan today');

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
      ? t('On the typical path your investments do not reach your target before {horizonAge}.', {
          horizonAge: input.horizonAge,
        })
      : input.retireAtAge !== undefined
        ? t('You plan to stop working at {age} ({date}).', { age, date })
        : t('You could stop working at {age} ({date}).', { age, date });
  if (!mc) return { stop };
  const lasts = lastsSentence(mc.successRate, input.horizonAge, mc.depletionAgeP50);
  let reach: string | undefined;
  if (input.retireAtAge === undefined) {
    if (mc.fiRate >= 0.95)
      reach =
        mc.successRate < 0.95
          ? t('You reach your target in nearly every simulation; the risk comes after you stop.')
          : t('You reach your target in nearly every simulation.');
    else reach = t('You reach your target in {fiRate} of 10 simulations.', { fiRate: chanceDots(mc.fiRate) });
  }
  return { stop, lasts, reach, tier: planStatus(mc.successRate) };
}

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
      text: more
        ? tn(
            b - a,
            'you work 1 more year, so the money must last {last} years instead of {was}',
            'you work {n} more years, so the money must last {last} years instead of {was}',
            { last: h - b, was: h - a },
          )
        : tn(
            a - b,
            'you stop 1 year earlier, so the money must last {last} years instead of {was}',
            'you stop {n} years earlier, so the money must last {last} years instead of {was}',
            { last: h - b, was: h - a },
          ),
    });
  }
  const fa = base.input.fiSpending;
  const fb = other.input.fiSpending;
  if (fa > 0 && Math.abs(fb - fa) / fa >= 0.02) {
    const p = Math.round((Math.abs(fb - fa) / fa) * 100);
    out.push({
      direction: fb < fa ? 1 : -1,
      text:
        fb < fa
          ? t('you spend {p}% less each year after you stop', { p })
          : t('you spend {p}% more each year after you stop', { p }),
    });
  }
  for (const st of other.input.stress ?? [])
    if (!(base.input.stress ?? []).some((b) => b.name === st.name))
      out.push({
        direction: st.shocks.some((x) => x.d > 0) || (st.lump ?? 0) < 0 || (st.pay?.factor ?? 1) < 1 ? -1 : 1,
        text: t('of the “{name}” story', { name: st.name }),
      });
  if (other.input.crash && !base.input.crash)
    out.push({
      direction: -1,
      text: t('markets fall {round}% just after you stop, when your savings are largest', {
        round: Math.round(other.input.crash.drop * 100),
      }),
    });
  const pa = base.input.barista?.annual ?? 0;
  const pb = other.input.barista?.annual ?? 0;
  if (pa !== pb)
    out.push({
      direction: pb > pa ? 1 : -1,
      text:
        pb > pa
          ? t('part-time income covers part of your spending after you stop')
          : t('there is less part-time income after you stop'),
    });
  const ea = base.input.events.reduce((s, e) => s + e.amount, 0);
  const eb = other.input.events.reduce((s, e) => s + e.amount, 0);
  if (ea !== eb)
    out.push({
      direction: eb > ea ? 1 : -1,
      text: eb < ea ? t('of the one-off costs') : t('of the one-off money coming in'),
    });
  const sa = annualSavings(base.input);
  const sb = annualSavings(other.input);
  if (Math.abs(sb - sa) >= 12_000)
    out.push({
      direction: sb > sa ? 1 : -1,
      text: sb > sa ? t('you save more each year while working') : t('you save less each year while working'),
    });
  if (other.input.swr !== base.input.swr)
    out.push({
      direction: other.input.swr < base.input.swr ? 1 : -1,
      text: t('your yearly draw rate is {toFixed}% instead of {toFixed2}%', {
        toFixed: (other.input.swr * 100).toFixed(1),
        toFixed2: (base.input.swr * 100).toFixed(1),
      }),
    });
  if (other.input.returnShift !== base.input.returnShift)
    out.push({
      direction: other.input.returnShift > base.input.returnShift ? 1 : -1,
      text:
        other.input.returnShift > base.input.returnShift
          ? t('the scenario assumes higher market returns')
          : t('the scenario assumes lower market returns'),
    });
  if (other.input.withdrawalRule.kind !== base.input.withdrawalRule.kind)
    out.push({ direction: 1, text: t('spending adjusts to markets after you stop') });
  if (JSON.stringify(other.input.allocation) !== JSON.stringify(base.input.allocation))
    out.push({ direction: 1, text: t('your investment mix is different') });
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
    parts.push(tn(Math.abs(b - a), '{sign}1 yr work', '{sign}{n} yrs work', { sign: b > a ? '+' : '−' }));
  let points: number | undefined;
  if (baseChance !== undefined && otherChance !== undefined) {
    points = Math.round((otherChance - baseChance) * 100);
    if (points !== 0) parts.push(t('{sign}{n} pts', { sign: points > 0 ? '+' : '−', n: Math.abs(points) }));
  }
  const short = parts.length ? parts.join(' · ') : t('Same');
  if (points === undefined || Math.abs(points) < 5) return { short };
  const direction = points > 0 ? 1 : -1;
  const all = drivers(base, other);
  const main = all.find((d) => d.direction === direction);
  const word = direction > 0 ? t('Safer') : t('Riskier');
  if (!main) return { short, cause: t('{word} because of the combined changes.', { word }) };
  const against = all.find((d) => d.direction !== direction);
  const cause = t('{word} mainly because {text}{v}.', {
    word,
    text: main.text,
    v:
      against && all.indexOf(against) < all.indexOf(main)
        ? t(', even though {text}', { text: against.text })
        : '',
  });
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
    const kinder = historical > assumed ? t('Past markets look kinder') : t('Simulated futures look kinder');
    const cause =
      historical > assumed
        ? t('Simulated futures use your assumptions, so they grow less.')
        : t('Your assumptions are more optimistic than history.');
    return t(
      '{kinder} because of returns: over {years} your mix grew about {historical} a year after inflation, while your assumptions give it about {assumed} in a typical year. {cause}',
      { kinder, years, historical: fmt(historical), assumed: fmt(assumed), cause },
    );
  }
  return gap > 0
    ? t(
        'Returns are similar in both, but the random sequences in the simulations include more long bad stretches than past markets had.',
      )
    : t(
        'Returns are similar in both, but past markets had longer bad stretches (such as the 1960s–70s) than most simulated futures.',
      );
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
    return t(
      '{savingsRate} is less than you save today ({todayRate}), so this scenario saves less, not more.',
      { savingsRate: pctText(o.savingsRate), todayRate: pctText(todayRate) },
    );
  const n = name.toLowerCase();
  const sa = annualSavings(today.input);
  const sb = annualSavings(row.input);
  if (/sav/.test(n) && /more|higher|increase|raise|extra|boost/.test(n) && sb < sa - 1)
    return t('The name says save more, but this scenario saves less than you do today.');
  if (/sav/.test(n) && /less|lower|cut|reduce/.test(n) && sb > sa + 1)
    return t('The name says save less, but this scenario saves more than you do today.');
  const a = stopAge(today.result);
  const b = stopAge(row.result);
  if (a !== undefined && b !== undefined) {
    if (/(retire|stop).*(earl)/.test(n) && b > a)
      return t("The name says stop earlier, but this scenario stops at {b}, later than today's {a}.", {
        b,
        a,
      });
    if (/(retire|stop).*(later|late)/.test(n) && b < a)
      return t("The name says stop later, but this scenario stops at {b}, earlier than today's {a}.", {
        b,
        a,
      });
  }
  return undefined;
}

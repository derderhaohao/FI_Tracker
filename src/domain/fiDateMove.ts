import type { AssumptionSet, GoalSnapshot } from './entities';
import { baselineContext, buildProjectionInput, BASELINE_SPEC, type PlanData } from './baseline';
import { monthlyTotals } from './cashflow';
import { monthOf } from './dates';
import { fromMinor } from './money';
import { netWorthAt, snapshotDates } from './networth';
import { periodChanges } from './reconcile';
import { runProjection, type Bucket, type ProjectionInput, type ProjectionLiability } from './projection';
import { locale, t } from '@/i18n';

/**
 * "Why did my FI date move?" (product review, Next phase): splits the change in the
 * typical-path FI date between the last two snapshots into its causes, by swapping one
 * group of inputs at a time from the earlier state to the latest:
 *
 *   a month passing → what you saved → markets → exchange rates → pay and spending → FI goal
 *
 * Balances move along the split of the net-worth change into contributions, market
 * return and FX (the same attribution as the Snapshots page). The parts add up exactly
 * to the total move. Assumption changes are not tracked over time, so both dates use
 * today's assumptions.
 */

export type MoveKey = 'time' | 'saving' | 'market' | 'fx' | 'cashflow' | 'goal';

export const MOVE_LABELS: Record<MoveKey, string> = {
  time: t('A month went by'),
  saving: t('What you saved'),
  market: t('Markets'),
  fx: t('Exchange rates'),
  cashflow: t('Pay and spending'),
  goal: t('FI goal'),
};

export interface FiDateMove {
  fromDate: string;
  toDate: string;
  /** Months since year 0 of the typical-path FI date, fractional. */
  fromFi?: number;
  toFi?: number;
  /** Positive = later. */
  totalMonths?: number;
  parts?: { key: MoveKey; months: number }[];
}

function monthIndex(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** FI date as a fractional month index, or undefined when not reached. */
export function fiMonth(input: ProjectionInput, asOfDate: string): number | undefined {
  const r = runProjection(input);
  return r.yearsToFi === undefined ? undefined : monthIndex(asOfDate) + r.yearsToFi * 12;
}

/** "Nov 2037" from a month index. */
export function monthIndexLabel(index: number): string {
  const i = Math.round(index);
  return new Date(Date.UTC(Math.floor(i / 12), i % 12, 1)).toLocaleDateString(locale(), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type Keyed<T> = Map<string, T>;

function byKey<T extends Bucket>(list: readonly T[], key: (b: T) => string): Keyed<T> {
  const m = new Map<string, T>();
  for (const b of list) {
    const k = key(b);
    const e = m.get(k);
    m.set(k, e ? { ...e, value: e.value + b.value } : { ...b });
  }
  return m;
}

function lerpBuckets<T extends Bucket>(
  a: readonly T[],
  b: readonly T[],
  t: number,
  key: (x: T) => string,
): T[] {
  const ma = byKey(a, key);
  const mb = byKey(b, key);
  const out: T[] = [];
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const pa = ma.get(k);
    const pb = mb.get(k);
    const base = (pb ?? pa)!;
    out.push({ ...base, value: (pa?.value ?? 0) + t * ((pb?.value ?? 0) - (pa?.value ?? 0)) });
  }
  return out;
}

function lerpLiabilities(
  a: ProjectionLiability[],
  b: ProjectionLiability[],
  t: number,
): ProjectionLiability[] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => {
    const pa = a[i];
    const pb = b[i];
    const base = (pb ?? pa)!;
    return { ...base, balance: (pa?.balance ?? 0) + t * ((pb?.balance ?? 0) - (pa?.balance ?? 0)) };
  });
}

function withBalances(from: ProjectionInput, to: ProjectionInput, t: number): ProjectionInput {
  const plain = (b: Bucket) => `${b.assetClass}|${b.currency}`;
  return {
    ...from,
    liquid: lerpBuckets(from.liquid, to.liquid, t, plain),
    locked: lerpBuckets(from.locked, to.locked, t, (b) => `${plain(b)}|${b.unlockAge}|${b.pension}`),
    nonInvestable: lerpBuckets(from.nonInvestable, to.nonInvestable, t, plain),
    liabilities: lerpLiabilities(from.liabilities, to.liabilities, t),
  };
}

/** The plan data as it stood on an earlier snapshot date. */
export function dataAsOf(data: PlanData, date: string): PlanData {
  const month = monthOf(date);
  return {
    ...data,
    snapshots: data.snapshots.filter((s) => s.date <= date),
    cashFlows: data.cashFlows.filter((c) => c.month <= month),
  };
}

export function fiDateMove(
  data: PlanData,
  assumptions: AssumptionSet,
  goalHistory: readonly GoalSnapshot[] = [],
): FiDateMove | undefined {
  const dates = snapshotDates(data.snapshots);
  if (dates.length < 2) return undefined;
  const toDate = dates.at(-1)!;
  const fromDate = dates.at(-2)!;

  const prevData = dataAsOf(data, fromDate);
  const ctxPrev = baselineContext(prevData);
  const ctxCur = baselineContext(data);
  const cur = buildProjectionInput(data, assumptions, BASELINE_SPEC, ctxCur);
  let prev = buildProjectionInput(prevData, assumptions, BASELINE_SPEC, ctxPrev);
  // The goal as it was recorded on the earlier date, when goal history has it.
  const goal = [...goalHistory]
    .filter((g) => g.date <= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (goal) prev = { ...prev, fiSpending: fromMinor(goal.fiSpendingMinor), swr: goal.swr };

  const fromFi = fiMonth(prev, fromDate);
  const toFi = fiMonth(cur, toDate);
  const result: FiDateMove = { fromDate, toDate, fromFi, toFi };
  if (fromFi === undefined || toFi === undefined) return result;
  result.totalMonths = toFi - fromFi;

  // Split the balance change like the Snapshots page does.
  const series = [
    netWorthAt(fromDate, data.accounts, data.snapshots, data.fxRates, data.settings.birthYear),
    netWorthAt(toDate, data.accounts, data.snapshots, data.fxRates, data.settings.birthYear),
  ];
  const totals = monthlyTotals(data.cashFlows, data.categories, data.fxRates);
  const change = periodChanges(series, totals, data.fxRates, assumptions.assets)[0];
  const d = change.change;
  const ws = Math.abs(d) < 1 ? 0 : change.contributions / d;
  const wm = Math.abs(d) < 1 ? 0 : (change.contributions + change.marketReturn) / d;

  const steps: { key: MoveKey; input: ProjectionInput }[] = [];
  const timed = { ...prev, startAge: cur.startAge, startYear: cur.startYear, horizonAge: cur.horizonAge };
  steps.push({ key: 'time', input: timed });
  steps.push({ key: 'saving', input: withBalances(timed, cur, ws) });
  steps.push({ key: 'market', input: withBalances(timed, cur, wm) });
  steps.push({ key: 'fx', input: withBalances(timed, cur, 1) });
  const cash = {
    ...withBalances(timed, cur, 1),
    annualIncome: cur.annualIncome,
    currentSpending: cur.currentSpending,
    incomeChanges: cur.incomeChanges,
    pension: cur.pension,
  };
  steps.push({ key: 'cashflow', input: cash });
  steps.push({ key: 'goal', input: cur });

  const parts: { key: MoveKey; months: number }[] = [];
  let last = fromFi;
  for (const s of steps) {
    const m = s.key === 'goal' ? toFi : fiMonth(s.input, toDate);
    if (m === undefined) return result;
    parts.push({ key: s.key, months: m - last });
    last = m;
  }
  result.parts = parts;
  return result;
}

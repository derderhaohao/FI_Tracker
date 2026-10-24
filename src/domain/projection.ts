import {
  ASSET_CLASSES,
  type AssetAssumption,
  type AssetClass,
  type TaiwanSettings,
  type WithdrawalRule,
} from './entities';
import { defaultCurrencyFor } from './assumptions';
import { fiTarget, type GuaranteedStream } from './fiNumber';
import { BASE_CURRENCY } from './fx';
import { laborInsuranceAnnual } from './taiwan/laborInsurance';
import { amtFlag, domesticDividendTax, nhiSupplementaryPremium } from './taiwan/dividends';
import { applyWithdrawalRule } from './withdrawal';
import { shockMultiplier, type Factor, type LevelShock, type RateShock } from './playback/library';
import { medianReturn } from './montecarlo/rng';

/**
 * Year-by-year projection in real TWD (TRJ-2). The deterministic projection and the
 * Monte Carlo runner share `simulate`, so both always apply the same rules; they
 * differ only in where each year's returns, inflation and FX come from.
 */

export const N_ASSETS = ASSET_CLASSES.length;
/** Normal draws per simulated year: one per asset class, then inflation, then FX. */
export const DRAWS_PER_YEAR = N_ASSETS + 2;

export interface Bucket {
  assetClass: AssetClass;
  currency: string;
  /** Real TWD. */
  value: number;
}

export interface LockedBucket extends Bucket {
  unlockAge: number;
  /** Receives 勞退 contributions while working. */
  pension: boolean;
}

export interface ProjectionStream {
  name: string;
  startAge: number;
  endAge?: number;
  /** Today's TWD per year. */
  annual: number;
  /** When false, the nominal amount is fixed and its real value falls with inflation. */
  inflationLinked: boolean;
}

export interface ProjectionLiability {
  balance: number;
  rate: number;
  /** Nominal TWD a year, fixed, so its real value falls with inflation. */
  annualPayment: number;
  /** Monthly payments left at the start; absent = pay until the balance is cleared. */
  months?: number;
}

export interface ProjectionEvent {
  year: number;
  amount: number;
  description: string;
}

/** Plain data (no functions), so it can be sent to the Monte Carlo worker. */
export interface ProjectionInput {
  startYear: number;
  startAge: number;
  horizonAge: number;
  liquid: Bucket[];
  locked: LockedBucket[];
  nonInvestable: Bucket[];
  liabilities: ProjectionLiability[];
  /** Net annual income now, real TWD. */
  annualIncome: number;
  incomeChanges: { fromAge: number; toAge?: number; annualIncome: number }[];
  /** Annual spending while working. */
  currentSpending: number;
  /** When set, spending while working = normal income × (1 − savings rate). */
  savingsRate?: number;
  /** Annual FI-phase spending S, including post-employment costs. */
  fiSpending: number;
  streams: ProjectionStream[];
  /** Part-time income after stopping; `inTarget` false leaves it out of the money-needed target. */
  barista?: { annual: number; untilAge: number; inTarget?: boolean };
  /** When retiring at FI: keep working this many years after first reaching the target. */
  workExtraYears?: number;
  /** Spending the money-needed target is sized on, when different from FI spending. */
  targetSpending?: number;
  laborInsurance?: { settings: TaiwanSettings['laborInsurance']; claimAge: number; haircut: number };
  /** 勞退 per year while working: into the locked bucket, and the change to take-home savings. */
  pension: { employer: number; voluntary: number; liquidDelta: number; accessAge: number };
  swr: number;
  withdrawalRule: WithdrawalRule;
  /** Stop working at this age; otherwise retire as soon as FI is reached. */
  retireAtAge?: number;
  /** Target weights in ASSET_CLASSES order, summing to 1. */
  allocation: number[];
  rebalance: boolean;
  /** In ASSET_CLASSES order. */
  assets: AssetAssumption[];
  returnShift: number;
  correlations: number[][];
  inflation: number;
  inflationVolatility: number;
  salaryGrowth: number;
  fxDrift: number;
  fxVolatility: number;
  events: ProjectionEvent[];
  /** Equities fall by `drop` in total over the first `years` years after stopping work. */
  crash?: { drop: number; years: number };
  /** Library events applied to every path (EN-8), resolved and scaled by severity. */
  stress?: StressEvent[];
  taiwan: TaiwanSettings;
}

export interface StressEvent {
  name: string;
  /** Month the event starts, or after stopping work. */
  start?: number;
  afterStop?: boolean;
  shocks: LevelShock[];
  rates: RateShock[];
  pay?: { factor: number; months?: number };
  lump?: number;
}

/** How each asset class follows the library's market factors (a global fund uses the preset region split). */
const CLASS_FACTORS: Record<AssetClass, Partial<Record<Factor, number>>> = {
  cash: {},
  tw_equity: { tw_equity: 1 },
  us_equity: { us_equity: 1 },
  global_equity: { us_equity: 0.62, eu_equity: 0.15, jp_equity: 0.06, em_equity: 0.11 },
  bond: { bonds: 1 },
  property: { tw_property: 1 },
  other: {},
};

function overlap(start: number, months: number, from: number, to: number): number {
  return Math.max(0, Math.min(start + months, to) - Math.max(start, from)) / (to - from);
}

/**
 * Bends year k's draw for the stress events: market factors move by the change in their
 * shock shape over the year, rate shocks by the share of the year they run. Returns the
 * year's average pay factor and any one-off amount.
 */
export function applyStress(
  input: ProjectionInput,
  k: number,
  retireAge: number | undefined,
  draw: YearDraw,
): { pay: number; lump: number } {
  let pay = 1;
  let lump = 0;
  for (const e of input.stress ?? []) {
    const s = e.afterStop
      ? retireAge !== undefined
        ? (retireAge - input.startAge) * 12
        : undefined
      : e.start;
    if (s === undefined) continue;
    const t0 = 12 * k - s;
    const t1 = t0 + 12;
    if (t1 <= 0) continue;
    const ratio = (f: Factor) => {
      let r = 1;
      for (const sh of e.shocks) if (sh.factor === f) r *= shockMultiplier(sh, t1) / shockMultiplier(sh, t0);
      return r;
    };
    for (let i = 0; i < N_ASSETS; i++) {
      let exposed = 0;
      let moved = 0;
      for (const [f, w] of Object.entries(CLASS_FACTORS[ASSET_CLASSES[i]])) {
        exposed += w ?? 0;
        moved += (w ?? 0) * ratio(f as Factor);
      }
      draw.nominal[i] = (1 + draw.nominal[i]) * (moved + 1 - exposed) - 1;
    }
    draw.fx = (1 + draw.fx) * ratio('usd') - 1;
    for (const r of e.rates) {
      const frac = overlap(s, r.months, 12 * k, 12 * k + 12);
      if (frac <= 0) continue;
      if (r.kind === 'inflation') draw.inflation += r.pts * frac;
      else if (r.kind === 'cash') draw.nominal[classIndex.get('cash')!] += r.pts * frac;
      else if (r.kind === 'cashLevel') {
        const c = classIndex.get('cash')!;
        draw.nominal[c] = draw.nominal[c] * (1 - frac) + r.pts * frac;
      } else if (r.kind === 'equityTrend' || r.kind === 'equityRealZero') {
        for (const cls of ['tw_equity', 'us_equity', 'global_equity'] as const) {
          const c = classIndex.get(cls)!;
          draw.nominal[c] =
            r.kind === 'equityTrend'
              ? draw.nominal[c] + r.pts * frac
              : draw.nominal[c] * (1 - frac) + draw.inflation * frac;
        }
      }
    }
    if (e.pay) {
      const months = e.pay.months ?? Infinity;
      const frac = overlap(s, months === Infinity ? 1e6 : months, 12 * k, 12 * k + 12);
      pay *= 1 - frac + frac * e.pay.factor;
    }
    if (e.lump && s >= 12 * k && s < 12 * k + 12) lump += e.lump;
  }
  return { pay, lump };
}

export interface YearDraw {
  /** Nominal return per asset class, ASSET_CLASSES order. */
  nominal: Float64Array;
  inflation: number;
  /** Change in TWD per unit of foreign currency. */
  fx: number;
}

export interface YearRow {
  year: number;
  age: number;
  liquid: number;
  locked: number;
  /** Liquid + locked. */
  investable: number;
  nonInvestable: number;
  liabilities: number;
  totalNetWorth: number;
  /** Liquid needed to retire at this age: FI number plus bridge fund. */
  fiTarget: number;
  income: number;
  spending: number;
  /** Added to liquid from work (negative = drawn down while working). */
  savings: number;
  /** Drawn from liquid after FI, loan payments included. */
  withdrawal: number;
  /** Loan payments from the terms in Accounts: out of savings while working, withdrawn after FI. */
  loanPayments: number;
  streamIncome: number;
  pensionContribution: number;
  eventAmount: number;
  taxDrag: number;
  overseasIncome: number;
  amt: boolean;
  retired: boolean;
  /** Cumulative inflation since the start, for nominal display. */
  inflationIndex: number;
}

export interface ProjectionResult {
  rows: YearRow[];
  /** Investable (liquid + locked) per age, startAge..horizonAge. */
  investable: Float64Array;
  fiAge?: number;
  /** Fractional years from the start until FI, interpolated between years. */
  yearsToFi?: number;
  retireAge?: number;
  success: boolean;
  depletionAge?: number;
  balanceAtHorizon: number;
  netWorthAtFi?: number;
  /** Lowest spending as a share of planned FI spending after retiring (1 = never cut). */
  minSpendingRatio: number;
  amtAges: number[];
}

interface Prepared {
  input: ProjectionInput;
  years: number;
  /** FI target per age offset 0..years. */
  required: Float64Array;
}

export function laborInsuranceYears(input: ProjectionInput, retireAge: number): number {
  return (input.laborInsurance?.settings.insuredYearsToDate ?? 0) + Math.max(0, retireAge - input.startAge);
}

/** Guaranteed streams as seen when retiring at `retireAge`, valued in real TWD at their start. */
export function guaranteedStreams(input: ProjectionInput, retireAge: number): GuaranteedStream[] {
  const out: GuaranteedStream[] = input.streams.map((s) => ({
    startAge: s.startAge,
    endAge: s.endAge,
    annual: s.inflationLinked
      ? s.annual
      : s.annual / Math.pow(1 + input.inflation, Math.max(0, s.startAge - input.startAge)),
  }));
  if (input.laborInsurance) {
    const li = input.laborInsurance;
    const annual = laborInsuranceAnnual(
      li.settings,
      laborInsuranceYears(input, retireAge),
      li.claimAge,
      li.haircut,
    );
    if (annual > 0) out.push({ startAge: li.claimAge, annual });
  }
  if (
    input.barista &&
    input.barista.inTarget !== false &&
    input.barista.untilAge > retireAge &&
    input.barista.annual > 0
  ) {
    out.push({ startAge: retireAge, endAge: input.barista.untilAge, annual: input.barista.annual });
  }
  return out;
}

/** Loan payments still due after stopping at `retireAge`, as negative temporary income (real TWD). */
export function loanStreams(input: ProjectionInput, retireAge: number): GuaranteedStream[] {
  const out: GuaranteedStream[] = [];
  for (const l of input.liabilities) {
    if (l.annualPayment <= 0 || l.months === undefined || l.months <= 0) continue;
    const endAge = Math.round(input.startAge + l.months / 12);
    if (endAge <= retireAge) continue;
    const years = Math.max(0, retireAge - input.startAge);
    out.push({
      startAge: retireAge,
      endAge,
      annual: -l.annualPayment / Math.pow(1 + input.inflation, years),
    });
  }
  return out;
}

/** What the money needed at `retireAge` must cover: guaranteed income, less loans still running. */
export function targetStreams(input: ProjectionInput, retireAge: number): GuaranteedStream[] {
  return [...guaranteedStreams(input, retireAge), ...loanStreams(input, retireAge)];
}

export function prepare(input: ProjectionInput): Prepared {
  const years = Math.max(0, input.horizonAge - input.startAge);
  const required = new Float64Array(years + 1);
  for (let k = 0; k <= years; k++) {
    const age = input.startAge + k;
    required[k] = fiTarget(
      input.targetSpending ?? input.fiSpending,
      targetStreams(input, age),
      input.swr,
      age,
      input.horizonAge,
    );
  }
  return { input, years, required };
}

/**
 * Typical-year draw used by the deterministic projection: each class returns its median
 * (compounded) return, so the typical path sits inside the Monte Carlo middle band
 * instead of above it. With zero volatility this is the expected return.
 */
export function expectedDraw(input: ProjectionInput): YearDraw {
  const nominal = new Float64Array(N_ASSETS);
  for (let i = 0; i < N_ASSETS; i++)
    nominal[i] = medianReturn(input.assets[i].expectedReturn + input.returnShift, input.assets[i].volatility);
  return { nominal, inflation: input.inflation, fx: input.fxDrift };
}

const EQUITY = new Set<AssetClass>(['tw_equity', 'us_equity', 'global_equity']);

export const classIndex = new Map<AssetClass, number>(ASSET_CLASSES.map((c, i) => [c, i]));

function total(buckets: readonly Bucket[]): number {
  let s = 0;
  for (const b of buckets) s += b.value;
  return s;
}

function addTo(buckets: Bucket[], assetClass: AssetClass, currency: string, amount: number): void {
  const b = buckets.find((x) => x.assetClass === assetClass && x.currency === currency);
  if (b) b.value += amount;
  else buckets.push({ assetClass, currency, value: amount });
}

/** Adds `amount` to one class, split by the currencies already held in it. */
function depositToClass(liquid: Bucket[], assetClass: AssetClass, amount: number): void {
  const inClass = liquid.filter((b) => b.assetClass === assetClass && b.value > 0);
  const classTotal = total(inClass);
  if (classTotal <= 0) {
    addTo(liquid, assetClass, defaultCurrencyFor(assetClass), amount);
    return;
  }
  for (const b of inClass) b.value += (amount * b.value) / classTotal;
}

function deposit(liquid: Bucket[], allocation: readonly number[], amount: number): void {
  for (let i = 0; i < N_ASSETS; i++) {
    if (allocation[i] > 0) depositToClass(liquid, ASSET_CLASSES[i], amount * allocation[i]);
  }
}

/** Withdraws proportionally; returns false when the portfolio could not cover it. */
function withdraw(liquid: Bucket[], amount: number): boolean {
  const t = total(liquid);
  if (amount <= 0) return true;
  if (t <= 0 || amount > t) {
    for (const b of liquid) b.value = 0;
    return amount <= 0;
  }
  const keep = 1 - amount / t;
  for (const b of liquid) b.value *= keep;
  return true;
}

function rebalance(liquid: Bucket[], allocation: readonly number[]): void {
  const t = total(liquid);
  if (t <= 0) return;
  const before = liquid.map((b) => ({ ...b }));
  for (const b of liquid) b.value = 0;
  for (let i = 0; i < N_ASSETS; i++) {
    const c = ASSET_CLASSES[i];
    const target = t * allocation[i];
    if (target <= 0) continue;
    const inClass = before.filter((b) => b.assetClass === c && b.value > 0);
    const classTotal = total(inClass);
    if (classTotal <= 0) addTo(liquid, c, defaultCurrencyFor(c), target);
    else for (const b of inClass) addTo(liquid, c, b.currency, (target * b.value) / classTotal);
  }
}

export function incomeFor(input: ProjectionInput, age: number, base: number, factor: number): number {
  for (const ch of input.incomeChanges) {
    if (age >= ch.fromAge && (ch.toAge === undefined || age < ch.toAge)) return ch.annualIncome * factor;
  }
  return base;
}

export function streamIncomeAt(
  input: ProjectionInput,
  age: number,
  retireAge: number,
  inflationIndex: number,
  laborAnnual: number,
): number {
  let sum = 0;
  for (const s of input.streams) {
    if (age < s.startAge || (s.endAge !== undefined && age >= s.endAge)) continue;
    sum += s.inflationLinked ? s.annual : s.annual / inflationIndex;
  }
  if (input.laborInsurance && age >= input.laborInsurance.claimAge) sum += laborAnnual;
  if (input.barista && age >= retireAge && age < input.barista.untilAge) sum += input.barista.annual;
  return sum;
}

/**
 * Runs one path. `fillDraw(k, draw)` writes year k's returns, inflation and FX into `draw`.
 * With `recordRows` false only the investable series and summary are kept (Monte Carlo).
 */
export function simulate(
  prep: Prepared,
  fillDraw: (k: number, draw: YearDraw) => void,
  recordRows: boolean,
): ProjectionResult {
  const { input, years, required } = prep;
  const tw = input.taiwan;
  const liquid: Bucket[] = input.liquid.map((b) => ({ ...b }));
  let locked: LockedBucket[] = input.locked.map((b) => ({ ...b }));
  const nonInv: Bucket[] = input.nonInvestable.map((b) => ({ ...b }));
  const liabilities = input.liabilities.map((l) => ({ ...l }));
  const investable = new Float64Array(years + 1);
  const rows: YearRow[] = [];
  const draw: YearDraw = { nominal: new Float64Array(N_ASSETS), inflation: 0, fx: 0 };
  const amtAges: number[] = [];

  if (input.pension.employer + input.pension.voluntary > 0 && !locked.some((b) => b.pension)) {
    locked.push({
      assetClass: 'other',
      currency: BASE_CURRENCY,
      value: 0,
      unlockAge: input.pension.accessAge,
      pension: true,
    });
  }

  let inflationIndex = 1;
  let incomeFactor = 1;
  let fiAge: number | undefined;
  let yearsToFi: number | undefined;
  let retireAge: number | undefined;
  let depletionAge: number | undefined;
  let netWorthAtFi: number | undefined;
  let spendingNow = input.fiSpending;
  let laborAnnual = 0;
  let minSpendingRatio = 1;

  const record = (k: number, flows: Partial<YearRow>) => {
    const age = input.startAge + k;
    const l = total(liquid);
    const lk = total(locked);
    const ni = total(nonInv);
    const debt = liabilities.reduce((s, x) => s + x.balance, 0);
    investable[k] = l + lk;
    if (recordRows) {
      rows.push({
        year: input.startYear + k,
        age,
        liquid: l,
        locked: lk,
        investable: l + lk,
        nonInvestable: ni,
        liabilities: debt,
        totalNetWorth: l + lk + ni - debt,
        fiTarget: required[k],
        income: 0,
        spending: 0,
        savings: 0,
        withdrawal: 0,
        loanPayments: 0,
        streamIncome: 0,
        pensionContribution: 0,
        eventAmount: 0,
        taxDrag: 0,
        overseasIncome: 0,
        amt: false,
        retired: retireAge !== undefined && age > retireAge,
        inflationIndex,
        ...flows,
      });
    }
    return l;
  };

  const checkFi = (k: number, liquidNow: number, liquidPrev: number) => {
    if (fiAge !== undefined || liquidNow < required[k]) return;
    fiAge = input.startAge + k;
    netWorthAtFi = investable[k];
    if (k === 0) {
      yearsToFi = 0;
    } else {
      const gapPrev = liquidPrev - required[k - 1];
      const gapNow = liquidNow - required[k];
      const frac = gapNow - gapPrev > 0 ? Math.min(1, Math.max(0, -gapPrev / (gapNow - gapPrev))) : 1;
      yearsToFi = k - 1 + frac;
    }
  };

  let liquidPrev = record(0, {});
  checkFi(0, liquidPrev, liquidPrev);

  for (let k = 0; k < years; k++) {
    const age = input.startAge + k;
    const retired =
      input.retireAtAge !== undefined
        ? age >= input.retireAtAge
        : fiAge !== undefined && age >= fiAge + (input.workExtraYears ?? 0);
    if (retired && retireAge === undefined) {
      retireAge = age;
      spendingNow = input.fiSpending;
      if (input.laborInsurance) {
        const li = input.laborInsurance;
        laborAnnual = laborInsuranceAnnual(
          li.settings,
          laborInsuranceYears(input, age),
          li.claimAge,
          li.haircut,
        );
      }
    }
    fillDraw(k, draw);
    if (input.crash && retireAge !== undefined && age < retireAge + input.crash.years) {
      const yearly = Math.pow(1 - input.crash.drop, 1 / input.crash.years) - 1;
      for (let i = 0; i < N_ASSETS; i++) if (EQUITY.has(ASSET_CLASSES[i])) draw.nominal[i] = yearly;
    }
    const stress = input.stress?.length ? applyStress(input, k, retireAge, draw) : { pay: 1, lump: 0 };
    const flows: Partial<YearRow> = { retired };

    // 1. Events for this year.
    let eventAmount = 0;
    for (const e of input.events) if (e.year === input.startYear + k) eventAmount += e.amount;
    eventAmount += stress.lump;
    if (eventAmount > 0) deposit(liquid, input.allocation, eventAmount);
    else if (eventAmount < 0 && !withdraw(liquid, -eventAmount) && depletionAge === undefined)
      depletionAge = age;
    flows.eventAmount = eventAmount;

    // Loan payments this year, from the terms in Accounts. The final year clears what is left.
    const growth = 1 + draw.inflation;
    let loanPaid = 0;
    const loanDue = liabilities.map((l) => {
      const due = l.balance * (1 + l.rate);
      if (l.annualPayment <= 0 || due <= 0 || (l.months !== undefined && l.months <= 0))
        return { due, paid: 0 };
      const n = l.months === undefined ? 12 : Math.min(12, l.months);
      const last = l.months !== undefined && l.months <= 12;
      const paid = last ? due : Math.min(due, (l.annualPayment * n) / 12 / inflationIndex);
      loanPaid += paid;
      return { due, paid };
    });
    flows.loanPayments = loanPaid;

    // 2–3. This year's flows, decided at the start of the year. They land mid-year, so they
    // earn half a year's return: the same as spreading them over twelve months, which keeps
    // this yearly engine in step with the monthly playback engine.
    let applyFlows: () => void;
    if (!retired) {
      // 2. Before FI: savings to liquid by target allocation, 勞退 to locked.
      const base = input.annualIncome * incomeFactor;
      const income = incomeFor(input, age, base, incomeFactor) * stress.pay;
      // A savings-rate lever sets the total going out, loan payments included.
      const spending =
        input.savingsRate !== undefined
          ? Math.max(0, base * (1 - input.savingsRate) - loanPaid)
          : input.currentSpending;
      const working = income > 0 ? incomeFactor : 0;
      const savings = income - spending - loanPaid + input.pension.liquidDelta * working;
      const contribution = (input.pension.employer + input.pension.voluntary) * working;
      applyFlows = () => {
        if (savings >= 0) deposit(liquid, input.allocation, savings);
        else if (!withdraw(liquid, -savings) && depletionAge === undefined) depletionAge = age;
        if (contribution > 0) {
          const pensionBucket = locked.find((b) => b.pension);
          if (pensionBucket) pensionBucket.value += contribution;
          else addTo(liquid, 'other', BASE_CURRENCY, contribution);
        }
      };
      Object.assign(flows, { income, spending, savings, pensionContribution: contribution });
    } else {
      // 3. After FI: withdraw spending minus active income streams.
      const streamIncome = streamIncomeAt(input, age, retireAge ?? age, inflationIndex, laborAnnual);
      const portfolio = total(liquid);
      let yieldSum = 0;
      for (const b of liquid)
        yieldSum += b.value * input.assets[classIndex.get(b.assetClass) ?? 0].dividendYield;
      const result = applyWithdrawalRule(input.withdrawalRule, {
        portfolio,
        spending: spendingNow,
        plannedSpending: input.fiSpending,
        streamIncome,
        dividendYield: portfolio > 0 ? yieldSum / portfolio : 0,
        swr: input.swr,
      });
      spendingNow = result.spending;
      if (input.fiSpending > 0)
        minSpendingRatio = Math.min(minSpendingRatio, result.spending / input.fiSpending);
      const out = result.withdrawal + loanPaid;
      applyFlows = () => {
        if (out >= 0) {
          if (!withdraw(liquid, out) && depletionAge === undefined) depletionAge = age;
        } else {
          deposit(liquid, input.allocation, -out);
        }
      };
      Object.assign(flows, { spending: result.spending, withdrawal: out, streamIncome });
    }

    // 4. Returns net of fees and Taiwan frictions; 5. FX on foreign-currency assets.
    // Applied in two halves around the flows.
    let taxDrag = 0;
    let overseasIncome = 0;
    const halfYear = () => {
      for (const b of liquid) {
        if (b.value <= 0) continue;
        const a = input.assets[classIndex.get(b.assetClass) ?? 0];
        let drag = 0;
        if (a.dividendYield > 0 && b.assetClass !== 'cash') {
          const dividendsNominal = b.value * a.dividendYield * inflationIndex;
          if (b.currency !== BASE_CURRENCY) {
            drag = a.dividendYield * tw.usWithholdingRate;
            overseasIncome += dividendsNominal / 2;
          } else if (b.assetClass === 'tw_equity') {
            const tax =
              domesticDividendTax(dividendsNominal, tw) + nhiSupplementaryPremium(dividendsNominal, tw);
            drag = tax / (b.value * inflationIndex);
          }
        }
        taxDrag += (drag * b.value) / 2;
        b.value *= Math.sqrt((1 + draw.nominal[classIndex.get(b.assetClass) ?? 0] - a.fee - drag) / growth);
      }
      for (const b of [...locked, ...nonInv]) {
        const i = classIndex.get(b.assetClass) ?? 0;
        b.value *= Math.sqrt((1 + draw.nominal[i] - input.assets[i].fee) / growth);
      }
      const fxHalf = Math.sqrt(1 + draw.fx);
      for (const b of [...liquid, ...locked, ...nonInv]) {
        if (b.currency !== BASE_CURRENCY) b.value *= fxHalf;
      }
    };
    halfYear();
    applyFlows();
    halfYear();
    liabilities.forEach((l, i) => {
      l.balance = Math.max(0, loanDue[i].due - loanDue[i].paid) / growth;
      if (l.months !== undefined) l.months = Math.max(0, l.months - 12);
    });
    inflationIndex *= growth;
    incomeFactor *= (1 + input.salaryGrowth) / growth;

    // 6. Unlock buckets that reach their access age.
    const nextAge = age + 1;
    const stillLocked: LockedBucket[] = [];
    for (const b of locked) {
      if (b.unlockAge <= nextAge) addTo(liquid, b.assetClass, b.currency, b.value);
      else stillLocked.push(b);
    }
    locked = stillLocked;
    if (input.rebalance) rebalance(liquid, input.allocation);

    const amt = amtFlag(overseasIncome, tw);
    if (amt) amtAges.push(age);
    Object.assign(flows, { taxDrag, overseasIncome, amt });

    // 7. Check FI; 8. record the year.
    const liquidNow = record(k + 1, flows);
    checkFi(k + 1, liquidNow, liquidPrev);
    liquidPrev = liquidNow;
  }

  return {
    rows,
    investable,
    fiAge,
    yearsToFi,
    retireAge,
    success: depletionAge === undefined,
    depletionAge,
    balanceAtHorizon: investable[years],
    netWorthAtFi,
    minSpendingRatio,
    amtAges,
  };
}

/** Deterministic projection with expected returns (TRJ-2, TRJ-3, TRJ-5). */
export function runProjection(input: ProjectionInput): ProjectionResult {
  const prep = prepare(input);
  const expected = expectedDraw(input);
  return simulate(
    prep,
    (_k, d) => {
      d.nominal.set(expected.nominal);
      d.inflation = expected.inflation;
      d.fx = expected.fx;
    },
    true,
  );
}

/** Typical (median) real return of the target allocation, net of fees (for closed-form estimates). */
export function portfolioRealReturn(input: ProjectionInput): number {
  let r = 0;
  for (let i = 0; i < N_ASSETS; i++) {
    const a = input.assets[i];
    const typical = medianReturn(a.expectedReturn + input.returnShift, a.volatility);
    r += input.allocation[i] * ((1 + typical - a.fee) / (1 + input.inflation) - 1);
  }
  return r;
}

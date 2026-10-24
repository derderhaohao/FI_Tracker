import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type Account,
  type AssetClass,
  type AssumptionSet,
  type Behaviour,
  type CustomEvent,
  type Exposure,
  type PlaybackSettings,
  type Severity,
  type StoryEvent,
} from '../entities';
import { defaultCurrencyFor } from '../assumptions';
import { buildProjectionInput, type BaselineContext, type PlanData, type ScenarioSpec } from '../baseline';
import { BASE_CURRENCY } from '../fx';
import { mulberry32, normalSource, medianReturn } from '../montecarlo/rng';
import {
  classIndex,
  incomeFor,
  laborInsuranceYears,
  prepare,
  streamIncomeAt,
  type ProjectionInput,
} from '../projection';
import { laborInsuranceAnnual } from '../taiwan/laborInsurance';
import { amtFlag, domesticDividendTax, nhiSupplementaryPremium } from '../taiwan/dividends';
import { applyWithdrawalRule } from '../withdrawal';
import {
  EQUITY_FACTORS,
  eventLength,
  FACTORS,
  findEvent,
  scaleShock,
  SEVERITY_SCALE,
  shockMultiplier,
  type EventDef,
  type Factor,
  type LevelShock,
  type RateShock,
  type Timing,
} from './library';
import { t } from '@/i18n';

/**
 * Monthly playback engine (PRD EN-1 to EN-5). It follows the yearly projection's rules
 * account by account, one month at a time: flows land mid-month, returns compound
 * monthly, salary, 勞退, 勞保 and withdrawal decisions happen at each model year's start,
 * and unlocks, rebalancing and the FI check at its end. With the Normal story and no
 * noise its year-end values match the yearly projection (tested). Event shocks move
 * named market factors; each account follows the factors it is exposed to.
 */

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  pensionMix: { tw_equity: 0.3, global_equity: 0.3, bond: 0.4 },
  pensionFloor: 0.017,
  autoPause: true,
  pauseOnFire: false,
  favourites: ['gfc', 'blockade', 'job_loss', 'ai_boom', 'pay_rise', 'windfall'],
};

/** A global fund's default region split (DM-4). */
export const DEFAULT_GLOBAL_SPLIT: Required<Exposure> = {
  TW: 0,
  US: 0.62,
  EU: 0.15,
  JP: 0.06,
  EM: 0.11,
  Other: 0.06,
};

export type RegionKey = 'TW' | 'US' | 'JP' | 'EU' | 'EM' | 'Other';
export const REGION_KEY_LABELS: Record<RegionKey, string> = {
  TW: t('Taiwan'),
  US: 'US',
  JP: t('Japan'),
  EU: t('Europe'),
  EM: t('China/EM'),
  Other: t('Other'),
};

const REGION_FACTOR: Partial<Record<RegionKey, Factor>> = {
  TW: 'tw_equity',
  US: 'us_equity',
  JP: 'jp_equity',
  EU: 'eu_equity',
  EM: 'em_equity',
};

export type Bucket = 'liquid' | 'locked' | 'nonInvestable' | 'liability';

export interface PlaybackAccount {
  id: string;
  name: string;
  cls: AssetClass;
  currency: string;
  bucket: Bucket;
  unlockAge?: number;
  pension: boolean;
  insurance: boolean;
  /** Market factors that move this account in events, as shares (the rest follows the backdrop only). */
  exposure: Partial<Record<Factor, number>>;
  /** Region split for the region view. */
  regions: Partial<Record<RegionKey, number>>;
  fx?: Factor;
  /** Real TWD at the start (owed amount for liabilities). */
  value0: number;
  rate?: number;
  /** Nominal TWD a year, from the loan terms in Accounts. */
  payment?: number;
  /** Monthly payments left at the start. */
  months?: number;
  floating?: boolean;
  /** Created for new savings in a class with no account yet. */
  synthetic?: boolean;
}

function regionOfCurrency(currency: string): RegionKey {
  if (currency === 'TWD') return 'TW';
  if (currency === 'USD') return 'US';
  if (currency === 'JPY') return 'JP';
  if (currency === 'EUR') return 'EU';
  if (currency === 'CNY' || currency === 'HKD') return 'EM';
  return 'Other';
}

function splitOf(exposure: Exposure | undefined): Partial<Record<RegionKey, number>> {
  const src = exposure && Object.values(exposure).some((v) => (v ?? 0) > 0) ? exposure : DEFAULT_GLOBAL_SPLIT;
  const sum = Object.values(src).reduce<number>((a, b) => a + (b ?? 0), 0) || 1;
  const out: Partial<Record<RegionKey, number>> = {};
  for (const [k, v] of Object.entries(src)) if ((v ?? 0) > 0) out[k as RegionKey] = (v ?? 0) / sum;
  return out;
}

/** Region split of an account (DM-3, DM-4). */
export function regionsOf(
  a: Pick<Account, 'assetClass' | 'currency' | 'region' | 'exposure' | 'type'>,
): Partial<Record<RegionKey, number>> {
  if (a.region && a.region !== 'Global') return { [a.region]: 1 };
  if (a.region === 'Global' || (a.assetClass === 'global_equity' && !a.region)) return splitOf(a.exposure);
  if (a.assetClass === 'tw_equity') return { TW: 1 };
  if (a.assetClass === 'us_equity') return { US: 1 };
  return { [regionOfCurrency(a.currency)]: 1 };
}

function propertyFactor(a: Pick<Account, 'currency' | 'location'>): Factor {
  const loc = a.location ?? (a.currency === 'USD' ? 'us' : a.currency === 'JPY' ? 'other_jp' : 'other_tw');
  if (loc === 'taipei') return 'taipei_property';
  if (loc === 'tokyo' || loc === 'other_jp') return 'jp_property';
  if (loc === 'us') return 'us_property';
  return 'tw_property';
}

function equityExposure(regions: Partial<Record<RegionKey, number>>): Partial<Record<Factor, number>> {
  const out: Partial<Record<Factor, number>> = {};
  for (const [k, v] of Object.entries(regions)) {
    const f = REGION_FACTOR[k as RegionKey];
    if (f && v) out[f] = (out[f] ?? 0) + v;
  }
  return out;
}

/** The market factors an account follows in events. */
export function exposureOf(
  a: Pick<Account, 'assetClass' | 'currency' | 'region' | 'exposure' | 'location' | 'type'>,
  pensionMix: PlaybackSettings['pensionMix'],
): Partial<Record<Factor, number>> {
  if (a.type === 'pension') {
    const g = equityExposure(splitOf(undefined));
    const out: Partial<Record<Factor, number>> = { tw_equity: pensionMix.tw_equity, bonds: pensionMix.bond };
    for (const [f, v] of Object.entries(g))
      out[f as Factor] = (out[f as Factor] ?? 0) + (v ?? 0) * pensionMix.global_equity;
    return out;
  }
  if (a.type === 'insurance') return {};
  if (a.assetClass === 'bond') return { bonds: 1 };
  if (a.assetClass === 'property') return { [propertyFactor(a)]: 1 };
  if (a.assetClass === 'tw_equity' || a.assetClass === 'us_equity' || a.assetClass === 'global_equity')
    return equityExposure(regionsOf(a));
  return {};
}

function fxFactorOf(currency: string): Factor | undefined {
  return currency === 'USD' ? 'usd' : currency === 'JPY' ? 'jpy' : undefined;
}

export interface PlaybackSetup {
  input: ProjectionInput;
  accounts: PlaybackAccount[];
  asOfDate: string;
  pensionFloor: number;
}

/** Builds the account list for playback from the same balances as the projection. */
export function playbackSetup(
  data: PlanData,
  assumptions: AssumptionSet,
  spec: ScenarioSpec,
  ctx: BaselineContext,
  playback: PlaybackSettings = DEFAULT_PLAYBACK_SETTINGS,
): PlaybackSetup {
  const input = buildProjectionInput(data, assumptions, spec, ctx);
  const accounts: PlaybackAccount[] = [];
  let pensionTaken = false;
  // Liabilities come in the same order as the projection input's.
  let liabilityIndex = 0;
  for (const b of ctx.netWorth.balances) {
    const a = b.account;
    const regions = regionsOf(a);
    const base = {
      id: a.id,
      name: a.nickname,
      cls: a.assetClass,
      currency: a.currency,
      insurance: a.type === 'insurance',
      exposure: exposureOf(a, playback.pensionMix),
      regions,
      fx: fxFactorOf(a.currency),
      pension: false,
    };
    if (b.bucket === 'liability') {
      const terms = data.liabilities.find((l) => l.accountId === a.id);
      const loan = input.liabilities[liabilityIndex++];
      accounts.push({
        ...base,
        bucket: 'liability',
        exposure: {},
        value0: b.twd,
        rate: terms?.interestRate ?? 0,
        payment: loan?.annualPayment ?? 0,
        months: loan?.months,
        floating: terms?.floating ?? false,
      });
    } else if (b.bucket === 'locked') {
      const pension = a.type === 'pension' && !pensionTaken;
      if (pension) pensionTaken = true;
      accounts.push({
        ...base,
        bucket: 'locked',
        unlockAge: a.accessAge ?? ctx.startAge,
        pension,
        value0: b.twd,
      });
    } else {
      accounts.push({ ...base, bucket: b.bucket, value0: b.twd });
    }
  }
  // New savings in a class with no holdings land in a synthetic account, as in the projection.
  for (const cls of ASSET_CLASSES) {
    const currency = defaultCurrencyFor(cls);
    const fake = { assetClass: cls, currency, type: 'brokerage' as const };
    accounts.push({
      id: `new:${cls}`,
      name: t('New savings: {ASSET_CLASS_LABELS}', { ASSET_CLASS_LABELS: ASSET_CLASS_LABELS[cls] }),
      cls,
      currency,
      bucket: 'liquid',
      pension: false,
      insurance: false,
      exposure: exposureOf(fake, playback.pensionMix),
      regions: regionsOf(fake),
      fx: fxFactorOf(currency),
      value0: 0,
      synthetic: true,
    });
  }
  if (!pensionTaken && input.pension.employer + input.pension.voluntary > 0) {
    const fake = { assetClass: 'other' as AssetClass, currency: BASE_CURRENCY, type: 'pension' as const };
    accounts.push({
      id: 'new:pension',
      name: '勞退 contributions',
      cls: 'other',
      currency: BASE_CURRENCY,
      bucket: 'locked',
      unlockAge: input.pension.accessAge,
      pension: true,
      insurance: false,
      exposure: exposureOf(fake, playback.pensionMix),
      regions: { TW: 1 },
      value0: 0,
      synthetic: true,
    });
  }
  return { input, accounts, asOfDate: ctx.asOfDate, pensionFloor: playback.pensionFloor };
}

// ---------- Stories ----------

export interface ResolvedEvent {
  uid: string;
  def: EventDef;
  start: number;
  severity: Severity;
  source: StoryEvent['source'] | 'backdrop';
  shocks: LevelShock[];
  rates: RateShock[];
  /** Take-home pay multiplier and its length in months (undefined = for good). */
  pay?: { factor: number; months?: number };
  lump?: number;
  /** Months the event runs. */
  length: number;
}

export interface PlaybackStory {
  backdrop: string;
  events: StoryEvent[];
  behaviour: Behaviour;
  noiseSeed?: number;
}

export const NORMAL_STORY: PlaybackStory = { backdrop: 'normal', events: [], behaviour: { kind: 'keep' } };

/** Month a timing points at, given the Normal story's stop-work month. */
export function resolveTiming(
  t: Timing,
  startAge: number,
  stopMonth: number | undefined,
  months: number,
): number {
  let m: number;
  if (t.kind === 'inYears') m = t.years * 12;
  else if (t.kind === 'afterStop') m = stopMonth ?? 120;
  else if (t.kind === 'beforeStop') m = (stopMonth ?? 120) - t.months;
  else m = (t.age - startAge) * 12;
  return Math.max(0, Math.min(months - 1, Math.round(m)));
}

export function resolveEvent(
  e: Pick<StoryEvent, 'uid' | 'eventId' | 'start' | 'severity' | 'amount'> & {
    source: ResolvedEvent['source'];
  },
  custom: readonly CustomEvent[] = [],
): ResolvedEvent | undefined {
  const def = findEvent(e.eventId, custom);
  if (!def) return undefined;
  const k = SEVERITY_SCALE[e.severity];
  const pay = def.pay
    ? (() => {
        const f = e.amount !== undefined && def.lump === undefined ? e.amount : def.pay.factor;
        return {
          factor: f < 1 ? 1 - (1 - f) * k : 1 + (f - 1) * k,
          months: def.pay.months !== undefined ? Math.round(def.pay.months * k) : undefined,
        };
      })()
    : undefined;
  return {
    uid: e.uid,
    def,
    start: e.start,
    severity: e.severity,
    source: e.source,
    shocks: def.shocks.map((s) => scaleShock(s, e.severity)),
    rates: (def.rates ?? []).map((r) => ({
      ...r,
      pts: r.pts * k,
      months: r.months >= 1200 ? r.months : Math.round(r.months * k),
    })),
    pay,
    lump: def.lump !== undefined ? (e.amount !== undefined ? e.amount : def.lump * k) : undefined,
    length: eventLength(def, e.severity),
  };
}

export function resolveStory(
  story: PlaybackStory,
  custom: readonly CustomEvent[] = [],
  startAge = 0,
  stopMonth?: number,
  months = 1200,
): ResolvedEvent[] {
  const out: ResolvedEvent[] = [];
  const backdrop = findEvent(story.backdrop);
  if (backdrop && backdrop.id !== 'normal') {
    const r = resolveEvent(
      {
        uid: 'backdrop',
        eventId: backdrop.id,
        start: resolveTiming(backdrop.defaultStart, startAge, stopMonth, months),
        severity: 'typical',
        source: 'backdrop',
      },
      custom,
    );
    if (r) out.push(r);
  }
  for (const e of story.events) {
    const r = resolveEvent(e, custom);
    if (r) out.push(r);
  }
  return out;
}

// ---------- The engine ----------

interface EngineState {
  values: number[];
  liquidMask: boolean[];
  guaranteed: number;
  inflationIndex: number;
  incomeFactor: number;
  fiAge?: number;
  yearsToFi?: number;
  netWorthAtFi?: number;
  retireAge?: number;
  spendingNow: number;
  laborAnnual: number;
  /** This model year's monthly flow: + saving, − withdrawal (before pay shocks). */
  monthlySavings: number;
  monthlyIncome: number;
  monthlyPension: number;
  monthlyWithdrawal: number;
  retiredThisYear: boolean;
  depletionMonth?: number;
  minSpendingRatio: number;
  dragRates: number[];
  overseasIncome: number;
  yearInflation: number;
  liquidYearStart: number;
  sold?: { since: number; level: number };
  amtAges: number[];
}

export interface PlaybackPath {
  setup: PlaybackSetup;
  events: ResolvedEvent[];
  months: number;
  startAge: number;
  /** Per month 0..months: account values in real TWD (liabilities as amounts owed). */
  values: Float64Array[];
  liquid: Float64Array;
  locked: Float64Array;
  nonInvestable: Float64Array;
  debt: Float64Array;
  investable: Float64Array;
  total: Float64Array;
  fiTarget: Float64Array;
  inflationIndex: Float64Array;
  /** Money added to (+) or taken from (−) investments during each month, before returns. */
  flow: Float64Array;
  /** Whether each account was usable (liquid) in each month. */
  liquidMask: Uint8Array[];
  retired: Uint8Array;
  fiAge?: number;
  yearsToFi?: number;
  retireAge?: number;
  retireMonth?: number;
  depletionMonth?: number;
  netWorthAtFi?: number;
  minSpendingRatio: number;
  amtAges: number[];
  /** Engine state at the start of each month, for recomputing from a month (EN-3). */
  states: EngineState[];
  /** Combined level per factor per month (1 = no event), for banners and warnings. */
  factorLevels: Record<Factor, Float64Array>;
}

function cloneState(s: EngineState): EngineState {
  return {
    ...s,
    values: [...s.values],
    liquidMask: [...s.liquidMask],
    dragRates: [...s.dragRates],
    sold: s.sold ? { ...s.sold } : undefined,
    amtAges: [...s.amtAges],
  };
}

/** Combined multiplier per factor per month, from all events. */
function factorPaths(events: ResolvedEvent[], months: number): Record<Factor, Float64Array> {
  const out = {} as Record<Factor, Float64Array>;
  for (const f of FACTORS) {
    const arr = new Float64Array(months + 2).fill(1);
    for (const e of events)
      for (const s of e.shocks) {
        if (s.factor !== f) continue;
        for (let m = Math.max(0, e.start); m <= months + 1; m++) arr[m] *= shockMultiplier(s, m - e.start);
      }
    out[f] = arr;
  }
  return out;
}

function rateAt(events: ResolvedEvent[], kind: RateShock['kind'], m: number): number {
  let sum = 0;
  for (const e of events)
    for (const r of e.rates) if (r.kind === kind && m >= e.start && m < e.start + r.months) sum += r.pts;
  return sum;
}

function rateActive(events: ResolvedEvent[], kind: RateShock['kind'], m: number): RateShock | undefined {
  for (const e of events)
    for (const r of e.rates) if (r.kind === kind && m >= e.start && m < e.start + r.months) return r;
  return undefined;
}

function payFactorAt(events: ResolvedEvent[], m: number): number {
  let f = 1;
  for (const e of events)
    if (e.pay && m >= e.start && (e.pay.months === undefined || m < e.start + e.pay.months))
      f *= e.pay.factor;
  return f;
}

const EQUITY_CLASSES = new Set<AssetClass>(['tw_equity', 'us_equity', 'global_equity']);

/**
 * Runs the story month by month. With `from`, months before `from.month` are copied
 * unchanged and only the rest is recomputed (live events, EN-3).
 */
export function runPlayback(
  setup: PlaybackSetup,
  events: ResolvedEvent[],
  behaviour: Behaviour = { kind: 'keep' },
  noiseSeed?: number,
  from?: { path: PlaybackPath; month: number },
): PlaybackPath {
  const { input, accounts } = setup;
  const tw = input.taiwan;
  const prep = prepare(input);
  const years = prep.years;
  const months = years * 12;
  const A = accounts.length;
  const levels = factorPaths(events, months);

  // Monthly noise per asset class (SC-4), drawn for every month so recomputing is exact.
  const noise: Float64Array | undefined =
    noiseSeed !== undefined ? new Float64Array((months + 1) * ASSET_CLASSES.length) : undefined;
  if (noise && noiseSeed !== undefined) {
    const normal = normalSource(mulberry32(noiseSeed));
    for (let i = 0; i < noise.length; i++) noise[i] = normal();
  }
  const typical = input.assets.map((a) => medianReturn(a.expectedReturn + input.returnShift, a.volatility));

  const path: PlaybackPath = {
    setup,
    events,
    months,
    startAge: input.startAge,
    values: [],
    liquid: new Float64Array(months + 1),
    locked: new Float64Array(months + 1),
    nonInvestable: new Float64Array(months + 1),
    debt: new Float64Array(months + 1),
    investable: new Float64Array(months + 1),
    total: new Float64Array(months + 1),
    fiTarget: new Float64Array(months + 1),
    inflationIndex: new Float64Array(months + 1),
    flow: new Float64Array(months + 1),
    liquidMask: [],
    retired: new Uint8Array(months + 1),
    minSpendingRatio: 1,
    amtAges: [],
    states: [],
    factorLevels: levels,
  };

  let st: EngineState;
  let startMonth = 0;
  if (from && from.month > 0 && from.month <= months) {
    startMonth = from.month;
    const p = from.path;
    for (let m = 0; m < startMonth; m++) {
      path.values[m] = p.values[m];
      path.liquidMask[m] = p.liquidMask[m];
      path.states[m] = p.states[m];
      for (const key of [
        'liquid',
        'locked',
        'nonInvestable',
        'debt',
        'investable',
        'total',
        'fiTarget',
        'inflationIndex',
        'flow',
      ] as const)
        path[key][m] = p[key][m];
      path.retired[m] = p.retired[m];
    }
    st = cloneState(p.states[startMonth]);
  } else {
    st = {
      values: accounts.map((a) => a.value0),
      liquidMask: accounts.map((a) => a.bucket === 'liquid'),
      guaranteed: accounts.filter((a) => a.pension).reduce((s, a) => s + a.value0, 0),
      inflationIndex: 1,
      incomeFactor: 1,
      spendingNow: input.fiSpending,
      laborAnnual: 0,
      monthlySavings: 0,
      monthlyIncome: 0,
      monthlyPension: 0,
      monthlyWithdrawal: 0,
      retiredThisYear: false,
      minSpendingRatio: 1,
      dragRates: accounts.map(() => 0),
      overseasIncome: 0,
      yearInflation: 1,
      liquidYearStart: 0,
      amtAges: [],
    };
  }

  const liquidTotal = () => {
    let s = 0;
    for (let i = 0; i < A; i++) if (st.liquidMask[i] && accounts[i].bucket !== 'liability') s += st.values[i];
    return s;
  };
  const record = (m: number) => {
    let liquid = 0;
    let locked = 0;
    let nonInv = 0;
    let debt = 0;
    for (let i = 0; i < A; i++) {
      const a = accounts[i];
      const v = st.values[i];
      if (a.bucket === 'liability') debt += v;
      else if (st.liquidMask[i]) liquid += v;
      else if (a.bucket === 'nonInvestable') nonInv += v;
      else locked += v;
    }
    path.values[m] = Float64Array.from(st.values);
    path.liquidMask[m] = Uint8Array.from(st.liquidMask.map((x) => (x ? 1 : 0)));
    path.liquid[m] = liquid;
    path.locked[m] = locked;
    path.nonInvestable[m] = nonInv;
    path.debt[m] = debt;
    path.investable[m] = liquid + locked;
    path.total[m] = liquid + locked + nonInv - debt;
    const k = Math.min(years, Math.floor(m / 12));
    const next = Math.min(years, k + 1);
    path.fiTarget[m] = prep.required[k] + ((m % 12) / 12) * (prep.required[next] - prep.required[k]);
    path.inflationIndex[m] = st.inflationIndex;
    return liquid;
  };

  const liquidIdx = (pred: (a: PlaybackAccount, i: number) => boolean) => {
    const out: number[] = [];
    for (let i = 0; i < A; i++)
      if (st.liquidMask[i] && accounts[i].bucket !== 'liability' && pred(accounts[i], i)) out.push(i);
    return out;
  };
  const depositToClass = (cls: AssetClass, amount: number) => {
    const idx = liquidIdx((a, i) => a.cls === cls && st.values[i] > 0);
    const sum = idx.reduce((s, i) => s + st.values[i], 0);
    if (sum <= 0) {
      const j = accounts.findIndex((a) => a.id === `new:${cls}`);
      st.values[j] += amount;
      st.liquidMask[j] = true;
      return;
    }
    for (const i of idx) st.values[i] += (amount * st.values[i]) / sum;
  };
  const deposit = (amount: number, toCash = false) => {
    if (toCash) return depositToClass('cash', amount);
    for (let c = 0; c < ASSET_CLASSES.length; c++)
      if (input.allocation[c] > 0) depositToClass(ASSET_CLASSES[c], amount * input.allocation[c]);
  };
  const withdraw = (amount: number, m: number): void => {
    if (amount <= 0) return;
    const idx = liquidIdx((_a, i) => st.values[i] > 0);
    const t = idx.reduce((s, i) => s + st.values[i], 0);
    if (t <= 0 || amount > t) {
      for (const i of idx) st.values[i] = 0;
      if (st.depletionMonth === undefined) st.depletionMonth = m;
      return;
    }
    const keep = 1 - amount / t;
    for (const i of idx) st.values[i] *= keep;
  };
  const rebalance = () => {
    const idx = liquidIdx(() => true);
    const t = idx.reduce((s, i) => s + st.values[i], 0);
    if (t <= 0) return;
    const before = st.values.slice();
    for (const i of idx) st.values[i] = 0;
    for (let c = 0; c < ASSET_CLASSES.length; c++) {
      const cls = ASSET_CLASSES[c];
      const target = t * input.allocation[c];
      if (target <= 0) continue;
      const inClass = idx.filter((i) => accounts[i].cls === cls && before[i] > 0);
      const sum = inClass.reduce((s, i) => s + before[i], 0);
      if (sum <= 0) {
        const j = accounts.findIndex((a) => a.id === `new:${cls}`);
        st.values[j] += target;
        st.liquidMask[j] = true;
      } else for (const i of inClass) st.values[i] += (target * before[i]) / sum;
    }
  };

  const equityLevel = (m: number) =>
    EQUITY_FACTORS.reduce((s, f) => s + levels[f][m], 0) / EQUITY_FACTORS.length;
  const activeShockEvents = (m: number) =>
    events.filter(
      (e) => e.source !== 'backdrop' && e.shocks.length > 0 && m >= e.start && m < e.start + e.length,
    );

  for (let m = startMonth; m <= months; m++) {
    path.states[m] = cloneState(st);
    let extraFlow = 0;
    const k = Math.floor(m / 12);
    const age = input.startAge + k;
    const liquidNow = record(m);
    if (m === months) break;

    // Year start: one-off plan events, retirement, this year's flows and tax rates.
    if (m % 12 === 0) {
      if (m > 0) {
        // Year end of the previous model year: unlock, rebalance, AMT, FI check (as the yearly engine).
        const kk = k - 1;
        const nextAge = input.startAge + k;
        for (let i = 0; i < A; i++) {
          const a = accounts[i];
          if (a.bucket === 'locked' && !st.liquidMask[i] && (a.unlockAge ?? 0) <= nextAge) {
            if (a.pension) st.values[i] = Math.max(st.values[i], st.guaranteed);
            st.liquidMask[i] = true;
          }
        }
        if (input.rebalance && !st.sold) rebalance();
        if (amtFlag(st.overseasIncome, tw)) st.amtAges.push(input.startAge + kk);
        st.overseasIncome = 0;
        st.incomeFactor *= (1 + input.salaryGrowth + rateAt(events, 'payTrend', m - 1)) / st.yearInflation;
        st.yearInflation = 1;
        const liq = liquidTotal();
        if (st.fiAge === undefined && liq >= prep.required[k]) {
          st.fiAge = input.startAge + k;
          st.netWorthAtFi = path.investable[m];
          const gapPrev = st.liquidYearStart - prep.required[kk];
          const gapNow = liq - prep.required[k];
          const frac = gapNow - gapPrev > 0 ? Math.min(1, Math.max(0, -gapPrev / (gapNow - gapPrev))) : 1;
          st.yearsToFi = kk + frac;
        }
        record(m);
      } else if (liquidNow >= prep.required[0] && st.fiAge === undefined) {
        st.fiAge = input.startAge;
        st.yearsToFi = 0;
        st.netWorthAtFi = path.investable[0];
      }
      st.liquidYearStart = liquidTotal();

      for (const e of input.events)
        if (e.year === input.startYear + k) {
          if (e.amount > 0) deposit(e.amount);
          else withdraw(-e.amount, m);
          extraFlow += e.amount;
        }

      const retired =
        input.retireAtAge !== undefined
          ? age >= input.retireAtAge
          : st.fiAge !== undefined && age >= st.fiAge + (input.workExtraYears ?? 0);
      if (retired && st.retireAge === undefined) {
        st.retireAge = age;
        st.spendingNow = input.fiSpending;
        if (input.laborInsurance) {
          const li = input.laborInsurance;
          st.laborAnnual = laborInsuranceAnnual(
            li.settings,
            laborInsuranceYears(input, age),
            li.claimAge,
            li.haircut,
          );
        }
      }
      st.retiredThisYear = retired;
      if (!retired) {
        const base = input.annualIncome * st.incomeFactor;
        const income = incomeFor(input, age, base, st.incomeFactor);
        const spending =
          input.savingsRate !== undefined ? base * (1 - input.savingsRate) : input.currentSpending;
        const working = income > 0 ? st.incomeFactor : 0;
        st.monthlyIncome = income / 12;
        st.monthlySavings = (-spending + input.pension.liquidDelta * working) / 12;
        st.monthlyPension = ((input.pension.employer + input.pension.voluntary) * working) / 12;
        st.monthlyWithdrawal = 0;
      } else {
        const streamIncome = streamIncomeAt(
          input,
          age,
          st.retireAge ?? age,
          st.inflationIndex,
          st.laborAnnual,
        );
        const portfolio = liquidTotal();
        let yieldSum = 0;
        for (const i of liquidIdx(() => true))
          yieldSum += st.values[i] * input.assets[classIndex.get(accounts[i].cls) ?? 0].dividendYield;
        const result = applyWithdrawalRule(input.withdrawalRule, {
          portfolio,
          spending: st.spendingNow,
          plannedSpending: input.fiSpending,
          streamIncome,
          dividendYield: portfolio > 0 ? yieldSum / portfolio : 0,
          swr: input.swr,
        });
        st.spendingNow = result.spending;
        if (input.fiSpending > 0)
          st.minSpendingRatio = Math.min(st.minSpendingRatio, result.spending / input.fiSpending);
        st.monthlyWithdrawal = result.withdrawal / 12;
        st.monthlyIncome = 0;
        st.monthlySavings = 0;
        st.monthlyPension = 0;
      }

      // Taiwan frictions as yearly rates per class and currency, like the yearly engine.
      const groups = new Map<string, number>();
      for (const i of liquidIdx(() => true)) {
        const key = `${accounts[i].cls}|${accounts[i].currency}`;
        groups.set(key, (groups.get(key) ?? 0) + st.values[i]);
      }
      for (let i = 0; i < A; i++) {
        const a = accounts[i];
        st.dragRates[i] = 0;
        if (!st.liquidMask[i] || a.bucket === 'liability') continue;
        const asset = input.assets[classIndex.get(a.cls) ?? 0];
        if (asset.dividendYield <= 0 || a.cls === 'cash') continue;
        if (a.currency !== BASE_CURRENCY) st.dragRates[i] = asset.dividendYield * tw.usWithholdingRate;
        else if (a.cls === 'tw_equity') {
          const g = groups.get(`${a.cls}|${a.currency}`) ?? 0;
          if (g > 0) {
            const dividends = g * asset.dividendYield * st.inflationIndex;
            st.dragRates[i] =
              (domesticDividendTax(dividends, tw) + nhiSupplementaryPremium(dividends, tw)) /
              (g * st.inflationIndex);
          }
        }
      }
    }

    // Story one-off amounts at their month.
    for (const e of events)
      if (e.lump !== undefined && e.start === m && e.lump !== 0) {
        if (e.lump > 0) deposit(e.lump);
        else withdraw(-e.lump, m);
        extraFlow += e.lump;
      }

    // This month's growth factors per account.
    const inflAnnual = input.inflation + rateAt(events, 'inflation', m);
    const inflM = Math.pow(1 + inflAnnual, 1 / 12);
    const equityTrend = rateAt(events, 'equityTrend', m);
    const realZero = rateActive(events, 'equityRealZero', m) !== undefined;
    const cashLevel = rateActive(events, 'cashLevel', m);
    const cashAdd = rateAt(events, 'cash', m);
    const mortgageAdd = rateAt(events, 'mortgage', m);
    const classGrowth = ASSET_CLASSES.map((cls, c) => {
      const a = input.assets[c];
      let y = typical[c];
      if (EQUITY_CLASSES.has(cls)) y = realZero ? inflAnnual : y + equityTrend;
      if (cls === 'cash') y = cashLevel ? cashLevel.pts : y + cashAdd;
      let g = Math.pow(Math.max(0.01, 1 + y - a.fee), 1 / 12) / inflM;
      if (noise) g *= Math.exp((a.volatility / Math.sqrt(12)) * noise[m * ASSET_CLASSES.length + c]);
      return g;
    });
    const fxDrift = Math.pow(1 + input.fxDrift, 1 / 12);
    const ratio = (f: Factor) => levels[f][m + 1] / levels[f][m];
    const factors = accounts.map((a, i) => {
      if (a.bucket === 'liability') return 1;
      let g = classGrowth[classIndex.get(a.cls) ?? 0];
      if (st.liquidMask[i] && st.dragRates[i] > 0)
        g *= Math.pow(1 - st.dragRates[i] / (1 + typical[classIndex.get(a.cls) ?? 0]), 1 / 12);
      let exposed = 0;
      let moved = 0;
      for (const [f, w] of Object.entries(a.exposure)) {
        exposed += w ?? 0;
        moved += (w ?? 0) * ratio(f as Factor);
      }
      g *= moved + (1 - exposed);
      if (a.currency !== BASE_CURRENCY) g *= fxDrift * (a.fx ? ratio(a.fx) : 1);
      return g;
    });
    const half = () => {
      for (let i = 0; i < A; i++)
        if (accounts[i].bucket !== 'liability') st.values[i] *= Math.sqrt(factors[i]);
    };

    // Dividends for the AMT flag.
    for (const i of liquidIdx(() => true)) {
      const a = accounts[i];
      const y = input.assets[classIndex.get(a.cls) ?? 0].dividendYield;
      if (a.currency !== BASE_CURRENCY && a.cls !== 'cash' && y > 0)
        st.overseasIncome += (st.values[i] * y * st.inflationIndex) / 12;
    }

    // Loan payments this month (nominal, so they shrink in real terms); the last one clears the rest.
    let loanCash = 0;
    const loanDue = accounts.map((a, i) => {
      if (a.bucket !== 'liability') return { due: 0, paid: 0 };
      const rate = (a.rate ?? 0) + (a.floating ? mortgageAdd : 0);
      const due = st.values[i] * (1 + rate / 12);
      const left = a.months === undefined ? Number.POSITIVE_INFINITY : a.months - m;
      if (!a.payment || due <= 0 || left <= 0) return { due, paid: 0 };
      const paid = left <= 1 ? due : Math.min(due, a.payment / 12 / st.inflationIndex);
      loanCash += paid;
      return { due, paid };
    });

    half();
    // Flows land mid-month.
    let flow: number;
    if (!st.retiredThisYear) {
      const pay = payFactorAt(events, m);
      const income = st.monthlyIncome * pay;
      const saving = income + st.monthlySavings - loanCash;
      const pausing = behaviour.kind === 'pause' && activeShockEvents(m).length > 0;
      if (saving >= 0) deposit(saving, pausing || !!st.sold);
      else withdraw(-saving, m);
      flow = saving;
      const pension = income > 0 ? st.monthlyPension * Math.min(1, pay) : 0;
      if (pension > 0) {
        const j = accounts.findIndex((a, i) => a.pension && !st.liquidMask[i]);
        if (j >= 0) st.values[j] += pension;
        else depositToClass('other', pension);
        st.guaranteed += pension;
        extraFlow += pension;
      }
    } else {
      const out = st.monthlyWithdrawal + loanCash;
      if (out >= 0) withdraw(out, m);
      else deposit(-out);
      flow = -out;
    }
    half();
    st.guaranteed *= Math.pow(1 + setup.pensionFloor, 1 / 12) / inflM;

    // Loans amortise monthly.
    for (let i = 0; i < A; i++) {
      if (accounts[i].bucket !== 'liability') continue;
      st.values[i] = Math.max(0, loanDue[i].due - loanDue[i].paid) / inflM;
    }
    st.inflationIndex *= inflM;
    st.yearInflation *= inflM;

    // Behaviour: sell shares after a fall, buy back on recovery (SC-6).
    if (behaviour.kind === 'sell') {
      const active = activeShockEvents(m + 1);
      const lvl = equityLevel(m + 1);
      if (!st.sold && active.length) {
        const pre = Math.max(...active.map((e) => equityLevel(e.start)));
        if (lvl <= pre * (1 - behaviour.fall)) {
          let moved = 0;
          for (const i of liquidIdx((a) => EQUITY_CLASSES.has(a.cls))) {
            moved += st.values[i];
            st.values[i] = 0;
          }
          depositToClass('cash', moved);
          st.sold = { since: m + 1, level: pre };
        }
      } else if (st.sold && (lvl >= st.sold.level || active.length === 0)) {
        st.sold = undefined;
        rebalance();
      }
    }
    path.flow[m + 1] = flow + extraFlow;
    path.retired[m + 1] = st.retiredThisYear ? 1 : 0;
  }

  path.fiAge = st.fiAge;
  path.yearsToFi = st.yearsToFi;
  path.retireAge = st.retireAge;
  path.retireMonth = st.retireAge !== undefined ? (st.retireAge - input.startAge) * 12 : undefined;
  path.depletionMonth = st.depletionMonth;
  path.netWorthAtFi = st.netWorthAtFi;
  path.minSpendingRatio = st.minSpendingRatio;
  path.amtAges = st.amtAges;
  return path;
}

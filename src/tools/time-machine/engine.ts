// The Time Machine's calculations (PRD Part B, "Calculations"): pure functions, no app imports.
//
// Currencies (PRD Part C, TW-4): every ticker is priced in its own currency, and the scenario is
// valued in one currency, the one the amount is entered in. A holding priced in another currency
// gains or loses the exchange-rate change each month: 1 + r_base = (1 + r_local) × FX_t / FX_{t−1},
// with FX as TWD per USD for a US holding in TWD and its inverse for a Taiwan holding in USD.
//
// Months are indices (year × 12 + month − 1). A scenario invests at the start of its start
// month, which is the previous month's close, and reports a value at the end of every month
// to its end month. Top-ups land at the end of each month after the first, split by target
// weight; every line gets the same money at the same months.

export type Rebalance = 'none' | 'yearly' | 'quarterly';
export type LateListing = 'cash' | 'move';
export type Currency = 'USD' | 'TWD';

export interface Holding {
  ticker: string;
  /** Percent, the holdings sum to 100. */
  weight: number;
}

export interface PropertyBenchmark {
  kind: 'property';
  name: string;
  /** Average yearly price change, as a decimal. */
  growth: number;
  /** Optional yearly changes by calendar year, overriding `growth` for those years. */
  years?: Record<number, number>;
  /** Net rental yield per year, as a decimal of the current value. */
  rent: number;
  rentMode: 'cash' | 'reinvest';
  /** Buying and selling costs, as a decimal of the price. */
  buyCost: number;
  sellCost: number;
  /** TM-22: the amount is the down payment; the rest is borrowed. */
  mortgage?: { down: number; rate: number; years: number };
}

export type Benchmark =
  | { kind: 'ticker'; ticker: string }
  | { kind: 'cash'; rate: number }
  | { kind: 'fixed'; rate: number }
  | PropertyBenchmark;

export interface Scenario {
  amount: number;
  /** YYYY-MM */
  start: string;
  end: string;
  holdings: Holding[];
  late: LateListing;
  rebalance: Rebalance;
  topUp: number;
  priceOnly: boolean;
  benchmarks: Benchmark[];
  /** The scenario currency: the amount and top-ups are in it and every line is valued in it. */
  currency: Currency;
  /** 2 since Part C. Older links meant "USD amounts, shown in TWD" when currency was TWD. */
  v?: 2;
  /** The user chose the currency; until then it follows the first holding (TW-3). */
  currencyPicked?: boolean;
}

/** A ticker's month-end closes from `first`, already rebased (only ratios matter). */
export interface Series {
  first: number;
  tr: readonly number[];
  p: readonly number[];
  /** The price currency; missing means USD (TW-2). */
  currency?: Currency;
}

export interface MarketData {
  series: ReadonlyMap<string, Series>;
  /** Month-end TWD per USD by month (TW-5), needed when currencies are mixed. */
  fx?: { first: number; v: readonly number[] };
}

export interface Line {
  id: string;
  kind: 'portfolio' | 'holding' | 'ticker' | 'cash' | 'fixed' | 'property';
  /** A ticker, or the property's name; labels are added by the UI. */
  name: string;
  /** Value at each point: index 0 is the start (before any return), then each month-end. */
  values: number[];
  /** Money added at each point (the amount at 0, top-ups after). */
  flows: number[];
  /** Property only: the final value after selling costs. */
  afterSelling?: number;
  /** Part of the final value that came from exchange rates (TW-9); 0 when currencies match. */
  fxEffect?: number;
}

export interface Simulation {
  /** First reported month: point i is the end of month `startMonth + i − 1`; point 0 the start. */
  startMonth: number;
  months: number;
  portfolio: Line;
  holdings: Line[];
  benchmarks: Line[];
}

export const monthIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
export const monthName = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** The first month a ticker can be bought at the start of (its first close is the month before). */
export const firstBuyMonth = (s: Series) => s.first + 1;

/** Month-end close of `m`, or undefined before listing or after the data ends. */
function close(s: Series, m: number, priceOnly: boolean): number | undefined {
  const v = (priceOnly ? s.p : s.tr)[m - s.first];
  return v === undefined ? undefined : v;
}

/** Months of data available to every series a scenario uses. */
export function lastMonth(data: MarketData): number {
  let last = Infinity;
  for (const s of data.series.values()) last = Math.min(last, s.first + s.tr.length - 1);
  return last;
}

/** The start month after the late-listing choice (TM-7): "move" waits for the latest listing. */
export function effectiveStart(sc: Scenario, data: MarketData): number {
  const start = monthIndex(sc.start);
  if (sc.late !== 'move') return start;
  let s = start;
  for (const h of sc.holdings) {
    const series = data.series.get(h.ticker);
    if (series) s = Math.max(s, firstBuyMonth(series));
  }
  for (const b of sc.benchmarks) {
    const series = b.kind === 'ticker' ? data.series.get(b.ticker) : undefined;
    if (series) s = Math.max(s, firstBuyMonth(series));
  }
  return s;
}

/** Holdings and ticker benchmarks that list after the start month. */
export function lateListings(sc: Scenario, data: MarketData): { ticker: string; first: number }[] {
  const start = monthIndex(sc.start);
  const tickers = [
    ...sc.holdings.map((h) => h.ticker),
    ...sc.benchmarks.flatMap((b) => (b.kind === 'ticker' ? [b.ticker] : [])),
  ];
  return [...new Set(tickers)].flatMap((t) => {
    const s = data.series.get(t);
    return s && firstBuyMonth(s) > start ? [{ ticker: t, first: firstBuyMonth(s) }] : [];
  });
}

const monthlyRate = (yearly: number) => Math.pow(1 + yearly, 1 / 12) - 1;

const seriesCurrency = (s: Series): Currency => s.currency ?? 'USD';

/** Whether any ticker the scenario uses is priced in another currency than the scenario's. */
export function needsFx(sc: Scenario, data: MarketData): boolean {
  const tickers = [
    ...sc.holdings.map((h) => h.ticker),
    ...sc.benchmarks.flatMap((b) => (b.kind === 'ticker' ? [b.ticker] : [])),
  ];
  return tickers.some((t) => {
    const s = data.series.get(t);
    return !!s && seriesCurrency(s) !== sc.currency;
  });
}

/** Month-end TWD per USD for month `m`, holding the nearest known rate outside the data. */
function fxAt(data: MarketData, m: number): number {
  const { first, v } = data.fx!;
  return v[Math.min(v.length - 1, Math.max(0, m - first))];
}

/** The exchange-rate part of a holding's growth over month `m`, into the scenario currency. */
function fxFactor(s: Series, m: number, currency: Currency, data: MarketData): number {
  if (seriesCurrency(s) === currency) return 1;
  const change = fxAt(data, m) / fxAt(data, m - 1); // TWD per USD, this month over last
  return currency === 'TWD' ? change : 1 / change;
}

/**
 * A basket of tickers with target weights. A ticker not yet listed holds its share as cash at
 * 0% and buys at its first close. Rebalancing resets every share, cash included, to its target.
 */
function basket(
  holdings: readonly Holding[],
  data: MarketData,
  start: number,
  months: number,
  amount: number,
  topUp: number,
  rebalance: Rebalance,
  priceOnly: boolean,
  /** The scenario currency, or undefined to leave out exchange-rate changes (TW-9). */
  currency: Currency | undefined,
): { total: number[]; each: number[][]; flows: number[] } {
  const w = holdings.map((h) => h.weight / 100);
  const series = holdings.map((h) => data.series.get(h.ticker));
  const value = w.map((x) => x * amount);
  const each = holdings.map((_, i) => [value[i]]);
  const total = [amount];
  const flows = [amount];
  for (let k = 1; k <= months; k++) {
    const m = start + k - 1; // the month that ends at point k
    for (let i = 0; i < holdings.length; i++) {
      const s = series[i];
      if (!s) continue;
      const now = close(s, m, priceOnly);
      const before = close(s, m - 1, priceOnly);
      // Listed and held through this month: grow; otherwise the share waits in cash.
      if (now !== undefined && before !== undefined)
        value[i] *= (now / before) * (currency ? fxFactor(s, m, currency, data) : 1);
    }
    const add = topUp > 0 ? topUp : 0;
    for (let i = 0; i < holdings.length; i++) value[i] += w[i] * add;
    const month = m % 12; // 0 = January
    if ((rebalance === 'yearly' && month === 11) || (rebalance === 'quarterly' && month % 3 === 2)) {
      const sum = value.reduce((a, b) => a + b, 0);
      for (let i = 0; i < holdings.length; i++) value[i] = w[i] * sum;
    }
    for (let i = 0; i < holdings.length; i++) each[i].push(value[i]);
    total.push(value.reduce((a, b) => a + b, 0));
    flows.push(add);
  }
  return { total, each, flows };
}

/** Monthly mortgage payment for a loan repaid over `years` at a yearly rate. */
export function mortgagePayment(loan: number, rate: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0) return loan;
  const r = rate / 12;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * A property bought with the same amount (TM-9). Its value is the home's price, plus rent kept
 * as cash. With a mortgage (TM-22) the amount is the down payment, and the line is the equity:
 * the price minus the loan, less the payments made so far (rent offsets them).
 */
function property(
  b: PropertyBenchmark,
  start: number,
  months: number,
  amount: number,
  topUps: readonly number[],
): { values: number[]; afterSelling: number } {
  const down = b.mortgage ? Math.min(1, Math.max(0.01, b.mortgage.down)) : 1;
  let price = amount / down;
  let loan = price - amount;
  // Buying costs are paid out of the amount, on the full price.
  price -= price * b.buyCost;
  const payment = b.mortgage ? mortgagePayment(loan, b.mortgage.rate, b.mortgage.years) : 0;
  let cash = 0;
  const equity = () => price - loan + cash;
  const values = [equity()];
  for (let k = 1; k <= months; k++) {
    const m = start + k - 1;
    const year = Math.floor(m / 12);
    const g = b.years?.[year] ?? b.growth;
    price *= 1 + monthlyRate(g);
    const rent = (price * b.rent) / 12;
    if (b.rentMode === 'reinvest') price += rent;
    else cash += rent;
    if (b.mortgage && loan > 0) {
      const interest = (loan * b.mortgage.rate) / 12;
      const pay = Math.min(payment, loan + interest);
      loan = Math.max(0, loan + interest - pay);
      cash -= pay;
    }
    price += topUps[k] ?? 0;
    values.push(equity());
  }
  return { values, afterSelling: price * (1 - b.sellCost) - loan + cash };
}

/** Runs a scenario: the portfolio, each holding and each benchmark, month by month. */
export function simulate(sc: Scenario, data: MarketData): Simulation {
  const start = effectiveStart(sc, data);
  const end = Math.min(monthIndex(sc.end), lastMonth(data));
  const months = Math.max(0, end - start + 1);
  if (needsFx(sc, data) && !data.fx) throw new Error('Exchange rates are needed for this scenario');
  const run = (holdings: readonly Holding[], rebalance: Rebalance, withFx = true) =>
    basket(
      holdings,
      data,
      start,
      months,
      sc.amount,
      sc.topUp,
      rebalance,
      sc.priceOnly,
      withFx ? sc.currency : undefined,
    );
  /** Final value minus the same run with exchange rates held still (TW-9). */
  const fxEffect = (holdings: readonly Holding[], rebalance: Rebalance, final: number) =>
    needsFx({ ...sc, holdings: [...holdings], benchmarks: [] }, data)
      ? final - run(holdings, rebalance, false).total[months]
      : 0;

  const port = run(sc.holdings, sc.rebalance);
  const flows = port.flows;
  const portfolio: Line = {
    id: 'portfolio',
    kind: 'portfolio',
    name: 'portfolio',
    values: port.total,
    flows,
    fxEffect: fxEffect(sc.holdings, sc.rebalance, port.total[months]),
  };
  const holdings: Line[] = sc.holdings.map((h, i) => {
    const one = [{ ticker: h.ticker, weight: 100 }];
    const s = data.series.get(h.ticker);
    // A holding's own exchange-rate part, on its own share of the money (no rebalancing).
    const own = s && seriesCurrency(s) !== sc.currency ? run(one, 'none') : undefined;
    return {
      id: `holding:${h.ticker}`,
      kind: 'holding',
      name: h.ticker,
      values: port.each[i],
      flows: flows.map((f) => (f * h.weight) / 100),
      fxEffect: own ? ((own.total[months] - run(one, 'none', false).total[months]) * h.weight) / 100 : 0,
    };
  });

  // Cash, fixed and property lines grow at the rates as entered, in the scenario currency.
  const benchmarks: Line[] = sc.benchmarks.map((b, i) => {
    const id = `bench:${i}`;
    if (b.kind === 'ticker') {
      const one = [{ ticker: b.ticker, weight: 100 }];
      const r = run(one, 'none');
      return {
        id,
        kind: 'ticker',
        name: b.ticker,
        values: r.total,
        flows,
        fxEffect: fxEffect(one, 'none', r.total[months]),
      };
    }
    if (b.kind === 'property') {
      const p = property(b, start, months, flows[0], flows);
      return { id, kind: 'property', name: b.name, values: p.values, flows, afterSelling: p.afterSelling };
    }
    const r = monthlyRate(b.rate);
    const values = [flows[0]];
    for (let k = 1; k <= months; k++) values.push(values[k - 1] * (1 + r) + flows[k]);
    return { id, kind: b.kind, name: b.kind, values, flows };
  });

  return { startMonth: start, months, portfolio, holdings, benchmarks };
}

/** Time-weighted index from 100: returns without the effect of top-ups. */
export function twr(line: Pick<Line, 'values' | 'flows'>): number[] {
  const out = [100];
  for (let k = 1; k < line.values.length; k++) {
    const prev = line.values[k - 1];
    const r = prev > 0 ? (line.values[k] - line.flows[k]) / prev : 1;
    out.push(out[k - 1] * r);
  }
  return out;
}

/** Monthly money-weighted return (IRR) for the flows and the final value, as a yearly rate. */
export function irr(flows: readonly number[], final: number): number | undefined {
  const n = flows.length - 1;
  if (n <= 0) return undefined;
  const npv = (r: number) => {
    let s = final / Math.pow(1 + r, n);
    for (let k = 0; k <= n; k++) s -= flows[k] / Math.pow(1 + r, k);
    return s;
  };
  let lo = -0.99;
  let hi = 1;
  if (npv(lo) * npv(hi) > 0) return undefined;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

export interface Drawdown {
  /** As a negative decimal; 0 when the line never fell. */
  depth: number;
  /** Points of the peak and the trough. */
  peak: number;
  trough: number;
  /** Months from the trough back to the peak level, if it got there. */
  recovery?: number;
}

/** The worst fall from a peak, on the time-weighted index. */
export function worstFall(index: readonly number[]): Drawdown {
  let peak = 0;
  let worst: Drawdown = { depth: 0, peak: 0, trough: 0 };
  for (let k = 1; k < index.length; k++) {
    if (index[k] > index[peak]) peak = k;
    const d = index[k] / index[peak] - 1;
    if (d < worst.depth) worst = { depth: d, peak, trough: k };
  }
  if (worst.depth < 0) {
    for (let k = worst.trough + 1; k < index.length; k++)
      if (index[k] >= index[worst.peak]) {
        worst.recovery = k - worst.trough;
        break;
      }
  }
  return worst;
}

/** Calendar-year returns on the time-weighted index; `partial` marks years not fully covered. */
export function calendarYears(
  index: readonly number[],
  startMonth: number,
): { year: number; ret: number; partial: boolean }[] {
  const out: { year: number; ret: number; partial: boolean }[] = [];
  // Point k is the end of month startMonth + k − 1; point 0 is the end of the month before.
  let from = 0;
  for (let k = 1; k < index.length; k++) {
    const m = startMonth + k - 1;
    if (m % 12 === 11 || k === index.length - 1) {
      const firstMonth = startMonth + from;
      out.push({
        year: Math.floor(m / 12),
        ret: index[k] / index[from] - 1,
        partial: firstMonth % 12 !== 0 || m % 12 !== 11,
      });
      from = k;
    }
  }
  return out;
}

export interface Metrics {
  final: number;
  invested: number;
  gain: number;
  gainPct: number;
  /** CAGR for a lump sum; with top-ups, the money-weighted return. */
  yearly?: number;
  fall: Drawdown;
  best?: { year: number; ret: number };
  worst?: { year: number; ret: number };
  /** Annualised standard deviation of monthly returns. */
  volatility: number;
}

/** The results row for one line (TM-12), up to point `at` (default: the end). */
export function metrics(line: Line, startMonth: number, at = line.values.length - 1): Metrics {
  const values = line.values.slice(0, at + 1);
  const flows = line.flows.slice(0, at + 1);
  const final = values[at];
  const invested = flows.reduce((a, b) => a + b, 0);
  const index = twr({ values, flows });
  const lump = flows.slice(1).every((f) => f === 0);
  const yearly =
    at === 0
      ? undefined
      : lump
        ? values[0] > 0 && final > 0
          ? Math.pow(final / values[0], 12 / at) - 1
          : undefined
        : irr(flows, final);
  const rets = index.slice(1).map((v, k) => v / index[k] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const years = calendarYears(index, startMonth);
  const full = years.filter((y) => !y.partial);
  const pool = full.length ? full : years;
  const best = pool.length ? pool.reduce((a, b) => (b.ret > a.ret ? b : a)) : undefined;
  const worst = pool.length ? pool.reduce((a, b) => (b.ret < a.ret ? b : a)) : undefined;
  return {
    final,
    invested,
    gain: final - invested,
    gainPct: invested > 0 ? final / invested - 1 : 0,
    yearly,
    fall: worstFall(index),
    best: best && { year: best.year, ret: best.ret },
    worst: worst && { year: worst.year, ret: worst.ret },
    volatility: Math.sqrt(variance) * Math.sqrt(12),
  };
}

/** Fall from the highest point so far, at point `at` (live counter). */
export function fallFromPeak(line: Pick<Line, 'values' | 'flows'>, at: number): number {
  const index = twr({ values: line.values.slice(0, at + 1), flows: line.flows.slice(0, at + 1) });
  const peak = Math.max(...index);
  return index[at] / peak - 1;
}

/** CSV of every line's value at each month-end (TM-19). */
export function toCsv(sim: Simulation, labels: Record<string, string>): string {
  const lines = [sim.portfolio, ...sim.holdings, ...sim.benchmarks];
  const head = ['Month', ...lines.map((l) => labels[l.id] ?? l.name)];
  const rows = [head.map(csvCell).join(',')];
  for (let k = 0; k <= sim.months; k++) {
    const month = k === 0 ? `${monthName(sim.startMonth)} (start)` : monthName(sim.startMonth + k - 1);
    rows.push([month, ...lines.map((l) => l.values[k].toFixed(2))].map(csvCell).join(','));
  }
  return rows.join('\n') + '\n';
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

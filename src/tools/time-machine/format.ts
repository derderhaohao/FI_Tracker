// The static price files the Time Machine reads (TM-4), written by scripts/build-prices.ts.
// Kept free of imports so the generator can share it.

export type TickerKind = 'stock' | 'etf' | 'adr';

export interface IndexEntry {
  /** Ticker, as shown (BRK-B). */
  t: string;
  /** Company or fund name. */
  n: string;
  k: TickerKind;
  /** Sector key, translated in the UI. */
  sec: string;
  /** First month with a month-end close, YYYY-MM. */
  f: string;
}

export interface PriceIndex {
  /** Last complete month in the data, YYYY-MM. */
  asOf: string;
  /** When the files were generated, ISO date. */
  built: string;
  source: string;
  tickers: IndexEntry[];
  /** Whether fx.json (TWD per USD) is available. */
  fx: boolean;
}

/** One ticker: month-end values from `s`, both rebased to 100 at the first month. */
export interface PriceFile {
  t: string;
  s: string;
  /** Total-return index: dividends reinvested, split adjusted. */
  tr: number[];
  /** Price only: split adjusted, dividends not reinvested. */
  p: number[];
}

/** Monthly average TWD per USD from `s`. */
export interface FxFile {
  s: string;
  v: number[];
}

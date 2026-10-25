// The static price files the Time Machine reads (TM-4), written by scripts/build-prices.ts.
// Kept free of imports so the generator can share it.

export type TickerKind = 'stock' | 'etf' | 'adr' | 'index';
export type PriceCurrency = 'USD' | 'TWD';
export type Market = 'US' | 'TW';

export interface IndexEntry {
  /** Ticker as stored (BRK-B, 2330.TW); the UI drops the .TW suffix. */
  t: string;
  /** Company or fund name, in English. */
  n: string;
  /** Chinese name, for Taiwan listings (TW-1). */
  nz?: string;
  /** Price currency and market (TW-2); missing means USD and US, as in older files. */
  c?: PriceCurrency;
  m?: Market;
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
  /** Whether fx.json (month-end TWD per USD, TW-5) is available. */
  fx: boolean;
}

/** One ticker: month-end values from `s`, both rebased to 100 at the first month. */
export interface PriceFile {
  t: string;
  /** Price currency; missing means USD (TW-2). */
  c?: PriceCurrency;
  s: string;
  /** Total-return index: dividends reinvested, split adjusted. */
  tr: number[];
  /** Price only: split adjusted, dividends not reinvested. Missing when the source had none. */
  p?: number[];
}

/** Month-end TWD per USD from `s` (TW-5; files before Part C held monthly averages). */
export interface FxFile {
  s: string;
  v: number[];
}

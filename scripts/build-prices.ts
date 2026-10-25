// Builds the Time Machine's static price files (PRD Part B, TM-4):
//   public/data/prices/index.json        tickers, names, first month, data month
//   public/data/prices/<TICKER>.json     monthly total-return and price-only indices
//   public/data/prices/fx.json           month-end TWD per USD (Yahoo TWD=X, FRED DEXTAUS)
//
//   npx tsx scripts/build-prices.ts [TICKER ...]
//
// Runs in GitHub Actions (.github/workflows/prices.yml): the app itself never calls a market
// API. Monthly bars come from Yahoo Finance's chart endpoint: "adjclose" (split and dividend
// adjusted) for the total-return index and "close" (split adjusted) for price only. Only
// derived indices rebased to 100 are published, rounded to 6 significant digits.
//
// Taiwan listings (PRD Part C) use the ".TW" Yahoo symbols and are priced in TWD. The TAIEX total
// return series comes from TWSE's return index (發行量加權股價報酬指數) when the runner can reach
// it, otherwise from 0050's total return.
//
// Checks: gaps are filled with the previous month and reported; a monthly move above ±60% is
// reported for review; a ticker that fails to download keeps its previous file. For Taiwan
// listings, each year's dividend gap (total return minus price return) must look like a dividend,
// which catches stock dividends (配股) and capital reductions (減資) the source adjusted badly.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { TW_INDEXES, TW_UNIVERSE, UNIVERSE, type Kind, type Sector } from './prices-universe.ts';
import type {
  FxFile,
  IndexEntry,
  Market,
  PriceCurrency,
  PriceFile,
  PriceIndex,
} from '../src/tools/time-machine/format.ts';

/** One series to download. */
interface Item {
  ticker: string;
  yahoo: string;
  name: string;
  nameZh?: string;
  kind: Kind;
  sector: Sector;
  currency: PriceCurrency;
  market: Market;
}

const ITEMS: Item[] = [
  ...UNIVERSE.map(([ticker, name, kind, sector]): Item => ({
    ticker,
    yahoo: ticker,
    name,
    kind,
    sector,
    currency: 'USD',
    market: 'US',
  })),
  ...TW_UNIVERSE.map(([code, name, nameZh, kind, sector]): Item => ({
    ticker: `${code}.TW`,
    yahoo: `${code}.TW`,
    name,
    nameZh,
    kind,
    sector,
    currency: 'TWD',
    market: 'TW',
  })),
  ...TW_INDEXES.filter((x) => x.yahoo).map((x): Item => ({
    ticker: x.ticker,
    yahoo: x.yahoo!,
    name: x.name,
    nameZh: x.nameZh,
    kind: 'index',
    sector: 'market',
    currency: 'TWD',
    market: 'TW',
  })),
];

const OUT = new URL('../public/data/prices/', import.meta.url);
const FIRST = '1999-12'; // one month before Jan 2000, so a Jan 2000 start has a buying price
const MAX_FILE = 8 * 1024;
const MAX_FOLDER = 5 * 1024 * 1024;
// A plain agent: Yahoo answers 429 to some full browser strings.
const UA = 'Mozilla/5.0';

const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()));
const warnings: string[] = [];
const warn = (s: string) => {
  warnings.push(s);
  console.warn(`! ${s}`);
};

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const monthName = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const round = (v: number) => Number(v.toPrecision(6));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The month being built is the last complete one. */
const CURRENT = monthIndex(ym(new Date()));

async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok || attempt >= 1 || res.status === 404) return res;
    await sleep(1500);
  }
}

interface Monthly {
  first: number;
  adj: number[];
  close: number[];
  /** False when the source has no unadjusted close: price only then equals total return. */
  priceOnly: boolean;
}

type Rows = Map<number, { adj: number; close: number }>;

/** Monthly bars from Yahoo Finance's chart endpoint: adjusted and split-adjusted closes. */
async function yahoo(symbol: string): Promise<Rows> {
  const p1 = Math.floor(Date.UTC(1999, 11, 1) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  let body: unknown;
  const statuses: number[] = [];
  for (const h of ['query1', 'query2']) {
    const res = await get(
      `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1mo&events=div%2Csplit&includeAdjustedClose=true`,
    );
    statuses.push(res.status);
    if (res.ok) {
      body = await res.json();
      break;
    }
  }
  type Chart = {
    chart: {
      result?: {
        meta: { gmtoffset?: number };
        timestamp?: number[];
        indicators: { quote: { close: (number | null)[] }[]; adjclose?: { adjclose: (number | null)[] }[] };
      }[];
    };
  };
  const r = (body as Chart | undefined)?.chart?.result?.[0];
  if (!r?.timestamp?.length) throw new Error(`Yahoo ${statuses.join('/')}`);
  const offset = r.meta.gmtoffset ?? 0;
  const rows: Rows = new Map();
  const closes = r.indicators.quote[0].close;
  const adjs = r.indicators.adjclose?.[0]?.adjclose ?? closes;
  r.timestamp.forEach((ts, i) => {
    const m = monthIndex(ym(new Date((ts + offset) * 1000)));
    const close = closes[i];
    const adj = adjs[i];
    if (m < monthIndex(FIRST) || m >= CURRENT) return;
    if (close == null || adj == null || !(close > 0) || !(adj > 0)) return;
    rows.set(m, { adj, close });
  });
  return rows;
}

/** Monthly bars from Stooq (closes adjusted for splits and dividends), the fallback source. */
async function stooq(symbol: string): Promise<Rows> {
  const res = await get(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase().replace('-', '.')}.us&i=m`);
  const text = res.ok ? await res.text() : '';
  if (!text.startsWith('Date')) throw new Error(`Stooq ${res.status}`);
  const rows: Rows = new Map();
  for (const line of text.trim().split('\n').slice(1)) {
    const [date, , , , close] = line.split(',');
    const m = monthIndex(date);
    const v = Number(close);
    if (m >= monthIndex(FIRST) && m < CURRENT && v > 0) rows.set(m, { adj: v, close: v });
  }
  return rows;
}

async function monthly(symbol: string): Promise<Monthly & { source: string }> {
  let rows: Rows | undefined;
  let source = 'Yahoo';
  const errors: string[] = [];
  try {
    rows = await yahoo(symbol);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (!rows?.size) {
    source = 'Stooq';
    try {
      rows = await stooq(symbol);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!rows?.size) throw new Error(errors.join(', ') || 'no complete months');
  return { ...fill(symbol, rows), priceOnly: source === 'Yahoo', source };
}

/** Consecutive months from the first close, gaps carried forward. */
function fill(symbol: string, rows: Rows): Omit<Monthly, 'priceOnly'> {
  const months = [...rows.keys()].sort((a, b) => a - b);
  const first = months[0];
  const last = months[months.length - 1];
  const adj: number[] = [];
  const close: number[] = [];
  for (let m = first; m <= last; m++) {
    const row = rows.get(m);
    if (!row) {
      warn(`${symbol}: no close for ${monthName(m)}, carried forward`);
      adj.push(adj[adj.length - 1]);
      close.push(close[close.length - 1]);
    } else {
      adj.push(row.adj);
      close.push(row.close);
    }
  }
  return { first, adj, close };
}

/** Month-end TWD per USD from Yahoo's TWD=X monthly bars (TW-5). */
async function yahooFx(): Promise<Map<number, number>> {
  const rows = await yahoo('TWD=X');
  return new Map([...rows].map(([m, r]) => [m, r.close]));
}

/** Fallback: FRED's daily DEXTAUS, keeping the last value of each month (TW-5). */
async function fredFx(): Promise<Map<number, number>> {
  const res = await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXTAUS');
  if (!res.ok) throw new Error(`FRED ${res.status}`);
  const out = new Map<number, number>();
  for (const line of (await res.text()).trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const m = monthIndex(d);
    if (m >= monthIndex(FIRST) && m < CURRENT && Number(v) > 0) out.set(m, Number(v));
  }
  return out;
}

/** Month-end FX: Yahoo first, FRED filling any months Yahoo lacks (its history is shorter). */
async function monthEndFx(): Promise<FxFile> {
  const rates = new Map<number, number>();
  const errors: string[] = [];
  for (const [label, load] of [
    ['Yahoo TWD=X', yahooFx],
    ['FRED DEXTAUS', fredFx],
  ] as const) {
    try {
      for (const [m, v] of await load()) if (!rates.has(m)) rates.set(m, v);
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (rates.size === 0) throw new Error(errors.join(', '));
  if (errors.length) warn(`USD/TWD: ${errors.join(', ')}`);
  const months = [...rates.keys()].sort((x, y) => x - y);
  const v: number[] = [];
  for (let m = months[0]; m <= months[months.length - 1]; m++) v.push(round(rates.get(m) ?? v[v.length - 1]));
  return { s: monthName(months[0]), v };
}

/**
 * TAIEX total return month-end values from TWSE's return index (MFI94U), one request per month.
 * Months already in `known` are not fetched again. Throws when TWSE cannot be reached.
 */
async function twseReturnIndex(known: Map<number, number>): Promise<Map<number, number>> {
  const out = new Map(known);
  let failures = 0;
  for (let m = monthIndex('2003-01'); m < CURRENT; m++) {
    if (out.has(m)) continue;
    const date = `${Math.floor(m / 12)}${String((m % 12) + 1).padStart(2, '0')}01`;
    const res = await get(`https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=${date}&response=json`);
    const body = res.ok ? ((await res.json()) as { stat?: string; data?: string[][] }) : undefined;
    const rows = body?.data ?? [];
    const last = rows.length ? Number(String(rows[rows.length - 1][1]).replace(/,/g, '')) : NaN;
    if (last > 0) out.set(m, last);
    else if (++failures >= 3 && out.size === known.size)
      throw new Error(`TWSE ${res.status} ${body?.stat ?? ''}`.trim());
    await sleep(2500);
  }
  if (out.size === 0) throw new Error('TWSE: no data');
  return out;
}

/** Each year's total return minus price return should look like a dividend (TW-8). */
function checkDividends(ticker: string, data: PriceFile) {
  if (!data.p) return;
  const first = monthIndex(data.s);
  for (let i = 12 - (first % 12); i + 12 < data.tr.length; i += 12) {
    const tr = data.tr[i + 12] / data.tr[i] - 1;
    const pr = data.p[i + 12] / data.p[i] - 1;
    const gap = tr - pr;
    if (gap < -0.005 || gap > 0.15)
      warn(
        `${ticker}: ${Math.floor((first + i + 1) / 12)} total return ${(tr * 100).toFixed(1)}% vs price ${(pr * 100).toFixed(1)}%: check stock dividends or capital reductions`,
      );
  }
}

/**
 * The TAIEX total-return benchmark (TW-7): TWSE's return index when reachable, else 0050's total
 * return. Values already published are kept, so the monthly refresh only fetches new months.
 */
async function taiexTotalReturn(entries: IndexEntry[]) {
  const meta = TW_INDEXES.find((x) => x.ticker === 'TAIEXTR')!;
  const file = new URL('TAIEXTR.json', OUT);
  const old = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as PriceFile & { raw?: number[] })
    : undefined;
  let data: PriceFile & { raw?: number[] };
  let name = meta.name;
  let nameZh = meta.nameZh;
  try {
    const known = new Map<number, number>();
    if (old?.raw) old.raw.forEach((v, i) => known.set(monthIndex(old.s) + i, v));
    const rows = await twseReturnIndex(known);
    const months = [...rows.keys()].sort((a, b) => a - b);
    const raw: number[] = [];
    for (let m = months[0]; m <= months[months.length - 1]; m++) raw.push(rows.get(m) ?? raw[raw.length - 1]);
    data = {
      t: 'TAIEXTR',
      c: 'TWD',
      s: monthName(months[0]),
      tr: raw.map((v) => round((v / raw[0]) * 100)),
      raw,
    };
    // 0050 tracks the index less its fees: a gap above 2 points a year means bad data somewhere.
    const etf = existsSync(new URL('0050.TW.json', OUT))
      ? (JSON.parse(readFileSync(new URL('0050.TW.json', OUT), 'utf8')) as PriceFile)
      : undefined;
    if (etf) {
      const e0 = monthIndex(etf.s);
      for (let y = Math.floor(e0 / 12) + 1; y * 12 + 11 < months[0] + raw.length; y++) {
        const at = (s: PriceFile, m: number) => s.tr[m - monthIndex(s.s)];
        const a = at(etf, y * 12 + 11) / at(etf, y * 12 - 1) - 1;
        const b = at(data, y * 12 + 11) / at(data, y * 12 - 1) - 1;
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 0.02)
          warn(`0050 vs TAIEX total return in ${y}: ${(a * 100).toFixed(1)}% vs ${(b * 100).toFixed(1)}%`);
      }
    }
  } catch (e) {
    const etf = new URL('0050.TW.json', OUT);
    if (old?.raw) {
      // Keep the TWSE-based series rather than downgrade it; next month tries again.
      warn(`TAIEX total return: ${e instanceof Error ? e.message : String(e)}, kept the TWSE file`);
      entries.push({
        t: 'TAIEXTR',
        n: name,
        nz: nameZh,
        k: 'index',
        sec: 'market',
        f: old.s,
        c: 'TWD',
        m: 'TW',
      });
      return;
    }
    if (!existsSync(etf)) {
      warn('TAIEX total return: no TWSE data and no 0050 file, skipped');
      return;
    }
    warn(`TAIEX total return: ${e instanceof Error ? e.message : String(e)}, using 0050's total return`);
    const f = JSON.parse(readFileSync(etf, 'utf8')) as PriceFile;
    data = { t: 'TAIEXTR', c: 'TWD', s: f.s, tr: f.tr };
    name = 'TAIEX total return (tracked by 0050)';
    nameZh = '加權報酬指數（以0050代表）';
  }
  writeFileSync(file, JSON.stringify(data));
  entries.push({
    t: 'TAIEXTR',
    n: name,
    nz: nameZh,
    k: 'index',
    sec: 'market',
    f: data.s,
    c: 'TWD',
    m: 'TW',
  });
  console.log(`TAIEXTR: ${data.s}, ${data.tr.length} months`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const indexPath = new URL('index.json', OUT);
  const previous: PriceIndex | undefined = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, 'utf8')) as PriceIndex)
    : undefined;
  const entries: IndexEntry[] = [];
  const sources = new Set<string>();
  let asOf = 0;

  for (const { ticker, yahoo: symbol, name, nameZh, kind, sector, currency, market } of ITEMS) {
    const file = new URL(`${ticker}.json`, OUT);
    const keep = () => {
      const old = previous?.tickers.find((e) => e.t === ticker);
      if (old && existsSync(file)) {
        entries.push(old);
        const p = JSON.parse(readFileSync(file, 'utf8')) as PriceFile;
        asOf = Math.max(asOf, monthIndex(p.s) + p.tr.length - 1);
      }
    };
    if (only.size && !only.has(ticker)) {
      keep();
      continue;
    }
    try {
      const m = await monthly(symbol);
      sources.add(m.source);
      for (let i = 1; i < m.adj.length; i++) {
        const move = m.adj[i] / m.adj[i - 1] - 1;
        if (Math.abs(move) > 0.6)
          warn(`${ticker}: ${(move * 100).toFixed(0)}% in ${monthName(m.first + i)}, please review`);
      }
      const data: PriceFile = {
        t: ticker,
        ...(currency === 'TWD' ? { c: currency } : {}),
        s: monthName(m.first),
        tr: m.adj.map((v) => round((v / m.adj[0]) * 100)),
        // Without an unadjusted close, the app uses the total-return index for price only too.
        ...(m.priceOnly ? { p: m.close.map((v) => round((v / m.close[0]) * 100)) } : {}),
      };
      const text = JSON.stringify(data);
      if (text.length > MAX_FILE) warn(`${ticker}: ${text.length} bytes, above 8 KB`);
      writeFileSync(file, text);
      if (market === 'TW' && kind !== 'index') checkDividends(ticker, data);
      entries.push({
        t: ticker,
        n: name,
        ...(nameZh ? { nz: nameZh } : {}),
        k: kind,
        sec: sector,
        f: data.s,
        ...(market === 'TW' ? { c: currency, m: market } : {}),
      });
      asOf = Math.max(asOf, m.first + m.adj.length - 1);
      console.log(`${ticker}: ${data.s} to ${monthName(m.first + m.adj.length - 1)} (${m.source})`);
    } catch (e) {
      warn(`${ticker}: download failed (${e instanceof Error ? e.message : String(e)}), kept the old file`);
      keep();
      // The default benchmark is first in the list: if it fails, every source is blocked.
      if (ticker === 'SPY' && !entries.some((x) => x.t === 'SPY'))
        throw new Error('SPY could not be downloaded', { cause: e });
    }
    await sleep(800);
  }
  if (!entries.some((e) => e.t === 'SPY')) throw new Error('SPY is missing: the default benchmark needs it');

  await taiexTotalReturn(entries);

  let fx: boolean;
  try {
    writeFileSync(new URL('fx.json', OUT), JSON.stringify(await monthEndFx()));
    fx = true;
  } catch (e) {
    warn(`USD/TWD: ${e instanceof Error ? e.message : String(e)}, kept the old file`);
    fx = existsSync(new URL('fx.json', OUT));
  }

  const index: PriceIndex = {
    asOf: monthName(asOf),
    built: new Date().toISOString().slice(0, 10),
    source: `${[...sources].map((x) => (x === 'Yahoo' ? 'Yahoo Finance' : x)).join(' and ') || previous?.source.split(';')[0] || 'Yahoo Finance'} monthly adjusted closes; TAIEX total return from TWSE; month-end USD/TWD from Yahoo (TWD=X) or FRED (DEXTAUS)`,
    tickers: entries,
    fx,
  };
  writeFileSync(indexPath, JSON.stringify(index));

  const folder = readdirSync(OUT).reduce((s, f) => s + statSync(new URL(f, OUT)).size, 0);
  console.log(`${entries.length} tickers, data to ${index.asOf}, ${(folder / 1024).toFixed(0)} KB in all`);
  if (folder > MAX_FOLDER) throw new Error('The price folder is above 5 MB');
  if (warnings.length) console.log(`\n${warnings.length} warnings:\n${warnings.join('\n')}`);
}

await main();

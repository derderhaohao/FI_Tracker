// Builds the Time Machine's static price files (PRD Part B, TM-4):
//   public/data/prices/index.json        tickers, names, first month, data month
//   public/data/prices/<TICKER>.json     monthly total-return and price-only indices
//   public/data/prices/fx.json           monthly TWD per USD (FRED EXTAUS)
//
//   npx tsx scripts/build-prices.ts [TICKER ...]
//
// Runs in GitHub Actions (.github/workflows/prices.yml): the app itself never calls a market
// API. Monthly bars come from Yahoo Finance's chart endpoint: "adjclose" (split and dividend
// adjusted) for the total-return index and "close" (split adjusted) for price only. Only
// derived indices rebased to 100 are published, rounded to 6 significant digits.
//
// Checks: gaps are filled with the previous month and reported; a monthly move above ±60% is
// reported for review; a ticker that fails to download keeps its previous file.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { UNIVERSE } from './prices-universe.ts';
import type { FxFile, IndexEntry, PriceFile, PriceIndex } from '../src/tools/time-machine/format.ts';

const OUT = new URL('../public/data/prices/', import.meta.url);
const FIRST = '1999-12'; // one month before Jan 2000, so a Jan 2000 start has a buying price
const MAX_FILE = 8 * 1024;
const MAX_FOLDER = 5 * 1024 * 1024;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

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
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    if (res.ok || attempt >= 3 || res.status === 404) return res;
    await sleep(2000 * 2 ** attempt);
  }
}

interface Monthly {
  first: number;
  adj: number[];
  close: number[];
}

/** Monthly closes from Yahoo, keyed by calendar month, complete months only. */
async function yahoo(symbol: string): Promise<Monthly> {
  const p1 = Math.floor(Date.UTC(1999, 11, 1) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const host = ['query1', 'query2'];
  let body: unknown;
  for (const h of host) {
    const res = await get(
      `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1mo&events=div%2Csplit&includeAdjustedClose=true`,
    );
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
  if (!r?.timestamp?.length) throw new Error('no data');
  const offset = r.meta.gmtoffset ?? 0;
  const rows = new Map<number, { adj: number; close: number }>();
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
  if (rows.size === 0) throw new Error('no complete months');
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

/** Monthly average TWD per USD from FRED (no key needed for the CSV download). */
async function fred(): Promise<FxFile> {
  const res = await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXTAUS');
  if (!res.ok) throw new Error(`FRED ${res.status}`);
  const rows = (await res.text())
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .map(([d, v]) => [monthIndex(d), Number(v)] as const)
    .filter(([m, v]) => m >= monthIndex(FIRST) && m < CURRENT && v > 0);
  if (rows.length === 0) throw new Error('FRED: no rows');
  const first = rows[0][0];
  const map = new Map(rows);
  const v: number[] = [];
  for (let m = first; m <= rows[rows.length - 1][0]; m++) {
    const x = map.get(m) ?? v[v.length - 1];
    v.push(round(x));
  }
  return { s: monthName(first), v };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const indexPath = new URL('index.json', OUT);
  const previous: PriceIndex | undefined = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, 'utf8')) as PriceIndex)
    : undefined;
  const entries: IndexEntry[] = [];
  let asOf = 0;

  for (const [ticker, name, kind, sector] of UNIVERSE) {
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
      const m = await yahoo(ticker);
      for (let i = 1; i < m.adj.length; i++) {
        const move = m.adj[i] / m.adj[i - 1] - 1;
        if (Math.abs(move) > 0.6)
          warn(`${ticker}: ${(move * 100).toFixed(0)}% in ${monthName(m.first + i)}, please review`);
      }
      const data: PriceFile = {
        t: ticker,
        s: monthName(m.first),
        tr: m.adj.map((v) => round((v / m.adj[0]) * 100)),
        p: m.close.map((v) => round((v / m.close[0]) * 100)),
      };
      const text = JSON.stringify(data);
      if (text.length > MAX_FILE) warn(`${ticker}: ${text.length} bytes, above 8 KB`);
      writeFileSync(file, text);
      entries.push({ t: ticker, n: name, k: kind, sec: sector, f: data.s });
      asOf = Math.max(asOf, m.first + m.adj.length - 1);
      console.log(`${ticker}: ${data.s} to ${monthName(m.first + m.adj.length - 1)}`);
    } catch (e) {
      warn(`${ticker}: download failed (${e instanceof Error ? e.message : String(e)}), kept the old file`);
      keep();
    }
    await sleep(400);
  }
  if (!entries.some((e) => e.t === 'SPY')) throw new Error('SPY is missing: the default benchmark needs it');

  let fx: boolean;
  try {
    const f = await fred();
    writeFileSync(new URL('fx.json', OUT), JSON.stringify(f));
    fx = true;
  } catch (e) {
    warn(`USD/TWD: ${e instanceof Error ? e.message : String(e)}`);
    fx = existsSync(new URL('fx.json', OUT));
  }

  const index: PriceIndex = {
    asOf: monthName(asOf),
    built: new Date().toISOString().slice(0, 10),
    source: 'Yahoo Finance monthly adjusted closes; USD/TWD from FRED (EXTAUS)',
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

// Loads the static price files from the site itself (TM-4): same origin, so the offline-only CSP
// is unchanged. The service worker keeps every file it has served for offline use.
import type { FxFile, PriceFile, PriceIndex } from './format';
import { monthIndex, type MarketData, type Series } from './engine';

const BASE = `${import.meta.env.BASE_URL}data/prices/`;

let index: Promise<PriceIndex> | undefined;
const files = new Map<string, Promise<Series>>();
let fx: Promise<MarketData['fx']> | undefined;

async function json<T>(name: string): Promise<T> {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadIndex(): Promise<PriceIndex> {
  index ??= json<PriceIndex>('index.json').catch((e: unknown) => {
    index = undefined;
    throw e;
  });
  return index;
}

export function loadSeries(ticker: string): Promise<Series> {
  let p = files.get(ticker);
  if (!p) {
    p = json<PriceFile>(`${encodeURIComponent(ticker)}.json`).then((f) => ({
      first: monthIndex(f.s),
      tr: f.tr,
      p: f.p ?? f.tr,
      currency: f.c ?? 'USD',
    }));
    p.catch(() => files.delete(ticker));
    files.set(ticker, p);
  }
  return p;
}

export function loadFx(): Promise<MarketData['fx']> {
  fx ??= json<FxFile>('fx.json')
    .then((f) => ({ first: monthIndex(f.s), v: f.v }))
    .catch(() => {
      fx = undefined;
      return undefined;
    });
  return fx;
}

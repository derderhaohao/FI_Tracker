import type { IndexEntry, Market } from './format';

export type MarketFilter = 'all' | Market;

/** The market of an index entry; entries without one are US (TW-2). */
export const marketOf = (e: Pick<IndexEntry, 'm'>): Market => e.m ?? 'US';

/** The ticker as shown: Taiwan codes without the ".TW" suffix (2330). */
export const tickerText = (t: string) => t.replace(/\.TW$/, '');

/**
 * Tickers matching a search by code, English or Chinese name (TW-6), best first: code matches,
 * then name matches. Benchmark-only indexes and `exclude` are left out.
 */
export function searchTickers(
  entries: readonly IndexEntry[],
  query: string,
  market: MarketFilter = 'all',
  exclude: readonly string[] = [],
  limit = 8,
): IndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = entries.flatMap((e) => {
    if (e.k === 'index' || exclude.includes(e.t)) return [];
    if (market !== 'all' && marketOf(e) !== market) return [];
    const code = tickerText(e.t).toLowerCase();
    const score =
      code === q
        ? 0
        : code.startsWith(q)
          ? 1
          : e.nz?.includes(query.trim()) || e.n.toLowerCase().startsWith(q)
            ? 2
            : e.n.toLowerCase().includes(q)
              ? 3
              : -1;
    return score < 0 ? [] : [{ e, score }];
  });
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.e);
}

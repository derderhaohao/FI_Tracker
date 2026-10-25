import { describe, expect, it } from 'vitest';
import type { IndexEntry } from './format';
import { searchTickers, tickerText } from './search';

const ENTRIES: IndexEntry[] = [
  { t: 'TSM', n: 'Taiwan Semiconductor (TSMC) ADR', k: 'adr', sec: 'tech', f: '1999-12' },
  { t: '2330.TW', n: 'TSMC', nz: '台積電', k: 'stock', sec: 'tech', f: '1999-12', c: 'TWD', m: 'TW' },
  {
    t: '0050.TW',
    n: 'Yuanta Taiwan 50 ETF',
    nz: '元大台灣50',
    k: 'etf',
    sec: 'market',
    f: '2003-06',
    c: 'TWD',
    m: 'TW',
  },
  {
    t: 'TAIEXTR',
    n: 'TAIEX total return',
    nz: '加權報酬指數',
    k: 'index',
    sec: 'market',
    f: '2003-01',
    c: 'TWD',
    m: 'TW',
  },
  { t: 'AAPL', n: 'Apple', k: 'stock', sec: 'tech', f: '1999-12' },
];

describe('Time Machine search (TW-6)', () => {
  it('finds 2330 by "台積", "2330" or "tsmc"', () => {
    for (const q of ['台積', '2330', 'tsmc', 'TSMC'])
      expect(
        searchTickers(ENTRIES, q).map((e) => e.t),
        q,
      ).toContain('2330.TW');
    expect(searchTickers(ENTRIES, '2330')[0].t).toBe('2330.TW');
  });

  it('filters by market and leaves out benchmark-only indexes', () => {
    expect(searchTickers(ENTRIES, 'tsm', 'US').map((e) => e.t)).toEqual(['TSM']);
    expect(searchTickers(ENTRIES, 'tsmc', 'TW').map((e) => e.t)).toEqual(['2330.TW']);
    expect(searchTickers(ENTRIES, 'taiex')).toEqual([]);
    expect(searchTickers(ENTRIES, 'apple', 'all', ['AAPL'])).toEqual([]);
  });

  it('shows Taiwan codes without the suffix', () => {
    expect(tickerText('0050.TW')).toBe('0050');
    expect(tickerText('BRK-B')).toBe('BRK-B');
  });
});

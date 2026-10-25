import { describe, expect, it } from 'vitest';
import { monthIndex, simulate, type Series } from './engine';
import type { PriceFile, PriceIndex } from './format';
import { defaultScenario } from './state';

/** The generated price files (TM-4), when the refresh workflow has written them. */
const FILES = import.meta.glob<string>('../../../public/data/prices/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const byName = new Map(Object.entries(FILES).map(([path, text]) => [path.split('/').pop()!, text]));
const index = byName.has('index.json') ? (JSON.parse(byName.get('index.json')!) as PriceIndex) : undefined;

describe.skipIf(!index)('Time Machine price files', () => {
  it('keeps each file under 8 KB and the folder under 5 MB', () => {
    let total = 0;
    for (const [name, text] of byName) {
      total += text.length;
      if (name !== 'index.json' && name !== 'fx.json')
        expect(text.length, name).toBeLessThanOrEqual(8 * 1024);
    }
    expect(total).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('lists a file for every ticker, SPY included', () => {
    expect(index!.tickers.some((e) => e.t === 'SPY')).toBe(true);
    for (const e of index!.tickers) expect(byName.has(`${e.t}.json`), e.t).toBe(true);
  });

  it('$10,000 in SPY from Jan 2010 matches its total return within 0.1%', () => {
    const f = JSON.parse(byName.get('SPY.json')!) as PriceFile;
    const spy: Series = { first: monthIndex(f.s), tr: f.tr, p: f.p ?? f.tr };
    const sc = {
      ...defaultScenario(index!.asOf),
      holdings: [{ ticker: 'SPY', weight: 100 }],
      benchmarks: [],
    };
    const sim = simulate(sc, { series: new Map([['SPY', spy]]) });
    const expected =
      (10_000 * f.tr[monthIndex(index!.asOf) - spy.first]) / f.tr[monthIndex('2009-12') - spy.first];
    expect(Math.abs(sim.portfolio.values[sim.months] / expected - 1)).toBeLessThan(0.001);
  });
});

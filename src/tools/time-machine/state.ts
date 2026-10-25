// Scenario state (TM-3, TM-13, TM-23): the scenario lives in the URL hash query as `?s=`, and the
// last scenario plus any saved ones in one localStorage key. Nothing goes to IndexedDB.
import type { Benchmark, Holding, Scenario } from './engine';

export const STORAGE_KEY = 'fi-tracker-tm-last';
export const MAX_HOLDINGS = 10;
export const MAX_BENCHMARKS = 3;
export const FIRST_MONTH = '2000-01';

export interface SavedScenario {
  name: string;
  scenario: Scenario;
}

interface Stored {
  last?: Scenario;
  saved?: SavedScenario[];
}

export function defaultScenario(end: string): Scenario {
  return {
    amount: 10_000,
    start: '2010-01',
    end,
    holdings: [
      { ticker: 'AAPL', weight: 50 },
      { ticker: 'MSFT', weight: 50 },
    ],
    late: 'cash',
    rebalance: 'none',
    topUp: 0,
    priceOnly: false,
    benchmarks: [{ kind: 'ticker', ticker: 'SPY' }],
    currency: 'USD',
  };
}

const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const month = (v: unknown, d: string) => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : d);
const pick = <T extends string>(v: unknown, options: readonly T[], d: T): T =>
  options.includes(v as T) ? (v as T) : d;

function benchmark(v: unknown): Benchmark | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const b = v as Record<string, unknown>;
  switch (b.kind) {
    case 'ticker':
      return typeof b.ticker === 'string' ? { kind: 'ticker', ticker: b.ticker.toUpperCase() } : undefined;
    case 'cash':
    case 'fixed':
      return { kind: b.kind, rate: num(b.rate, 0.02, -0.5, 1) };
    case 'property': {
      const years: Record<number, number> = {};
      if (b.years && typeof b.years === 'object')
        for (const [y, g] of Object.entries(b.years as Record<string, unknown>))
          if (/^\d{4}$/.test(y) && typeof g === 'number' && Number.isFinite(g)) years[Number(y)] = g;
      const m = b.mortgage as Record<string, unknown> | undefined;
      return {
        kind: 'property',
        name: typeof b.name === 'string' ? b.name.slice(0, 60) : '',
        growth: num(b.growth, 0.03, -0.5, 1),
        years: Object.keys(years).length ? years : undefined,
        rent: num(b.rent, 0, 0, 0.5),
        rentMode: pick(b.rentMode, ['cash', 'reinvest'] as const, 'cash'),
        buyCost: num(b.buyCost, 0, 0, 0.5),
        sellCost: num(b.sellCost, 0, 0, 0.5),
        mortgage:
          m && typeof m === 'object'
            ? {
                down: num(m.down, 0.2, 0.01, 1),
                rate: num(m.rate, 0.03, 0, 0.5),
                years: num(m.years, 30, 1, 50),
              }
            : undefined,
      };
    }
  }
  return undefined;
}

/** Fills in and bounds a scenario from untrusted input (a link or storage). */
export function sanitize(v: unknown, end: string): Scenario {
  const d = defaultScenario(end);
  if (!v || typeof v !== 'object') return d;
  const s = v as Record<string, unknown>;
  const holdings: Holding[] = Array.isArray(s.holdings)
    ? s.holdings
        .filter(
          (h): h is Record<string, unknown> => !!h && typeof h === 'object' && typeof h.ticker === 'string',
        )
        .slice(0, MAX_HOLDINGS)
        .map((h) => ({ ticker: String(h.ticker).toUpperCase(), weight: num(h.weight, 0, 0, 100) }))
    : d.holdings;
  const benchmarks = Array.isArray(s.benchmarks)
    ? s.benchmarks
        .map(benchmark)
        .filter((b): b is Benchmark => !!b)
        .slice(0, MAX_BENCHMARKS)
    : d.benchmarks;
  return {
    amount: num(s.amount, d.amount, 1, 1e12),
    start: month(s.start, d.start),
    end: month(s.end, d.end),
    holdings: holdings.length ? holdings : d.holdings,
    late: pick(s.late, ['cash', 'move'] as const, 'cash'),
    rebalance: pick(s.rebalance, ['none', 'yearly', 'quarterly'] as const, 'none'),
    topUp: num(s.topUp, 0, 0, 1e10),
    priceOnly: s.priceOnly === true,
    benchmarks,
    currency: pick(s.currency, ['USD', 'TWD'] as const, 'USD'),
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeScenario(s: Scenario): string {
  return toBase64Url(JSON.stringify(s));
}

export function decodeScenario(text: string, end: string): Scenario | undefined {
  try {
    return sanitize(JSON.parse(fromBase64Url(text)), end);
  } catch {
    return undefined;
  }
}

function read(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Stored;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function write(v: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // Storage full or blocked: the URL still holds the scenario.
  }
}

export function loadLast(end: string): Scenario | undefined {
  const last = read().last;
  return last ? sanitize(last, end) : undefined;
}

export function saveLast(s: Scenario): void {
  write({ ...read(), last: s });
}

export function loadSaved(end: string): SavedScenario[] {
  return (read().saved ?? []).map((x) => ({ name: String(x.name), scenario: sanitize(x.scenario, end) }));
}

export function storeSaved(saved: SavedScenario[]): void {
  write({ ...read(), saved });
}

/** Weights that add to exactly 100, the remainder on the first holdings (TM-6). */
export function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((100 / n) * 100) / 100;
  const out = new Array<number>(n).fill(base);
  let rest = Math.round((100 - base * n) * 100);
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i] = Math.round((out[i] + 0.01) * 100) / 100;
  return out;
}

export const weightTotal = (h: readonly Holding[]) =>
  Math.round(h.reduce((a, b) => a + b.weight, 0) * 100) / 100;

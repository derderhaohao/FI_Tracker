import { getLang, locale, t } from '@/i18n';
import type { Benchmark, Currency, Line, Simulation } from './engine';
import type { IndexEntry } from './format';
import { tickerText } from './search';

/**
 * Money in the scenario currency, whole units: $12,345 or NT$394,000 in every language (the
 * zh-TW locale writes a bare "$" for TWD, which would read as dollars next to US holdings).
 */
export function money(v: number, currency: Currency, compact = false): string {
  const big = compact && Math.abs(v) >= 1000;
  const n = new Intl.NumberFormat(locale(), {
    maximumFractionDigits: big ? 1 : 0,
    notation: big ? 'compact' : 'standard',
  }).format(Math.abs(v));
  return `${v < 0 ? '-' : ''}${currency === 'TWD' ? 'NT$' : '$'}${n}`;
}

export function pct(v: number | undefined, digits = 1, signed = false): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const s = new Intl.NumberFormat(locale(), {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Math.abs(v));
  if (!signed && v >= 0) return s;
  return `${v < 0 ? '−' : '+'}${s}`;
}

/** "Mar 2020" for a month index. */
export function monthText(m: number): string {
  return new Date(Date.UTC(Math.floor(m / 12), m % 12, 1)).toLocaleDateString(locale(), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function sectorLabel(s: string): string {
  const labels: Record<string, string> = {
    tech: t('Technology'),
    comms: t('Communication'),
    consumer: t('Consumer'),
    staples: t('Consumer staples'),
    health: t('Health care'),
    finance: t('Financials'),
    industrial: t('Industrials'),
    energy: t('Energy'),
    materials: t('Materials'),
    utilities: t('Utilities'),
    realEstate: t('Real estate'),
    market: t('Broad market'),
    international: t('International'),
    bonds: t('Bonds'),
    commodities: t('Commodities'),
  };
  return labels[s] ?? s;
}

export function kindLabel(k: string): string {
  return k === 'etf' ? t('ETF') : k === 'adr' ? t('ADR') : t('Stock');
}

/** The ticker benchmarks on offer (TM-8, TW-7). */
export const TICKER_BENCHMARKS = ['SPY', 'QQQ', 'VTI', 'TAIEXTR', '0050.TW', 'TAIEX'] as const;

/** A name in the UI language: Chinese for Taiwan listings in zh-TW (TW-6). */
export function entryName(e: Pick<IndexEntry, 'n' | 'nz'>): string {
  return getLang() === 'zh-TW' && e.nz ? e.nz : e.n;
}

export function benchmarkLabel(b: Benchmark): string {
  switch (b.kind) {
    case 'ticker': {
      const names: Record<string, string> = {
        SPY: t('S&P 500 (SPY)'),
        QQQ: t('Nasdaq-100 (QQQ)'),
        VTI: t('Total US market (VTI)'),
        TAIEXTR: t('TAIEX total return'),
        '0050.TW': t('Taiwan 50 (0050)'),
        TAIEX: t('TAIEX (price only, dividends not included)'),
      };
      return names[b.ticker] ?? tickerText(b.ticker);
    }
    case 'cash':
      return t('Cash at {rate}', { rate: pct(b.rate, 1) });
    case 'fixed':
      return t('Fixed {rate} a year', { rate: pct(b.rate, 1) });
    case 'property':
      return b.name || t('Property');
  }
}

export function lineLabel(line: Line, benchmarks: readonly Benchmark[]): string {
  if (line.kind === 'portfolio') return t('Your portfolio');
  if (line.kind === 'holding') return tickerText(line.name);
  const i = Number(line.id.split(':')[1]);
  return benchmarks[i] ? benchmarkLabel(benchmarks[i]) : line.name;
}

/** Line colours: the portfolio in the tool accent, benchmarks in the chart palette. */
export function lineColor(line: Line, series: string[], accent: string): string {
  if (line.kind === 'portfolio') return accent;
  const i = Number(line.id.split(':')[1]);
  return series[[1, 2, 3][i] ?? 4];
}

/** The month a point ends (point 0 is the start, before the first month). */
export const pointMonth = (sim: Simulation, k: number) => sim.startMonth + k - 1;

export function pointLabel(sim: Simulation, k: number): string {
  return k === 0
    ? t('Start of {month}', { month: monthText(sim.startMonth) })
    : t('End of {month}', { month: monthText(pointMonth(sim, k)) });
}

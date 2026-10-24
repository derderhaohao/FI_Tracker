import type { YearRow } from '@/domain/projection';

const MONEY_KEYS = [
  'liquid',
  'locked',
  'investable',
  'nonInvestable',
  'liabilities',
  'totalNetWorth',
  'fiTarget',
  'income',
  'spending',
  'savings',
  'withdrawal',
  'loanPayments',
  'streamIncome',
] as const;

/** Projection rows in today's TWD (real) or nominal TWD. */
export function toMode(rows: YearRow[], mode: 'real' | 'nominal'): YearRow[] {
  if (mode === 'real') return rows;
  return rows.map((r) => {
    const out = { ...r };
    for (const k of MONEY_KEYS) out[k] = r[k] * r.inflationIndex;
    return out;
  });
}

/** Expected inflation index after `years`, for nominal display of Monte Carlo bands. */
export function inflationIndex(inflation: number, years: number): number {
  return Math.pow(1 + inflation, years);
}

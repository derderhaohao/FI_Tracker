import { formatMoney, formatPercent, fromMinor } from '@/domain/money';

export const twd = (v: number) => formatMoney(v, 'TWD');
export const twdCompact = (v: number) => formatMoney(v, 'TWD', { compact: true });
export const pct = (v: number, d = 1) => formatPercent(v, d);

/** Fractional years from a date, as "Mar 2041". */
export function dateAfterYears(fromDate: string, years: number): string {
  const [y, m] = fromDate.split('-').map(Number);
  const months = Math.round(years * 12);
  const index = y * 12 + (m - 1) + months;
  const date = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "40% more" / "25% less": the FI budget against what you spend now, in words. */
export function budgetVsActual(budgetMinor: number | undefined, actual: number): string {
  if (budgetMinor === undefined || actual <= 0) return '';
  const d = fromMinor(budgetMinor) / actual - 1;
  if (Math.abs(d) < 0.005) return 'same';
  return `${formatPercent(Math.abs(d), 0)} ${d > 0 ? 'more' : 'less'}`;
}

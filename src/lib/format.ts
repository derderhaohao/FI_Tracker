import { formatMoney, formatPercent, fromMinor } from '@/domain/money';
import { locale, t } from '@/i18n';

export const twd = (v: number) => formatMoney(v, 'TWD');
export const twdCompact = (v: number) => formatMoney(v, 'TWD', { compact: true });
export const pct = (v: number, d = 1) => formatPercent(v, d);

/** Fractional years from a date, as "Mar 2041". */
export function dateAfterYears(fromDate: string, years: number): string {
  const [y, m] = fromDate.split('-').map(Number);
  const months = Math.round(years * 12);
  const index = y * 12 + (m - 1) + months;
  const date = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
  return date.toLocaleDateString(locale(), { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One date style for the whole app (UI-18). Months read "Sep 2026" (zh-TW "2026年9月"); full
 * dates "30 Sep 2026" (zh-TW "2026/9/30"). ISO stays only in file names and exports.
 */
export function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  if (locale() === 'zh-TW') return `${y}/${m}/${d}`;
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${d} ${month} ${y}`;
}

/** A month as "Sep 2026" (zh-TW "2026年9月"). */
export function formatMonth(month: string): string {
  return monthLabel(month);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale(), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "40% more" / "25% less": the FI budget against what you spend now, in words. */
export function budgetVsActual(budgetMinor: number | undefined, actual: number): string {
  if (budgetMinor === undefined || actual <= 0) return '';
  const d = fromMinor(budgetMinor) / actual - 1;
  if (Math.abs(d) < 0.005) return t('same');
  const p = formatPercent(Math.abs(d), 0);
  return d > 0 ? t('{p} more', { p }) : t('{p} less', { p });
}

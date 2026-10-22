/** Money helpers. Stored amounts are integer minor units (×100); projections use floats in major units. */

export const MINOR_PER_MAJOR = 100;

export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR);
}

export function fromMinor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/** Adds minor-unit amounts exactly. */
export function sumMinor(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Parses user input such as "1,234.5", "NT$ 1234" or "-12" into minor units.
 * Returns null for anything that is not a number.
 */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '').replace(/^(NT\$|US\$|\$)/i, '');
  if (cleaned === '' || cleaned === '-') return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? toMinor(value) : null;
}

const SYMBOLS: Record<string, string> = { TWD: 'NT$', USD: 'US$' };

export interface FormatOptions {
  /** Show 1.2M / 350K instead of the full number. */
  compact?: boolean;
  /** Decimal places; defaults to 0 for TWD and 2 for other currencies. */
  decimals?: number;
}

/** Formats a major-unit amount, e.g. formatMoney(1234567, 'TWD') → "NT$1,234,567". */
export function formatMoney(major: number, currency = 'TWD', options: FormatOptions = {}): string {
  if (!Number.isFinite(major)) return '—';
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const sign = major < 0 ? '-' : '';
  const abs = Math.abs(major);
  if (options.compact) {
    const units: [number, string][] = [
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'K'],
    ];
    for (const [size, suffix] of units) {
      if (abs >= size) {
        const scaled = abs / size;
        return `${sign}${symbol}${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}${suffix}`;
      }
    }
  }
  const decimals = options.decimals ?? (currency === 'TWD' ? 0 : 2);
  const text = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${symbol}${text}`;
}

export function formatMinor(minor: number, currency = 'TWD', options: FormatOptions = {}): string {
  return formatMoney(fromMinor(minor), currency, options);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

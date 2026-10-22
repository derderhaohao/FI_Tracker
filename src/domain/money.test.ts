import { formatMoney, formatPercent, fromMinor, parseMoneyInput, toMinor } from './money';

describe('money', () => {
  it('converts between major and minor units exactly', () => {
    expect(toMinor(1234.5)).toBe(123450);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(fromMinor(123450)).toBe(1234.5);
  });

  it('parses user input', () => {
    expect(parseMoneyInput('1,234.50')).toBe(123450);
    expect(parseMoneyInput('NT$ 2,000')).toBe(200000);
    expect(parseMoneyInput('-12')).toBe(-1200);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull();
  });

  it('formats TWD and USD', () => {
    expect(formatMoney(1234567, 'TWD')).toBe('NT$1,234,567');
    expect(formatMoney(-50.5, 'USD')).toBe('-US$50.50');
    expect(formatMoney(12_340_000, 'TWD', { compact: true })).toBe('NT$12.3M');
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatPercent(0.0425)).toBe('4.3%');
  });
});

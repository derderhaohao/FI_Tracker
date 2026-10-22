import { stamp } from '@/domain/testFixtures';
import type { Category } from '@/domain/entities';
import { parseCsv } from './csv';
import {
  detectDateFormat,
  guessAccountIds,
  guessColumn,
  HEADER_PATTERNS,
  parseAmount,
  parseDate,
  previewBalances,
  previewTransactions,
  type TransactionMapping,
} from './csvImport';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', kind: 'income', essential: false, ...stamp },
  { id: 'other-in', name: 'Other income', kind: 'income', essential: false, ...stamp },
  { id: 'food', name: 'Food', kind: 'expense', essential: true, ...stamp },
  { id: 'other', name: 'Other', kind: 'expense', essential: false, ...stamp },
];

describe('CSV parsing helpers', () => {
  it('parses dates in common bank formats', () => {
    expect(parseDate('2026/10/22')).toBe('2026-10-22');
    expect(parseDate('2026-1-5')).toBe('2026-01-05');
    expect(parseDate('20261022')).toBe('2026-10-22');
    expect(parseDate('115/10/22')).toBe('2026-10-22');
    expect(parseDate('1151022')).toBe('2026-10-22');
    expect(parseDate('2026年10月22日')).toBe('2026-10-22');
    expect(parseDate('22/10/2026')).toBe('2026-10-22');
    expect(parseDate('10/22/2026')).toBe('2026-10-22');
    expect(parseDate('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(parseDate('2026-10-22 13:05:00')).toBe('2026-10-22');
    expect(parseDate('2026/02/30')).toBeNull();
    expect(parseDate('hello')).toBeNull();
    expect(detectDateFormat(['115/01/02', '115/01/15', '114/12/31'])).toBe('roc');
    expect(detectDateFormat(['13/01/2026', '28/02/2026'])).toBe('dmy');
  });

  it('parses amounts with separators, symbols and negatives', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('NT$ 2,000')).toBe(2000);
    expect(parseAmount('(1,000)')).toBe(-1000);
    expect(parseAmount('500-')).toBe(-500);
    expect(parseAmount('+30')).toBe(30);
    expect(parseAmount('2,500元')).toBe(2500);
    expect(parseAmount('12.3456')).toBe(12.3456);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('guesses columns from English and Chinese headers', () => {
    expect(guessColumn(['交易日期', '摘要', '支出', '存入', '餘額'], HEADER_PATTERNS.date)).toBe(0);
    expect(guessColumn(['交易日期', '摘要', '支出', '存入', '餘額'], HEADER_PATTERNS.debit)).toBe(2);
    expect(guessColumn(['Date', 'Description', 'Amount'], HEADER_PATTERNS.amount)).toBe(2);
    expect(guessColumn(['x'], HEADER_PATTERNS.amount)).toBeUndefined();
  });
});

describe('transaction import', () => {
  const base: TransactionMapping = {
    date: 0,
    description: 1,
    amount: 2,
    positiveIsExpense: false,
    dateFormat: 'auto',
    defaultCurrency: 'TWD',
    defaultIncomeCategoryId: 'other-in',
    defaultExpenseCategoryId: 'other',
    hasHeader: true,
  };

  it('signs, categorises and flags errors', () => {
    const rows = parseCsv(
      'Date,Description,Amount,Category\n2026/10/01,Payroll,"86,500",Salary\n2026/10/02,Lunch,-180,Food\n2026/10/03,Refund,50,\nbad,x,1,\n2026/10/04,No amount,,\n',
    );
    const p = previewTransactions(rows, { ...base, category: 3 }, categories, []);
    expect(p.rows.map((r) => [r.date, r.kind, r.categoryId, r.amountMinor])).toEqual([
      ['2026-10-01', 'income', 'salary', 8_650_000],
      ['2026-10-02', 'expense', 'food', 18_000],
      ['2026-10-03', 'income', 'other-in', 5_000],
    ]);
    expect(p.errors.map((e) => e.line)).toEqual([5, 6]);
  });

  it('reads debit and credit columns, and credit-card signs', () => {
    const rows = parseCsv('交易日期,摘要,支出,存入\n115/10/01,薪資,,"86,500"\n115/10/02,超市,"1,200",\n');
    const p = previewTransactions(rows, { ...base, amount: undefined, debit: 2, credit: 3 }, categories, []);
    expect(p.rows.map((r) => [r.date, r.kind, r.amountMinor])).toEqual([
      ['2026-10-01', 'income', 8_650_000],
      ['2026-10-02', 'expense', 120_000],
    ]);
    const card = previewTransactions(
      parseCsv('d,m,a\n2026-10-05,Coffee,120\n'),
      { ...base, positiveIsExpense: true },
      categories,
      [],
    );
    expect(card.rows[0].kind).toBe('expense');
  });

  it('marks rows already imported as duplicates', () => {
    const rows = parseCsv(
      'Date,Description,Amount\n2026-10-02,Lunch,-180\n2026-10-02,Lunch,-180\n2026-10-03,Lunch,-180\n',
    );
    const existing = [
      {
        id: 'x',
        month: '2026-10',
        date: '2026-10-02',
        categoryId: 'food',
        amountMinor: 18_000,
        currency: 'TWD',
        lumpSum: false,
        note: 'lunch',
        ...stamp,
      },
    ];
    const p = previewTransactions(rows, base, categories, existing);
    expect(p.rows.map((r) => r.duplicate)).toEqual([true, true, false]);
  });
});

describe('balance import', () => {
  it('maps account names and keeps the last row per account and date', () => {
    const accounts = [
      {
        id: 'a1',
        nickname: 'Everyday account',
        institution: '',
        type: 'cash' as const,
        assetClass: 'cash' as const,
        currency: 'TWD',
        investable: true,
        archived: false,
        ...stamp,
      },
    ];
    const rows = parseCsv(
      'date,account,balance\n2026-10-31,everyday account,"100,000"\n2026-10-31,Everyday Account,120000\n2026-10-31,Unknown,5\n2026-11-30,everyday account,x\n',
    );
    const accountIds = guessAccountIds(['everyday account', 'Unknown'], accounts);
    expect(accountIds).toEqual({ 'everyday account': 'a1' });
    const existing = [{ id: 's', date: '2026-10-31', accountId: 'a1', balanceMinor: 1, ...stamp }];
    const p = previewBalances(
      rows,
      { date: 0, account: 1, balance: 2, dateFormat: 'auto', hasHeader: true, accountIds },
      existing,
    );
    expect(p.rows).toEqual([
      { line: 3, date: '2026-10-31', accountId: 'a1', balanceMinor: 12_000_000, replaces: true },
    ]);
    expect(p.unmatched).toEqual(['Unknown']);
    expect(p.errors).toEqual([{ line: 5, message: 'No balance' }]);
  });
});

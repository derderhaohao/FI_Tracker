/**
 * CSV import from bank and broker exports (POS-8). Exports differ per institution, so
 * the caller maps columns; these functions parse, validate and de-duplicate rows.
 */
import type { Account, CashFlow, Category, Snapshot } from '@/domain/entities';
import { monthOf } from '@/domain/dates';
import { toMinor } from '@/domain/money';

export type DateFormat = 'auto' | 'ymd' | 'roc' | 'dmy' | 'mdy';

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: 'Detect',
  ymd: 'Year-month-day (2026/10/22)',
  roc: '民國 year (115/10/22)',
  dmy: 'Day/month/year (22/10/2026)',
  mdy: 'Month/day/year (10/22/2026)',
};

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parses a date cell to `YYYY-MM-DD`; null when it is not a valid date in that format. */
export function parseDate(text: string, format: DateFormat = 'auto'): string | null {
  const t = text
    .trim()
    .replace(/[年月]/g, '/')
    .replace(/日/g, '')
    .split(/[ T]/)[0];
  let parts: number[];
  if (/^\d{8}$/.test(t)) parts = [Number(t.slice(0, 4)), Number(t.slice(4, 6)), Number(t.slice(6, 8))];
  else if (/^\d{7}$/.test(t)) parts = [Number(t.slice(0, 3)), Number(t.slice(3, 5)), Number(t.slice(5, 7))];
  else {
    const m = t.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
    if (!m) return null;
    parts = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const [a, b, c] = parts;
  const as = (f: Exclude<DateFormat, 'auto'>) => {
    switch (f) {
      case 'ymd':
        return validDate(a, b, c);
      case 'roc':
        return a < 1000 ? validDate(a + 1911, b, c) : null;
      case 'dmy':
        return validDate(c, b, a);
      case 'mdy':
        return validDate(c, a, b);
    }
  };
  if (format !== 'auto') return as(format);
  if (a >= 1000) return as('ymd');
  if (c >= 1000) return a > 12 ? as('dmy') : as('mdy');
  if (a > 31) return as('roc');
  return null;
}

/** Detects the date format that parses the most sample cells. */
export function detectDateFormat(samples: readonly string[]): Exclude<DateFormat, 'auto'> {
  const formats: Exclude<DateFormat, 'auto'>[] = ['ymd', 'roc', 'dmy', 'mdy'];
  let best: Exclude<DateFormat, 'auto'> = 'ymd';
  let bestCount = -1;
  for (const f of formats) {
    const count = samples.filter((s) => parseDate(s, f) !== null).length;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses an amount cell: thousands separators, currency symbols, `(1,234)` and
 * trailing-minus negatives. Returns major units, or null when not a number.
 */
export function parseAmount(text: string): number | null {
  let t = text.trim();
  if (t === '' || t === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('-')) {
    negative = !negative;
    t = t.slice(0, -1);
  }
  t = t
    .replace(/[,\s]/g, '')
    .replace(/^(NT\$|US\$|NTD|TWD|USD|\$|＄)/i, '')
    .replace(/(元|NTD|TWD|USD)$/i, '');
  if (t.startsWith('+')) t = t.slice(1);
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const value = Number(t);
  return negative ? -value : value;
}

export interface TransactionMapping {
  date: number;
  description?: number;
  category?: number;
  currency?: number;
  /** Single signed column (negative = spending unless flipped). */
  amount?: number;
  /** Separate money-out and money-in columns. */
  debit?: number;
  credit?: number;
  /** Treat positive amounts as spending (credit-card statements). */
  positiveIsExpense: boolean;
  dateFormat: DateFormat;
  defaultCurrency: string;
  /** Used when no category column matches. */
  defaultIncomeCategoryId: string;
  defaultExpenseCategoryId: string;
  hasHeader: boolean;
}

export interface ParsedTransaction {
  line: number;
  date: string;
  month: string;
  categoryId: string;
  /** Minor units, positive. */
  amountMinor: number;
  kind: 'income' | 'expense';
  currency: string;
  note?: string;
  duplicate: boolean;
}

export interface RowError {
  line: number;
  message: string;
}

export interface TransactionPreview {
  rows: ParsedTransaction[];
  errors: RowError[];
}

function cellAt(row: readonly string[], i: number | undefined): string {
  return i === undefined ? '' : (row[i] ?? '').trim();
}

export function transactionKey(
  date: string,
  amountMinor: number,
  categoryKind: string,
  note: string | undefined,
): string {
  return `${date}|${amountMinor}|${categoryKind}|${(note ?? '').trim().toLowerCase()}`;
}

/** Parses and validates transaction rows; existing dated entries mark duplicates. */
export function previewTransactions(
  rows: readonly string[][],
  map: TransactionMapping,
  categories: readonly Category[],
  existing: readonly CashFlow[],
): TransactionPreview {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
  const seen = new Set(
    existing
      .filter((e) => e.date)
      .map((e) => transactionKey(e.date!, e.amountMinor, kindOf.get(e.categoryId) ?? '', e.note)),
  );
  const out: TransactionPreview = { rows: [], errors: [] };
  const body = map.hasHeader ? rows.slice(1) : rows;
  const format =
    map.dateFormat === 'auto'
      ? detectDateFormat(body.slice(0, 50).map((r) => cellAt(r, map.date)))
      : map.dateFormat;
  body.forEach((row, i) => {
    const line = i + (map.hasHeader ? 2 : 1);
    if (row.every((c) => c.trim() === '')) return;
    const date = parseDate(cellAt(row, map.date), format);
    if (!date) return out.errors.push({ line, message: `Unreadable date “${cellAt(row, map.date)}”` });
    let signed: number | null;
    if (map.amount !== undefined) {
      const v = parseAmount(cellAt(row, map.amount));
      signed = v === null ? null : map.positiveIsExpense ? -v : v;
    } else {
      const out_ = parseAmount(cellAt(row, map.debit)) ?? 0;
      const in_ = parseAmount(cellAt(row, map.credit)) ?? 0;
      signed = out_ === 0 && in_ === 0 ? null : Math.abs(in_) - Math.abs(out_);
    }
    if (signed === null) return out.errors.push({ line, message: 'No amount' });
    if (signed === 0) return;
    const kind: 'income' | 'expense' = signed > 0 ? 'income' : 'expense';
    const named = byName.get(cellAt(row, map.category).toLowerCase());
    const categoryId =
      named && named.kind === kind
        ? named.id
        : kind === 'income'
          ? map.defaultIncomeCategoryId
          : map.defaultExpenseCategoryId;
    const currency = (cellAt(row, map.currency) || map.defaultCurrency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      return out.errors.push({ line, message: `Unknown currency “${currency}”` });
    const amountMinor = toMinor(Math.abs(signed));
    const note = cellAt(row, map.description).slice(0, 500) || undefined;
    const key = transactionKey(date, amountMinor, kind, note);
    const duplicate = seen.has(key);
    seen.add(key);
    out.rows.push({
      line,
      date,
      month: monthOf(date),
      categoryId,
      amountMinor,
      kind,
      currency,
      note,
      duplicate,
    });
  });
  return out;
}

export interface BalanceMapping {
  date: number;
  account: number;
  balance: number;
  dateFormat: DateFormat;
  hasHeader: boolean;
  /** Account name in the file (lower-cased) → account id; unmapped names are skipped. */
  accountIds: Record<string, string>;
}

export interface ParsedBalance {
  line: number;
  date: string;
  accountId: string;
  balanceMinor: number;
  /** An existing snapshot for this account and date will be overwritten. */
  replaces: boolean;
}

export interface BalancePreview {
  rows: ParsedBalance[];
  errors: RowError[];
  /** Account names in the file that are not mapped yet. */
  unmatched: string[];
}

/** Names in the file matched to account nicknames, case-insensitively. */
export function guessAccountIds(
  names: readonly string[],
  accounts: readonly Account[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const key = n.trim().toLowerCase();
    const a = accounts.find((x) => x.nickname.trim().toLowerCase() === key);
    if (a) out[key] = a.id;
  }
  return out;
}

export function distinctColumnValues(
  rows: readonly string[][],
  column: number,
  hasHeader: boolean,
): string[] {
  const body = hasHeader ? rows.slice(1) : rows;
  return [...new Set(body.map((r) => (r[column] ?? '').trim()).filter(Boolean))];
}

/** Parses balance rows for the snapshot grid; later rows win for the same account and date. */
export function previewBalances(
  rows: readonly string[][],
  map: BalanceMapping,
  existing: readonly Snapshot[],
): BalancePreview {
  const out: BalancePreview = { rows: [], errors: [], unmatched: [] };
  const body = map.hasHeader ? rows.slice(1) : rows;
  const format =
    map.dateFormat === 'auto'
      ? detectDateFormat(body.slice(0, 50).map((r) => cellAt(r, map.date)))
      : map.dateFormat;
  const unmatched = new Set<string>();
  const byKey = new Map<string, ParsedBalance>();
  body.forEach((row, i) => {
    const line = i + (map.hasHeader ? 2 : 1);
    if (row.every((c) => c.trim() === '')) return;
    const name = cellAt(row, map.account);
    const accountId = map.accountIds[name.toLowerCase()];
    if (!accountId) {
      if (name) unmatched.add(name);
      return;
    }
    const date = parseDate(cellAt(row, map.date), format);
    if (!date) return out.errors.push({ line, message: `Unreadable date “${cellAt(row, map.date)}”` });
    const balance = parseAmount(cellAt(row, map.balance));
    if (balance === null) return out.errors.push({ line, message: 'No balance' });
    const replaces = existing.some((s) => s.accountId === accountId && s.date === date);
    byKey.set(`${accountId}|${date}`, { line, date, accountId, balanceMinor: toMinor(balance), replaces });
  });
  out.rows = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  out.unmatched = [...unmatched];
  return out;
}

/** Guesses a column by header name, for a first mapping the user can change. */
export function guessColumn(headers: readonly string[], patterns: RegExp[]): number | undefined {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h.trim()));
    if (i >= 0) return i;
  }
  return undefined;
}

export const HEADER_PATTERNS = {
  date: [/^date$/i, /date/i, /日期/, /交易日/],
  description: [/desc/i, /memo/i, /payee/i, /merchant/i, /摘要/, /說明/, /備註/, /商店/],
  category: [/categ/i, /類別/, /分類/],
  amount: [/^amount$/i, /amount/i, /金額/],
  debit: [/debit/i, /withdraw/i, /out/i, /支出/, /提款/],
  credit: [/credit/i, /deposit/i, /\bin\b/i, /存入/, /收入/],
  currency: [/curr/i, /幣別/],
  account: [/account/i, /帳戶/, /名稱/],
  balance: [/balance/i, /value/i, /餘額/, /市值/],
};

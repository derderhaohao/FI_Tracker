import { useMemo, useState, type ReactNode } from 'react';
import { Upload, X } from 'lucide-react';
import { formatMinor } from '@/domain/money';
import { parseCsv } from '@/io/csv';
import {
  DATE_FORMAT_LABELS,
  distinctColumnValues,
  guessAccountIds,
  guessColumn,
  HEADER_PATTERNS,
  previewBalances,
  previewTransactions,
  type DateFormat,
} from '@/io/csvImport';
import { db } from '@/db/db';
import { newId, patch, save, saveMany } from '@/db/repo';
import { useAppData } from '@/app/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Select } from '@/components/ui/input';
import { Badge, Notice, Table } from '@/components/ui/misc';
import { t } from '@/i18n';

interface LoadedFile {
  name: string;
  rows: string[][];
}

/** Remembers the column mapping per file layout (header row), in this browser only. */
function useSavedMapping<T extends object>(
  kind: string,
  headers: string[],
  initial: () => T,
): [T, (m: T) => void] {
  const key = `fi-tracker-import-${kind}-${headers.join('|').slice(0, 300)}`;
  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key, value: load() }));
  function load(): T {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return { ...initial(), ...(JSON.parse(saved) as Partial<T>) };
    } catch {
      // Storage may be unavailable (private mode); fall back to guesses.
    }
    return initial();
  }
  if (state.key !== key) setState({ key, value: load() });
  const set = (value: T) => {
    setState({ key, value });
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not critical.
    }
  };
  return [state.key === key ? state.value : initial(), set];
}

function FilePicker({ onLoad, label }: { onLoad: (f: LoadedFile) => void; label: string }) {
  const [error, setError] = useState<string>();
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-2">
        <Upload className="size-4" aria-hidden /> {label}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          aria-label={t('CSV file')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            let text = await file.text();
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            const rows = parseCsv(text);
            if (rows.length === 0) setError(t('The file has no rows.'));
            else {
              setError(undefined);
              onLoad({ name: file.name, rows });
            }
          }}
        />
      </label>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <p className="mt-2 text-xs text-subtle">
        {t(
          'Export a CSV from your bank or broker. Files stay in this browser. Big5-encoded files must be saved as UTF-8 first.',
        )}
      </p>
    </div>
  );
}

function ColumnSelect({
  label,
  headers,
  value,
  onChange,
  optional,
}: {
  label: string;
  headers: string[];
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Select
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        >
          <option value="">{optional ? t('— none —') : t('— choose —')}</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || t('Column {v}', { v: i + 1 })}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function Shell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="mb-4">
      <CardHeader
        title={title}
        description={description}
        actions={
          <Button size="icon" variant="ghost" aria-label={t('Close import')} onClick={onClose}>
            <X />
          </Button>
        }
      />
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function headersOf(file: LoadedFile, hasHeader: boolean): string[] {
  const width = Math.max(...file.rows.slice(0, 20).map((r) => r.length));
  return Array.from({ length: width }, (_, i) =>
    hasHeader ? (file.rows[0][i] ?? '').trim() : t('Column {v}', { v: i + 1 }),
  );
}

interface TxnMap {
  hasHeader: boolean;
  date?: number;
  description?: number;
  category?: number;
  currency?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  mode: 'signed' | 'split';
  positiveIsExpense: boolean;
  dateFormat: DateFormat;
}

function guessTxn(headers: string[]): TxnMap {
  const debit = guessColumn(headers, HEADER_PATTERNS.debit);
  const credit = guessColumn(headers, HEADER_PATTERNS.credit);
  const amount = guessColumn(headers, HEADER_PATTERNS.amount);
  return {
    hasHeader: true,
    date: guessColumn(headers, HEADER_PATTERNS.date),
    description: guessColumn(headers, HEADER_PATTERNS.description),
    category: guessColumn(headers, HEADER_PATTERNS.category),
    currency: guessColumn(headers, HEADER_PATTERNS.currency),
    amount,
    debit,
    credit,
    mode: amount === undefined && debit !== undefined && credit !== undefined ? 'split' : 'signed',
    positiveIsExpense: false,
    dateFormat: 'auto',
  };
}

/** Imports dated transactions into cash flow (ENG-2, POS-8). */
export function TransactionImport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<LoadedFile>();
  return (
    <Shell
      title={t('Import transactions from CSV')}
      description={t('Each row becomes a dated cash-flow entry. Rows already imported are skipped.')}
      onClose={onClose}
    >
      {file ? (
        <TransactionMapper file={file} onReset={() => setFile(undefined)} onClose={onClose} />
      ) : (
        <FilePicker label={t('Choose CSV file')} onLoad={setFile} />
      )}
    </Shell>
  );
}

function TransactionMapper({
  file,
  onReset,
  onClose,
}: {
  file: LoadedFile;
  onReset: () => void;
  onClose: () => void;
}) {
  const { categories, cashFlows, settings } = useAppData();
  const income = categories.filter((c) => c.kind === 'income');
  const expense = categories.filter((c) => c.kind === 'expense');
  const firstHeaders = headersOf(file, true);
  const [map, setMap] = useSavedMapping<TxnMap>('transactions', firstHeaders, () => guessTxn(firstHeaders));
  const headers = headersOf(file, map.hasHeader);
  const [incomeCat, setIncomeCat] = useState(
    income.find((c) => /other/i.test(c.name))?.id ?? income[0]?.id ?? '',
  );
  const [expenseCat, setExpenseCat] = useState(
    expense.find((c) => /^other$/i.test(c.name))?.id ?? expense[0]?.id ?? '',
  );
  const [lumpSum, setLumpSum] = useState(false);
  const [done, setDone] = useState<string>();

  const ready =
    map.date !== undefined &&
    (map.mode === 'signed'
      ? map.amount !== undefined
      : map.debit !== undefined || map.credit !== undefined) &&
    !!incomeCat &&
    !!expenseCat;
  const preview = useMemo(
    () =>
      ready
        ? previewTransactions(
            file.rows,
            {
              date: map.date!,
              description: map.description,
              category: map.category,
              currency: map.currency,
              amount: map.mode === 'signed' ? map.amount : undefined,
              debit: map.mode === 'split' ? map.debit : undefined,
              credit: map.mode === 'split' ? map.credit : undefined,
              positiveIsExpense: map.positiveIsExpense,
              dateFormat: map.dateFormat,
              defaultCurrency: 'TWD',
              defaultIncomeCategoryId: incomeCat,
              defaultExpenseCategoryId: expenseCat,
              hasHeader: map.hasHeader,
            },
            categories,
            cashFlows,
          )
        : undefined,
    [ready, file.rows, map, incomeCat, expenseCat, categories, cashFlows],
  );
  const fresh = preview?.rows.filter((r) => !r.duplicate) ?? [];
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? '?';

  const doImport = async () => {
    await saveMany(
      db.cashFlows,
      fresh.map((r) => ({
        id: newId(),
        month: r.month,
        date: r.date,
        categoryId: r.categoryId,
        amountMinor: r.amountMinor,
        currency: r.currency,
        lumpSum,
        note: r.note,
      })),
    );
    setDone(
      t('Imported {length} transaction{v} from {name}.', {
        length: fresh.length,
        v: fresh.length === 1 ? '' : 's',
        name: file.name,
      }),
    );
  };

  if (done) {
    return (
      <>
        <Notice>{t('{done} Recategorise them in the transaction list below.', { done })}</Notice>
        <div className="flex gap-2">
          {settings.cashFlowMode === 'monthly' && (
            <Button
              onClick={() =>
                void patch(db.settings, 'singleton', { cashFlowMode: 'transactions' }).then(onClose)
              }
            >
              {t('Switch to transaction view')}
            </Button>
          )}
          <Button variant="outline" onClick={onReset}>
            {t('Import another file')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge>{file.name}</Badge>
        <span className="text-muted-foreground">{t('{length} rows', { length: file.rows.length })}</span>
        <Checkbox
          label={t('First row is a header')}
          checked={map.hasHeader}
          onChange={(e) => setMap({ ...map, hasHeader: e.target.checked })}
        />
        <Button size="sm" variant="ghost" onClick={onReset}>
          {t('Choose another file')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ColumnSelect
          label={t('Date')}
          headers={headers}
          value={map.date}
          onChange={(v) => setMap({ ...map, date: v })}
        />
        <Field label={t('Date format')}>
          {(id) => (
            <Select
              id={id}
              value={map.dateFormat}
              onChange={(e) => setMap({ ...map, dateFormat: e.target.value as DateFormat })}
            >
              {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => (
                <option key={f} value={f}>
                  {DATE_FORMAT_LABELS[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ColumnSelect
          label={t('Description')}
          headers={headers}
          value={map.description}
          onChange={(v) => setMap({ ...map, description: v })}
          optional
        />
        <ColumnSelect
          label={t('Category (matched by name)')}
          headers={headers}
          value={map.category}
          onChange={(v) => setMap({ ...map, category: v })}
          optional
        />
        <Field label={t('Amounts')}>
          {(id) => (
            <Select
              id={id}
              value={map.mode}
              onChange={(e) => setMap({ ...map, mode: e.target.value as TxnMap['mode'] })}
            >
              <option value="signed">{t('One column, signed')}</option>
              <option value="split">{t('Separate out / in columns')}</option>
            </Select>
          )}
        </Field>
        {map.mode === 'signed' ? (
          <>
            <ColumnSelect
              label={t('Amount')}
              headers={headers}
              value={map.amount}
              onChange={(v) => setMap({ ...map, amount: v })}
            />
            <div className="flex items-end pb-2">
              <Checkbox
                label={t('Positive amounts are spending (credit card)')}
                checked={map.positiveIsExpense}
                onChange={(e) => setMap({ ...map, positiveIsExpense: e.target.checked })}
              />
            </div>
          </>
        ) : (
          <>
            <ColumnSelect
              label={t('Money out (支出)')}
              headers={headers}
              value={map.debit}
              onChange={(v) => setMap({ ...map, debit: v })}
              optional
            />
            <ColumnSelect
              label={t('Money in (存入)')}
              headers={headers}
              value={map.credit}
              onChange={(v) => setMap({ ...map, credit: v })}
              optional
            />
          </>
        )}
        <ColumnSelect
          label={t('Currency')}
          headers={headers}
          value={map.currency}
          onChange={(v) => setMap({ ...map, currency: v })}
          optional
        />
        <Field label={t('Income without a category')}>
          {(id) => (
            <Select id={id} value={incomeCat} onChange={(e) => setIncomeCat(e.target.value)}>
              {income.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('Spending without a category')}>
          {(id) => (
            <Select id={id} value={expenseCat} onChange={(e) => setExpenseCat(e.target.value)}>
              {expense.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox
            label={t('Tag all as lump sums')}
            checked={lumpSum}
            onChange={(e) => setLumpSum(e.target.checked)}
          />
        </div>
      </div>

      {!ready && <Notice tone="warning">{t('Choose the date and amount columns to see a preview.')}</Notice>}
      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="good">{t('{length} to import', { length: fresh.length })}</Badge>
            {preview.rows.length - fresh.length > 0 && (
              <Badge>{t('{v} already imported', { v: preview.rows.length - fresh.length })}</Badge>
            )}
            {preview.errors.length > 0 && (
              <Badge tone="warning">{t('{length} rows skipped', { length: preview.errors.length })}</Badge>
            )}
          </div>
          {preview.errors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {preview.errors
                .slice(0, 5)
                .map((e) => t('Line {line}: {message}', { line: e.line, message: e.message }))
                .join(' · ')}
              {preview.errors.length > 5 && ' …'}
            </p>
          )}
          <Table>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Description')}</th>
                <th>{t('Category')}</th>
                <th className="text-right">{t('Amount')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 15).map((r) => (
                <tr key={r.line} className={r.duplicate ? 'opacity-50' : undefined}>
                  <td>{r.date}</td>
                  <td className="max-w-64 truncate">{r.note}</td>
                  <td>{name(r.categoryId)}</td>
                  <td className="text-right">
                    {r.kind === 'expense' ? '−' : '+'}
                    {formatMinor(r.amountMinor, r.currency)}
                  </td>
                  <td>{r.duplicate && <Badge>{t('duplicate')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {preview.rows.length > 15 && (
            <p className="text-xs text-subtle">
              {t('Showing 15 of {length} rows.', { length: preview.rows.length })}
            </p>
          )}
          <div>
            <Button disabled={fresh.length === 0} onClick={() => void doImport()}>
              {t('Import {length} transaction{v}', {
                length: fresh.length,
                v: fresh.length === 1 ? '' : 's',
              })}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

interface BalanceMap {
  hasHeader: boolean;
  date?: number;
  account?: number;
  balance?: number;
  dateFormat: DateFormat;
  accountIds: Record<string, string>;
}

/** Imports balances into the snapshot grid (POS-8). */
export function BalanceImport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<LoadedFile>();
  return (
    <Shell
      title={t('Import balances from CSV')}
      description={t(
        "One row per account and date: date, account name, balance in the account's currency. Existing balances for the same date are replaced.",
      )}
      onClose={onClose}
    >
      {file ? (
        <BalanceMapper file={file} onReset={() => setFile(undefined)} onClose={onClose} />
      ) : (
        <FilePicker label={t('Choose CSV file')} onLoad={setFile} />
      )}
    </Shell>
  );
}

function BalanceMapper({
  file,
  onReset,
  onClose,
}: {
  file: LoadedFile;
  onReset: () => void;
  onClose: () => void;
}) {
  const { accounts, snapshots } = useAppData();
  const active = accounts.filter((a) => !a.archived);
  const firstHeaders = headersOf(file, true);
  const [map, setMap] = useSavedMapping<BalanceMap>('balances', firstHeaders, () => ({
    hasHeader: true,
    date: guessColumn(firstHeaders, HEADER_PATTERNS.date),
    account: guessColumn(firstHeaders, HEADER_PATTERNS.account),
    balance: guessColumn(firstHeaders, HEADER_PATTERNS.balance),
    dateFormat: 'auto',
    accountIds: {},
  }));
  const headers = headersOf(file, map.hasHeader);
  const [done, setDone] = useState<string>();
  const names = map.account !== undefined ? distinctColumnValues(file.rows, map.account, map.hasHeader) : [];
  const accountIds = { ...guessAccountIds(names, active), ...map.accountIds };
  const ready = map.date !== undefined && map.account !== undefined && map.balance !== undefined;
  const preview = ready
    ? previewBalances(
        file.rows,
        {
          date: map.date!,
          account: map.account!,
          balance: map.balance!,
          dateFormat: map.dateFormat,
          hasHeader: map.hasHeader,
          accountIds,
        },
        snapshots,
      )
    : undefined;
  const nick = (id: string) => accounts.find((a) => a.id === id);

  const doImport = async () => {
    if (!preview) return;
    await db.transaction('rw', db.snapshots, db.settings, async () => {
      for (const r of preview.rows) {
        const existing = await db.snapshots.where('[accountId+date]').equals([r.accountId, r.date]).first();
        if (existing) await patch(db.snapshots, existing.id, { balanceMinor: r.balanceMinor });
        else
          await save(db.snapshots, {
            id: newId(),
            accountId: r.accountId,
            date: r.date,
            balanceMinor: r.balanceMinor,
          });
      }
      await patch(db.settings, 'singleton', { snapshotSinceBackup: true });
    });
    setDone(
      `Imported ${preview.rows.length} balance${preview.rows.length === 1 ? '' : 's'} from ${file.name}. Enter the FX rate for any new date in the grid.`,
    );
  };

  if (done) {
    return (
      <>
        <Notice>{done}</Notice>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>
            {t('Import another file')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge>{file.name}</Badge>
        <Checkbox
          label={t('First row is a header')}
          checked={map.hasHeader}
          onChange={(e) => setMap({ ...map, hasHeader: e.target.checked })}
        />
        <Button size="sm" variant="ghost" onClick={onReset}>
          {t('Choose another file')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ColumnSelect
          label={t('Date')}
          headers={headers}
          value={map.date}
          onChange={(v) => setMap({ ...map, date: v })}
        />
        <Field label={t('Date format')}>
          {(id) => (
            <Select
              id={id}
              value={map.dateFormat}
              onChange={(e) => setMap({ ...map, dateFormat: e.target.value as DateFormat })}
            >
              {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => (
                <option key={f} value={f}>
                  {DATE_FORMAT_LABELS[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ColumnSelect
          label={t('Account name')}
          headers={headers}
          value={map.account}
          onChange={(v) => setMap({ ...map, account: v })}
        />
        <ColumnSelect
          label={t('Balance')}
          headers={headers}
          value={map.balance}
          onChange={(v) => setMap({ ...map, balance: v })}
        />
      </div>
      {names.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('Match accounts')}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {names.map((n) => (
              <Field key={n} label={n}>
                {(id) => (
                  <Select
                    id={id}
                    value={accountIds[n.toLowerCase()] ?? ''}
                    onChange={(e) =>
                      setMap({ ...map, accountIds: { ...map.accountIds, [n.toLowerCase()]: e.target.value } })
                    }
                  >
                    <option value="">{t('Skip')}</option>
                    {active.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nickname} ({a.currency})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        </div>
      )}
      {preview && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge tone="good">{t('{length} balances', { length: preview.rows.length })}</Badge>
            {preview.rows.some((r) => r.replaces) && (
              <Badge tone="warning">
                {preview.rows.filter((r) => r.replaces).length} {t('replace existing')}
              </Badge>
            )}
            {preview.unmatched.length > 0 && (
              <Badge>{t('{length} account names skipped', { length: preview.unmatched.length })}</Badge>
            )}
            {preview.errors.length > 0 && (
              <Badge tone="warning">
                {t('{length} rows with errors', { length: preview.errors.length })}
              </Badge>
            )}
          </div>
          <Table>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Account')}</th>
                <th className="text-right">{t('Balance')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 15).map((r) => (
                <tr key={`${r.accountId}${r.date}`}>
                  <td>{r.date}</td>
                  <td>
                    {nick(r.accountId)?.nickname} {r.replaces && <Badge>{t('replaces')}</Badge>}
                  </td>
                  <td className="text-right">
                    {formatMinor(r.balanceMinor, nick(r.accountId)?.currency ?? 'TWD')}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div>
            <Button disabled={preview.rows.length === 0} onClick={() => void doImport()}>
              {t('Import {length} balance{v}', {
                length: preview.rows.length,
                v: preview.rows.length === 1 ? '' : 's',
              })}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

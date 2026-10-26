import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2, Upload } from 'lucide-react';
import type { CashFlow, Category, Settings } from '@/domain/entities';
import { cashFlowTwd, monthlyTotals, trailing12 } from '@/domain/cashflow';
import { addMonths, lastDayOfMonth, monthOf, today } from '@/domain/dates';
import { formatMinor, parseMoneyInput } from '@/domain/money';
import { db } from '@/db/db';
import { newId, patch, save, saveMany } from '@/db/repo';
import { useAppData } from '@/app/data';
import { MoneyInput } from '@/components/MoneyInput';
import { LineChart } from '@/components/charts/LineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Badge, EmptyState, PageHeader, Segmented, Stat, Table } from '@/components/ui/misc';
import { TransactionImport } from '@/features/import/CsvImport';
import { monthLabel, pct, twd, twdCompact } from '@/lib/format';
import { t } from '@/i18n';
import { Link } from 'react-router-dom';
import { LoanNotice } from '@/components/LoanNotice';
import { LOAN_CATEGORY, loanPaymentsInCategory } from '@/domain/loans';

const VISIBLE_MONTHS = 6;

type CashFlowMode = Settings['cashFlowMode'];

/** The grid cell's own record: a monthly TWD total that is neither a lump sum nor a dated transaction. */
function isRegular(f: CashFlow) {
  return !f.lumpSum && f.currency === 'TWD' && !f.date;
}

/** A cell's own typed amount; in the "Loan payments" row the scheduled payment stands in for it. */
function regularFlow(flows: readonly CashFlow[], month: string, categoryId: string, loanRow = false) {
  return flows.find(
    (f) => f.month === month && f.categoryId === categoryId && isRegular(f) && (loanRow || !f.scheduled),
  );
}

/**
 * Saves a grid cell. In the "Loan payments" row a typed amount replaces that month's scheduled
 * payment, 0 included (a skipped payment); clearing the cell brings the schedule back.
 */
async function setRegular(month: string, categoryId: string, minor: number | undefined, keepZero = false) {
  const existing = (
    await db.cashFlows.where('[month+categoryId]').equals([month, categoryId]).toArray()
  ).find(isRegular);
  if (minor === undefined || (minor === 0 && !keepZero)) {
    if (existing) await db.cashFlows.delete(existing.id);
    return;
  }
  if (existing) await patch(db.cashFlows, existing.id, { amountMinor: minor });
  else
    await save(db.cashFlows, {
      id: newId(),
      month,
      categoryId,
      amountMinor: minor,
      currency: 'TWD',
      lumpSum: false,
    });
}

function defaultDate(month: string): string {
  const t = today();
  return monthOf(t) === month ? t : `${month}-01`;
}

function Entries({ month, categories, mode }: { month: string; categories: Category[]; mode: CashFlowMode }) {
  const { cashFlows, fxRates } = useAppData();
  const rows = cashFlows
    .filter((f) => f.month === month && (mode === 'transactions' || !isRegular(f)))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.createdAt.localeCompare(b.createdAt));
  const [draft, setDraft] = useState({
    date: defaultDate(month),
    categoryId: categories.find((c) => c.kind === 'expense')?.id ?? categories[0]?.id ?? '',
    amount: '',
    currency: 'TWD',
    note: '',
    lumpSum: mode === 'monthly',
  });
  const [draftMonth, setDraftMonth] = useState(month);
  if (draftMonth !== month) {
    setDraftMonth(month);
    setDraft({ ...draft, date: defaultDate(month) });
  }
  const amount = parseMoneyInput(draft.amount);
  const dateOk =
    mode === 'monthly' ? draft.date === '' || monthOf(draft.date) === month : monthOf(draft.date) === month;
  const kindOf = (id: string) => categories.find((c) => c.id === id)?.kind;
  const total = rows.reduce(
    (s, f) => s + (kindOf(f.categoryId) === 'income' ? 1 : -1) * cashFlowTwd(f, fxRates),
    0,
  );

  return (
    <Card className="mt-4">
      <CardHeader
        title={
          mode === 'transactions'
            ? t('Transactions · {month}', { month: monthLabel(month) })
            : t('Other entries · {month}', { month: monthLabel(month) })
        }
        description={
          mode === 'transactions'
            ? t(
                '{length} entries, net {total}. Tag year-end bonuses and large one-off costs as lump sums so they do not distort trends.',
                { length: rows.length, total: twd(total) },
              )
            : t(
                'Lump sums, foreign-currency amounts and imported transactions. Tag year-end bonuses and large one-off costs as lump sums so they do not distort monthly trends.',
              )
        }
      />
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Category')}</th>
              <th>{t('Description')}</th>
              <th className="text-right">{t('Amount')}</th>
              <th className="text-right">{t('TWD')}</th>
              <th>{t('Tag')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap text-muted-foreground">{f.date ?? t('month')}</td>
                <td>
                  <Select
                    aria-label={t('Category')}
                    className="h-8 min-w-36"
                    value={f.categoryId}
                    onChange={(e) => void patch(db.cashFlows, f.id, { categoryId: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.kind === 'income' ? t('income') : t('expense')})
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="max-w-72 truncate text-muted-foreground" title={f.note}>
                  {f.note}
                </td>
                <td className="text-right whitespace-nowrap">
                  {kindOf(f.categoryId) === 'expense' ? '−' : '+'}
                  {formatMinor(f.amountMinor, f.currency)}
                </td>
                <td className="text-right text-muted-foreground">{twd(cashFlowTwd(f, fxRates))}</td>
                <td>
                  <button
                    onClick={() => void patch(db.cashFlows, f.id, { lumpSum: !f.lumpSum })}
                    aria-label={t('Toggle lump sum')}
                  >
                    {f.lumpSum ? (
                      <Badge tone="primary">{t('Lump sum')}</Badge>
                    ) : (
                      <Badge>{t('Regular')}</Badge>
                    )}
                  </button>
                </td>
                <td className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('Delete entry')}
                    onClick={() => void db.cashFlows.delete(f.id)}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <Input
                  aria-label={t('Date')}
                  type="date"
                  className="h-8 w-36"
                  value={draft.date}
                  min={`${month}-01`}
                  max={lastDayOfMonth(month)}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </td>
              <td>
                <Select
                  aria-label={t('New entry category')}
                  className="h-8"
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.kind === 'income' ? t('income') : t('expense')})
                    </option>
                  ))}
                </Select>
              </td>
              <td>
                <Input
                  aria-label={t('Description')}
                  className="h-8"
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder={mode === 'transactions' ? t('Supermarket') : t('Year-end bonus')}
                />
              </td>
              <td>
                <div className="flex gap-1">
                  <Input
                    aria-label={t('Currency')}
                    className="h-8 w-16"
                    maxLength={3}
                    value={draft.currency}
                    onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                  />
                  <Input
                    aria-label={t('Amount')}
                    className="h-8 text-right"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  />
                </div>
              </td>
              <td />
              <td>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.lumpSum}
                    onChange={(e) => setDraft({ ...draft, lumpSum: e.target.checked })}
                  />{' '}
                  {t('Lump sum')}
                </label>
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  disabled={
                    !draft.categoryId ||
                    amount === null ||
                    amount <= 0 ||
                    !/^[A-Z]{3}$/.test(draft.currency) ||
                    !dateOk
                  }
                  onClick={() => {
                    if (amount === null) return;
                    void save(db.cashFlows, {
                      id: newId(),
                      month,
                      date: draft.date || undefined,
                      categoryId: draft.categoryId,
                      amountMinor: amount,
                      currency: draft.currency,
                      lumpSum: draft.lumpSum,
                      note: draft.note || undefined,
                    });
                    setDraft({ ...draft, amount: '', note: '' });
                  }}
                >
                  <Plus aria-hidden /> {t('Add')}
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
        {mode === 'monthly' && (
          <p className="mt-2 text-xs text-subtle">{t('Leave the date empty for a monthly total.')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CashFlowPage() {
  const { cashFlows, categories, fxRates, settings, ctx } = useAppData();
  const loans = ctx.loans;
  const mode = settings.cashFlowMode;
  const [importing, setImporting] = useState(false);
  const totals = useMemo(
    () => monthlyTotals(cashFlows, categories, fxRates),
    [cashFlows, categories, fxRates],
  );
  const t12 = trailing12(totals);
  const dataMonths = totals.map((t) => t.month);
  const [extraMonths, setExtraMonths] = useState<string[]>([]);
  const months = [...new Set([...dataMonths, ...extraMonths])].sort();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? months : months.slice(-VISIBLE_MONTHS);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const lumpMonth = selected ?? shown.at(-1);
  const income = categories.filter((c) => c.kind === 'income');
  const expense = categories.filter((c) => c.kind === 'expense');
  const byMonth = new Map(totals.map((t) => [t.month, t]));

  const addMonth = async (copy: boolean) => {
    const next = months.length ? addMonths(months.at(-1)!, 1) : monthOf(today());
    if (copy && months.length) {
      const prev = months.at(-1)!;
      await saveMany(
        db.cashFlows,
        cashFlows
          // Loan payments fill themselves from Accounts; never copy them.
          .filter((f) => f.month === prev && isRegular(f) && !f.scheduled && !loanRow(f.categoryId))
          .map((f) => ({
            id: newId(),
            month: next,
            categoryId: f.categoryId,
            amountMinor: f.amountMinor,
            currency: f.currency,
            lumpSum: false,
          })),
      );
    }
    setExtraMonths((m) => [...m, next]);
    setSelected(next);
  };

  if (categories.length === 0) {
    return (
      <>
        <PageHeader title={t('Cash flow')} />
        <EmptyState title={t('No categories')} to="/settings#categories" action={t('Add categories')} />
      </>
    );
  }

  const loanRow = (id: string) => categories.find((c) => c.id === id)?.system === LOAN_CATEGORY;

  const section = (title: string, cats: Category[]) => (
    <>
      <tr>
        <td
          colSpan={shown.length + 1}
          className="sticky left-0 bg-surface-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </td>
      </tr>
      {cats.map((c) => (
        <tr key={c.id}>
          <td className="sticky left-0 z-10 max-w-32 bg-surface sm:max-w-none sm:min-w-44">
            {c.name}
            {c.kind === 'expense' && c.essential && !c.system && (
              <span className="ml-1 text-xs text-subtle">{t('essential')}</span>
            )}
            {c.system === LOAN_CATEGORY && (
              <Link to="/accounts" className="block text-xs text-primary hover:underline">
                {t('from loan terms in Accounts')}
              </Link>
            )}
          </td>
          {shown.map((m) => {
            const extra = byMonth.get(m)?.byCategory[c.id] ?? 0;
            const loanRow = c.system === LOAN_CATEGORY;
            const regular = regularFlow(cashFlows, m, c.id, loanRow);
            // Loan payments from Accounts shown in this cell: kept inside the typed amount, or added.
            const loan = loanRow
              ? { included: 0, added: 0 }
              : loanPaymentsInCategory(loans, categories, c.id, m);
            const scheduled = loanRow
              ? 0
              : cashFlows
                  .filter((f) => f.scheduled && f.month === m && f.categoryId === c.id)
                  .reduce((sum, f) => sum + f.amountMinor / 100, 0);
            const others = extra - (regular ? regular.amountMinor / 100 : 0) - scheduled;
            return (
              <td key={m} className="w-36 min-w-28 align-top">
                {mode === 'transactions' ? (
                  <button
                    className="block w-full py-1 text-right hover:text-primary"
                    onClick={() => setSelected(m)}
                    aria-label={t('{name} {m}: show transactions', { name: c.name, m })}
                  >
                    {extra ? twd(extra) : <span className="text-subtle">—</span>}
                  </button>
                ) : (
                  <div
                    className={regular?.scheduled ? 'text-subtle' : undefined}
                    title={
                      regular?.scheduled ? t('Scheduled from Accounts; type to change this month') : undefined
                    }
                  >
                    <MoneyInput
                      compact
                      aria-label={`${c.name} ${m}`}
                      value={regular?.amountMinor}
                      currency="TWD"
                      onCommit={(v) => {
                        if (regular?.scheduled && v === regular.amountMinor) return;
                        void setRegular(m, c.id, v, c.system === LOAN_CATEGORY);
                      }}
                    />
                  </div>
                )}
                {loan.added > 0 && (
                  <Link
                    to="/accounts"
                    className="mt-0.5 block text-right text-xs text-primary hover:underline"
                    title={t('Added from the loan terms in Accounts')}
                  >
                    {t('+ {amount} loan', { amount: twd(loan.added) })}
                  </Link>
                )}
                {loan.included > 0 && (
                  <Link
                    to="/accounts"
                    className="mt-0.5 block text-right text-xs text-subtle hover:text-primary"
                    title={t('Part of this amount, from the loan terms in Accounts')}
                  >
                    {t('incl. {amount} loan', { amount: twd(loan.included) })}
                  </Link>
                )}
                {mode === 'monthly' && Math.abs(others) > 0.5 && (
                  <div className="mt-0.5 text-right text-xs text-subtle">
                    {t('+ {others} other', { others: twdCompact(others) })}
                  </div>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Cash flow')}
        description={
          mode === 'monthly'
            ? t(
                'Monthly totals per category (net income after tax and deductions). Lump sums, foreign-currency and imported entries go below the grid.',
              )
            : t(
                'Individual dated transactions, entered or imported from CSV. The grid sums them per category and month.',
              )
        }
        actions={
          <>
            <Segmented
              label={t('Cash-flow mode')}
              value={mode}
              onChange={(m) => void patch(db.settings, 'singleton', { cashFlowMode: m })}
              options={[
                { value: 'monthly', label: t('Monthly totals') },
                { value: 'transactions', label: t('Transactions') },
              ]}
            />
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> {t('Import CSV')}
            </Button>
            <Button variant="outline" onClick={() => void addMonth(false)}>
              <Plus aria-hidden /> {t('Add month')}
            </Button>
            {mode === 'monthly' && (
              <Button onClick={() => void addMonth(true)} disabled={months.length === 0}>
                <Copy aria-hidden /> {t('Copy last month')}
              </Button>
            )}
          </>
        }
      />
      {importing && <TransactionImport onClose={() => setImporting(false)} />}
      <LoanNotice className="mb-4" />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={t('Trailing 12 months income')}
          value={twdCompact(t12.income)}
          sub={t('{monthsWithData} month{v} of data', {
            monthsWithData: t12.monthsWithData,
            v: t12.monthsWithData === 1 ? '' : 's',
          })}
        />
        <Stat
          label={t('Trailing 12 months spending')}
          value={twdCompact(t12.expense)}
          sub={t('Annualised {annualExpense} — the reality check for your FI budget', {
            annualExpense: twdCompact(t12.annualExpense),
          })}
        />
        <Stat
          label={t('Trailing 12 months savings rate')}
          value={Number.isFinite(t12.savingsRate) ? pct(t12.savingsRate) : '—'}
          sub={t('Saved {savings}', { savings: twdCompact(t12.savings) })}
        />
      </div>

      {months.length === 0 ? (
        <EmptyState title={t('No months yet')}>
          {t('Press “Add month” to start with the current month.')}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader
            title={t('Monthly totals')}
            actions={
              months.length > VISIBLE_MONTHS && (
                <Button size="sm" variant="outline" onClick={() => setShowAll(!showAll)}>
                  {showAll
                    ? t('Show last {VISIBLE_MONTHS}', { VISIBLE_MONTHS })
                    : t('Show all {length} months', { length: months.length })}
                </Button>
              )
            }
          />
          <CardContent>
            <Table className="w-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface">{t('Category')}</th>
                  {shown.map((m) => (
                    <th key={m} className="w-36 text-right">
                      <button
                        className={
                          m === lumpMonth ? 'font-semibold text-foreground' : 'hover:text-foreground'
                        }
                        onClick={() => setSelected(m)}
                      >
                        {monthLabel(m)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section(t('Income'), income)}
                {section(t('Expenses'), expense)}
                <tr className="font-medium">
                  <td className="sticky left-0 bg-surface">{t('Savings')}</td>
                  {shown.map((m) => (
                    <td key={m} className="text-right">
                      {twd(byMonth.get(m)?.savings ?? 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-surface text-muted-foreground">
                    {t('Savings rate (excl. lump sums)')}
                  </td>
                  {shown.map((m) => {
                    const t = byMonth.get(m);
                    return (
                      <td key={m} className="text-right text-muted-foreground">
                        {t && Number.isFinite(t.savingsRate) ? pct(t.savingsRate) : '—'}
                        {t && Number.isFinite(t.regularSavingsRate) && t.lumpIncome + t.lumpExpense > 0 && (
                          <> ({pct(t.regularSavingsRate)})</>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {lumpMonth && <Entries month={lumpMonth} categories={categories} mode={mode} />}

      {totals.length > 1 && (
        <Card className="mt-4">
          <CardHeader
            title={t('Savings rate trend')}
            description={t('Regular months exclude lump sums, so bonuses do not distort the trend.')}
          />
          <CardContent>
            <LineChart
              ariaLabel={t('Savings rate by month')}
              data={totals.map((t) => ({
                month: t.month,
                all: t.savingsRate,
                regular: t.regularSavingsRate,
              }))}
              xKey="month"
              xFormat={(v) => monthLabel(String(v))}
              yFormat={(v) => pct(v, 0)}
              series={[
                { key: 'regular', label: t('Excl. lump sums'), slot: 0 },
                { key: 'all', label: t('Incl. lump sums'), slot: 1, dashed: true },
              ]}
              height={240}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

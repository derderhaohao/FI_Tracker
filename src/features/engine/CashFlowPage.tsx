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

const VISIBLE_MONTHS = 6;

type CashFlowMode = Settings['cashFlowMode'];

/** The grid cell's own record: a monthly TWD total that is neither a lump sum nor a dated transaction. */
function isRegular(f: CashFlow) {
  return !f.lumpSum && f.currency === 'TWD' && !f.date;
}

function regularFlow(flows: readonly CashFlow[], month: string, categoryId: string) {
  return flows.find((f) => f.month === month && f.categoryId === categoryId && isRegular(f));
}

async function setRegular(month: string, categoryId: string, minor: number | undefined) {
  const existing = (
    await db.cashFlows.where('[month+categoryId]').equals([month, categoryId]).toArray()
  ).find(isRegular);
  if (minor === undefined || minor === 0) {
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
            ? `Transactions · ${monthLabel(month)}`
            : `Other entries · ${monthLabel(month)}`
        }
        description={
          mode === 'transactions'
            ? `${rows.length} entries, net ${twd(total)}. Tag year-end bonuses and large one-off costs as lump sums so they do not distort trends.`
            : 'Lump sums, foreign-currency amounts and imported transactions. Tag year-end bonuses and large one-off costs as lump sums so they do not distort monthly trends.'
        }
      />
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th className="text-right">TWD</th>
              <th>Tag</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap text-muted-foreground">{f.date ?? 'month'}</td>
                <td>
                  <Select
                    aria-label="Category"
                    className="h-8 min-w-36"
                    value={f.categoryId}
                    onChange={(e) => void patch(db.cashFlows, f.id, { categoryId: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.kind})
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
                    aria-label="Toggle lump sum"
                  >
                    {f.lumpSum ? <Badge tone="primary">Lump sum</Badge> : <Badge>Regular</Badge>}
                  </button>
                </td>
                <td className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete entry"
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
                  aria-label="Date"
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
                  aria-label="New entry category"
                  className="h-8"
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.kind})
                    </option>
                  ))}
                </Select>
              </td>
              <td>
                <Input
                  aria-label="Description"
                  className="h-8"
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder={mode === 'transactions' ? 'Supermarket' : 'Year-end bonus'}
                />
              </td>
              <td>
                <div className="flex gap-1">
                  <Input
                    aria-label="Currency"
                    className="h-8 w-16"
                    maxLength={3}
                    value={draft.currency}
                    onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                  />
                  <Input
                    aria-label="Amount"
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
                  Lump sum
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
                  <Plus aria-hidden /> Add
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
        {mode === 'monthly' && (
          <p className="mt-2 text-xs text-subtle">Leave the date empty for a monthly total.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CashFlowPage() {
  const { cashFlows, categories, fxRates, settings } = useAppData();
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
          .filter((f) => f.month === prev && isRegular(f))
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
        <PageHeader title="Cash flow" />
        <EmptyState title="No categories" to="/settings#categories" action="Add categories" />
      </>
    );
  }

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
            {c.kind === 'expense' && c.essential && (
              <span className="ml-1 text-xs text-subtle">essential</span>
            )}
          </td>
          {shown.map((m) => {
            const extra = byMonth.get(m)?.byCategory[c.id] ?? 0;
            const regular = regularFlow(cashFlows, m, c.id);
            const others = extra - (regular ? regular.amountMinor / 100 : 0);
            return (
              <td key={m} className="w-36 min-w-28 align-top">
                {mode === 'transactions' ? (
                  <button
                    className="block w-full py-1 text-right hover:text-primary"
                    onClick={() => setSelected(m)}
                    aria-label={`${c.name} ${m}: show transactions`}
                  >
                    {extra ? twd(extra) : <span className="text-subtle">—</span>}
                  </button>
                ) : (
                  <MoneyInput
                    compact
                    aria-label={`${c.name} ${m}`}
                    value={regular?.amountMinor}
                    currency="TWD"
                    onCommit={(v) => void setRegular(m, c.id, v)}
                  />
                )}
                {mode === 'monthly' && Math.abs(others) > 0.5 && (
                  <div className="mt-0.5 text-right text-[11px] text-subtle">
                    + {twdCompact(others)} other
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
        title="Cash flow"
        description={
          mode === 'monthly'
            ? 'Monthly totals per category (net income after tax and deductions). Lump sums, foreign-currency and imported entries go below the grid.'
            : 'Individual dated transactions, entered or imported from CSV. The grid sums them per category and month.'
        }
        actions={
          <>
            <Segmented
              label="Cash-flow mode"
              value={mode}
              onChange={(m) => void patch(db.settings, 'singleton', { cashFlowMode: m })}
              options={[
                { value: 'monthly', label: 'Monthly totals' },
                { value: 'transactions', label: 'Transactions' },
              ]}
            />
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> Import CSV
            </Button>
            <Button variant="outline" onClick={() => void addMonth(false)}>
              <Plus aria-hidden /> Add month
            </Button>
            {mode === 'monthly' && (
              <Button onClick={() => void addMonth(true)} disabled={months.length === 0}>
                <Copy aria-hidden /> Copy last month
              </Button>
            )}
          </>
        }
      />
      {importing && <TransactionImport onClose={() => setImporting(false)} />}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Trailing 12 months income"
          value={twdCompact(t12.income)}
          sub={`${t12.monthsWithData} month${t12.monthsWithData === 1 ? '' : 's'} of data`}
        />
        <Stat
          label="Trailing 12 months spending"
          value={twdCompact(t12.expense)}
          sub={`Annualised ${twdCompact(t12.annualExpense)} — the reality check for your FI budget`}
        />
        <Stat
          label="Trailing 12 months savings rate"
          value={Number.isFinite(t12.savingsRate) ? pct(t12.savingsRate) : '—'}
          sub={`Saved ${twdCompact(t12.savings)}`}
        />
      </div>

      {months.length === 0 ? (
        <EmptyState title="No months yet">Press “Add month” to start with the current month.</EmptyState>
      ) : (
        <Card>
          <CardHeader
            title="Monthly totals"
            actions={
              months.length > VISIBLE_MONTHS && (
                <Button size="sm" variant="outline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? `Show last ${VISIBLE_MONTHS}` : `Show all ${months.length} months`}
                </Button>
              )
            }
          />
          <CardContent>
            <Table className="w-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface">Category</th>
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
                {section('Income', income)}
                {section('Expenses', expense)}
                <tr className="font-medium">
                  <td className="sticky left-0 bg-surface">Savings</td>
                  {shown.map((m) => (
                    <td key={m} className="text-right">
                      {twd(byMonth.get(m)?.savings ?? 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-surface text-muted-foreground">
                    Savings rate (excl. lump sums)
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
            title="Savings rate trend"
            description="Regular months exclude lump sums, so bonuses do not distort the trend."
          />
          <CardContent>
            <LineChart
              ariaLabel="Savings rate by month"
              data={totals.map((t) => ({
                month: t.month,
                all: t.savingsRate,
                regular: t.regularSavingsRate,
              }))}
              xKey="month"
              xFormat={(v) => monthLabel(String(v))}
              yFormat={(v) => pct(v, 0)}
              series={[
                { key: 'regular', label: 'Excl. lump sums', slot: 0 },
                { key: 'all', label: 'Incl. lump sums', slot: 1, dashed: true },
              ]}
              height={240}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { BalanceImport } from '@/features/import/CsvImport';
import { ACCOUNT_TYPE_LABELS, type Account, type Holding } from '@/domain/entities';
import { monthlyTotals } from '@/domain/cashflow';
import { today } from '@/domain/dates';
import { defaultUpdateDate } from '@/features/update/updateModel';
import { exactRate, rateFor } from '@/domain/fx';
import { formatMoney, fromMinor, toMinor } from '@/domain/money';
import { latestSnapshots, netWorthAt, snapshotDates } from '@/domain/networth';
import { periodChanges } from '@/domain/reconcile';
import { db } from '@/db/db';
import { newId, patch, save, saveMany } from '@/db/repo';
import { useAppData } from '@/app/data';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge, EmptyState, Notice, PageHeader, Table } from '@/components/ui/misc';
import { formatDate, monthLabel, twd, twdCompact } from '@/lib/format';
import { LoanNotice } from '@/components/LoanNotice';
import { AccountDrawer, loanTermsText } from './AccountDrawer';
import { t } from '@/i18n';

const VISIBLE_DATES = 6;

async function markSnapshotSaved() {
  const s = await db.settings.get('singleton');
  if (s && !s.snapshotSinceBackup) await patch(db.settings, 'singleton', { snapshotSinceBackup: true });
}

async function setBalance(accountId: string, date: string, minor: number | undefined) {
  const existing = await db.snapshots.where('[accountId+date]').equals([accountId, date]).first();
  if (minor === undefined) {
    if (existing) await db.snapshots.delete(existing.id);
    return;
  }
  if (existing) await patch(db.snapshots, existing.id, { balanceMinor: minor });
  else await save(db.snapshots, { id: newId(), accountId, date, balanceMinor: minor });
  await markSnapshotSaved();
}

async function setFx(currency: string, date: string, rate: number | undefined) {
  const existing = await db.fxRates.where('[currency+date]').equals([currency, date]).first();
  if (rate === undefined || !(rate > 0)) {
    if (existing) await db.fxRates.delete(existing.id);
    return;
  }
  if (existing) await patch(db.fxRates, existing.id, { twdPerUnit: rate });
  else await save(db.fxRates, { id: newId(), currency, date, twdPerUnit: rate });
}

function FxInput({ currency, date }: { currency: string; date: string }) {
  const { fxRates } = useAppData();
  const stored = exactRate(fxRates, currency, date);
  const fallback = rateFor(fxRates, currency, date);
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      aria-label={t('{currency}/TWD on {date}', { currency, date: formatDate(date) })}
      inputMode="decimal"
      className="h-8 w-full rounded-md border border-input bg-surface px-2 text-right text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={text ?? (stored !== undefined ? String(stored) : '')}
      placeholder={fallback !== undefined ? t('{fallback} (carried)', { fallback }) : t('rate')}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === null) return;
        const n = Number(text.replace(/,/g, ''));
        void setFx(currency, date, text.trim() === '' ? undefined : Number.isFinite(n) ? n : undefined);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function HoldingsPanel({ account, date }: { account: Account; date: string }) {
  const { holdings, fxRates, snapshots } = useAppData();
  const rows = holdings.filter((h) => h.accountId === account.id && h.date === date);
  const [draft, setDraft] = useState({ ticker: '', units: '', price: '' });
  const total = rows.reduce((s, h) => s + h.units * fromMinor(h.priceMinor), 0);
  const snap = snapshots.find((s) => s.accountId === account.id && s.date === date);
  const copyPrevious = async () => {
    const prevDate = [
      ...new Set(holdings.filter((h) => h.accountId === account.id && h.date < date).map((h) => h.date)),
    ]
      .sort()
      .at(-1);
    if (!prevDate) return;
    await saveMany(
      db.holdings,
      holdings
        .filter((h) => h.accountId === account.id && h.date === prevDate)
        .map((h): Omit<Holding, 'createdAt' | 'updatedAt'> => ({
          id: newId(),
          date,
          accountId: h.accountId,
          ticker: h.ticker,
          units: h.units,
          priceMinor: h.priceMinor,
          currency: h.currency,
        })),
    );
  };
  return (
    <Card className="mt-4">
      <CardHeader
        title={t('Holdings · {nickname} · {date}', { nickname: account.nickname, date: formatDate(date) })}
        description={t(
          'Optional detail: ticker, units and price. The account balance stays the number of record.',
        )}
        actions={
          rows.length === 0 ? (
            <Button size="sm" variant="outline" onClick={() => void copyPrevious()}>
              <Copy aria-hidden /> {t('Copy previous holdings')}
            </Button>
          ) : undefined
        }
      />
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th>{t('Ticker')}</th>
              <th className="text-right">{t('Units')}</th>
              <th className="text-right">{t('Price ({currency})', { currency: account.currency })}</th>
              <th className="text-right">{t('Value')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="font-medium">{h.ticker}</td>
                <td className="text-right">{h.units.toLocaleString('en-US')}</td>
                <td className="text-right">{formatMoney(fromMinor(h.priceMinor), h.currency)}</td>
                <td className="text-right">{formatMoney(h.units * fromMinor(h.priceMinor), h.currency)}</td>
                <td className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('Remove {ticker}', { ticker: h.ticker })}
                    onClick={() => void db.holdings.delete(h.id)}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <Input
                  aria-label={t('Ticker')}
                  className="h-8"
                  value={draft.ticker}
                  onChange={(e) => setDraft({ ...draft, ticker: e.target.value.toUpperCase() })}
                  placeholder={t('VT')}
                />
              </td>
              <td>
                <Input
                  aria-label={t('Units')}
                  className="h-8 text-right"
                  inputMode="decimal"
                  value={draft.units}
                  onChange={(e) => setDraft({ ...draft, units: e.target.value })}
                />
              </td>
              <td>
                <Input
                  aria-label={t('Price')}
                  className="h-8 text-right"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </td>
              <td colSpan={2} className="text-right">
                <Button
                  size="sm"
                  disabled={
                    !draft.ticker ||
                    !(Number(draft.units) >= 0) ||
                    !(Number(draft.price) >= 0) ||
                    draft.units === '' ||
                    draft.price === ''
                  }
                  onClick={() => {
                    void save(db.holdings, {
                      id: newId(),
                      date,
                      accountId: account.id,
                      ticker: draft.ticker.trim(),
                      units: Number(draft.units),
                      priceMinor: toMinor(Number(draft.price)),
                      currency: account.currency,
                    });
                    setDraft({ ticker: '', units: '', price: '' });
                  }}
                >
                  <Plus aria-hidden /> {t('Add')}
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span>
              {t('Holdings total')} <strong>{formatMoney(total, account.currency)}</strong>
              {account.currency !== 'TWD' && rateFor(fxRates, account.currency, date) !== undefined && (
                <span className="text-subtle">
                  {' '}
                  ≈ {twd(total * rateFor(fxRates, account.currency, date)!)}
                </span>
              )}
            </span>
            {(!snap || Math.abs(fromMinor(snap.balanceMinor) - total) > 0.005) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void setBalance(account.id, date, toMinor(total))}
              >
                {t('Use as balance')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Bucket = 'own' | 'locked' | 'owe';

/** What changed per month as one bar: saved, markets and FX, each signed (UX doc, M2). */
function ChangeBars({ rows }: { rows: ReturnType<typeof periodChanges> }) {
  const parts = [
    { key: 'contributions', label: t('Saved'), color: 'var(--series-1)' },
    { key: 'marketReturn', label: t('Markets'), color: 'var(--series-3)' },
    { key: 'fxEffect', label: t('Exchange rate'), color: 'var(--series-5)' },
  ] as const;
  const recent = rows.slice(-12);
  const max = Math.max(
    1,
    ...recent.map((r) =>
      Math.max(
        parts.reduce((s, p) => s + Math.max(0, r[p.key]), 0),
        parts.reduce((s, p) => s - Math.min(0, r[p.key]), 0),
      ),
    ),
  );
  return (
    <>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1.5 text-sm">
        {recent
          .slice()
          .reverse()
          .map((r) => {
            let pos = 0;
            let neg = 0;
            return (
              <li
                key={r.to}
                className="grid grid-cols-[5.5rem_1fr_6rem] items-center gap-2"
                aria-label={t('{month}: {change}, saved {saved}, markets {markets}, exchange rate {fx}', {
                  month: monthLabel(r.to.slice(0, 7)),
                  change: twdCompact(r.change),
                  saved: twdCompact(r.contributions),
                  markets: twdCompact(r.marketReturn),
                  fx: twdCompact(r.fxEffect),
                })}
              >
                <span className="text-muted-foreground">{monthLabel(r.to.slice(0, 7))}</span>
                <span className="relative h-3 rounded bg-surface-2" aria-hidden>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  {parts.map((p) => {
                    const v = r[p.key];
                    const w = (Math.abs(v) / max) * 50;
                    const left = v >= 0 ? 50 + (pos / max) * 50 : 50 - ((neg - v) / max) * 50;
                    if (v >= 0) pos += v;
                    else neg -= v;
                    return (
                      <span
                        key={p.key}
                        className="absolute inset-y-0"
                        style={{ left: `${left}%`, width: `${w}%`, background: p.color }}
                      />
                    );
                  })}
                </span>
                <span className="text-right tabular">
                  {r.change >= 0 ? '+' : '−'}
                  {twdCompact(Math.abs(r.change))}
                  {r.check?.flagged && (
                    <Badge tone="warning" className="ml-1">
                      {t('Check')}
                    </Badge>
                  )}
                </span>
              </li>
            );
          })}
      </ul>
    </>
  );
}

/**
 * My money → Balances (UX doc, M2): accounts grouped as what you own, what is locked and what
 * you owe, with subtotals and net worth; details open in a side drawer. Below, the monthly
 * history reads first: only the latest month is editable without an Edit click.
 */
export function BalancesPage() {
  const data = useAppData();
  const { accounts, snapshots, fxRates, settings, ctx, liabilities, categories } = data;
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const allDates = snapshotDates(snapshots);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const dates = [...new Set([...allDates, ...extraDates])].sort();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? dates : dates.slice(-VISIBLE_DATES);
  const [newDate, setNewDate] = useState(() => defaultUpdateDate(today()));
  const [holdingsFor, setHoldingsFor] = useState<{ accountId: string; date: string }>();
  const [importing, setImporting] = useState(false);
  const [drawer, setDrawer] = useState<Account | 'new'>();
  const [editingDates, setEditingDates] = useState<string[]>([]);
  const currencies = [...new Set(active.map((a) => a.currency).filter((c) => c !== 'TWD'))].sort();
  const totals = useMemo(
    () => monthlyTotals(data.cashFlows, data.categories, fxRates),
    [data.cashFlows, data.categories, fxRates],
  );
  const drawerEl = drawer && (
    <AccountDrawer account={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(undefined)} />
  );

  if (active.length === 0) {
    return (
      <>
        <PageHeader
          title={t('Balances')}
          actions={
            <Button onClick={() => setDrawer('new')}>
              <Plus aria-hidden /> {t('Add account')}
            </Button>
          }
        />
        <EmptyState title={t('No accounts yet')}>
          {t('Add your bank, broker, pension and insurance accounts.')}
        </EmptyState>
        {drawerEl}
      </>
    );
  }

  const latestDate = dates.at(-1);
  const editable = (d: string) => d === latestDate || editingDates.includes(d);

  const copyLast = async () => {
    if (dates.includes(newDate) && snapshots.some((s) => s.date === newDate)) {
      alert(t('There is already a month on {date}. Edit it in the table.', { date: formatDate(newDate) }));
      return;
    }
    const latest = latestSnapshots(snapshots, newDate);
    const drafts = active
      .map((a) => latest.get(a.id))
      .filter((s) => s !== undefined)
      .map((s) => ({ id: newId(), date: newDate, accountId: s.accountId, balanceMinor: s.balanceMinor }));
    await saveMany(db.snapshots, drafts);
    for (const c of currencies) {
      const r = rateFor(fxRates, c, newDate);
      if (r !== undefined && exactRate(fxRates, c, newDate) === undefined) await setFx(c, newDate, r);
    }
    if (drafts.length === 0) setExtraDates((d) => [...d, newDate]);
    await markSnapshotSaved();
  };

  const deleteDate = async (date: string) => {
    if (!confirm(t('Delete every balance and FX rate on {date}?', { date: formatDate(date) }))) return;
    await db.transaction('rw', db.snapshots, db.fxRates, db.holdings, async () => {
      await db.snapshots.where('date').equals(date).delete();
      await db.fxRates.filter((r) => r.date === date).delete();
      await db.holdings.filter((h) => h.date === date).delete();
    });
    setExtraDates((d) => d.filter((x) => x !== date));
  };

  const nwByDate = new Map(
    dates.map((d) => [d, netWorthAt(d, accounts, snapshots, fxRates, settings.birthYear)]),
  );
  const attributions = periodChanges(
    allDates.map((d) => nwByDate.get(d)!),
    totals,
    fxRates,
    data.activeAssumptions.assets,
  );
  const missingFx = shown.flatMap((d) =>
    currencies
      .filter((c) => rateFor(fxRates, c, d) === undefined)
      .map((c) => t('{c} on {d}', { c, d: formatDate(d) })),
  );
  const holdingsAccount = holdingsFor && accounts.find((a) => a.id === holdingsFor.accountId);

  // The grouped summary at the latest date, with the change since the month before.
  const nw = ctx.netWorth;
  const prevDate = allDates.at(-2);
  const prev = prevDate ? nwByDate.get(prevDate) : undefined;
  const bucketOf = (b: (typeof nw.balances)[number]): Bucket =>
    b.bucket === 'liability' ? 'owe' : b.bucket === 'locked' ? 'locked' : 'own';
  const lockedAge = nw.balances.find((b) => b.bucket === 'locked')?.account.accessAge;
  const groups: { key: Bucket; title: string }[] = [
    { key: 'own', title: t('What you own') },
    {
      key: 'locked',
      title: lockedAge ? t('Locked until {age}', { age: lockedAge }) : t('Locked pension'),
    },
    { key: 'owe', title: t('What you owe') },
  ];
  const changeText = (v: number | undefined) =>
    v === undefined || Math.abs(v) < 0.5 ? '—' : `${v > 0 ? '+' : '−'}${twdCompact(Math.abs(v))}`;

  return (
    <>
      <PageHeader
        title={t('Balances')}
        description={t('As of {date}. Amounts in TWD; foreign balances at that day’s rate.', {
          date: formatDate(ctx.asOfDate),
        })}
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> {t('Import CSV')}
            </Button>
            <Button onClick={() => setDrawer('new')}>
              <Plus aria-hidden /> {t('Add account')}
            </Button>
          </>
        }
      />
      {importing && <BalanceImport onClose={() => setImporting(false)} />}
      <LoanNotice className="mb-4" link={false} />

      <Card className="mb-4">
        <CardContent>
          <Table>
            <thead>
              <tr>
                <th>{t('Account')}</th>
                <th className="text-right">{t('Balance')}</th>
                <th className="text-right">
                  {prevDate ? t('Since {date}', { date: formatDate(prevDate) }) : t('Change')}
                </th>
              </tr>
            </thead>
            {groups.map((g) => {
              const rows = nw.balances.filter((b) => bucketOf(b) === g.key);
              if (rows.length === 0) return null;
              const sign = g.key === 'owe' ? -1 : 1;
              const subtotal = rows.reduce((s, b) => s + b.twd, 0);
              const prevOf = (id: string) => prev?.balances.find((x) => x.account.id === id)?.twd;
              const prevSubtotal = prev?.balances
                .filter((b) => bucketOf(b) === g.key)
                .reduce((s, b) => s + b.twd, 0);
              return (
                <tbody key={g.key}>
                  <tr>
                    <th
                      colSpan={3}
                      scope="rowgroup"
                      className="bg-surface-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {g.title}
                    </th>
                  </tr>
                  {rows.map((b) => {
                    const p = prevOf(b.account.id);
                    return (
                      <tr key={b.account.id}>
                        <td>
                          <button
                            type="button"
                            className="text-left font-medium hover:text-primary hover:underline"
                            onClick={() => setDrawer(b.account)}
                          >
                            {b.account.nickname}
                          </button>
                          <div className="text-xs text-subtle">
                            {ACCOUNT_TYPE_LABELS[b.account.type]}
                            {b.account.institution && ` · ${b.account.institution}`}
                            {b.account.currency !== 'TWD' && ` · ${b.account.currency}`}
                          </div>
                          {(() => {
                            const terms = liabilities.find((l) => l.accountId === b.account.id);
                            return (
                              terms && (
                                <div className="text-xs text-muted-foreground">
                                  {loanTermsText(terms, b.account.currency, categories, snapshots)}
                                </div>
                              )
                            );
                          })()}
                        </td>
                        <td className="text-right tabular">{twd(sign * b.twd)}</td>
                        <td className="text-right text-muted-foreground tabular">
                          {changeText(p === undefined ? undefined : sign * (b.twd - p))}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-medium">
                    <td>{t('Subtotal')}</td>
                    <td className="text-right tabular">{twd(sign * subtotal)}</td>
                    <td className="text-right text-muted-foreground tabular">
                      {changeText(prevSubtotal === undefined ? undefined : sign * (subtotal - prevSubtotal))}
                    </td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr className="border-t-2 text-base font-semibold">
                <td>{t('Net worth')}</td>
                <td className="text-right tabular">{twd(nw.total)}</td>
                <td className="text-right tabular">{changeText(prev ? nw.total - prev.total : undefined)}</td>
              </tr>
            </tfoot>
          </Table>
          {archived.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t('Archived accounts ({n})', { n: archived.length })}
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {archived.map((a) => (
                  <li key={a.id}>
                    <Button size="sm" variant="outline" onClick={() => setDrawer(a)}>
                      {a.nickname}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {missingFx.length > 0 && (
        <Notice tone="warning" className="mb-4">
          {t('Missing FX rate: {join}. Those balances count as zero until a rate is entered.', {
            join: missingFx.join(', '),
          })}
        </Notice>
      )}

      <Card role="region" aria-label={t('Monthly history')}>
        <CardHeader
          title={t('Monthly history')}
          description={t(
            'Native currency. The latest month is editable; press Edit on an earlier month to change it. The Monthly update fills a new month for you.',
          )}
          actions={
            dates.length > VISIBLE_DATES && (
              <Button size="sm" variant="outline" onClick={() => setShowAll(!showAll)}>
                {showAll
                  ? t('Show last {VISIBLE_DATES}', { VISIBLE_DATES })
                  : t('Show all {length} dates', { length: dates.length })}
              </Button>
            )
          }
        />
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label={t('Balances as of')}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-44"
                />
              )}
            </Field>
            <Button variant="outline" onClick={() => void copyLast()} disabled={!newDate}>
              <Copy aria-hidden /> {t('Copy last period')}
            </Button>
          </div>
          {dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Pick a date and press “Copy last period” to start a month, then fill in each balance.')}
            </p>
          ) : (
            <Table className="w-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-44 bg-surface">{t('Account')}</th>
                  {shown.map((d) => (
                    <th key={d} className="w-36 text-right">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        {formatDate(d)}
                        {d !== latestDate && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-pressed={editingDates.includes(d)}
                            aria-label={t('Edit {d}', { d: formatDate(d) })}
                            onClick={() =>
                              setEditingDates((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))
                            }
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {editable(d) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={t('Delete {d}', { d: formatDate(d) })}
                            onClick={() => void deleteDate(d)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id}>
                    <td className="sticky left-0 z-10 max-w-36 bg-surface sm:max-w-none">
                      <div className="font-medium">{a.nickname}</div>
                      <div className="text-xs text-subtle">
                        {a.type === 'liability' ? t('Owed') : a.institution} · {a.currency}
                        {a.type === 'brokerage' && shown.length > 0 && (
                          <>
                            {' · '}
                            <button
                              className="text-primary hover:underline"
                              onClick={() => setHoldingsFor({ accountId: a.id, date: shown.at(-1)! })}
                            >
                              {t('Holdings')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    {shown.map((d) => {
                      const s = snapshots.find((x) => x.accountId === a.id && x.date === d);
                      const label = t('{nickname} on {d}', { nickname: a.nickname, d: formatDate(d) });
                      return (
                        <td key={d} className="w-36 min-w-28 align-top">
                          {editable(d) ? (
                            <MoneyInput
                              compact
                              aria-label={label}
                              value={s?.balanceMinor}
                              currency={a.currency}
                              twdRate={rateFor(fxRates, a.currency, d)}
                              allowNegative
                              onCommit={(minor) => void setBalance(a.id, d, minor)}
                            />
                          ) : (
                            <div className="py-1 text-right tabular" aria-label={label}>
                              {s ? (
                                formatMoney(fromMinor(s.balanceMinor), a.currency)
                              ) : (
                                <span className="text-subtle">—</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {currencies.map((c) => (
                  <tr key={c}>
                    <td className="sticky left-0 bg-surface text-muted-foreground">
                      {t('FX · TWD per {c}', { c })}
                    </td>
                    {shown.map((d) => (
                      <td key={d}>
                        {editable(d) ? (
                          <FxInput currency={c} date={d} />
                        ) : (
                          <div className="py-1 text-right text-muted-foreground tabular">
                            {rateFor(fxRates, c, d) ?? '—'}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="sticky left-0 bg-surface">{t('Total net worth')}</td>
                  {shown.map((d) => (
                    <td key={d} className="text-right">
                      {twd(nwByDate.get(d)!.total)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {holdingsAccount && holdingsFor && (
        <div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Field label={t('Holdings date')}>
              {(id) => (
                <Select
                  id={id}
                  value={holdingsFor.date}
                  onChange={(e) => setHoldingsFor({ ...holdingsFor, date: e.target.value })}
                  className="w-44"
                >
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(d)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button variant="ghost" onClick={() => setHoldingsFor(undefined)}>
              {t('Close holdings')}
            </Button>
          </div>
          <HoldingsPanel account={holdingsAccount} date={holdingsFor.date} />
        </div>
      )}

      {attributions.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title={t('What changed')}
            description={t(
              'Each month’s change in net worth: what you saved, what markets did, and the exchange rate on foreign balances.',
            )}
          />
          <CardContent>
            <ChangeBars rows={attributions} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-primary">{t('Show numbers')}</summary>
              <Table className="mt-2">
                <thead>
                  <tr>
                    <th>{t('Period')}</th>
                    <th className="text-right">{t('Change')}</th>
                    <th className="text-right">{t('Contributions')}</th>
                    <th className="text-right">{t('Market return')}</th>
                    <th className="text-right">{t('FX effect')}</th>
                    <th>{t('Check')}</th>
                  </tr>
                </thead>
                <tbody>
                  {attributions
                    .slice(-12)
                    .reverse()
                    .map((a) => (
                      <tr key={a.to}>
                        <td>
                          {a.from} → {a.to}
                        </td>
                        <td className="text-right font-medium">{twdCompact(a.change)}</td>
                        <td className="text-right">{twdCompact(a.contributions)}</td>
                        <td className="text-right">{twdCompact(a.marketReturn)}</td>
                        <td className="text-right">{twdCompact(a.fxEffect)}</td>
                        <td>
                          {a.check === undefined ? (
                            <span className="text-xs text-subtle">{t('no cash flow')}</span>
                          ) : a.check.flagged ? (
                            <Badge tone="warning">{t('Check')}</Badge>
                          ) : (
                            <span className="text-xs text-good">{t('OK')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </details>
          </CardContent>
        </Card>
      )}
      {drawerEl}
    </>
  );
}

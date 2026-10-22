import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2, Upload } from 'lucide-react';
import { BalanceImport } from '@/features/import/CsvImport';
import type { Account, Holding } from '@/domain/entities';
import { monthlyTotals } from '@/domain/cashflow';
import { lastDayOfMonth, monthOf, today } from '@/domain/dates';
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
import { twd, twdCompact } from '@/lib/format';

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
      aria-label={`${currency}/TWD on ${date}`}
      inputMode="decimal"
      className="h-8 w-full rounded-md border border-input bg-surface px-2 text-right text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={text ?? (stored !== undefined ? String(stored) : '')}
      placeholder={fallback !== undefined ? `${fallback} (carried)` : 'rate'}
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
        title={`Holdings · ${account.nickname} · ${date}`}
        description="Optional detail: ticker, units and price. The account balance stays the number of record."
        actions={
          rows.length === 0 ? (
            <Button size="sm" variant="outline" onClick={() => void copyPrevious()}>
              <Copy aria-hidden /> Copy previous holdings
            </Button>
          ) : undefined
        }
      />
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="text-right">Units</th>
              <th className="text-right">Price ({account.currency})</th>
              <th className="text-right">Value</th>
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
                    aria-label={`Remove ${h.ticker}`}
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
                  aria-label="Ticker"
                  className="h-8"
                  value={draft.ticker}
                  onChange={(e) => setDraft({ ...draft, ticker: e.target.value.toUpperCase() })}
                  placeholder="VT"
                />
              </td>
              <td>
                <Input
                  aria-label="Units"
                  className="h-8 text-right"
                  inputMode="decimal"
                  value={draft.units}
                  onChange={(e) => setDraft({ ...draft, units: e.target.value })}
                />
              </td>
              <td>
                <Input
                  aria-label="Price"
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
                  <Plus aria-hidden /> Add
                </Button>
              </td>
            </tr>
          </tbody>
        </Table>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span>
              Holdings total <strong>{formatMoney(total, account.currency)}</strong>
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
                Use as balance
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SnapshotsPage() {
  const data = useAppData();
  const { accounts, snapshots, fxRates, settings } = data;
  const active = accounts.filter((a) => !a.archived);
  const allDates = snapshotDates(snapshots);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const dates = [...new Set([...allDates, ...extraDates])].sort();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? dates : dates.slice(-VISIBLE_DATES);
  const [newDate, setNewDate] = useState(lastDayOfMonth(monthOf(today())));
  const [holdingsFor, setHoldingsFor] = useState<{ accountId: string; date: string }>();
  const [importing, setImporting] = useState(false);
  const currencies = [...new Set(active.map((a) => a.currency).filter((c) => c !== 'TWD'))].sort();
  const totals = useMemo(
    () => monthlyTotals(data.cashFlows, data.categories, fxRates),
    [data.cashFlows, data.categories, fxRates],
  );

  if (active.length === 0) {
    return (
      <>
        <PageHeader title="Snapshots" />
        <EmptyState title="Add an account first" to="/accounts" action="Add an account">
          Each snapshot holds one balance per account.
        </EmptyState>
      </>
    );
  }

  const copyLast = async () => {
    if (dates.includes(newDate) && snapshots.some((s) => s.date === newDate)) {
      alert(`There is already a snapshot on ${newDate}. Edit it in the grid.`);
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
    if (!confirm(`Delete every balance and FX rate on ${date}?`)) return;
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
    currencies.filter((c) => rateFor(fxRates, c, d) === undefined).map((c) => `${c} on ${d}`),
  );
  const holdingsAccount = holdingsFor && accounts.find((a) => a.id === holdingsFor.accountId);

  return (
    <>
      <PageHeader
        title="Snapshots"
        description={`One balance per account per ${settings.snapshotCadence === 'monthly' ? 'month' : 'quarter'}, in its native currency, with the FX rate for the date. Liabilities are entered as the amount owed.`}
        actions={
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload aria-hidden /> Import CSV
          </Button>
        }
      />
      {importing && <BalanceImport onClose={() => setImporting(false)} />}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Snapshot date">
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
          <Button onClick={() => void copyLast()} disabled={!newDate}>
            <Copy aria-hidden /> Copy last period
          </Button>
          <p className="text-sm text-muted-foreground">
            Copies every balance and FX rate to the new date; then edit what changed.
          </p>
        </CardContent>
      </Card>

      {missingFx.length > 0 && (
        <Notice tone="warning" className="mb-4">
          Missing FX rate: {missingFx.join(', ')}. Those balances count as zero until a rate is entered.
        </Notice>
      )}

      {dates.length === 0 ? (
        <EmptyState title="No snapshot yet">
          Pick a date above and press “Copy last period” to start an empty column, then fill in each balance.
        </EmptyState>
      ) : (
        <Card>
          <CardHeader
            title="Balances"
            description="Native currency; TWD equivalent shown under foreign amounts. Click Holdings to add brokerage detail."
            actions={
              dates.length > VISIBLE_DATES && (
                <Button size="sm" variant="outline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? `Show last ${VISIBLE_DATES}` : `Show all ${dates.length} dates`}
                </Button>
              )
            }
          />
          <CardContent>
            <Table className="w-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-44 bg-surface">Account</th>
                  {shown.map((d) => (
                    <th key={d} className="w-36 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label={`Delete snapshot ${d}`}
                          onClick={() => void deleteDate(d)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id}>
                    <td className="sticky left-0 bg-surface">
                      <div className="font-medium">{a.nickname}</div>
                      <div className="text-xs text-subtle">
                        {a.type === 'liability' ? 'Owed' : a.institution} · {a.currency}
                        {a.type === 'brokerage' && shown.length > 0 && (
                          <>
                            {' · '}
                            <button
                              className="text-primary hover:underline"
                              onClick={() => setHoldingsFor({ accountId: a.id, date: shown.at(-1)! })}
                            >
                              Holdings
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    {shown.map((d) => {
                      const s = snapshots.find((x) => x.accountId === a.id && x.date === d);
                      return (
                        <td key={d} className="w-36 align-top">
                          <MoneyInput
                            aria-label={`${a.nickname} on ${d}`}
                            value={s?.balanceMinor}
                            currency={a.currency}
                            twdRate={rateFor(fxRates, a.currency, d)}
                            allowNegative
                            onCommit={(minor) => void setBalance(a.id, d, minor)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {currencies.map((c) => (
                  <tr key={c}>
                    <td className="sticky left-0 bg-surface text-muted-foreground">FX · TWD per {c}</td>
                    {shown.map((d) => (
                      <td key={d}>
                        <FxInput currency={c} date={d} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="sticky left-0 bg-surface">Total net worth</td>
                  {shown.map((d) => (
                    <td key={d} className="text-right">
                      {twd(nwByDate.get(d)!.total)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-surface text-muted-foreground">Investable</td>
                  {shown.map((d) => (
                    <td key={d} className="text-right text-muted-foreground">
                      {twd(nwByDate.get(d)!.investable)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {holdingsAccount && holdingsFor && (
        <div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Field label="Holdings date">
              {(id) => (
                <Select
                  id={id}
                  value={holdingsFor.date}
                  onChange={(e) => setHoldingsFor({ ...holdingsFor, date: e.target.value })}
                  className="w-44"
                >
                  {dates.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Button variant="ghost" onClick={() => setHoldingsFor(undefined)}>
              Close holdings
            </Button>
          </div>
          <HoldingsPanel account={holdingsAccount} date={holdingsFor.date} />
        </div>
      )}

      {attributions.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="What changed"
            description="Each period's change in total net worth = savings from cash flow + market return + FX effect (prior foreign balances × rate change). Market return is the remainder; “Check” marks a remainder too large for the assets to have earned."
          />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="text-right">Change</th>
                  <th className="text-right">Contributions</th>
                  <th className="text-right">Market return</th>
                  <th className="text-right">FX effect</th>
                  <th>Check</th>
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
                          <span className="text-xs text-subtle" title="No cash flow entered for this period">
                            no cash flow
                          </span>
                        ) : a.check.flagged ? (
                          <Badge
                            tone="warning"
                            title={`Market return ${twdCompact(a.marketReturn)} is outside the plausible range ${twdCompact(a.check.expectedLow)} to ${twdCompact(a.check.expectedHigh)}. Check for a missing cash-flow entry, a mistyped balance, or a transfer between tracked and untracked accounts.`}
                          >
                            Check
                          </Badge>
                        ) : (
                          <span className="text-xs text-good">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

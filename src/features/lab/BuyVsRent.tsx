import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { buyVsRent, DEFAULT_BUY_VS_RENT, type BuyVsRentInput } from '@/domain/buyVsRent';
import { toMinor } from '@/domain/money';
import { db } from '@/db/db';
import { save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { useUi } from '@/state/ui';
import { MoneyInput, NumberInput, PercentInput } from '@/components/MoneyInput';
import { LineChart } from '@/components/charts/LineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Notice, Stat, Table } from '@/components/ui/misc';
import { twd, twdCompact } from '@/lib/format';
import { newScenarioDraft } from './actions';

const STORAGE_KEY = 'fi-tracker-buy-vs-rent';

function loadInputs(): BuyVsRentInput {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_BUY_VS_RENT, ...(JSON.parse(saved) as Partial<BuyVsRentInput>) };
  } catch {
    // Storage unavailable: start from the defaults.
  }
  return DEFAULT_BUY_VS_RENT;
}

/** Buy vs. rent comparison (LAB-8). Inputs are remembered in this browser only. */
export function BuyVsRentPanel() {
  const data = useAppData();
  const selectScenario = useUi((s) => s.selectScenario);
  const [inputs, setInputs] = useState<BuyVsRentInput>(loadInputs);
  const [purchaseDate, setPurchaseDate] = useState(`${new Date().getFullYear() + 1}-01-01`);
  const [created, setCreated] = useState<string>();
  const result = useMemo(() => buyVsRent(inputs), [inputs]);

  const set = (patch: Partial<BuyVsRentInput>) => {
    const next = { ...inputs, ...patch };
    setInputs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not critical.
    }
  };
  const pctField = (label: string, key: keyof BuyVsRentInput, hint?: string, step = 0.1) => (
    <Field label={label} hint={hint}>
      {(id) => (
        <PercentInput
          id={id}
          value={inputs[key]}
          step={step}
          onCommit={(v) => v !== undefined && set({ [key]: v })}
        />
      )}
    </Field>
  );
  const moneyField = (label: string, key: 'homePrice' | 'monthlyRent') => (
    <Field label={label}>
      {(id) => (
        <MoneyInput
          id={id}
          value={toMinor(inputs[key])}
          currency="TWD"
          onCommit={(v) => v !== undefined && set({ [key]: v / 100 })}
        />
      )}
    </Field>
  );

  const createScenario = async () => {
    const draft = newScenarioDraft(
      data,
      `Buy a ${twdCompact(inputs.homePrice)} home in ${purchaseDate.slice(0, 4)}`,
    );
    draft.events = [
      {
        date: purchaseDate,
        amountMinor: -toMinor(result.upfront),
        description: 'Down payment and buying costs',
      },
    ];
    draft.notes = `From Buy vs. rent: monthly mortgage ${twd(result.monthlyPayment)} plus holding costs, against rent of ${twd(inputs.monthlyRent)}. Adjust spending while working to reflect the change in housing cost.`;
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    setCreated(draft.name);
  };

  const first = result.rows[1];
  const last = result.rows.at(-1)!;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader title="Inputs" description="Nominal rates per year. Results are in today's TWD." />
        <CardContent className="grid grid-cols-2 gap-3">
          {moneyField('Home price', 'homePrice')}
          {moneyField('Comparable rent / month', 'monthlyRent')}
          {pctField('Down payment', 'downPaymentRate', undefined, 1)}
          {pctField('Mortgage rate', 'mortgageRate', undefined, 0.05)}
          <Field label="Mortgage term (years)">
            {(id) => (
              <NumberInput
                id={id}
                value={inputs.mortgageYears}
                min={1}
                max={40}
                onCommit={(v) => v && set({ mortgageYears: v })}
              />
            )}
          </Field>
          <Field label="Compare over (years)">
            {(id) => (
              <NumberInput
                id={id}
                value={inputs.years}
                min={1}
                max={60}
                onCommit={(v) => v && set({ years: v })}
              />
            )}
          </Field>
          {pctField('Buying costs', 'buyingCostRate', '契稅, 代書, agent')}
          {pctField('Selling costs', 'sellingCostRate', 'Agent, 土增稅 estimate')}
          {pctField('Holding costs / year', 'holdingCostRate', '房屋稅, 地價稅, upkeep', 0.05)}
          {pctField('Home price growth', 'homeAppreciation')}
          {pctField('Rent growth', 'rentGrowth')}
          {pctField('Investment return', 'investmentReturn', 'After fees')}
          {pctField('Inflation', 'inflation')}
          <div className="col-span-2">
            <Button size="sm" variant="ghost" onClick={() => set(DEFAULT_BUY_VS_RENT)}>
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 xl:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Break-even"
            value={
              result.breakEvenYear !== undefined ? `Year ${result.breakEvenYear}` : 'Renting stays ahead'
            }
            sub={
              result.breakEvenYear !== undefined ? 'First year buying is ahead' : `Over ${inputs.years} years`
            }
          />
          <Stat
            label={`After ${inputs.years} years`}
            value={`${result.finalDifference >= 0 ? 'Buy' : 'Rent'} +${twdCompact(Math.abs(result.finalDifference))}`}
            sub={`Buy ${twdCompact(last.buyerNetWorth)} · rent ${twdCompact(last.renterNetWorth)}`}
          />
          <Stat
            label="Cash needed up front"
            value={twdCompact(result.upfront)}
            sub={`Mortgage ${twd(result.monthlyPayment)}/mo · rent ${twd(inputs.monthlyRent)}/mo`}
          />
        </div>
        <Card>
          <CardHeader
            title="Net worth: buy vs. rent"
            description="Home value after selling costs, minus mortgage, plus investments; the renter invests the down payment and any monthly saving."
          />
          <CardContent>
            <LineChart
              ariaLabel="Net worth when buying and when renting"
              data={result.rows}
              xKey="year"
              xFormat={(v) => `Yr ${v}`}
              tooltipTitle={(r) => `Year ${r.year}`}
              referenceX={
                result.breakEvenYear !== undefined
                  ? { x: result.breakEvenYear, label: 'Break-even' }
                  : undefined
              }
              series={[
                { key: 'buyerNetWorth', label: 'Buy', slot: 0 },
                { key: 'renterNetWorth', label: 'Rent and invest', slot: 1 },
              ]}
            />
            <Table className="mt-3">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="text-right">Owning cost / yr</th>
                  <th className="text-right">Rent / yr</th>
                  <th className="text-right">Mortgage left</th>
                  <th className="text-right">Buy</th>
                  <th className="text-right">Rent</th>
                </tr>
              </thead>
              <tbody>
                {result.rows
                  .filter((r) => r.year > 0 && (r.year === 1 || r.year % 5 === 0 || r.year === inputs.years))
                  .map((r) => (
                    <tr key={r.year}>
                      <td>{r.year}</td>
                      <td className="text-right">{twdCompact(r.ownerCost)}</td>
                      <td className="text-right">{twdCompact(r.rentCost)}</td>
                      <td className="text-right">{twdCompact(r.mortgageBalance)}</td>
                      <td className="text-right">{twdCompact(r.buyerNetWorth)}</td>
                      <td className="text-right">{twdCompact(r.renterNetWorth)}</td>
                    </tr>
                  ))}
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-subtle">
              Year 1 owning costs {twd(first?.ownerCost ?? 0)} against rent {twd(first?.rentCost ?? 0)}, in
              today's TWD. Not modelled: 房貸 interest deduction, 自住 tax rates, moving costs, and the
              non-financial value of owning.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Test it on your plan"
            description="Creates a scenario with the down payment and buying costs as a one-off event, so the Strategy Lab can show the effect on your FI date."
          />
          <CardContent className="flex flex-wrap items-end gap-3">
            <Field label="Purchase date">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-44"
                />
              )}
            </Field>
            <Button
              onClick={() => void createScenario()}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)}
            >
              <Plus aria-hidden /> Create scenario
            </Button>
            {created && (
              <Notice className="w-full">Created “{created}”. Switch to Scenarios to compare it.</Notice>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

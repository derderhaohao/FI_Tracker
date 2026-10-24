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
import { t } from '@/i18n';

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
      t('Buy a {homePrice} home in {slice}', {
        homePrice: twdCompact(inputs.homePrice),
        slice: purchaseDate.slice(0, 4),
      }),
    );
    draft.events = [
      {
        date: purchaseDate,
        amountMinor: -toMinor(result.upfront),
        description: t('Down payment and buying costs'),
      },
    ];
    draft.notes = t(
      'From Buy vs. rent: monthly mortgage {monthlyPayment} plus holding costs, against rent of {monthlyRent}. Adjust spending while working to reflect the change in housing cost.',
      { monthlyPayment: twd(result.monthlyPayment), monthlyRent: twd(inputs.monthlyRent) },
    );
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    setCreated(draft.name);
  };

  const first = result.rows[1];
  const last = result.rows.at(-1)!;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader
          title={t('Inputs')}
          description={t("Nominal rates per year. Results are in today's TWD.")}
        />
        <CardContent className="grid grid-cols-2 gap-3">
          {moneyField(t('Home price'), 'homePrice')}
          {moneyField(t('Comparable rent / month'), 'monthlyRent')}
          {pctField(t('Down payment'), 'downPaymentRate', undefined, 1)}
          {pctField(t('Mortgage rate'), 'mortgageRate', undefined, 0.05)}
          <Field label={t('Mortgage term (years)')}>
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
          <Field label={t('Compare over (years)')}>
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
          {pctField(t('Buying costs'), 'buyingCostRate', t('契稅, 代書, agent'))}
          {pctField(t('Selling costs'), 'sellingCostRate', t('Agent, 土增稅 estimate'))}
          {pctField(t('Holding costs / year'), 'holdingCostRate', t('房屋稅, 地價稅, upkeep'), 0.05)}
          {pctField(t('Home price growth'), 'homeAppreciation')}
          {pctField(t('Rent growth'), 'rentGrowth')}
          {pctField(t('Investment return'), 'investmentReturn', t('After fees'))}
          {pctField(t('Inflation'), 'inflation')}
          <div className="col-span-2">
            <Button size="sm" variant="ghost" onClick={() => set(DEFAULT_BUY_VS_RENT)}>
              {t('Reset to defaults')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 xl:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label={t('Break-even')}
            value={
              result.breakEvenYear !== undefined
                ? t('Year {year}', { year: result.breakEvenYear })
                : t('Renting stays ahead')
            }
            sub={
              result.breakEvenYear !== undefined
                ? t('First year buying is ahead')
                : t('Over {years} years', { years: inputs.years })
            }
          />
          <Stat
            label={t('After {years} years', { years: inputs.years })}
            value={
              result.finalDifference >= 0
                ? t('Buy +{amount}', { amount: twdCompact(Math.abs(result.finalDifference)) })
                : t('Rent +{amount}', { amount: twdCompact(Math.abs(result.finalDifference)) })
            }
            sub={t('Buy {buyerNetWorth} · rent {renterNetWorth}', {
              buyerNetWorth: twdCompact(last.buyerNetWorth),
              renterNetWorth: twdCompact(last.renterNetWorth),
            })}
          />
          <Stat
            label={t('Cash needed up front')}
            value={twdCompact(result.upfront)}
            sub={t('Mortgage {monthlyPayment}/mo · rent {monthlyRent}/mo', {
              monthlyPayment: twd(result.monthlyPayment),
              monthlyRent: twd(inputs.monthlyRent),
            })}
          />
        </div>
        <Card>
          <CardHeader
            title={t('Net worth: buy vs. rent')}
            description={t(
              'Home value after selling costs, minus mortgage, plus investments; the renter invests the down payment and any monthly saving.',
            )}
          />
          <CardContent>
            <LineChart
              ariaLabel={t('Net worth when buying and when renting')}
              data={result.rows}
              xKey="year"
              xFormat={(v) => t('Yr {v}', { v })}
              tooltipTitle={(r) => t('Year {year}', { year: r.year })}
              referenceX={
                result.breakEvenYear !== undefined
                  ? { x: result.breakEvenYear, label: t('Break-even') }
                  : undefined
              }
              series={[
                { key: 'buyerNetWorth', label: t('Buy'), slot: 0 },
                { key: 'renterNetWorth', label: t('Rent and invest'), slot: 1 },
              ]}
            />
            <Table className="mt-3">
              <thead>
                <tr>
                  <th>{t('Year')}</th>
                  <th className="text-right">{t('Owning cost / yr')}</th>
                  <th className="text-right">{t('Rent / yr')}</th>
                  <th className="text-right">{t('Mortgage left')}</th>
                  <th className="text-right">{t('Buy')}</th>
                  <th className="text-right">{t('Rent')}</th>
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
              {t(
                "Year 1 owning costs {twd} against rent {twd2}, in today's TWD. Not modelled: 房貸 interest deduction, 自住 tax rates, moving costs, and the non-financial value of owning.",
                { twd: twd(first?.ownerCost ?? 0), twd2: twd(first?.rentCost ?? 0) },
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title={t('Test it on your plan')}
            description={t(
              'Creates a scenario with the down payment and buying costs as a one-off event, so the Strategy Lab can show the effect on your FI date.',
            )}
          />
          <CardContent className="flex flex-wrap items-end gap-3">
            <Field label={t('Purchase date')}>
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
              <Plus aria-hidden /> {t('Create scenario')}
            </Button>
            {created && (
              <Notice className="w-full">
                {t('Created “{created}”. Switch to Scenarios to compare it.', { created })}
              </Notice>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

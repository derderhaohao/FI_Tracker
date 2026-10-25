import { useState } from 'react';
import { Scale, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Notice, Segmented } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import {
  firstBuyMonth,
  monthIndex,
  monthName,
  type Currency,
  type MarketData,
  type Scenario,
} from './engine';
import type { PriceIndex } from './format';
import { Chips, MarketBadge, NumberInput } from './fields';
import { entryName, kindLabel, monthText, sectorLabel } from './labels';
import { marketOf, searchTickers, tickerText, type MarketFilter } from './search';
import { equalWeights, FIRST_MONTH, MAX_HOLDINGS, weightTotal } from './state';

const AMOUNTS: Record<Currency, number[]> = {
  USD: [1_000, 10_000, 100_000, 1_000_000],
  TWD: [30_000, 300_000, 3_000_000, 30_000_000],
};

const presetLabel = (a: number, c: Currency) => {
  const sign = c === 'USD' ? '$' : 'NT$';
  return a >= 1e6 ? `${sign}${a / 1e6}M` : `${sign}${a / 1000}k`;
};

/** Amount, start and end (TM-5), the portfolio (TM-6, TM-7) and options (TM-15, TM-16, TM-21). */
export function SetupPanel({
  scenario,
  index,
  data,
  late,
  onChange,
  onCurrency,
}: {
  scenario: Scenario;
  index: PriceIndex;
  data: MarketData;
  late: { ticker: string; first: number }[];
  onChange: (s: Scenario) => void;
  /** Switches the scenario currency, converting the amounts (TW-3). */
  onCurrency: (c: Currency) => void;
}) {
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<MarketFilter>('all');
  const set = (patch: Partial<Scenario>) => onChange({ ...scenario, ...patch });
  const last = monthIndex(index.asOf);
  const latestStart = monthName(last);
  const yearsAgo = (n: number) => monthName(last - n * 12 + 1);
  const total = weightTotal(scenario.holdings);
  const full = scenario.holdings.length >= MAX_HOLDINGS;
  const q = query.trim();
  const results = searchTickers(
    index.tickers,
    q,
    market,
    scenario.holdings.map((h) => h.ticker),
  );

  const addHolding = (ticker: string) => {
    const holdings = [...scenario.holdings, { ticker, weight: 0 }];
    const w = equalWeights(holdings.length);
    set({ holdings: holdings.map((h, i) => ({ ...h, weight: w[i] })) });
    setQuery('');
  };
  const latest = late.reduce((m, x) => Math.max(m, x.first), 0);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="tm-amount" className="flex flex-col gap-3">
        <h2 id="tm-amount" className="font-semibold">
          {t('1 · Amount and dates')}
        </h2>
        <Field
          label={t('Amount')}
          hint={t('Every line is valued in this currency; foreign holdings convert at each month-end rate.')}
        >
          {() => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <NumberInput
                  label={t('Amount')}
                  value={scenario.amount}
                  min={1}
                  max={1e12}
                  onChange={(amount) => set({ amount })}
                />
                <Segmented
                  label={t('Scenario currency')}
                  value={scenario.currency}
                  onChange={(c) => (index.fx || c === scenario.currency ? onCurrency(c) : undefined)}
                  options={[
                    { value: 'USD', label: 'USD' },
                    { value: 'TWD', label: 'TWD' },
                  ]}
                />
              </div>
              <Chips
                label={t('Amount presets')}
                value={scenario.amount}
                options={AMOUNTS[scenario.currency].map((a) => ({
                  value: a,
                  label: presetLabel(a, scenario.currency),
                }))}
                onPick={(amount) => set({ amount })}
              />
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Start month')}>
            {(id) => (
              <Input
                id={id}
                type="month"
                min={FIRST_MONTH}
                max={latestStart}
                value={scenario.start}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v >= FIRST_MONTH && v <= latestStart)
                    set({ start: v, end: v > scenario.end ? index.asOf : scenario.end });
                }}
              />
            )}
          </Field>
          <Field label={t('End month')}>
            {(id) => (
              <Input
                id={id}
                type="month"
                min={scenario.start}
                max={index.asOf}
                value={scenario.end}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v >= scenario.start && v <= index.asOf) set({ end: v });
                }}
              />
            )}
          </Field>
        </div>
        <Chips
          label={t('Quick start months')}
          value={scenario.start}
          options={[
            { value: '2000-01', label: '2000' },
            { value: '2010-01', label: '2010' },
            { value: '2015-01', label: '2015' },
            { value: '2020-01', label: '2020' },
            { value: yearsAgo(5), label: t('5 years ago') },
            { value: yearsAgo(1), label: t('1 year ago') },
          ]}
          onPick={(start) => set({ start, end: index.asOf })}
        />
      </section>

      <section aria-labelledby="tm-portfolio" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="tm-portfolio" className="font-semibold">
            {t('2 · Portfolio')}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t('{n} of {max} holdings', { n: scenario.holdings.length, max: MAX_HOLDINGS })}
          </span>
        </div>
        <Segmented
          label={t('Market')}
          value={market}
          onChange={setMarket}
          options={[
            { value: 'all', label: t('All') },
            { value: 'US', label: t('US') },
            { value: 'TW', label: t('Taiwan') },
          ]}
        />
        <div className="relative">
          <Input
            type="search"
            aria-label={t('Search tickers')}
            placeholder={
              full ? t('Up to 10 holdings') : t('Search by code or company, such as 2330 or Apple')
            }
            disabled={full}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) addHolding(results[0].t);
              if (e.key === 'Escape') setQuery('');
            }}
          />
          {q && (
            <ul
              aria-label={t('Search results')}
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-surface p-1 shadow-lg"
            >
              {results.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">{t('No tickers match.')}</li>
              )}
              {results.map((e) => (
                <li key={e.t}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    aria-label={t('Add {ticker}, {name}', { ticker: tickerText(e.t), name: entryName(e) })}
                    onClick={() => addHolding(e.t)}
                  >
                    <span className="w-14 shrink-0 font-semibold">{tickerText(e.t)}</span>
                    <span className="min-w-0 flex-1 truncate">{entryName(e)}</span>
                    <MarketBadge market={marketOf(e)} currency={e.c ?? 'USD'} />
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {kindLabel(e.k)} · {sectorLabel(e.sec)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className="flex flex-col gap-1.5" aria-label={t('Holdings')}>
          {scenario.holdings.map((h, i) => {
            const entry = index.tickers.find((e) => e.t === h.ticker);
            const s = data.series.get(h.ticker);
            return (
              <li key={h.ticker} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-semibold">{tickerText(h.ticker)}</span>
                    {entry && <MarketBadge market={marketOf(entry)} currency={entry.c ?? 'USD'} />}
                    <span className="truncate text-muted-foreground">
                      {entry ? entryName(entry) : t('Not in the price data')}
                    </span>
                  </div>
                  {s && (
                    <div className="text-xs text-subtle">
                      {t('Data from {month}', { month: monthText(firstBuyMonth(s)) })}
                    </div>
                  )}
                </div>
                <NumberInput
                  label={t('Weight of {ticker}', { ticker: tickerText(h.ticker) })}
                  className="w-24"
                  value={h.weight}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(weight) =>
                    set({ holdings: scenario.holdings.map((x, j) => (j === i ? { ...x, weight } : x)) })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('Remove {ticker}', { ticker: tickerText(h.ticker) })}
                  disabled={scenario.holdings.length === 1}
                  onClick={() => set({ holdings: scenario.holdings.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const w = equalWeights(scenario.holdings.length);
              set({ holdings: scenario.holdings.map((h, i) => ({ ...h, weight: w[i] })) });
            }}
          >
            <Scale aria-hidden /> {t('Equal weights')}
          </Button>
          <span
            data-testid="weight-total"
            className={cn(
              'text-sm tabular',
              total === 100 ? 'text-muted-foreground' : 'font-medium text-critical',
            )}
          >
            {t('Total {total}%', { total })}
          </span>
        </div>
        {total !== 100 && (
          <Notice tone="warning">
            {t('The weights must add up to 100%. Edit them or press Equal weights.')}
          </Notice>
        )}
        {late.length > 0 && (
          <div className="rounded-md border border-tool-accent/40 bg-tool-accent-bg p-2.5 text-sm">
            <p>
              {t('{tickers} started trading after {month}.', {
                tickers: late.map((x) => tickerText(x.ticker)).join(', '),
                month: monthText(monthIndex(scenario.start)),
              })}
            </p>
            <div className="mt-1.5">
              <Segmented
                label={t('Late listing')}
                value={scenario.late}
                onChange={(v) => set({ late: v })}
                options={[
                  { value: 'cash', label: t('Hold its share in cash until it lists') },
                  { value: 'move', label: t('Start in {month} instead', { month: monthText(latest) }) },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      <details className="group rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          {t('Options: rebalancing, top-ups, dividends')}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <Field
            label={t('Rebalancing')}
            hint={t('Resets the holdings to their weights at the end of each period.')}
          >
            {() => (
              <Segmented
                label={t('Rebalancing')}
                value={scenario.rebalance}
                onChange={(rebalance) => set({ rebalance })}
                options={[
                  { value: 'none', label: t('None (buy and hold)') },
                  { value: 'yearly', label: t('Yearly') },
                  { value: 'quarterly', label: t('Quarterly') },
                ]}
              />
            )}
          </Field>
          <Field
            label={t('Monthly top-up')}
            hint={t('Added at each month-end, split by the weights. Every benchmark gets the same.')}
          >
            {() => (
              <NumberInput
                label={t('Monthly top-up')}
                value={scenario.topUp}
                min={0}
                onChange={(topUp) => set({ topUp })}
              />
            )}
          </Field>
          <Field label={t('Dividends')}>
            {() => (
              <Segmented
                label={t('Dividends')}
                value={scenario.priceOnly ? 'price' : 'reinvest'}
                onChange={(v) => set({ priceOnly: v === 'price' })}
                options={[
                  { value: 'reinvest', label: t('Reinvested') },
                  { value: 'price', label: t('Price only') },
                ]}
              />
            )}
          </Field>
        </div>
      </details>
    </div>
  );
}

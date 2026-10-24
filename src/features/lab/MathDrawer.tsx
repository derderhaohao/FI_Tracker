import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { formatMoney } from '@/domain/money';
import { pct, twd } from '@/lib/format';
import { savingsRateOf, spendingNow, stopAge, stopDate, type LabRow } from './model';

const big = (v: number) => formatMoney(v, 'TWD', { compact: v >= 10_000_000 });

/** "Show the math" (PRD R12): each headline number with its formula filled in. */
export function MathDrawer({ row, mc, asOfDate }: { row: LabRow; mc?: MonteCarloSummary; asOfDate: string }) {
  const { input, result, backtest } = row;
  const age = stopAge(result);
  const k = age !== undefined ? age - input.startAge : undefined;
  const fiRow = result.fiAge !== undefined ? result.rows[result.fiAge - input.startAge] : undefined;
  const rate = savingsRateOf(input);
  const items: { title: string; body: string }[] = [
    {
      title: 'Money needed',
      body: `Yearly FI spending ÷ yearly draw rate = ${twd(input.fiSpending)} ÷ ${pct(input.swr, 1)} = ${big(input.fiSpending / input.swr)}.${
        k !== undefined && Math.abs(row.fiTargets[k] - input.fiSpending / input.swr) > 1
          ? ` At ${age} the target is ${big(row.fiTargets[k])}: pensions and part-time income that start later lower it, and money you can't touch until a later age needs a bridge to get there.`
          : ''
      }`,
    },
    {
      title: 'Earliest stop-work date',
      body:
        input.retireAtAge !== undefined
          ? `You set the stop-work age to ${input.retireAtAge} (${stopDate(input, result, asOfDate)}), whether or not investments have reached the money needed by then.`
          : fiRow
            ? `The first month your usable investments reach the money needed on the typical path: ${big(fiRow.liquid)} ≥ ${big(fiRow.fiTarget)} at ${result.fiAge}, around ${stopDate(input, result, asOfDate)}.`
            : `Usable investments never reach the money needed before ${input.horizonAge} on the typical path.`,
    },
    ...(mc
      ? [
          {
            title: 'Chance your money lasts',
            body: `Futures where investments last to ${input.horizonAge} ÷ all simulated futures = ${Math.round(mc.successRate * mc.runs).toLocaleString()} ÷ ${mc.runs.toLocaleString()} = ${pct(mc.successRate, 0)}.`,
          },
        ]
      : []),
    {
      title: 'Past-markets check',
      body: `Start years where the money lasted ÷ start years tested = ${Math.round(backtest.successRate * backtest.runs)} ÷ ${backtest.runs} = ${pct(backtest.successRate, 0)} (start years ${backtest.firstYear}–${backtest.lastYear}).`,
    },
    ...(rate !== undefined
      ? [
          {
            title: 'Savings rate',
            body: `(Take-home pay − spending) ÷ take-home pay = (${twd(input.annualIncome)} − ${twd(spendingNow(input))}) ÷ ${twd(input.annualIncome)} = ${pct(rate, 1)} a year.`,
          },
        ]
      : []),
  ];
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-primary">How these numbers are worked out</summary>
      <dl className="mt-2 flex flex-col gap-2">
        {items.map((i) => (
          <div key={i.title}>
            <dt className="font-medium">{i.title}</dt>
            <dd className="text-muted-foreground">{i.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

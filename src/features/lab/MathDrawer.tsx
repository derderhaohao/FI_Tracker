import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { formatMoney } from '@/domain/money';
import { pct, twd } from '@/lib/format';
import { savingsRateOf, spendingNow, stopAge, stopDate, type LabRow } from './model';
import { t } from '@/i18n';

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
      title: t('Money needed'),
      body: t('Yearly FI spending ÷ yearly draw rate = {fiSpending} ÷ {swr} = {big}.{v}', {
        fiSpending: twd(input.fiSpending),
        swr: pct(input.swr, 1),
        big: big(input.fiSpending / input.swr),
        v:
          k !== undefined && Math.abs(row.fiTargets[k] - input.fiSpending / input.swr) > 1
            ? t(
                " At {age} the target is {big}: pensions and part-time income that start later lower it, and money you can't touch until a later age needs a bridge to get there.",
                { age, big: big(row.fiTargets[k]) },
              )
            : '',
      }),
    },
    {
      title: t('Earliest stop-work date'),
      body:
        input.retireAtAge !== undefined
          ? t(
              'You set the stop-work age to {retireAtAge} ({input}), whether or not investments have reached the money needed by then.',
              { retireAtAge: input.retireAtAge, input: stopDate(input, result, asOfDate) },
            )
          : fiRow
            ? t(
                'The first month your usable investments reach the money needed on the typical path: {liquid} ≥ {fiTarget} at {fiAge}, around {input}.',
                {
                  liquid: big(fiRow.liquid),
                  fiTarget: big(fiRow.fiTarget),
                  fiAge: result.fiAge,
                  input: stopDate(input, result, asOfDate),
                },
              )
            : t('Usable investments never reach the money needed before {horizonAge} on the typical path.', {
                horizonAge: input.horizonAge,
              }),
    },
    ...(mc
      ? [
          {
            title: t('Chance your money lasts'),
            body: t(
              'Futures where investments last to {horizonAge} ÷ all simulated futures = {toLocaleString} ÷ {toLocaleString2} = {successRate}.',
              {
                horizonAge: input.horizonAge,
                toLocaleString: Math.round(mc.successRate * mc.runs).toLocaleString(),
                toLocaleString2: mc.runs.toLocaleString(),
                successRate: pct(mc.successRate, 0),
              },
            ),
          },
        ]
      : []),
    {
      title: t('Past-markets check'),
      body: t(
        'Start years where the money lasted ÷ start years tested = {round} ÷ {runs} = {successRate} (start years {firstYear}–{lastYear}).',
        {
          round: Math.round(backtest.successRate * backtest.runs),
          runs: backtest.runs,
          successRate: pct(backtest.successRate, 0),
          firstYear: backtest.firstYear,
          lastYear: backtest.lastYear,
        },
      ),
    },
    ...(rate !== undefined
      ? [
          {
            title: t('Savings rate'),
            body: t(
              '(Take-home pay − spending) ÷ take-home pay = ({annualIncome} − {input}) ÷ {annualIncome} = {rate} a year.',
              { annualIncome: twd(input.annualIncome), input: twd(spendingNow(input)), rate: pct(rate, 1) },
            ),
          },
        ]
      : []),
  ];
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-primary">{t('How these numbers are worked out')}</summary>
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

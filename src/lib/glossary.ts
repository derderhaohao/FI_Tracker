import { formatMoney } from '@/domain/money';
import { t } from '@/i18n';

/**
 * Plain-language names and one-sentence explanations for Strategy Lab terms (PRD R11).
 * The Simple view shows `label`; the Advanced view adds the technical `advanced` term.
 */

export interface GlossaryParams {
  runs: number;
  horizonAge: number;
  firstYear: number;
  lastYear: number;
  /** FI spending per year, today's TWD, and the draw rate, for the worked example. */
  fiSpending: number;
  swr: number;
}

export interface GlossaryEntry {
  label: string;
  advanced: string;
  tooltip: (p: GlossaryParams) => string;
}

const money = (v: number) => formatMoney(v, 'TWD', { compact: v >= 10_000_000 });

export const GLOSSARY = {
  chanceLasts: {
    label: t('Chance your money lasts'),
    advanced: t('Success rate'),
    tooltip: (p) =>
      t(
        'Out of {toLocaleString} simulated futures with random good and bad market years, the share where your investments last until age {horizonAge}.',
        { toLocaleString: p.runs.toLocaleString(), horizonAge: p.horizonAge },
      ),
  },
  pastMarkets: {
    label: t('Past-markets check'),
    advanced: t('Historical backtest'),
    tooltip: (p) =>
      t(
        'If you had started this plan in each past year from {firstYear} to {lastYear}, the share of start years where the money lasted to {horizonAge}.',
        { firstYear: p.firstYear, lastYear: p.lastYear, horizonAge: p.horizonAge },
      ),
  },
  reachTarget: {
    label: t('Chance you reach your target'),
    advanced: t('Reach FI'),
    tooltip: () =>
      t('The share of simulations where your investments reach your FI target while you are still working.'),
  },
  stopAge: {
    label: t('Earliest stop-work age'),
    advanced: t('FI age'),
    tooltip: () =>
      t(
        'When your investments first cover your yearly FI spending at your withdrawal rate. If you set a stop-work age, that age is shown instead.',
      ),
  },
  stopRange: {
    label: t('Likely stop-work range'),
    advanced: t('FI age P10–P90'),
    tooltip: () =>
      t('In 8 of 10 simulations you reach FI between these ages; 1 in 10 is earlier and 1 in 10 is later.'),
  },
  investAtStop: {
    label: t('Investments when you stop'),
    advanced: t('Investable at FI'),
    tooltip: () => t("Money in your investment accounts on your stop-work date, in today's money."),
  },
  leftAtHorizon: {
    label: t('Left at the end (typical path)'),
    advanced: t('At horizon'),
    tooltip: (p) =>
      t('What remains at {horizonAge} if markets return their typical amount every year.', {
        horizonAge: p.horizonAge,
      }),
  },
  simulated: {
    label: t('Simulated futures'),
    advanced: t('Monte Carlo'),
    tooltip: (p) =>
      t(
        'We replay your plan {toLocaleString} times with random but realistic market returns to see the range of outcomes.',
        { toLocaleString: p.runs.toLocaleString() },
      ),
  },
  bands: {
    label: t('1 in 10 worse / typical / 1 in 10 better'),
    advanced: 'P10 / P50 / P90',
    tooltip: () =>
      t('Nine in ten futures do better than the lower edge; one in ten does better than the upper edge.'),
  },
  typicalPath: {
    label: t('Typical path'),
    advanced: t('Deterministic projection'),
    tooltip: () =>
      t("One projection using the typical return every year. Good for the shape; it can't show risk."),
  },
  drawRate: {
    label: t('Yearly draw rate'),
    advanced: t('Safe withdrawal rate (SWR)'),
    tooltip: (p) =>
      t(
        'The share of your investments you spend in your first FI year. Your target = yearly FI spending ÷ this rate; at {replace}%, {fiSpending} a year needs {money}.',
        {
          replace: (p.swr * 100).toFixed(1).replace(/\.0$/, ''),
          fiSpending: money(p.fiSpending),
          money: money(p.fiSpending / p.swr),
        },
      ),
  },
  sameSpending: {
    label: t('Same spending every year'),
    advanced: t('Fixed real SWR'),
    tooltip: () => t('Spend the same amount each year, raised with inflation, whatever markets do.'),
  },
  moneyNeeded: {
    label: t('Money needed'),
    advanced: t('FI target'),
    tooltip: () =>
      t(
        'The investments you need at each age to fund the rest of your plan. It falls with age because fewer years are left to pay for, and pensions start.',
      ),
  },
  simulationId: {
    label: t('Simulation ID'),
    advanced: t('Seed'),
    tooltip: () => t('Keeps the random sequence the same, so reruns and comparisons are fair.'),
  },
  coastFi: {
    label: t('Coast FI'),
    advanced: t('Coast FI'),
    tooltip: () =>
      t(
        'The amount that, left invested with no more saving, grows into the money needed by your target age. Past it, saving more only brings the date forward.',
      ),
  },
  bridgeFund: {
    label: t('Bridge fund'),
    advanced: t('Bridge fund'),
    tooltip: () =>
      t(
        'Extra money needed if you stop before pensions such as 勞保 start: it covers the years until they begin.',
      ),
  },
  todaysMoney: {
    label: t("Today's money"),
    advanced: t('Real TWD'),
    tooltip: () => t("Today's money removes inflation, so NT$1M in 2045 means what NT$1M buys now."),
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Words the Simple view must not use (PRD acceptance criteria). */
export const JARGON = ['P10', 'P90', 'seed', 'det.', 'SWR', t('Monte Carlo')];

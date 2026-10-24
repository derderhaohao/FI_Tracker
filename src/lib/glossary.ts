import { formatMoney } from '@/domain/money';

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
    label: 'Chance your money lasts',
    advanced: 'Success rate',
    tooltip: (p) =>
      `Out of ${p.runs.toLocaleString()} simulated futures with random good and bad market years, the share where your investments last until age ${p.horizonAge}.`,
  },
  pastMarkets: {
    label: 'Past-markets check',
    advanced: 'Historical backtest',
    tooltip: (p) =>
      `If you had started this plan in each past year from ${p.firstYear} to ${p.lastYear}, the share of start years where the money lasted to ${p.horizonAge}.`,
  },
  reachTarget: {
    label: 'Chance you reach your target',
    advanced: 'Reach FI',
    tooltip: () =>
      'The share of simulations where your investments reach your FI target while you are still working.',
  },
  stopAge: {
    label: 'Earliest stop-work age',
    advanced: 'FI age',
    tooltip: () =>
      'When your investments first cover your yearly FI spending at your withdrawal rate. If you set a stop-work age, that age is shown instead.',
  },
  stopRange: {
    label: 'Likely stop-work range',
    advanced: 'FI age P10–P90',
    tooltip: () =>
      'In 8 of 10 simulations you reach FI between these ages; 1 in 10 is earlier and 1 in 10 is later.',
  },
  investAtStop: {
    label: 'Investments when you stop',
    advanced: 'Investable at FI',
    tooltip: () => "Money in your investment accounts on your stop-work date, in today's money.",
  },
  leftAtHorizon: {
    label: 'Left at the end (typical path)',
    advanced: 'At horizon',
    tooltip: (p) => `What remains at ${p.horizonAge} if markets return their typical amount every year.`,
  },
  simulated: {
    label: 'Simulated futures',
    advanced: 'Monte Carlo',
    tooltip: (p) =>
      `We replay your plan ${p.runs.toLocaleString()} times with random but realistic market returns to see the range of outcomes.`,
  },
  bands: {
    label: '1 in 10 worse / typical / 1 in 10 better',
    advanced: 'P10 / P50 / P90',
    tooltip: () =>
      'Nine in ten futures do better than the lower edge; one in ten does better than the upper edge.',
  },
  typicalPath: {
    label: 'Typical path',
    advanced: 'Deterministic projection',
    tooltip: () =>
      "One projection using the typical return every year. Good for the shape; it can't show risk.",
  },
  drawRate: {
    label: 'Yearly draw rate',
    advanced: 'Safe withdrawal rate (SWR)',
    tooltip: (p) =>
      `The share of your investments you spend in your first FI year. Your target = yearly FI spending ÷ this rate; at ${(p.swr * 100).toFixed(1).replace(/\.0$/, '')}%, ${money(p.fiSpending)} a year needs ${money(p.fiSpending / p.swr)}.`,
  },
  sameSpending: {
    label: 'Same spending every year',
    advanced: 'Fixed real SWR',
    tooltip: () => 'Spend the same amount each year, raised with inflation, whatever markets do.',
  },
  moneyNeeded: {
    label: 'Money needed',
    advanced: 'FI target',
    tooltip: () =>
      'The investments you need at each age to fund the rest of your plan. It falls with age because fewer years are left to pay for, and pensions start.',
  },
  simulationId: {
    label: 'Simulation ID',
    advanced: 'Seed',
    tooltip: () => 'Keeps the random sequence the same, so reruns and comparisons are fair.',
  },
  todaysMoney: {
    label: "Today's money",
    advanced: 'Real TWD',
    tooltip: () => "Today's money removes inflation, so NT$1M in 2045 means what NT$1M buys now.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Words the Simple view must not use (PRD acceptance criteria). */
export const JARGON = ['P10', 'P90', 'seed', 'det.', 'SWR', 'Monte Carlo'];

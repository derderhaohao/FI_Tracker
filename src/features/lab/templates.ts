import type { ScenarioEvent, ScenarioLevers } from '@/domain/entities';
import { toMinor } from '@/domain/money';
import type { ProjectionInput } from '@/domain/projection';
import { spendingNow, stopAge, type LabRow } from './model';

/**
 * What-if templates (PRD R2): each pre-fills overrides relative to today's plan and names
 * the scenario after what it does, so the name can't contradict the effect.
 */

export type TemplateKind = 'retire_at' | 'save_more' | 'spend_less' | 'part_time' | 'big_expense' | 'crash';

export interface TemplateField {
  key: string;
  label: string;
  kind: 'age' | 'money' | 'percent' | 'year';
  /** Hint under the field. */
  hint?: string;
}

export interface TemplateResult {
  name: string;
  overrides: ScenarioLevers;
  events: ScenarioEvent[];
}

export interface Template {
  kind: TemplateKind;
  label: string;
  fields: TemplateField[];
  defaults: (today: LabRow) => Record<string, number>;
  build: (values: Record<string, number>, today: LabRow) => TemplateResult;
}

/** "NT$10k", "NT$1.5M": short amounts for scenario names. */
export function shortMoney(v: number): string {
  const abs = Math.abs(v);
  const trim = (x: number) => (Math.round(x * 10) / 10).toString();
  if (abs >= 1e6) return `NT$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `NT$${trim(abs / 1e3)}k`;
  return `NT$${Math.round(abs)}`;
}

function todayStop(today: LabRow): number {
  return stopAge(today.result) ?? Math.min(today.input.horizonAge - 1, 65);
}

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export const TEMPLATES: Template[] = [
  {
    kind: 'retire_at',
    label: 'Retire earlier or later',
    fields: [{ key: 'age', label: 'Stop working at age', kind: 'age' }],
    defaults: (t) => ({ age: Math.max(t.input.startAge + 1, todayStop(t) - 3) }),
    build: ({ age }) => ({ name: `Retire at ${age}`, overrides: { targetFiAge: age }, events: [] }),
  },
  {
    kind: 'save_more',
    label: 'Save more or less per month',
    fields: [
      { key: 'monthly', label: 'Extra saving per month', kind: 'money', hint: 'Negative = save less' },
    ],
    defaults: () => ({ monthly: 10_000 }),
    build: ({ monthly }, t) => ({
      name: `Save ${shortMoney(monthly)} ${monthly >= 0 ? 'more' : 'less'} a month`,
      overrides: { currentSpendingMinor: toMinor(Math.max(0, spendingNow(t.input) - monthly * 12)) },
      events: [],
    }),
  },
  {
    kind: 'spend_less',
    label: 'Spend less after you stop',
    fields: [{ key: 'percent', label: 'Spend less by', kind: 'percent' }],
    defaults: () => ({ percent: 10 }),
    build: ({ percent }, t) => ({
      name: `Spend ${percent}% less after you stop`,
      overrides: { fiSpendingMinor: toMinor(round(t.input.fiSpending * (1 - percent / 100), 1)) },
      events: [],
    }),
  },
  {
    kind: 'part_time',
    label: 'Part-time income after FI',
    fields: [
      { key: 'monthly', label: 'Part-time income per month', kind: 'money' },
      { key: 'untilAge', label: 'Until age', kind: 'age' },
    ],
    defaults: (t) => ({ monthly: 30_000, untilAge: Math.max(60, todayStop(t) + 5) }),
    build: ({ monthly, untilAge }) => ({
      name: `Part-time ${shortMoney(monthly)} a month to ${untilAge}`,
      overrides: { baristaIncome: { annualMinor: toMinor(monthly * 12), untilAge } },
      events: [],
    }),
  },
  {
    kind: 'big_expense',
    label: 'A one-off big expense',
    fields: [
      { key: 'amount', label: 'Cost', kind: 'money', hint: 'E.g. a home down payment' },
      { key: 'year', label: 'In year', kind: 'year' },
    ],
    defaults: (t) => ({ amount: 3_000_000, year: t.input.startYear + 3 }),
    build: ({ amount, year }) => ({
      name: `Spend ${shortMoney(amount)} in ${year}`,
      overrides: {},
      events: [
        { date: `${year}-01-01`, amountMinor: -toMinor(Math.abs(amount)), description: 'One-off cost' },
      ],
    }),
  },
  {
    kind: 'crash',
    label: 'A market crash just after you stop',
    fields: [
      { key: 'percent', label: 'Shares fall by', kind: 'percent', hint: 'Spread over the first 2 years' },
    ],
    defaults: () => ({ percent: 30 }),
    build: ({ percent }) => ({
      name: `Markets fall ${percent}% just after you stop`,
      overrides: { crash: { drop: percent / 100, years: 2 } },
      events: [],
    }),
  },
];

/** Validates template values; returns an error message or undefined. */
export function checkTemplateValues(
  template: Template,
  values: Record<string, number>,
  input: ProjectionInput,
): string | undefined {
  for (const f of template.fields) {
    const v = values[f.key];
    if (v === undefined || !Number.isFinite(v)) return `Enter ${f.label.toLowerCase()}.`;
    if (f.kind === 'age' && (v <= input.startAge || v >= input.horizonAge || !Number.isInteger(v)))
      return `Use an age between ${input.startAge + 1} and ${input.horizonAge - 1}.`;
    if (f.kind === 'percent' && (v <= 0 || v >= 90)) return 'Use a percentage between 1 and 89.';
    if (
      f.kind === 'year' &&
      (v < input.startYear || v > input.startYear + (input.horizonAge - input.startAge))
    )
      return `Use a year from ${input.startYear}.`;
    if (f.kind === 'money' && template.kind !== 'save_more' && v <= 0) return 'Use an amount above zero.';
  }
  return undefined;
}

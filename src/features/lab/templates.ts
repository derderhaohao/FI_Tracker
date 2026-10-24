import type { ScenarioEvent, ScenarioLevers } from '@/domain/entities';
import { formatMoney, toMinor } from '@/domain/money';
import type { ProjectionInput } from '@/domain/projection';
import { spendingNow, stopAge, type LabRow } from './model';
import { getLang, t } from '@/i18n';

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
  if (getLang() === 'zh-TW') return formatMoney(abs, 'TWD', { compact: true });
  const trim = (x: number) => (Math.round(x * 10) / 10).toString();
  if (abs >= 1e6) return t('NT${trim}M', { trim: trim(abs / 1e6) });
  if (abs >= 1e3) return t('NT${trim}k', { trim: trim(abs / 1e3) });
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
    label: t('Retire earlier or later'),
    fields: [{ key: 'age', label: t('Stop working at age'), kind: 'age' }],
    defaults: (ctx) => ({ age: Math.max(ctx.input.startAge + 1, todayStop(ctx) - 3) }),
    build: ({ age }) => ({
      name: t('Retire at {age}', { age }),
      overrides: { targetFiAge: age },
      events: [],
    }),
  },
  {
    kind: 'save_more',
    label: t('Save more or less per month'),
    fields: [
      { key: 'monthly', label: t('Extra saving per month'), kind: 'money', hint: t('Negative = save less') },
    ],
    defaults: () => ({ monthly: 10_000 }),
    build: ({ monthly }, ctx) => ({
      name:
        monthly >= 0
          ? t('Save {monthly} more a month', { monthly: shortMoney(monthly) })
          : t('Save {monthly} less a month', { monthly: shortMoney(monthly) }),
      overrides: { currentSpendingMinor: toMinor(Math.max(0, spendingNow(ctx.input) - monthly * 12)) },
      events: [],
    }),
  },
  {
    kind: 'spend_less',
    label: t('Spend less after you stop'),
    fields: [{ key: 'percent', label: t('Spend less by'), kind: 'percent' }],
    defaults: () => ({ percent: 10 }),
    build: ({ percent }, ctx) => ({
      name: t('Spend {percent}% less after you stop', { percent }),
      overrides: { fiSpendingMinor: toMinor(round(ctx.input.fiSpending * (1 - percent / 100), 1)) },
      events: [],
    }),
  },
  {
    kind: 'part_time',
    label: t('Part-time income after FI'),
    fields: [
      { key: 'monthly', label: t('Part-time income per month'), kind: 'money' },
      { key: 'untilAge', label: t('Until age'), kind: 'age' },
    ],
    defaults: (ctx) => ({ monthly: 30_000, untilAge: Math.max(60, todayStop(ctx) + 5) }),
    build: ({ monthly, untilAge }) => ({
      name: t('Part-time {monthly} a month to {untilAge}', { monthly: shortMoney(monthly), untilAge }),
      overrides: { baristaIncome: { annualMinor: toMinor(monthly * 12), untilAge } },
      events: [],
    }),
  },
  {
    kind: 'big_expense',
    label: t('A one-off big expense'),
    fields: [
      { key: 'amount', label: t('Cost'), kind: 'money', hint: t('E.g. a home down payment') },
      { key: 'year', label: t('In year'), kind: 'year' },
    ],
    defaults: (ctx) => ({ amount: 3_000_000, year: ctx.input.startYear + 3 }),
    build: ({ amount, year }) => ({
      name: t('Spend {amount} in {year}', { amount: shortMoney(amount), year }),
      overrides: {},
      events: [
        { date: `${year}-01-01`, amountMinor: -toMinor(Math.abs(amount)), description: t('One-off cost') },
      ],
    }),
  },
  {
    kind: 'crash',
    label: t('A market crash just after you stop'),
    fields: [
      {
        key: 'percent',
        label: t('Shares fall by'),
        kind: 'percent',
        hint: t('Spread over the first 2 years'),
      },
    ],
    defaults: () => ({ percent: 30 }),
    build: ({ percent }) => ({
      name: t('Markets fall {percent}% just after you stop', { percent }),
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
    if (v === undefined || !Number.isFinite(v))
      return t('Enter {toLowerCase}.', { toLowerCase: f.label.toLowerCase() });
    if (f.kind === 'age' && (v <= input.startAge || v >= input.horizonAge || !Number.isInteger(v)))
      return t('Use an age between {v} and {v2}.', { v: input.startAge + 1, v2: input.horizonAge - 1 });
    if (f.kind === 'percent' && (v <= 0 || v >= 90)) return t('Use a percentage between 1 and 89.');
    if (
      f.kind === 'year' &&
      (v < input.startYear || v > input.startYear + (input.horizonAge - input.startAge))
    )
      return t('Use a year from {startYear}.', { startYear: input.startYear });
    if (f.kind === 'money' && template.kind !== 'save_more' && v <= 0) return t('Use an amount above zero.');
  }
  return undefined;
}

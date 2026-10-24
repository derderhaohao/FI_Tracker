import { describe, expect, it } from 'vitest';
import type { Scenario } from '@/domain/entities';
import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { makeInput } from '@/domain/testFixtures';
import { GLOSSARY, JARGON } from '@/lib/glossary';
import { PLAIN_BAND_LABELS } from '@/components/charts/bandLabels';
import {
  evaluateRow,
  explainDifference,
  nameCheck,
  outOfTen,
  savingsRateOf,
  stopAge,
  tierOf,
  verdict,
  whyLensesDiffer,
  type LabRow,
} from './model';
import { saferVariants } from './levers';
import { checkTemplateValues, shortMoney, TEMPLATES } from './templates';
import { demoAppData } from './testData';

const data = demoAppData();
const today = evaluateRow(data);

function scenario(name: string, overrides: Scenario['overrides'], events: Scenario['events'] = []): Scenario {
  return {
    id: name,
    name,
    assumptionSetId: data.activeAssumptions.id,
    overrides,
    events,
    withdrawalRule: { kind: 'fixed_swr' },
    isPlanOfRecord: false,
    seed: 42,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function mc(successRate: number, extra: Partial<MonteCarloSummary> = {}): MonteCarloSummary {
  return {
    runs: 1000,
    seed: 42,
    ages: [],
    p10: [],
    p40: [],
    p50: [],
    p60: [],
    p90: [],
    successRate,
    fiRate: 1,
    fiAgeDistribution: [],
    balanceAtHorizonP50: 0,
    minSpendingRatioP50: 1,
    elapsedMs: 1,
    ...extra,
  };
}

describe('plain-language helpers', () => {
  it('computes the savings rate the PRD quotes (23.2%)', () => {
    const input = makeInput({ annualIncome: 2_554_800, currentSpending: 2_554_800 - 593_424 });
    expect(savingsRateOf(input)).toBeCloseTo(0.2323, 4);
    expect(savingsRateOf(makeInput({ annualIncome: 0 }))).toBeUndefined();
  });

  it('uses the PRD tier thresholds and never rounds a real risk away', () => {
    expect(tierOf(0.85)).toBe('on_track');
    expect(tierOf(0.84)).toBe('borderline');
    expect(tierOf(0.7)).toBe('borderline');
    expect(tierOf(0.69)).toBe('at_risk');
    expect(outOfTen(0.6)).toBe(6);
    expect(outOfTen(0.97)).toBe(9);
    expect(outOfTen(1)).toBe(10);
    expect(outOfTen(0.02)).toBe(1);
  });

  it('writes the verdict sentence with the typical run-out age', () => {
    const v = verdict(today, data.ctx.asOfDate, mc(0.6, { depletionAgeP50: 81.4 }));
    expect(v.stop).toMatch(/^You could stop working at \d+ \([A-Z][a-z]{2} \d{4}\)\.$/);
    expect(v.lasts).toBe(
      `In 6 of 10 simulated futures your money lasts to ${today.input.horizonAge}; in the other 4 it runs out, typically around age 81.`,
    );
    expect(v.reach).toBe('You reach your target in every simulation; the risk comes after you stop.');
    expect(v.tier).toBe('at_risk');
    expect(verdict(today, data.ctx.asOfDate).lasts).toBeUndefined();
  });

  it('keeps jargon out of the Simple-view labels', () => {
    const simple = [...Object.values(GLOSSARY).map((g) => g.label), ...Object.values(PLAIN_BAND_LABELS)].join(
      ' | ',
    );
    for (const word of JARGON) expect(simple).not.toContain(word);
  });
});

describe('vs your plan', () => {
  it('explains the "safest scenario saves least" case by the extra working years', () => {
    const later = evaluateRow(data, scenario('Saving rate 10%', { savingsRate: 0.1 }));
    const a = stopAge(today.result)!;
    const b = stopAge(later.result)!;
    expect(b).toBeGreaterThan(a);
    const d = explainDifference(today, later, 0.6, 0.66);
    expect(d.short).toBe(`+${b - a} yr${b - a === 1 ? '' : 's'} work · +6 pts`);
    expect(d.cause).toBe(
      `Safer mainly because you work ${b - a} more year${b - a === 1 ? '' : 's'}, so the money must last ${95 - b} years instead of ${95 - a}.`,
    );
  });

  it('only adds a cause line for 5 points or more', () => {
    const r = evaluateRow(data, scenario('Spend less', { spendingMultiplier: 0.98 }));
    expect(explainDifference(today, r, 0.6, 0.63).cause).toBeUndefined();
    expect(explainDifference(today, today, 0.6, 0.6).short).toBe('Same');
  });

  it('names a crash as the cause of a riskier plan', () => {
    const r = evaluateRow(data, scenario('Crash', { crash: { drop: 0.3, years: 2 } }));
    expect(explainDifference(today, r, 0.7, 0.5).cause).toMatch(/^Riskier mainly because markets fall 30%/);
  });

  it('warns when a "20%" savings scenario saves less than today', () => {
    const rate = savingsRateOf(today.input)!;
    const cut = evaluateRow(data, scenario('Saving rate 20%', { savingsRate: rate - 0.03 }));
    expect(nameCheck('Saving rate 20%', today, cut)).toMatch(/is less than you save today/);
    const more = evaluateRow(data, scenario('Save more', { currentSpendingMinor: 0 }));
    expect(nameCheck('Save more', today, more)).toBeUndefined();
    const less = evaluateRow(data, scenario('Save more', { annualIncomeMinor: 0 }));
    expect(nameCheck('Save more', today, less)).toMatch(/saves less/);
    const late = evaluateRow(data, scenario('Retire early', { targetFiAge: 70 }));
    expect(nameCheck('Retire early', today, late)).toMatch(/stop earlier/);
  });
});

describe('two lenses', () => {
  it('explains a gap over 10 points by the return assumptions', () => {
    expect(whyLensesDiffer(today.input, 0.6, 0.68)).toBeUndefined();
    const note = whyLensesDiffer(today.input, 0.6, 0.91)!;
    expect(note).toMatch(/^Past markets look kinder because of returns: over 1871–2022 your mix grew about/);
  });
});

describe('templates and variants', () => {
  it('names each template after what it does', () => {
    const names = TEMPLATES.map((t) => t.build(t.defaults(today), today).name);
    expect(names[0]).toMatch(/^Retire at \d+$/);
    expect(names.slice(1)).toEqual([
      'Save NT$10k more a month',
      'Spend 10% less after you stop',
      expect.stringMatching(/^Part-time NT\$30k a month to \d+$/),
      `Spend NT$3M in ${today.input.startYear + 3}`,
      'Markets fall 30% just after you stop',
    ]);
    expect(shortMoney(1_500_000)).toBe('NT$1.5M');
    expect(shortMoney(-10_000)).toBe('NT$10k');
  });

  it('builds overrides relative to today and validates values', () => {
    const save = TEMPLATES.find((t) => t.kind === 'save_more')!;
    const r = save.build({ monthly: 10_000 }, today);
    expect(r.overrides.currentSpendingMinor! / 100).toBeCloseTo(today.input.currentSpending - 120_000, 0);
    const retire = TEMPLATES[0];
    expect(checkTemplateValues(retire, { age: today.input.startAge }, today.input)).toMatch(/between/);
    expect(checkTemplateValues(retire, { age: 50 }, today.input)).toBeUndefined();
    const expense = TEMPLATES.find((t) => t.kind === 'big_expense')!;
    expect(expense.build({ amount: 3_000_000, year: 2030 }, today).events[0].amountMinor).toBe(-300_000_000);
  });

  it('offers safer variants that keep a stop-at-target plan stopping at its target', () => {
    const row: LabRow = today;
    const v = saferVariants(row);
    expect(v.map((x) => x.key)).toEqual(['work1', 'work2', 'spend5', 'spend10', 'parttime']);
    expect(today.input.swr).toBeLessThanOrEqual(0.035);
    expect(v[0].overrides.workExtraYears).toBe(1);
    expect(v[2].overrides.targetSpendingMinor).toBeDefined();
    expect(v[4].overrides.baristaIncome?.inTarget).toBe(false);
    const work = evaluateRow(data, scenario('w', v[0].overrides));
    expect(stopAge(work.result)).toBe(stopAge(today.result)! + 1);
    const spend = evaluateRow(data, scenario('s', v[3].overrides));
    expect(stopAge(spend.result)).toBe(stopAge(today.result));
    const fixed = evaluateRow(data, scenario('f', { targetFiAge: 55 }));
    expect(saferVariants(fixed)[0].overrides.targetFiAge).toBe(56);
  });
});

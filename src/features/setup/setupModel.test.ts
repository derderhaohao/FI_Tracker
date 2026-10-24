import { makeAssumptions, makeSettings, stamp } from '@/domain/testFixtures';
import type { Category } from '@/domain/entities';
import { toMinor } from '@/domain/money';
import {
  buildSetupRecords,
  CASH_WARNING,
  chosenMix,
  currentMix,
  MIX_PRESETS,
  draftAccount,
  emptyDraft,
  LIVING_COSTS,
  previewSetup,
  validateStep,
  type SetupDraft,
} from './setupModel';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', kind: 'income', essential: false, ...stamp },
  { id: 'food', name: 'Food', kind: 'expense', essential: true, ...stamp },
];
const ctx = {
  settings: makeSettings({ birthYear: 1990 }),
  categories,
  assumptionSet: makeAssumptions(),
  today: '2026-10-23',
  now: '2026-10-23T08:00:00.000Z',
};

function fullDraft(): SetupDraft {
  const d = emptyDraft(0.04);
  d.birthYear = 1988;
  d.targetFiAge = 50;
  d.accounts = [
    { ...draftAccount('bank'), balanceMinor: toMinor(800_000) },
    { ...draftAccount('us_broker'), balanceMinor: toMinor(40_000) },
    { ...draftAccount('pension'), balanceMinor: toMinor(600_000) },
    { ...draftAccount('loan'), balanceMinor: toMinor(300_000) },
  ];
  d.usdRate = 32;
  d.monthlyIncomeMinor = toMinor(90_000);
  d.monthlySpendingMinor = toMinor(50_000);
  d.fiSpendingMinor = toMinor(600_000);
  d.taiwan = {
    skipped: false,
    pensionWageMinor: toMinor(92_100),
    insuredYears: 12,
    avgInsuredSalaryMinor: toMinor(45_800),
    claimAge: 65,
  };
  d.mix = 'current';
  return d;
}

describe('setup validation', () => {
  it('requires a sensible birth year and target age', () => {
    const d = emptyDraft(0.04);
    expect(validateStep(0, d, 2026)).toEqual(['Enter your birth year.']);
    expect(validateStep(0, { ...d, birthYear: 2020 }, 2026)[0]).toMatch(/between 1930 and 2010/);
    expect(validateStep(0, { ...d, birthYear: 1990, targetFiAge: 30 }, 2026)[0]).toMatch(/Target FI age/);
    expect(validateStep(0, { ...d, birthYear: 1990, targetFiAge: 50 }, 2026)).toEqual([]);
  });

  it('requires an owned account, balances, nicknames and a USD rate', () => {
    const d = emptyDraft(0.04);
    expect(validateStep(1, d, 2026)).toContain("Enter today's balance for Bank account (0 is fine).");
    expect(
      validateStep(1, { ...d, accounts: [{ ...draftAccount('loan'), balanceMinor: 1 }] }, 2026)[0],
    ).toMatch(/at least one account you own/);
    const usd = { ...d, accounts: [{ ...draftAccount('us_broker'), balanceMinor: 100 }] };
    expect(validateStep(1, usd, 2026)).toEqual(['Enter today’s USD/TWD rate for your USD accounts.']);
    expect(validateStep(1, { ...usd, usdRate: 32 }, 2026)).toEqual([]);
    const numbered = {
      ...d,
      accounts: [{ ...draftAccount('bank'), nickname: '012345678', balanceMinor: 0 }],
    };
    expect(validateStep(1, numbered, 2026)[0]).toMatch(/account number/);
  });

  it('checks money, goal and Taiwan steps', () => {
    const d = fullDraft();
    expect([2, 3, 4, 5].flatMap((s) => validateStep(s, d, 2026))).toEqual([]);
    expect(validateStep(2, { ...d, monthlySpendingMinor: undefined }, 2026)).toEqual([
      'Enter your monthly spending.',
    ]);
    expect(validateStep(3, { ...d, swr: 0.06 }, 2026)[0]).toMatch(/2.5% and 5%/);
    expect(validateStep(4, { ...d, taiwan: { skipped: false, claimAge: 75 } }, 2026)[0]).toMatch(/claim age/);
    expect(validateStep(4, { ...d, taiwan: { skipped: true, claimAge: 75 } }, 2026)).toEqual([]);
  });

  it('has no mix without usable investments', () => {
    expect(
      currentMix({ ...emptyDraft(0.04), accounts: [{ ...draftAccount('pension'), balanceMinor: 100 }] }),
    ).toBeUndefined();
  });

  it('numbers repeated account kinds', () => {
    const first = draftAccount('bank');
    expect(draftAccount('bank', [first]).nickname).toBe('Bank account 2');
  });
});

describe('setup records', () => {
  const r = buildSetupRecords(fullDraft(), ctx);

  it('updates settings and the Taiwan assumptions', () => {
    expect(r.settings.birthYear).toBe(1988);
    expect(r.settings.defaultSwr).toBe(0.04);
    expect(r.settings.destination.targetFiAge).toBe(50);
    // The chosen mix: the current usable mix, 800k cash and 1.28M US equity (勞退 excluded).
    expect(r.settings.targetAllocation).toEqual({ cash: 0.38, us_equity: 0.62 });
    expect(r.settings.backupPrompt).toBe('setup');
    expect(r.assumptionSet.taiwan.laborPension.monthlyInsuredWageMinor).toBe(toMinor(92_100));
    expect(r.assumptionSet.taiwan.laborInsurance.insuredYearsToDate).toBe(12);
    expect(r.assumptionSet.taiwan.laborInsurance.avgMonthlyInsuredSalaryMinor).toBe(toMinor(45_800));
    // The original assumption set is not mutated.
    expect(ctx.assumptionSet.taiwan.laborInsurance.insuredYearsToDate).toBe(0);
  });

  it('maps account kinds to types, classes and access ages', () => {
    const by = (n: string) => r.accounts.find((a) => a.nickname === n)!;
    expect(by('Bank account')).toMatchObject({
      type: 'cash',
      assetClass: 'cash',
      investable: true,
      currency: 'TWD',
    });
    expect(by('US broker')).toMatchObject({ type: 'brokerage', assetClass: 'us_equity', currency: 'USD' });
    expect(by('勞退 account')).toMatchObject({ type: 'pension', investable: true, accessAge: 60 });
    expect(by('Loan')).toMatchObject({ type: 'liability', investable: false });
    expect(r.liabilities).toHaveLength(1);
    expect(r.liabilities[0].accountId).toBe(by('Loan').id);
    expect(r.snapshots).toHaveLength(4);
    expect(r.snapshots.every((s) => s.date === '2026-10-23')).toBe(true);
    expect(r.fxRates).toEqual([
      expect.objectContaining({ currency: 'USD', twdPerUnit: 32, date: '2026-10-23' }),
    ]);
  });

  it('records last month’s cash flow and a Living costs FI budget', () => {
    const living = r.categories.find((c) => c.name === LIVING_COSTS)!;
    expect(living).toMatchObject({ kind: 'expense', essential: true, fiAnnualMinor: toMinor(600_000) });
    expect(r.categories.filter((c) => c.name === 'Salary')).toHaveLength(1);
    expect(r.cashFlows.map((c) => [c.month, c.categoryId, c.amountMinor, c.date])).toEqual([
      ['2026-09', 'salary', toMinor(90_000), undefined],
      ['2026-09', living.id, toMinor(50_000), undefined],
    ]);
  });

  it('leaves the Taiwan settings alone when skipped and skips zero cash flows', () => {
    const d = { ...fullDraft(), taiwan: { skipped: true, insuredYears: 30 }, monthlyIncomeMinor: 0 };
    const s = buildSetupRecords(d, ctx);
    expect(s.assumptionSet.taiwan.laborInsurance.insuredYearsToDate).toBe(0);
    expect(s.cashFlows).toHaveLength(1);
  });

  it('previews a projected FI age before anything is saved', () => {
    const p = previewSetup(r);
    expect(p.startAge).toBe(38);
    expect(p.fiAge).toBeGreaterThan(38);
    expect(p.investableNow).toBe(800_000 + 40_000 * 32);
    // (600k FI spending + 826 × 12 NHI from the default settings) ÷ 4%
    expect(p.fiNumber).toBeCloseTo((600_000 + (ctx.settings.destination.nhiMonthlyMinor * 12) / 100) / 0.04);
  });
});

describe('investment mix for new savings', () => {
  it('must be chosen, and can be the current mix or a preset', () => {
    const d = fullDraft();
    expect(validateStep(5, { ...d, mix: undefined }, 2026)).toEqual([
      'Choose how your new savings will be invested.',
    ]);
    expect(chosenMix({ ...d, mix: 'balanced' })).toEqual(MIX_PRESETS.balanced.allocation);
    const sum = (a: Record<string, number | undefined>) =>
      Object.values(a).reduce<number>((x, y) => x + (y ?? 0), 0);
    for (const p of Object.values(MIX_PRESETS)) expect(sum(p.allocation)).toBeCloseTo(1, 9);
    expect(chosenMix(d)!.cash).toBeGreaterThan(CASH_WARNING);
    const noUsable = { ...d, accounts: [{ ...draftAccount('pension'), balanceMinor: 100 }] };
    expect(validateStep(5, noUsable, 2026)[0]).toMatch(/no current mix/);
  });
});

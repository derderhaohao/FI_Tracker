import type {
  Account,
  AssumptionSet,
  CashFlow,
  Category,
  FxRate,
  Holding,
  Review,
  Scenario,
  Settings,
  Snapshot,
} from '@/domain/entities';
import { defaultAssumptionSet } from '@/domain/assumptions';
import { buildProjectionInput, type PlanData } from '@/domain/baseline';
import { addMonths, lastDayOfMonth, monthRange } from '@/domain/dates';
import { mulberry32 } from '@/domain/montecarlo/rng';
import { toMinor } from '@/domain/money';
import { lockProjection } from '@/domain/planVsActual';
import { runProjection } from '@/domain/projection';
import { SCHEMA_VERSION } from '@/db/db';
import type { BackupFile } from './backup';

/**
 * Fictional demo data for development and the public demo. The person, the
 * institutions and every amount are made up. Generated deterministically, so the
 * file in sample-data/ can be regenerated with `npm run demo:generate`.
 */

const STAMP = '2026-10-01T00:00:00.000Z';
const at = { createdAt: STAMP, updatedAt: STAMP };
const FIRST_MONTH = '2025-01';
const LAST_MONTH = '2026-09';

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `demo-${prefix}-${String(counter).padStart(4, '0')}`;
}

export function buildDemoBackup(): BackupFile {
  counter = 0;
  const rand = mulberry32(20261022);
  const noise = (scale: number) => (rand() * 2 - 1) * scale;

  const assumptionSet: AssumptionSet = { ...defaultAssumptionSet('demo-assumptions-base'), ...at };
  assumptionSet.taiwan.laborPension.monthlyInsuredWageMinor = toMinor(92_100);
  assumptionSet.taiwan.laborInsurance.avgMonthlyInsuredSalaryMinor = toMinor(45_800);
  assumptionSet.taiwan.laborInsurance.insuredYearsToDate = 11;
  const cautious: AssumptionSet = {
    ...structuredClone(assumptionSet),
    id: 'demo-assumptions-cautious',
    name: 'Cautious',
    inflation: 0.025,
    assets: assumptionSet.assets.map((a) => ({ ...a, expectedReturn: a.expectedReturn - 0.015 })),
  };

  const settings: Settings = {
    id: 'singleton',
    baseCurrency: 'TWD',
    birthYear: 1991,
    horizonAge: 95,
    defaultSwr: 0.035,
    snapshotCadence: 'monthly',
    activeAssumptionSetId: assumptionSet.id,
    targetAllocation: { cash: 0.1, tw_equity: 0.3, us_equity: 0.45, bond: 0.15 },
    destination: {
      fiTier: 'full',
      fatMultiplier: 1.3,
      nhiMonthlyMinor: toMinor(826),
      privateInsuranceAnnualMinor: toMinor(36_000),
      healthcareReserveAnnualMinor: toMinor(30_000),
      targetFiAge: 50,
    },
    alerts: { targetSavingsRate: 0.35, allocationDriftThreshold: 0.1, emergencyFundMonths: 6 },
    snapshotSinceBackup: false,
    ...at,
  };

  const account = (a: Omit<Account, 'id' | 'archived' | 'createdAt' | 'updatedAt'>): Account => ({
    id: id('acct'),
    archived: false,
    ...at,
    ...a,
  });
  const accounts = {
    everyday: account({
      nickname: 'Everyday account',
      institution: 'Demo Bank',
      type: 'cash',
      assetClass: 'cash',
      currency: 'TWD',
      investable: true,
    }),
    savings: account({
      nickname: 'Emergency fund',
      institution: 'Demo Bank',
      type: 'cash',
      assetClass: 'cash',
      currency: 'TWD',
      investable: true,
    }),
    twBroker: account({
      nickname: 'TW ETFs',
      institution: 'Demo Securities',
      type: 'brokerage',
      assetClass: 'tw_equity',
      currency: 'TWD',
      investable: true,
    }),
    usBroker: account({
      nickname: 'US ETFs',
      institution: 'Sample Broker',
      type: 'brokerage',
      assetClass: 'us_equity',
      currency: 'USD',
      investable: true,
    }),
    bonds: account({
      nickname: 'Bond ETF',
      institution: 'Sample Broker',
      type: 'brokerage',
      assetClass: 'bond',
      currency: 'USD',
      investable: true,
    }),
    pension: account({
      nickname: '勞退 account',
      institution: 'Labor pension fund',
      type: 'pension',
      assetClass: 'other',
      currency: 'TWD',
      investable: true,
      accessAge: 60,
    }),
    insurance: account({
      nickname: 'USD savings policy',
      institution: 'Demo Life',
      type: 'insurance',
      assetClass: 'other',
      currency: 'USD',
      investable: false,
    }),
    loan: account({
      nickname: 'Car loan',
      institution: 'Demo Bank',
      type: 'liability',
      assetClass: 'other',
      currency: 'TWD',
      investable: false,
    }),
  };

  const months = monthRange(FIRST_MONTH, LAST_MONTH);
  const fxRates: FxRate[] = [];
  const snapshots: Snapshot[] = [];
  let usd = 31.2;
  const balances = {
    everyday: 120_000,
    savings: 380_000,
    twBroker: 1_450_000,
    usBroker: 38_000,
    bonds: 9_000,
    pension: 610_000,
    insurance: 21_000,
    loan: 420_000,
  };
  months.forEach((m, i) => {
    const date = lastDayOfMonth(m);
    usd = Math.round((usd + noise(0.45)) * 100) / 100;
    fxRates.push({ id: id('fx'), date, currency: 'USD', twdPerUnit: usd, ...at });
    if (i > 0) {
      balances.everyday = Math.max(60_000, balances.everyday + noise(25_000));
      balances.savings += 3_000;
      balances.twBroker = balances.twBroker * (1 + 0.006 + noise(0.04)) + 22_000;
      balances.usBroker = balances.usBroker * (1 + 0.006 + noise(0.035)) + 650;
      balances.bonds = balances.bonds * (1 + 0.002 + noise(0.01)) + 120;
      balances.pension = balances.pension * 1.003 + 11_052;
      if (m.endsWith('-12')) balances.insurance += 1_800;
      balances.loan = Math.max(0, balances.loan - 12_500);
    }
    for (const [key, value] of Object.entries(balances) as [keyof typeof balances, number][]) {
      snapshots.push({
        id: id('snap'),
        date,
        accountId: accounts[key].id,
        balanceMinor: toMinor(Math.round(value)),
        ...at,
      });
    }
  });

  const lastDate = lastDayOfMonth(LAST_MONTH);
  const holdings: Holding[] = [
    {
      id: id('hold'),
      date: lastDate,
      accountId: accounts.usBroker.id,
      ticker: 'VT',
      units: 180,
      priceMinor: toMinor(132.4),
      currency: 'USD',
      ...at,
    },
    {
      id: id('hold'),
      date: lastDate,
      accountId: accounts.usBroker.id,
      ticker: 'VOO',
      units: Math.round((balances.usBroker - 180 * 132.4) / 560),
      priceMinor: toMinor(560),
      currency: 'USD',
      ...at,
    },
  ];

  const cat = (name: string, kind: Category['kind'], essential: boolean, fiAnnual?: number): Category => ({
    id: id('cat'),
    name,
    kind,
    essential,
    fiAnnualMinor: fiAnnual === undefined ? undefined : toMinor(fiAnnual),
    ...at,
  });
  const c = {
    salary: cat('Salary', 'income', false),
    bonus: cat('Bonus', 'income', false),
    dividends: cat('Dividends', 'income', false),
    housing: cat('Housing', 'expense', true, 216_000),
    food: cat('Food', 'expense', true, 132_000),
    transport: cat('Transport', 'expense', true, 30_000),
    utilities: cat('Utilities & phone', 'expense', true, 30_000),
    health: cat('Insurance & health', 'expense', true, 24_000),
    family: cat('Family', 'expense', true, 72_000),
    travel: cat('Travel', 'expense', false, 90_000),
    leisure: cat('Leisure & shopping', 'expense', false, 60_000),
    loan: cat('Loan repayment', 'expense', false, 0),
  };
  const categories = Object.values(c);

  const cashFlows: CashFlow[] = [];
  const flow = (month: string, category: Category, amount: number, lumpSum = false, note?: string) =>
    cashFlows.push({
      id: id('cf'),
      month,
      categoryId: category.id,
      amountMinor: toMinor(Math.round(amount)),
      currency: 'TWD',
      lumpSum,
      note,
      ...at,
    });
  for (const m of months) {
    const raise = m >= '2026-03' ? 1.04 : 1;
    flow(m, c.salary, 86_500 * raise);
    if (m.endsWith('-01')) flow(m, c.bonus, 173_000, true, 'Year-end bonus');
    if (m.endsWith('-09')) flow(m, c.bonus, 30_000, true, 'Mid-Autumn bonus');
    if (['03', '06', '09', '12'].includes(m.slice(5))) flow(m, c.dividends, 14_000 + noise(3_000));
    flow(m, c.housing, 18_000);
    flow(m, c.food, 11_500 + noise(1_500));
    flow(m, c.transport, 2_600 + noise(600));
    flow(m, c.utilities, 2_400 + noise(300));
    flow(m, c.health, 1_900);
    flow(m, c.family, 6_000);
    flow(m, c.leisure, 5_500 + noise(2_000));
    flow(m, c.loan, 12_500);
    if (m === '2025-07') flow(m, c.travel, 68_000, true, 'Japan trip');
    else flow(m, c.travel, 1_500 + noise(1_000));
  }

  const scenario = (
    s: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt' | 'isPlanOfRecord' | 'assumptionSetId'> &
      Partial<Scenario>,
  ): Scenario => ({
    id: id('scn'),
    assumptionSetId: assumptionSet.id,
    isPlanOfRecord: false,
    ...at,
    ...s,
  });
  const scenarios: Scenario[] = [
    scenario({
      name: 'Baseline',
      overrides: {},
      events: [],
      withdrawalRule: { kind: 'fixed_swr' },
      seed: 42,
    }),
    scenario({
      name: 'Save 50%',
      overrides: { savingsRate: 0.5 },
      events: [],
      withdrawalRule: { kind: 'guardrails', band: 0.2, step: 0.1 },
      seed: 42,
    }),
    scenario({
      name: 'Barista FI at 45',
      overrides: { targetFiAge: 45, baristaIncome: { annualMinor: toMinor(360_000), untilAge: 55 } },
      events: [],
      withdrawalRule: { kind: 'fixed_swr' },
      seed: 42,
    }),
    scenario({
      name: 'Buy a flat in 2029',
      overrides: { currentSpendingMinor: toMinor(780_000) },
      events: [{ date: '2029-06-01', amountMinor: toMinor(-3_000_000), description: 'Down payment' }],
      withdrawalRule: { kind: 'fixed_swr' },
      seed: 42,
    }),
  ];

  const data = {
    settings: [settings],
    accounts: Object.values(accounts),
    snapshots,
    fxRates,
    holdings,
    liabilities: [
      {
        accountId: accounts.loan.id,
        interestRate: 0.025,
        monthlyPaymentMinor: toMinor(12_500),
        remainingMonths: 32,
        ...at,
      },
    ],
    cashFlows,
    categories,
    incomeStreams: [],
    assumptionSets: [assumptionSet, cautious],
    scenarios,
    reviews: [] as Review[],
  };

  // Lock the baseline as plan of record, as of the snapshot six months before the last.
  const lockMonth = addMonths(LAST_MONTH, -6);
  const lockDate = lastDayOfMonth(lockMonth);
  const asOfLock: PlanData = {
    settings,
    accounts: data.accounts,
    snapshots: snapshots.filter((s) => s.date <= lockDate),
    fxRates,
    liabilities: data.liabilities,
    categories,
    cashFlows: cashFlows.filter((f) => f.month <= lockMonth),
    incomeStreams: [],
  };
  const baseline = scenarios[0];
  const result = runProjection(buildProjectionInput(asOfLock, assumptionSet, baseline));
  baseline.isPlanOfRecord = true;
  baseline.lockedAt = lockDate;
  baseline.lockedProjection = lockProjection(result);

  data.reviews.push(
    {
      id: id('rev'),
      date: lockDate,
      type: 'annual',
      planOfRecordId: baseline.id,
      notes: 'First annual reset. Locked the baseline as plan of record.',
      decisions: ['Keep 45% in US equity', 'Raise emergency fund to 6 months'],
      checklist: {},
      ...at,
    },
    {
      id: id('rev'),
      date: lastDate,
      type: 'quarterly',
      planOfRecordId: baseline.id,
      notes: 'Ahead of plan thanks to the raise in March.',
      decisions: ['Test a 50% savings-rate scenario'],
      checklist: {},
      ...at,
    },
  );

  return { app: 'fi-tracker', schemaVersion: SCHEMA_VERSION, exportedAt: STAMP, data };
}

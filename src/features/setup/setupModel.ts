/**
 * First-time setup wizard: the draft, per-step validation, and a pure builder that turns
 * the draft into the records to save. Nothing is written until the last step, and then
 * in one transaction, so an abandoned setup leaves no half-finished data.
 */
import type {
  Account,
  AccountType,
  Allocation,
  AssetClass,
  AssumptionSet,
  CashFlow,
  Category,
  FxRate,
  Liability,
  Settings,
  Snapshot,
} from '@/domain/entities';
import { accountDefaults } from '@/domain/accounts';
import { buildProjectionInput, type PlanData } from '@/domain/baseline';
import { addMonths, monthOf, yearOf } from '@/domain/dates';
import { fiSpendingByTier, fiNumber } from '@/domain/fiNumber';
import { fromMinor } from '@/domain/money';
import { runProjection } from '@/domain/projection';
import { db } from '@/db/db';
import { newId } from '@/db/repo';

export type SetupKind = 'bank' | 'tw_broker' | 'us_broker' | 'pension' | 'insurance' | 'home' | 'loan';

interface KindPreset {
  label: string;
  nickname: string;
  type: AccountType;
  assetClass: AssetClass;
  currency: 'TWD' | 'USD';
  hint: string;
}

export const SETUP_KINDS: Record<SetupKind, KindPreset> = {
  bank: {
    label: 'Bank account',
    nickname: 'Bank account',
    type: 'cash',
    assetClass: 'cash',
    currency: 'TWD',
    hint: 'Savings and current accounts, time deposits',
  },
  tw_broker: {
    label: 'TW broker',
    nickname: 'TW broker',
    type: 'brokerage',
    assetClass: 'tw_equity',
    currency: 'TWD',
    hint: 'Taiwan stocks and ETFs, market value',
  },
  us_broker: {
    label: 'US broker',
    nickname: 'US broker',
    type: 'brokerage',
    assetClass: 'us_equity',
    currency: 'USD',
    hint: 'Overseas stocks and ETFs, in USD',
  },
  pension: {
    label: '勞退 account',
    nickname: '勞退 account',
    type: 'pension',
    assetClass: 'other',
    currency: 'TWD',
    hint: 'Labor pension balance (locked until 60)',
  },
  insurance: {
    label: 'Savings insurance',
    nickname: 'Savings insurance',
    type: 'insurance',
    assetClass: 'other',
    currency: 'TWD',
    hint: '儲蓄險 cash value',
  },
  home: {
    label: 'Home',
    nickname: 'Home',
    type: 'property',
    assetClass: 'property',
    currency: 'TWD',
    hint: 'Estimated market value',
  },
  loan: {
    label: 'Loan / mortgage',
    nickname: 'Loan',
    type: 'liability',
    assetClass: 'other',
    currency: 'TWD',
    hint: 'Amount still owed',
  },
};

export interface DraftAccount {
  key: string;
  kind: SetupKind;
  nickname: string;
  currency: 'TWD' | 'USD';
  /** Minor units in the account currency; for loans, the amount owed. */
  balanceMinor?: number;
}

export interface SetupDraft {
  birthYear?: number;
  targetFiAge?: number;
  accounts: DraftAccount[];
  /** TWD per USD today. */
  usdRate?: number;
  monthlyIncomeMinor?: number;
  monthlySpendingMinor?: number;
  /** Annual FI-phase spending, TWD minor units. */
  fiSpendingMinor?: number;
  swr: number;
  taiwan: {
    skipped: boolean;
    pensionWageMinor?: number;
    insuredYears?: number;
    avgInsuredSalaryMinor?: number;
    claimAge?: number;
  };
  /** How new savings are invested; asked on the last step. */
  mix?: MixChoice;
}

export type MixChoice = 'current' | 'growth' | 'balanced' | 'cautious';

/** Ready-made mixes for new savings, offered beside the current mix. */
export const MIX_PRESETS: Record<
  Exclude<MixChoice, 'current'>,
  { label: string; text: string; allocation: Allocation }
> = {
  growth: {
    label: 'Mostly shares',
    text: '80% shares, 15% bonds, 5% cash. Bigger swings, higher typical growth.',
    allocation: { global_equity: 0.4, us_equity: 0.25, tw_equity: 0.15, bond: 0.15, cash: 0.05 },
  },
  balanced: {
    label: 'Balanced',
    text: '60% shares, 30% bonds, 10% cash.',
    allocation: { global_equity: 0.3, us_equity: 0.18, tw_equity: 0.12, bond: 0.3, cash: 0.1 },
  },
  cautious: {
    label: 'Cautious',
    text: '35% shares, 45% bonds, 20% cash. Smaller swings, lower typical growth.',
    allocation: { global_equity: 0.2, us_equity: 0.1, tw_equity: 0.05, bond: 0.45, cash: 0.2 },
  },
};

/** Cash above this share of new savings quietly lowers long-run growth. */
export const CASH_WARNING = 0.3;

export function draftAccount(kind: SetupKind, existing: readonly DraftAccount[] = []): DraftAccount {
  const p = SETUP_KINDS[kind];
  const same = existing.filter((a) => a.kind === kind).length;
  return {
    key: newId(),
    kind,
    nickname: same === 0 ? p.nickname : `${p.nickname} ${same + 1}`,
    currency: p.currency,
  };
}

export function emptyDraft(swr: number): SetupDraft {
  return { accounts: [draftAccount('bank')], swr, taiwan: { skipped: false } };
}

export const STEPS = [
  'About you',
  'Accounts',
  'Money in & out',
  'FI goal',
  'Taiwan pensions',
  'Review',
] as const;

/** Problems that stop the user leaving a step; empty when the step is complete. */
export function validateStep(step: number, d: SetupDraft, currentYear: number): string[] {
  const errors: string[] = [];
  switch (step) {
    case 0: {
      if (d.birthYear === undefined) errors.push('Enter your birth year.');
      else if (d.birthYear < 1930 || d.birthYear > currentYear - 16)
        errors.push(`Birth year must be between 1930 and ${currentYear - 16}.`);
      if (d.targetFiAge !== undefined && d.birthYear !== undefined) {
        const age = currentYear - d.birthYear;
        if (d.targetFiAge <= age || d.targetFiAge > 100)
          errors.push(`Target FI age must be between ${age + 1} and 100, or left empty.`);
      }
      break;
    }
    case 1: {
      if (!d.accounts.some((a) => a.kind !== 'loan'))
        errors.push('Add at least one account you own, such as a bank account.');
      for (const a of d.accounts) {
        if (!a.nickname.trim()) errors.push('Every account needs a nickname.');
        else if (/\d{6,}/.test(a.nickname))
          errors.push(`“${a.nickname}” looks like an account number; use a nickname instead.`);
        if (a.balanceMinor === undefined || a.balanceMinor < 0)
          errors.push(`Enter today's balance for ${a.nickname.trim() || 'each account'} (0 is fine).`);
      }
      if (d.accounts.some((a) => a.currency === 'USD') && !(d.usdRate && d.usdRate > 0))
        errors.push('Enter today’s USD/TWD rate for your USD accounts.');
      break;
    }
    case 2:
      if (d.monthlyIncomeMinor === undefined)
        errors.push('Enter your monthly take-home pay (0 if none right now).');
      if (d.monthlySpendingMinor === undefined) errors.push('Enter your monthly spending.');
      break;
    case 3:
      if (!d.fiSpendingMinor || d.fiSpendingMinor <= 0)
        errors.push('Enter how much you would spend per year once you stop working.');
      if (d.swr < 0.025 || d.swr > 0.05) errors.push('The withdrawal rate must be between 2.5% and 5%.');
      break;
    case 5:
      if (!d.mix) errors.push('Choose how your new savings will be invested.');
      else if (d.mix === 'current' && !currentMix(d))
        errors.push('There is no current mix to keep yet; pick one of the ready-made mixes.');
      break;
    case 4: {
      const t = d.taiwan;
      if (t.skipped) break;
      if (t.insuredYears !== undefined && (t.insuredYears < 0 || t.insuredYears > 50))
        errors.push('勞保 insured years must be between 0 and 50.');
      if (t.claimAge !== undefined && (t.claimAge < 60 || t.claimAge > 70))
        errors.push('勞保 claim age must be between 60 and 70.');
      break;
    }
  }
  return [...new Set(errors)];
}

export interface SetupRecords {
  settings: Settings;
  accounts: Account[];
  liabilities: Liability[];
  snapshots: Snapshot[];
  fxRates: FxRate[];
  /** All categories after setup (existing ones plus any created). */
  categories: Category[];
  cashFlows: CashFlow[];
  assumptionSet: AssumptionSet;
}

export interface SetupContext {
  settings: Settings;
  categories: readonly Category[];
  assumptionSet: AssumptionSet;
  /** `YYYY-MM-DD` */
  today: string;
  /** ISO timestamp for audit fields. */
  now: string;
}

export const LIVING_COSTS = 'Living costs';

/**
 * The mix of usable investments (not 勞退, home, insurance or loans), as whole
 * percentages. Setup uses it as the target allocation, so new savings follow the
 * current mix and the drift alert starts quiet. Undefined when there is nothing usable.
 */
export function currentMix(d: SetupDraft): Allocation | undefined {
  const totals: Allocation = {};
  let sum = 0;
  for (const a of d.accounts) {
    const preset = SETUP_KINDS[a.kind];
    if (!accountDefaults(preset.type).investable || preset.type === 'pension') continue;
    const twd = fromMinor(a.balanceMinor ?? 0) * (a.currency === 'USD' ? (d.usdRate ?? 0) : 1);
    if (twd <= 0) continue;
    totals[preset.assetClass] = (totals[preset.assetClass] ?? 0) + twd;
    sum += twd;
  }
  if (sum <= 0) return undefined;
  const out: Allocation = {};
  for (const [k, v] of Object.entries(totals) as [AssetClass, number][])
    out[k] = Math.round((v / sum) * 100) / 100;
  return out;
}

/** The target allocation the user chose, if any. */
export function chosenMix(d: SetupDraft): Allocation | undefined {
  if (!d.mix) return undefined;
  return d.mix === 'current' ? currentMix(d) : MIX_PRESETS[d.mix].allocation;
}

/** Turns a complete draft into the records to save. Pure: ids come from `newId`. */
export function buildSetupRecords(d: SetupDraft, ctx: SetupContext): SetupRecords {
  const at = { createdAt: ctx.now, updatedAt: ctx.now };
  const settings: Settings = {
    ...ctx.settings,
    birthYear: d.birthYear ?? ctx.settings.birthYear,
    defaultSwr: d.swr,
    destination: { ...ctx.settings.destination, targetFiAge: d.targetFiAge },
    targetAllocation: chosenMix(d) ?? ctx.settings.targetAllocation,
    backupPrompt: 'setup',
    updatedAt: ctx.now,
  };

  const assumptionSet: AssumptionSet = structuredClone(ctx.assumptionSet);
  const tw = assumptionSet.taiwan;
  if (!d.taiwan.skipped) {
    if (d.taiwan.pensionWageMinor !== undefined)
      tw.laborPension.monthlyInsuredWageMinor = d.taiwan.pensionWageMinor;
    if (d.taiwan.insuredYears !== undefined) tw.laborInsurance.insuredYearsToDate = d.taiwan.insuredYears;
    if (d.taiwan.avgInsuredSalaryMinor !== undefined)
      tw.laborInsurance.avgMonthlyInsuredSalaryMinor = d.taiwan.avgInsuredSalaryMinor;
    if (d.taiwan.claimAge !== undefined) tw.laborInsurance.claimAge = d.taiwan.claimAge;
    assumptionSet.updatedAt = ctx.now;
  }

  const accounts: Account[] = [];
  const liabilities: Liability[] = [];
  const snapshots: Snapshot[] = [];
  for (const a of d.accounts) {
    const preset = SETUP_KINDS[a.kind];
    const defaults = accountDefaults(preset.type, tw.laborPension.accessAge);
    const account: Account = {
      id: newId(),
      nickname: a.nickname.trim(),
      institution: '',
      type: preset.type,
      assetClass: preset.assetClass,
      currency: a.currency,
      investable: defaults.investable,
      accessAge: defaults.accessAge,
      archived: false,
      ...at,
    };
    accounts.push(account);
    snapshots.push({
      id: newId(),
      date: ctx.today,
      accountId: account.id,
      balanceMinor: a.balanceMinor ?? 0,
      ...at,
    });
    if (preset.type === 'liability') {
      liabilities.push({
        accountId: account.id,
        interestRate: 0,
        monthlyPaymentMinor: 0,
        remainingMonths: 0,
        ...at,
      });
    }
  }
  const fxRates: FxRate[] =
    d.accounts.some((a) => a.currency === 'USD') && d.usdRate
      ? [{ id: newId(), date: ctx.today, currency: 'USD', twdPerUnit: d.usdRate, ...at }]
      : [];

  const categories = ctx.categories.map((c) => ({ ...c }));
  let salary = categories.find((c) => c.kind === 'income' && c.name.toLowerCase() === 'salary');
  if (!salary) {
    salary = { id: newId(), name: 'Salary', kind: 'income', essential: false, ...at };
    categories.push(salary);
  }
  let living = categories.find((c) => c.kind === 'expense' && c.name === LIVING_COSTS);
  if (!living) {
    living = { id: newId(), name: LIVING_COSTS, kind: 'expense', essential: true, ...at };
    categories.push(living);
  }
  living.fiAnnualMinor = d.fiSpendingMinor;
  living.updatedAt = ctx.now;

  const month = addMonths(monthOf(ctx.today), -1);
  const cashFlows: CashFlow[] = [];
  const flow = (categoryId: string, amountMinor: number | undefined) => {
    if (amountMinor && amountMinor > 0) {
      cashFlows.push({ id: newId(), month, categoryId, amountMinor, currency: 'TWD', lumpSum: false, ...at });
    }
  };
  flow(salary.id, d.monthlyIncomeMinor);
  flow(living.id, d.monthlySpendingMinor);

  return { settings, accounts, liabilities, snapshots, fxRates, categories, cashFlows, assumptionSet };
}

export interface SetupPreview {
  asOfDate: string;
  startAge: number;
  fiAge?: number;
  yearsToFi?: number;
  success: boolean;
  depletionAge?: number;
  /** FI number before guaranteed income: (FI spending + post-employment costs) ÷ SWR. */
  fiNumber: number;
  investableNow: number;
}

/** Runs the projection on the records before they are saved, for the review step. */
export function previewSetup(r: SetupRecords): SetupPreview {
  const plan: PlanData = {
    settings: r.settings,
    accounts: r.accounts,
    snapshots: r.snapshots,
    fxRates: r.fxRates,
    liabilities: r.liabilities,
    categories: r.categories,
    cashFlows: r.cashFlows,
    incomeStreams: [],
  };
  const input = buildProjectionInput(plan, r.assumptionSet);
  const result = runProjection(input);
  const spending = fiSpendingByTier(r.categories, r.settings.destination)[r.settings.destination.fiTier];
  return {
    asOfDate: r.snapshots[0]?.date ?? '',
    startAge: input.startAge,
    fiAge: result.fiAge,
    yearsToFi: result.yearsToFi,
    success: result.success,
    depletionAge: result.depletionAge,
    fiNumber: fiNumber(spending, 0, r.settings.defaultSwr),
    investableNow: result.rows[0]?.liquid ?? 0,
  };
}

/** Writes every record in one transaction. */
export async function applySetup(r: SetupRecords): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.settings,
      db.accounts,
      db.liabilities,
      db.snapshots,
      db.fxRates,
      db.categories,
      db.cashFlows,
      db.assumptionSets,
    ],
    async () => {
      await db.settings.put(r.settings);
      await db.assumptionSets.put(r.assumptionSet);
      await db.accounts.bulkPut(r.accounts);
      await db.liabilities.bulkPut(r.liabilities);
      await db.snapshots.bulkPut(r.snapshots);
      await db.fxRates.bulkPut(r.fxRates);
      await db.categories.bulkPut(r.categories);
      await db.cashFlows.bulkPut(r.cashFlows);
    },
  );
}

export function currentAge(birthYear: number | undefined, today: string): number | undefined {
  return birthYear === undefined ? undefined : yearOf(today) - birthYear;
}

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
import { t } from '@/i18n';

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
    label: t('Bank account'),
    nickname: t('Bank account'),
    type: 'cash',
    assetClass: 'cash',
    currency: 'TWD',
    hint: t('Savings and current accounts, time deposits'),
  },
  tw_broker: {
    label: t('TW broker'),
    nickname: t('TW broker'),
    type: 'brokerage',
    assetClass: 'tw_equity',
    currency: 'TWD',
    hint: t('Taiwan stocks and ETFs, market value'),
  },
  us_broker: {
    label: t('US broker'),
    nickname: t('US broker'),
    type: 'brokerage',
    assetClass: 'us_equity',
    currency: 'USD',
    hint: t('Overseas stocks and ETFs, in USD'),
  },
  pension: {
    label: t('勞退 account'),
    nickname: t('勞退 account'),
    type: 'pension',
    assetClass: 'other',
    currency: 'TWD',
    hint: t('Labor pension balance (locked until 60)'),
  },
  insurance: {
    label: t('Savings insurance'),
    nickname: t('Savings insurance'),
    type: 'insurance',
    assetClass: 'other',
    currency: 'TWD',
    hint: t('儲蓄險 cash value'),
  },
  home: {
    label: t('Home'),
    nickname: t('Home'),
    type: 'property',
    assetClass: 'property',
    currency: 'TWD',
    hint: t('Estimated market value'),
  },
  loan: {
    label: t('Loan / mortgage'),
    nickname: t('Loan'),
    type: 'liability',
    assetClass: 'other',
    currency: 'TWD',
    hint: t('Amount still owed'),
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
  /** How new savings are invested; pre-selected (T2) and changeable on the last step. */
  mix?: MixChoice;
  /** "Do you have a Taiwan employer?" Yes estimates 勞退 and 勞保 from pay (UX doc, O2). */
  taiwanEmployer?: boolean;
  /** True once the user types their own FI spending; until then it follows spending × 12. */
  fiSpendingEdited?: boolean;
}

export type MixChoice = 'current' | 'growth' | 'balanced' | 'cautious';

/** Ready-made mixes for new savings, offered beside the current mix. */
export const MIX_PRESETS: Record<
  Exclude<MixChoice, 'current'>,
  { label: string; text: string; allocation: Allocation }
> = {
  growth: {
    label: t('Mostly shares'),
    text: t('80% shares, 15% bonds, 5% cash. Bigger swings, higher typical growth.'),
    allocation: { global_equity: 0.4, us_equity: 0.25, tw_equity: 0.15, bond: 0.15, cash: 0.05 },
  },
  balanced: {
    label: t('Balanced'),
    text: t('60% shares, 30% bonds, 10% cash.'),
    allocation: { global_equity: 0.3, us_equity: 0.18, tw_equity: 0.12, bond: 0.3, cash: 0.1 },
  },
  cautious: {
    label: t('Cautious'),
    text: t('35% shares, 45% bonds, 20% cash. Smaller swings, lower typical growth.'),
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

/** Four short steps (UX doc, O2); the result screen follows Finish. */
export const STEPS = [
  t('About you'),
  t('What you have'),
  t('Money in and out'),
  t('How you invest'),
] as const;

/** The answers of the 60-second estimate on the welcome screen (UX doc, O1). */
export interface QuickEstimate {
  age?: number;
  investedMinor?: number;
  monthlyIncomeMinor?: number;
  monthlySpendingMinor?: number;
}

/** A setup draft from the quick estimate, so "Make it accurate" carries its four answers. */
export function draftFromEstimate(e: QuickEstimate, swr: number, currentYear: number): SetupDraft {
  const d = emptyDraft(swr);
  if (e.age !== undefined) d.birthYear = currentYear - e.age;
  if (e.investedMinor !== undefined) {
    d.accounts = [
      { ...draftAccount('tw_broker'), nickname: t('Investments'), balanceMinor: e.investedMinor },
    ];
  }
  d.monthlyIncomeMinor = e.monthlyIncomeMinor;
  d.monthlySpendingMinor = e.monthlySpendingMinor;
  if (e.monthlySpendingMinor !== undefined) d.fiSpendingMinor = e.monthlySpendingMinor * 12;
  return d;
}

/** True when the estimate has all four answers. */
export function estimateComplete(e: QuickEstimate): boolean {
  return (
    e.age !== undefined &&
    e.investedMinor !== undefined &&
    e.monthlyIncomeMinor !== undefined &&
    e.monthlySpendingMinor !== undefined
  );
}

/** Take-home pay is roughly 90% of gross after 勞健保 and withheld tax. */
const TAKE_HOME_SHARE = 0.9;
/** A typical start of insured work, for years of 勞保 so far. */
const CAREER_START_AGE = 23;

/**
 * Rough 勞退 and 勞保 figures from monthly take-home pay and age, for someone with a Taiwan
 * employer. The dashboard asks for the real figures later ("Improve accuracy").
 */
export function estimateTaiwanPension(
  monthlyIncomeMinor: number,
  age: number,
): { pensionWageMinor: number; avgInsuredSalaryMinor: number; insuredYears: number } {
  const gross = Math.round(monthlyIncomeMinor / TAKE_HOME_SHARE / 100_00) * 100_00;
  return {
    pensionWageMinor: Math.min(gross, 150_000_00),
    avgInsuredSalaryMinor: Math.min(gross, 45_800_00),
    insuredYears: Math.max(0, Math.min(45, age - CAREER_START_AGE)),
  };
}

/** Problems that stop the user leaving a step; empty when the step is complete. */
export function validateStep(step: number, d: SetupDraft, currentYear: number): string[] {
  const errors: string[] = [];
  switch (step) {
    case 0: {
      if (d.birthYear === undefined) errors.push(t('Enter your birth year.'));
      else if (d.birthYear < 1930 || d.birthYear > currentYear - 16)
        errors.push(t('Birth year must be between 1930 and {v}.', { v: currentYear - 16 }));
      if (d.targetFiAge !== undefined && d.birthYear !== undefined) {
        const age = currentYear - d.birthYear;
        if (d.targetFiAge <= age || d.targetFiAge > 100)
          errors.push(t('Target FI age must be between {v} and 100, or left empty.', { v: age + 1 }));
      }
      break;
    }
    case 1: {
      if (!d.accounts.some((a) => a.kind !== 'loan'))
        errors.push(t('Add at least one account you own, such as a bank account.'));
      for (const a of d.accounts) {
        if (!a.nickname.trim()) errors.push(t('Every account needs a nickname.'));
        else if (/\d{6,}/.test(a.nickname))
          errors.push(
            t('“{nickname}” looks like an account number; use a nickname instead.', { nickname: a.nickname }),
          );
        if (a.balanceMinor === undefined || a.balanceMinor < 0)
          errors.push(
            t("Enter today's balance for {v} (0 is fine).", { v: a.nickname.trim() || t('each account') }),
          );
      }
      if (d.accounts.some((a) => a.currency === 'USD') && !(d.usdRate && d.usdRate > 0))
        errors.push(t('Enter today’s USD/TWD rate for your USD accounts.'));
      break;
    }
    case 2:
      if (d.monthlyIncomeMinor === undefined)
        errors.push(t('Enter your monthly take-home pay (0 if none right now).'));
      if (d.monthlySpendingMinor === undefined) errors.push(t('Enter your monthly spending.'));
      if (d.monthlySpendingMinor !== undefined && (!d.fiSpendingMinor || d.fiSpendingMinor <= 0))
        errors.push(t('Enter how much you would spend per year once you stop working.'));
      if (d.swr < 0.025 || d.swr > 0.05) errors.push(t('The withdrawal rate must be between 2.5% and 5%.'));
      break;
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

export const LIVING_COSTS = t('Living costs');

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

const SHARE_CLASSES: AssetClass[] = ['global_equity', 'us_equity', 'tw_equity'];

/** Shares, bonds and cash-or-other, as fractions of a mix. */
function mixShape(a: Allocation): [number, number, number] {
  const total = Object.values(a).reduce((s, v) => s + (v ?? 0), 0) || 1;
  const shares = SHARE_CLASSES.reduce((s, c) => s + (a[c] ?? 0), 0) / total;
  const bonds = (a.bond ?? 0) / total;
  return [shares, bonds, 1 - shares - bonds];
}

/**
 * The ready-made mix closest to what the accounts already hold, by their split between shares,
 * bonds and cash; Balanced when nothing is invested yet. Setup pre-selects it (UX doc, T2), so
 * the required choice is never blank.
 */
export function suggestedMix(d: SetupDraft): Exclude<MixChoice, 'current'> {
  const current = currentMix(d);
  if (!current) return 'balanced';
  const shape = mixShape(current);
  let best: Exclude<MixChoice, 'current'> = 'balanced';
  let bestDistance = Infinity;
  for (const [key, preset] of Object.entries(MIX_PRESETS) as [
    Exclude<MixChoice, 'current'>,
    (typeof MIX_PRESETS)['balanced'],
  ][]) {
    const p = mixShape(preset.allocation);
    const distance = p.reduce((s, v, i) => s + Math.abs(v - shape[i]), 0);
    if (distance < bestDistance) [best, bestDistance] = [key, distance];
  }
  return best;
}

/** The mix in effect: the user's choice, else the suggested one. */
export function effectiveMix(d: SetupDraft): MixChoice {
  if (d.mix === 'current' && !currentMix(d)) return suggestedMix(d);
  return d.mix ?? suggestedMix(d);
}

/** The target allocation the draft will save. */
export function chosenMix(d: SetupDraft): Allocation | undefined {
  const mix = effectiveMix(d);
  return mix === 'current' ? currentMix(d) : MIX_PRESETS[mix].allocation;
}

/** Turns a complete draft into the records to save. Pure: ids come from `newId`. */
export function buildSetupRecords(d: SetupDraft, ctx: SetupContext): SetupRecords {
  const at = { createdAt: ctx.now, updatedAt: ctx.now };

  const assumptionSet: AssumptionSet = structuredClone(ctx.assumptionSet);
  const tw = assumptionSet.taiwan;
  const estimated =
    d.taiwanEmployer === true &&
    d.taiwan.pensionWageMinor === undefined &&
    d.monthlyIncomeMinor !== undefined &&
    d.birthYear !== undefined;
  if (estimated) {
    const e = estimateTaiwanPension(d.monthlyIncomeMinor!, yearOf(ctx.today) - d.birthYear!);
    tw.laborPension.monthlyInsuredWageMinor = e.pensionWageMinor;
    tw.laborInsurance.avgMonthlyInsuredSalaryMinor = e.avgInsuredSalaryMinor;
    tw.laborInsurance.insuredYearsToDate = e.insuredYears;
    assumptionSet.updatedAt = ctx.now;
  } else if (!d.taiwan.skipped && d.taiwanEmployer !== false) {
    if (d.taiwan.pensionWageMinor !== undefined)
      tw.laborPension.monthlyInsuredWageMinor = d.taiwan.pensionWageMinor;
    if (d.taiwan.insuredYears !== undefined) tw.laborInsurance.insuredYearsToDate = d.taiwan.insuredYears;
    if (d.taiwan.avgInsuredSalaryMinor !== undefined)
      tw.laborInsurance.avgMonthlyInsuredSalaryMinor = d.taiwan.avgInsuredSalaryMinor;
    if (d.taiwan.claimAge !== undefined) tw.laborInsurance.claimAge = d.taiwan.claimAge;
    assumptionSet.updatedAt = ctx.now;
  }

  const settings: Settings = {
    ...ctx.settings,
    birthYear: d.birthYear ?? ctx.settings.birthYear,
    defaultSwr: d.swr,
    destination: { ...ctx.settings.destination, targetFiAge: d.targetFiAge },
    targetAllocation: chosenMix(d) ?? ctx.settings.targetAllocation,
    backupPrompt: 'setup',
    pensionEstimated: estimated || undefined,
    updatedAt: ctx.now,
  };
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
  let salary = categories.find(
    (c) => c.kind === 'income' && [t('Salary'), 'salary'].includes(c.name.toLowerCase()),
  );
  if (!salary) {
    salary = { id: newId(), name: t('Salary'), kind: 'income', essential: false, ...at };
    categories.push(salary);
  }
  let living = categories.find(
    (c) => c.kind === 'expense' && [LIVING_COSTS, 'Living costs'].includes(c.name),
  );
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

const DRAFT_KEY = 'fi-tracker-setup-draft';

/** The draft survives a reload during setup (session storage only). */
export function loadSetupDraft(swr: number): SetupDraft {
  try {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) return JSON.parse(saved) as SetupDraft;
  } catch {
    // Unavailable storage just means a fresh draft.
  }
  return emptyDraft(swr);
}

export function saveSetupDraft(d: SetupDraft | undefined): void {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Not critical.
  }
}

export function currentAge(birthYear: number | undefined, today: string): number | undefined {
  return birthYear === undefined ? undefined : yearOf(today) - birthYear;
}

/**
 * The live "Estimated FI age" during setup (UX doc, O2), from whatever the draft holds so far.
 * `needsMoney` until pay and spending are in, since a date without them means nothing.
 */
export function livePreview(
  d: SetupDraft,
  ctx: SetupContext,
): { investableNow: number; needsMoney: boolean; preview?: SetupPreview } | undefined {
  if (d.birthYear === undefined) return undefined;
  const filled: SetupDraft = {
    ...d,
    accounts: d.accounts.map((a) => ({ ...a, balanceMinor: a.balanceMinor ?? 0 })),
    usdRate: d.usdRate ?? 0,
  };
  const needsMoney = d.monthlyIncomeMinor === undefined || d.monthlySpendingMinor === undefined;
  const preview = previewSetup(buildSetupRecords(filled, ctx));
  return {
    investableNow: preview.investableNow,
    needsMoney,
    preview: needsMoney || !(d.fiSpendingMinor && d.fiSpendingMinor > 0) ? undefined : preview,
  };
}

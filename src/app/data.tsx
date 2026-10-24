import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AssumptionSet, GoalSnapshot, Holding, Review, Scenario } from '@/domain/entities';
import {
  baselineContext,
  buildProjectionInput,
  BASELINE_SPEC,
  type BaselineContext,
  type PlanData,
} from '@/domain/baseline';
import {
  guaranteedStreams,
  runProjection,
  type ProjectionInput,
  type ProjectionResult,
} from '@/domain/projection';
import { fiNumber, permanentIncome } from '@/domain/fiNumber';
import { db } from '@/db/db';

export interface AppData extends PlanData {
  holdings: Holding[];
  assumptionSets: AssumptionSet[];
  scenarios: Scenario[];
  reviews: Review[];
  goalHistory: GoalSnapshot[];
  /** The assumption set selected in Settings (falls back to the first). */
  activeAssumptions: AssumptionSet;
  ctx: BaselineContext;
  baselineInput: ProjectionInput;
  /** Baseline projection with the active assumptions. */
  baseline: ProjectionResult;
  /** FI number now: (S − G) ÷ SWR, without the bridge fund. */
  fiNumberNow: number;
  /** Guaranteed income G counted in the FI number, valued at the plan's stop age. */
  guaranteedIncome: number;
  /** Typical-path stop-work age (or the target or current age when FI is not reached). */
  planStopAge: number;
}

const DataContext = createContext<AppData | undefined>(undefined);

/** Loads every store with live queries; the UI re-renders whenever data changes. */
export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const raw = useLiveQuery(async () => {
    const [
      settings,
      accounts,
      snapshots,
      fxRates,
      liabilities,
      categories,
      cashFlows,
      incomeStreams,
      holdings,
      assumptionSets,
      scenarios,
      reviews,
      goalHistory,
    ] = await Promise.all([
      db.settings.get('singleton'),
      db.accounts.toArray(),
      db.snapshots.toArray(),
      db.fxRates.toArray(),
      db.liabilities.toArray(),
      db.categories.toArray(),
      db.cashFlows.toArray(),
      db.incomeStreams.toArray(),
      db.holdings.toArray(),
      db.assumptionSets.toArray(),
      db.scenarios.toArray(),
      db.reviews.toArray(),
      db.goalHistory.toArray(),
    ]);
    return {
      settings,
      accounts,
      snapshots,
      fxRates,
      liabilities,
      categories,
      cashFlows,
      incomeStreams,
      holdings,
      assumptionSets,
      scenarios,
      reviews,
      goalHistory,
    };
  });

  const value = useMemo<AppData | undefined>(() => {
    if (!raw?.settings || raw.assumptionSets.length === 0) return undefined;
    const settings = raw.settings;
    const activeAssumptions =
      raw.assumptionSets.find((a) => a.id === settings.activeAssumptionSetId) ?? raw.assumptionSets[0];
    const plan: PlanData = { ...raw, settings };
    const ctx = baselineContext(plan);
    const baselineInput = buildProjectionInput(plan, activeAssumptions, BASELINE_SPEC, ctx);
    const baseline = runProjection(baselineInput);
    // Guaranteed income as the plan will see it: 勞保 years and the annuity depend on when
    // work stops, so value it at the typical stop age, not today's age.
    const planStopAge =
      baseline.retireAge ?? baseline.fiAge ?? settings.destination.targetFiAge ?? ctx.startAge;
    const guaranteedIncome = permanentIncome(
      guaranteedStreams(baselineInput, planStopAge),
      baselineInput.horizonAge,
    );
    const fiNumberNow = fiNumber(baselineInput.fiSpending, guaranteedIncome, baselineInput.swr);
    return {
      ...raw,
      settings,
      activeAssumptions,
      ctx,
      baselineInput,
      baseline,
      fiNumberNow,
      guaranteedIncome,
      planStopAge,
    };
  }, [raw]);

  if (!value) return <>{fallback}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(DataContext);
  if (!v) throw new Error('useAppData must be used inside DataProvider');
  return v;
}

export function assumptionSetFor(data: AppData, id: string | undefined): AssumptionSet {
  return data.assumptionSets.find((a) => a.id === id) ?? data.activeAssumptions;
}

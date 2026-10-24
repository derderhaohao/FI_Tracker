import type { AppData } from '@/app/data';
import { baselineContext, buildProjectionInput, BASELINE_SPEC, type PlanData } from '@/domain/baseline';
import { runProjection } from '@/domain/projection';
import { buildDemoBackup } from '@/io/demo';

/** The demo backup as the app sees it, for Lab unit tests. */
export function demoAppData(): AppData {
  const raw = buildDemoBackup().data;
  const settings = raw.settings[0];
  const activeAssumptions =
    raw.assumptionSets.find((a) => a.id === settings.activeAssumptionSetId) ?? raw.assumptionSets[0];
  const plan: PlanData = { ...raw, settings };
  const ctx = baselineContext(plan);
  const baselineInput = buildProjectionInput(plan, activeAssumptions, BASELINE_SPEC, ctx);
  return {
    ...raw,
    settings,
    activeAssumptions,
    ctx,
    baselineInput,
    baseline: runProjection(baselineInput),
    fiNumberNow: 0,
    guaranteedIncome: 0,
  } as AppData;
}

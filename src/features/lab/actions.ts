import type { Draft, Scenario } from '@/domain/entities';
import { buildProjectionInput, type ScenarioSpec } from '@/domain/baseline';
import { lockProjection } from '@/domain/planVsActual';
import { prepare, runProjection, type ProjectionInput, type ProjectionResult } from '@/domain/projection';
import { db } from '@/db/db';
import { newId } from '@/db/repo';
import { assumptionSetFor, type AppData } from '@/app/data';

export function newScenarioDraft(data: AppData, name: string): Draft<Scenario> {
  return {
    id: newId(),
    name,
    assumptionSetId: data.activeAssumptions.id,
    overrides: {},
    events: [],
    withdrawalRule: { kind: 'fixed_swr' },
    isPlanOfRecord: false,
    seed: 42,
  };
}

export interface Evaluated {
  scenario: Scenario;
  input: ProjectionInput;
  result: ProjectionResult;
  fiTargets: number[];
}

export function evaluate(data: AppData, scenario: Scenario): Evaluated {
  const assumptions = assumptionSetFor(data, scenario.assumptionSetId);
  const input = buildProjectionInput(data, assumptions, scenario as ScenarioSpec, data.ctx);
  return { scenario, input, result: runProjection(input), fiTargets: Array.from(prepare(input).required) };
}

/** Locks a scenario as the plan of record (FBK-3); the previous plan is unlocked. */
export async function lockPlanOfRecord(data: AppData, scenario: Scenario): Promise<void> {
  const { result } = evaluate(data, scenario);
  await db.transaction('rw', db.scenarios, async () => {
    for (const s of data.scenarios) {
      if (s.isPlanOfRecord && s.id !== scenario.id)
        await db.scenarios.put({ ...s, isPlanOfRecord: false, updatedAt: new Date().toISOString() });
    }
    await db.scenarios.put({
      ...scenario,
      isPlanOfRecord: true,
      lockedAt: data.ctx.asOfDate,
      lockedProjection: lockProjection(result),
      updatedAt: new Date().toISOString(),
    });
  });
}

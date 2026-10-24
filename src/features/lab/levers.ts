import type { ScenarioLevers } from '@/domain/entities';
import { toMinor } from '@/domain/money';
import { stopAge, type LabRow } from './model';
import { shortMoney } from './templates';

/**
 * "What would make it safer" (PRD R13): quick variants of one scenario, each a single
 * change on top of its overrides. Results are what-ifs, not advice.
 */

export interface Variant {
  key: string;
  label: string;
  /** Name for a scenario saved from this variant. */
  name: string;
  overrides: ScenarioLevers;
}

export function saferVariants(row: LabRow): Variant[] {
  const base = row.spec.overrides;
  const named = (text: string) =>
    row.scenario ? `${row.scenario.name}: ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
  const out: Variant[] = [];
  const age = stopAge(row.result);
  const adaptive = row.input.retireAtAge === undefined;
  if (age !== undefined) {
    for (const extra of [1, 2]) {
      if (age + extra >= row.input.horizonAge) continue;
      const years = `${extra} more year${extra > 1 ? 's' : ''}`;
      out.push({
        key: `work${extra}`,
        label: adaptive
          ? `Keep working ${years} after reaching your target (typically stop at ${age + extra})`
          : `Work ${years} (stop at ${age + extra})`,
        name: named(adaptive ? `work ${years} after the target` : `stop at ${age + extra}`),
        overrides: adaptive
          ? { ...base, workExtraYears: (base.workExtraYears ?? 0) + extra }
          : { ...base, targetFiAge: age + extra },
      });
    }
  }
  const keepTarget = toMinor(Math.round(row.input.targetSpending ?? row.input.fiSpending));
  for (const cut of [5, 10]) {
    out.push({
      key: `spend${cut}`,
      label: `Spend ${cut}% less after you stop${adaptive ? ' (same stop date)' : ''}`,
      name: named(`spend ${cut}% less after stopping`),
      overrides: {
        ...base,
        fiSpendingMinor: toMinor(Math.round(row.input.fiSpending * (1 - cut / 100))),
        targetSpendingMinor: keepTarget,
      },
    });
  }
  const untilAge = Math.max(60, (age ?? row.input.startAge) + 5);
  const annual = Math.max(60_000, Math.round((row.input.fiSpending * 0.25) / 12 / 1000) * 1000 * 12);
  if (!row.input.barista && (age === undefined || age < untilAge)) {
    out.push({
      key: 'parttime',
      label: `Part-time income of ${shortMoney(annual / 12)} a month until ${untilAge}${adaptive ? ' (same stop date)' : ''}`,
      name: named(`part-time to ${untilAge}`),
      overrides: { ...base, baristaIncome: { annualMinor: toMinor(annual), untilAge, inTarget: false } },
    });
  }
  if (row.input.swr > 0.035 + 1e-9) {
    out.push({
      key: 'swr',
      label: 'Use a 3.5% yearly draw rate (a bigger target)',
      name: named(`3.5% draw rate`),
      overrides: { ...base, swr: 0.035 },
    });
  }
  return out;
}

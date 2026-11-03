import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScenarioLevers } from '@/domain/entities';
import { db } from '@/db/db';
import { save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { usePlanHealth } from '@/app/planHealth';
import { newScenarioDraft } from '@/features/lab/actions';
import { BacktestCard } from '@/features/lab/BacktestCard';
import { evaluateRow } from '@/features/lab/model';
import { SaferCard } from '@/features/lab/SaferCard';
import { HEALTH_RUNS, HEALTH_SEED } from '@/lib/mcWorker';
import { useUi, MAX_COMPARE } from '@/state/ui';
import { PlanHealthCard } from '@/components/PlanHealthCard';
import { PageHeader } from '@/components/ui/misc';
import { t } from '@/i18n';

/**
 * "How sure is this?" (UX doc, P2): the simulated futures and the past-markets second opinion
 * for your plan, and what would make it safer, said in money.
 */
export function SurePage() {
  const data = useAppData();
  const { summary } = usePlanHealth();
  const navigate = useNavigate();
  const { selectScenario, compare, toggleCompare } = useUi();
  const today = useMemo(() => evaluateRow(data), [data]);
  const keep = async (name: string, overrides: ScenarioLevers) => {
    const draft = { ...newScenarioDraft(data, name), overrides };
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    if (Object.keys(compare).length < MAX_COMPARE) toggleCompare(draft.id);
    navigate('/plan/lab');
  };
  return (
    <>
      <PageHeader
        title={t('How sure is this?')}
        description={t(
          'Your plan against 1,000 simulated futures, and against what markets actually did in the past.',
        )}
      />
      <PlanHealthCard
        note={t(
          'The age is the typical path, where markets return their typical amount every year; the word counts how often the money lasts across the simulated futures.',
        )}
      />
      <SaferCard
        row={today}
        chance={summary?.successRate}
        runs={HEALTH_RUNS}
        seed={HEALTH_SEED}
        onSave={keep}
      />
      <BacktestCard row={today} slot={0} advanced={false} />
    </>
  );
}

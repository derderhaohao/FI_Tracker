import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, Save } from 'lucide-react';
import { buildProjectionInput } from '@/domain/baseline';
import { STATUS_LABELS } from '@/domain/planStatus';
import { runProjection } from '@/domain/projection';
import { db } from '@/db/db';
import { save } from '@/db/repo';
import { useAppData } from '@/app/data';
import { usePlanHealth } from '@/app/planHealth';
import { newScenarioDraft } from '@/features/lab/actions';
import { stopAge, stopDate } from '@/features/lab/model';
import { useUi, MAX_COMPARE } from '@/state/ui';
import { LineChart } from '@/components/charts/LineChart';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, PageHeader } from '@/components/ui/misc';
import { twd, twdCompact } from '@/lib/format';
import { t } from '@/i18n';
import { leverBase, leverOverrides, leversUnchanged, type PlanLevers } from './planModel';

function Slider({
  label,
  value,
  min,
  max,
  step,
  text,
  changed,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  text: ReactNode;
  changed: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular">
          {text}
          {changed && (
            <Badge tone="primary" className="ml-1.5">
              {t('what-if')}
            </Badge>
          )}
        </span>
      </span>
      <input
        type="range"
        className="w-full accent-primary"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * My plan (UX doc, P1): the hero chart of investments against money needed, with the FI
 * crossing and the 勞退 / 勞保 milestones marked; three sliders preview a change live without
 * saving, and "Save as a what-if" keeps it for Compare.
 */
export function PlanPage() {
  const data = useAppData();
  const { baselineInput, baseline, ctx, activeAssumptions } = data;
  const { status } = usePlanHealth();
  const navigate = useNavigate();
  const { valueMode, selectScenario, compare, toggleCompare } = useUi();
  const [levers, setLevers] = useState<PlanLevers>({});
  const base = useMemo(() => leverBase(baselineInput), [baselineInput]);

  // The projection runs on every slider move: the yearly engine takes a few milliseconds.
  const { input, result } = useMemo(() => {
    if (leversUnchanged(levers)) return { input: baselineInput, result: baseline };
    const spec = {
      overrides: leverOverrides(levers, baselineInput),
      events: [],
      withdrawalRule: { kind: 'fixed_swr' as const },
    };
    const i = buildProjectionInput(data, activeAssumptions, spec, ctx);
    return { input: i, result: runProjection(i) };
  }, [levers, baselineInput, baseline, data, activeAssumptions, ctx]);

  const age = stopAge(result);
  const date = stopDate(input, result, ctx.asOfDate);
  const fiAge = result.fiAge;
  const changed = !leversUnchanged(levers);
  const idx = (r: (typeof result.rows)[number]) => (valueMode === 'nominal' ? r.inflationIndex : 1);
  const rows = result.rows.map((r) => ({
    age: r.age,
    investable: r.investable * idx(r),
    needed: r.fiTarget * idx(r),
  }));
  const marks: { x: number; label: string }[] = [];
  if (fiAge !== undefined) marks.push({ x: fiAge, label: t('FI at {age}', { age: fiAge }) });
  if (input.retireAtAge !== undefined && input.retireAtAge !== fiAge)
    marks.push({ x: input.retireAtAge, label: t('Stop work at {age}', { age: input.retireAtAge }) });
  if (input.locked.some((b) => b.pension) || input.pension.employer > 0)
    marks.push({
      x: input.pension.accessAge,
      label: t('勞退 at {age}', { age: input.pension.accessAge }),
    });
  if (input.laborInsurance)
    marks.push({
      x: input.laborInsurance.claimAge,
      label: t('勞保 at {age}', { age: input.laborInsurance.claimAge }),
    });

  const stopValue = levers.stopAge ?? stopAge(baseline) ?? Math.min(70, ctx.startAge + 20);
  const savingValue = levers.monthlySaving ?? base.monthlySaving;
  const spendValue = levers.fiSpending ?? base.fiSpending;
  const savingMax = Math.max(
    base.monthlySaving * 2,
    (baselineInput.annualIncome - base.loansAnnual) / 12,
    10_000,
  );
  const spendMin = Math.max(0, Math.round((base.fiSpending * 0.5) / 10_000) * 10_000);
  const spendMax = Math.max(Math.round((base.fiSpending * 1.5) / 10_000) * 10_000, 100_000);

  const sentence =
    age === undefined || !date
      ? t('At this pace the money does not reach what you need by {horizonAge}.', {
          horizonAge: input.horizonAge,
        })
      : input.retireAtAge !== undefined
        ? result.success
          ? t('Stop work at {age} ({date}); on the typical path the money lasts to {horizonAge}.', {
              age,
              date,
              horizonAge: input.horizonAge,
            })
          : t('Stop work at {age} ({date}); on the typical path the money runs out at {depletionAge}.', {
              age,
              date,
              depletionAge: result.depletionAge ?? '—',
            })
        : t('Investments meet what you need at {age} ({date}).', { age, date });

  const saveWhatIf = async () => {
    const parts: string[] = [];
    if (levers.stopAge !== undefined) parts.push(t('stop at {age}', { age: levers.stopAge }));
    if (levers.monthlySaving !== undefined)
      parts.push(t('save {amount}/mo', { amount: twdCompact(levers.monthlySaving) }));
    if (levers.fiSpending !== undefined)
      parts.push(t('spend {amount}/yr', { amount: twdCompact(levers.fiSpending) }));
    const name = parts.join(', ');
    const draft = {
      ...newScenarioDraft(data, name.charAt(0).toUpperCase() + name.slice(1)),
      overrides: leverOverrides(levers, baselineInput),
    };
    await save(db.scenarios, draft);
    selectScenario(draft.id);
    if (!(draft.id in compare) && Object.keys(compare).length < MAX_COMPARE) toggleCompare(draft.id);
    navigate('/plan/lab');
  };

  return (
    <>
      <PageHeader
        title={t('My plan')}
        description={
          valueMode === 'real'
            ? t("Amounts in today's money. Change this in Settings → General.")
            : t('Amounts in future money. Change this in Settings → General.')
        }
      />
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
            <p className="text-lg font-semibold sm:text-xl">{sentence}</p>
            {!changed && status && <StatusBadge status={status}>{STATUS_LABELS[status]}</StatusBadge>}
            <Link to="/plan/sure" className="text-sm text-primary hover:underline">
              {t('How sure is this?')}
            </Link>
          </div>
          <LineChart
            ariaLabel={t('Investments against money needed')}
            data={rows}
            xKey="age"
            series={[
              { key: 'investable', label: t('Your investments'), slot: 0, area: true },
              { key: 'needed', label: t('Money needed'), slot: 1, dashed: true },
            ]}
            references={marks}
            height={300}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" role="group" aria-label={t('What if')}>
            <Slider
              label={t('Stop work at')}
              value={stopValue}
              min={ctx.startAge + 1}
              max={75}
              step={1}
              changed={levers.stopAge !== undefined}
              text={t('Age {age}', { age: stopValue })}
              onChange={(v) => setLevers((l) => ({ ...l, stopAge: v }))}
            />
            <Slider
              label={t('Saving per month')}
              value={Math.round(savingValue / 1000) * 1000}
              min={0}
              max={Math.round(savingMax / 1000) * 1000}
              step={1000}
              changed={levers.monthlySaving !== undefined}
              text={twd(savingValue)}
              onChange={(v) => setLevers((l) => ({ ...l, monthlySaving: v }))}
            />
            <Slider
              label={t('Yearly spending once you stop')}
              value={Math.round(spendValue / 10_000) * 10_000}
              min={spendMin}
              max={spendMax}
              step={10_000}
              changed={levers.fiSpending !== undefined}
              text={twd(spendValue)}
              onChange={(v) => setLevers((l) => ({ ...l, fiSpending: v }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveWhatIf()} disabled={!changed}>
              <Save aria-hidden /> {t('Save as a what-if')}
            </Button>
            <Button variant="ghost" onClick={() => setLevers({})} disabled={!changed}>
              <RotateCcw aria-hidden /> {t('Back to my plan')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {changed
                ? t('A preview: nothing is saved until you press Save.')
                : t('Move a slider to see the date move.')}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

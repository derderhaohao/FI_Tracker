import { useMemo, useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import type { ReviewType } from '@/domain/entities';
import { monthlyTotals } from '@/domain/cashflow';
import { addMonths, daysBetween, monthOf, today } from '@/domain/dates';
import { netWorthSeries } from '@/domain/networth';
import { flowsVsPlan, netWorthVsPlan } from '@/domain/planVsActual';
import { db } from '@/db/db';
import { newId, patch, save } from '@/db/repo';
import { useAppData, type AppData } from '@/app/data';
import { lockPlanOfRecord } from '@/features/lab/actions';
import { LineChart } from '@/components/charts/LineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge, EmptyState, PageHeader, Segmented, Table } from '@/components/ui/misc';
import { formatDate, pct, twd, twdCompact } from '@/lib/format';
import { t } from '@/i18n';

interface ChecklistItem {
  id: string;
  label: string;
  /** Automatic hint: true when the app can see it is done. */
  auto?: (data: AppData) => boolean;
}

const lastMonth = () => addMonths(monthOf(today()), -1);

const CHECKLISTS: Record<ReviewType, ChecklistItem[]> = {
  monthly: [
    {
      id: 'snapshot',
      label: t('Enter a balance for every account'),
      auto: (d) => d.snapshots.some((s) => monthOf(s.date) >= lastMonth()),
    },
    {
      id: 'fx',
      label: t('Enter the USD/TWD rate for the snapshot date'),
      auto: (d) => d.fxRates.some((r) => monthOf(r.date) >= lastMonth()),
    },
    {
      id: 'cashflow',
      label: t("Enter last month's income and spending"),
      auto: (d) => d.cashFlows.some((c) => c.month === lastMonth()),
    },
    { id: 'lump', label: t('Tag bonuses and large one-off costs as lump sums') },
    { id: 'savings', label: t('Check the savings rate against the target') },
    {
      id: 'backup',
      label: t('Export a backup'),
      auto: (d) =>
        !!d.settings.lastBackupAt && daysBetween(d.settings.lastBackupAt.slice(0, 10), today()) <= 7,
    },
  ],
  quarterly: [
    { id: 'monthlies', label: t('Monthly updates done for the quarter') },
    { id: 'plan', label: t('Review plan vs. actual: net worth, savings, spending') },
    { id: 'allocation', label: t('Check allocation drift; rebalance if beyond the threshold') },
    { id: 'emergency', label: t('Check the emergency fund') },
    { id: 'lab', label: t('Revisit Strategy Lab scenarios') },
    { id: 'decisions', label: t('Write down decisions taken') },
  ],
  annual: [
    { id: 'budget', label: t('Update the FI budget per category (Goal)') },
    { id: 'assumptions', label: t('Review assumptions and the Taiwan settings as-of date') },
    { id: 'insurance', label: t('Update insurance cash values from policy statements') },
    { id: 'laborInsurance', label: t('Update 勞保 insured years and average insured salary') },
    { id: 'montecarlo', label: t('Compare scenarios and run Monte Carlo') },
    {
      id: 'lock',
      label: t('Lock the plan of record'),
      auto: (d) =>
        d.scenarios.some((s) => s.isPlanOfRecord && !!s.lockedAt && daysBetween(s.lockedAt, today()) <= 60),
    },
    { id: 'backup', label: t('Export a backup') },
  ],
};

function NewReview() {
  const data = useAppData();
  const [type, setType] = useState<ReviewType>('monthly');
  const [date, setDate] = useState(today());
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [decisions, setDecisions] = useState('');
  const [lockId, setLockId] = useState('');
  const plan = data.scenarios.find((s) => s.isPlanOfRecord);

  const submit = async () => {
    let planId = plan?.id;
    if (type === 'annual' && lockId) {
      const s = data.scenarios.find((x) => x.id === lockId);
      if (s) {
        await lockPlanOfRecord(data, s);
        planId = s.id;
      }
    }
    await save(db.reviews, {
      id: newId(),
      date,
      type,
      planOfRecordId: planId,
      notes,
      decisions: decisions
        .split('\n')
        .map((d) => d.trim())
        .filter(Boolean),
      checklist: checked,
    });
    // A finished review is a good moment to back up (product review, issue 11).
    await patch(db.settings, 'singleton', { backupPrompt: 'review' });
    setChecked({});
    setNotes('');
    setDecisions('');
    setLockId('');
  };

  return (
    <Card>
      <CardHeader
        title={t('New review')}
        description={t('Monthly snapshot, quarterly review, annual reset.')}
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label={t('Review type')}
            value={type}
            onChange={(t) => {
              setType(t);
              setChecked({});
            }}
            options={[
              { value: 'monthly', label: t('Monthly') },
              { value: 'quarterly', label: t('Quarterly') },
              { value: 'annual', label: t('Annual reset') },
            ]}
          />
          <Field label={t('Date')}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            )}
          </Field>
        </div>
        <ul className="flex flex-col gap-1.5">
          {CHECKLISTS[type].map((item) => {
            const auto = item.auto?.(data);
            return (
              <li key={item.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked[item.id] ?? false}
                    onChange={(e) => setChecked({ ...checked, [item.id]: e.target.checked })}
                  />
                  {item.label}
                  {auto && <Badge tone="good">{t('looks done')}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
        {type === 'annual' && (
          <Field
            label={t('Lock plan of record')}
            hint={
              plan
                ? t('Current: {name}, locked {lockedAt}', {
                    name: plan.name,
                    lockedAt: formatDate(plan.lockedAt ?? ''),
                  })
                : t('No plan of record yet')
            }
          >
            {(id) => (
              <Select id={id} value={lockId} onChange={(e) => setLockId(e.target.value)}>
                <option value="">{t('Keep the current plan')}</option>
                {data.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t('Notes')}>
          {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <Field label={t('Decisions')} hint={t('One per line')}>
          {(id) => <Textarea id={id} value={decisions} onChange={(e) => setDecisions(e.target.value)} />}
        </Field>
        <div>
          <Button onClick={() => void submit()}>{t('Save review')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanVsActual() {
  const data = useAppData();
  const plan = data.scenarios.find((s) => s.isPlanOfRecord);
  const series = useMemo(
    () => netWorthSeries(data.accounts, data.snapshots, data.fxRates, data.settings.birthYear),
    [data],
  );
  const totals = useMemo(() => monthlyTotals(data.cashFlows, data.categories, data.fxRates), [data]);
  if (!plan?.lockedProjection || !plan.lockedAt) {
    return (
      <EmptyState title={t('No plan of record yet')} to="/lab" action={t('Lock one in the Strategy Lab')}>
        {t(
          'Lock a scenario as the plan of record; every review then compares actual net worth, savings and spending against it.',
        )}
      </EmptyState>
    );
  }
  const nw = netWorthVsPlan(plan.lockedProjection, plan.lockedAt, series);
  const flows = flowsVsPlan(plan.lockedProjection, totals);
  const latest = nw.at(-1);
  return (
    <Card>
      <CardHeader
        title={t('Plan vs. actual')}
        description={
          <>
            {t('Plan of record:')} <strong>{plan.name}</strong>
            {t(", locked {lockedAt}. Investable includes locked pension; today's TWD.", {
              lockedAt: plan.lockedAt,
            })}
          </>
        }
      />
      <CardContent>
        {latest?.planned !== undefined && (
          <p className="mb-3 text-sm">
            {t('Latest ({date}): actual {actual} vs. plan {planned} —', {
              date: latest.date,
              actual: twd(latest.actual),
              planned: twd(latest.planned),
            })}{' '}
            <strong className={latest.actual >= latest.planned ? 'text-good' : 'text-critical'}>
              {latest.actual >= latest.planned ? t('ahead') : t('behind')}{' '}
              {t('by {abs} ({pct})', {
                abs: twdCompact(Math.abs(latest.actual - latest.planned)),
                pct: pct(latest.actual / latest.planned - 1),
              })}
            </strong>
          </p>
        )}
        {nw.length > 1 && (
          <LineChart
            ariaLabel={t('Actual investable net worth against plan')}
            data={nw}
            xKey="date"
            series={[
              { key: 'actual', label: t('Actual'), slot: 0 },
              { key: 'planned', label: t('Plan'), slot: 1, dashed: true },
            ]}
            height={240}
          />
        )}
        {flows.length > 0 && (
          <Table className="mt-4">
            <thead>
              <tr>
                <th>{t('Year')}</th>
                <th className="text-right">{t('Months')}</th>
                <th className="text-right">{t('Savings: plan')}</th>
                <th className="text-right">{t('actual')}</th>
                <th className="text-right">{t('Spending: plan')}</th>
                <th className="text-right">{t('actual')}</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.year}>
                  <td>{f.year}</td>
                  <td className="text-right">{f.months}</td>
                  <td className="text-right">{twdCompact(f.plannedSavings)}</td>
                  <td className="text-right">{twdCompact(f.actualSavings)}</td>
                  <td className="text-right">{twdCompact(f.plannedSpending)}</td>
                  <td className="text-right">{twdCompact(f.actualSpending)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-xs text-subtle">
          {t(
            'Planned savings and spending are pro-rated to the months with data. Actuals are nominal; small differences from inflation are expected.',
          )}
        </p>
      </CardContent>
    </Card>
  );
}

const TYPE_LABELS: Record<string, string> = {
  monthly: t('Monthly'),
  quarterly: t('Quarterly'),
  annual: t('Annual reset'),
};

export function ReviewsPage() {
  const { reviews, scenarios } = useAppData();
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const plan = scenarios.find((s) => s.isPlanOfRecord);
  return (
    <>
      <PageHeader
        title={t('Reviews')}
        description={t(
          'Close the loop: a checklist for each review, plan vs. actual against the plan of record, and a log of decisions.',
        )}
        actions={
          plan && (
            <Badge tone="primary">
              <Lock className="size-3" aria-hidden /> {t('Plan of record: {name}', { name: plan.name })}
            </Badge>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <PlanVsActual />
          <Card>
            <CardHeader title={t('Review log')} />
            <CardContent>
              {sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('No reviews yet.')}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {sorted.map((r) => {
                    const done = Object.values(r.checklist).filter(Boolean).length;
                    return (
                      <li key={r.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatDate(r.date)}</span>
                            <Badge>{TYPE_LABELS[r.type]}</Badge>
                            {done > 0 && (
                              <span className="text-xs text-subtle">
                                {t('{done} checklist items done', { done })}
                              </span>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t('Delete review {date}', { date: formatDate(r.date) })}
                            onClick={() => confirm(t('Delete this review?')) && void db.reviews.delete(r.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        {r.notes && (
                          <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
                        )}
                        {r.decisions.length > 0 && (
                          <ul className="mt-1 list-disc pl-5 text-sm">
                            {r.decisions.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <NewReview />
      </div>
    </>
  );
}

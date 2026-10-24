import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { chanceDots, chanceText, lastsSentence, STATUS_LABELS, type PlanStatus } from '@/domain/planStatus';
import { useAppData } from '@/app/data';
import { usePlanHealth } from '@/app/planHealth';
import { stopAge, stopDate } from '@/features/lab/model';
import { Badge } from '@/components/ui/misc';
import { Term } from '@/components/ui/term';
import { Dots } from '@/features/lab/Dots';
import { pct } from '@/lib/format';
import { cn } from '@/lib/cn';

export const STATUS_TONE: Record<PlanStatus, 'good' | 'warning' | 'critical'> = {
  on_track: 'good',
  watch: 'warning',
  at_risk: 'critical',
};

/**
 * The one headline answer (product review, "one answer people can trust"): the plan's
 * status from simulated futures and its most likely stop-work age from the typical path.
 * The Dashboard shows it in full; Projection and Goal show the compact line.
 */
export function PlanHealthCard({ compact = false, note }: { compact?: boolean; note?: ReactNode }) {
  const { baseline, baselineInput, ctx } = useAppData();
  const { summary, status, pending } = usePlanHealth();
  const age = stopAge(baseline);
  const date = stopDate(baselineInput, baseline, ctx.asOfDate);
  const headline =
    age !== undefined ? `Most likely age ${age} · ${date}` : `Not reached by ${baselineInput.horizonAge}`;
  // FI date as a range (product review, Next phase): 8 in 10 futures reach FI between these ages.
  const lo = summary?.fiAgeP10 !== undefined ? Math.round(summary.fiAgeP10) : undefined;
  const hi = summary?.fiAgeP90 !== undefined ? Math.round(summary.fiAgeP90) : undefined;
  const range =
    baselineInput.retireAtAge === undefined && lo !== undefined && hi !== undefined && summary!.fiRate >= 0.9
      ? lo === hi
        ? `Reach your target at ${lo} in 8 of 10 futures`
        : `Likely between age ${lo} and ${hi} (8 in 10 futures)`
      : undefined;
  const badge = status ? (
    <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
  ) : (
    <Badge>{pending ? 'Checking…' : '—'}</Badge>
  );

  if (compact) {
    return (
      <section aria-label="Plan health" className="mb-4 rounded-lg border bg-surface px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Your plan</span>
          {badge}
          <span className="font-medium">
            {age !== undefined ? `Stop work most likely at ${age} (${date})` : headline}
          </span>
          {lo !== undefined && hi !== undefined && lo !== hi && range && (
            <span className="text-muted-foreground">
              · range {lo}–{hi}
            </span>
          )}
          {summary && (
            <span className="text-muted-foreground">
              · money lasts to {baselineInput.horizonAge} in {chanceText(summary.successRate).toLowerCase()}{' '}
              simulated futures
            </span>
          )}
          <Link to="/lab" className="ml-auto text-primary hover:underline">
            Details
          </Link>
        </div>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </section>
    );
  }

  return (
    <section aria-label="Plan health" className="mb-4 rounded-lg border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Your plan {badge}</div>
      <div className={cn('mt-1 font-semibold tracking-tight', age !== undefined ? 'text-4xl' : 'text-3xl')}>
        {headline}
      </div>
      {range && <div className="mt-1 text-sm text-muted-foreground">{range}</div>}
      {summary ? (
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <p>{lastsSentence(summary.successRate, baselineInput.horizonAge, summary.depletionAgeP50)}</p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <Dots
              filled={chanceDots(summary.successRate)}
              label={`${chanceText(summary.successRate)} simulated futures last`}
            />
            <span>
              <Term k="chanceLasts">Chance your money lasts</Term>: {pct(summary.successRate, 0)}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-subtle">Running the simulated futures…</p>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
        <Link className="text-primary hover:underline" to="/lab">
          Why, and what would make it safer
        </Link>
        <Link className="text-primary hover:underline" to="/projection">
          Year by year
        </Link>
      </div>
    </section>
  );
}

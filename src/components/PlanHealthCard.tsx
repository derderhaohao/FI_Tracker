import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { chanceDots, chanceText, lastsSentence, STATUS_LABELS } from '@/domain/planStatus';
import { useAppData } from '@/app/data';
import { usePlanHealth } from '@/app/planHealth';
import { stopAge, stopDate } from '@/features/lab/model';
import { Badge } from '@/components/ui/misc';
import { StatusBadge } from '@/components/StatusBadge';
import { Term } from '@/components/ui/term';
import { Dots } from '@/features/lab/Dots';
import { pct } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

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
    age !== undefined
      ? t('Most likely age {age} · {date}', { age, date })
      : t('Not reached by {horizonAge}', { horizonAge: baselineInput.horizonAge });
  // FI date as a range (product review, Next phase): 8 in 10 futures reach FI between these ages.
  const lo = summary?.fiAgeP10 !== undefined ? Math.round(summary.fiAgeP10) : undefined;
  const hi = summary?.fiAgeP90 !== undefined ? Math.round(summary.fiAgeP90) : undefined;
  const range =
    baselineInput.retireAtAge === undefined && lo !== undefined && hi !== undefined && summary!.fiRate >= 0.9
      ? lo === hi
        ? t('Reach your target at {lo} in 8 of 10 futures', { lo })
        : t('Likely between age {lo} and {hi} (8 in 10 futures)', { lo, hi })
      : undefined;
  const badge = status ? (
    <StatusBadge status={status}>{STATUS_LABELS[status]}</StatusBadge>
  ) : (
    <Badge>{pending ? t('Checking…') : '—'}</Badge>
  );

  if (compact) {
    return (
      <section aria-label={t('Plan health')} className="mb-4 rounded-lg border bg-surface px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground">{t('Your plan')}</span>
          {badge}
          <span className="font-medium">
            {age !== undefined ? t('Stop work most likely at {age} ({date})', { age, date }) : headline}
          </span>
          {lo !== undefined && hi !== undefined && lo !== hi && range && (
            <span className="text-muted-foreground">{t('· range {lo}–{hi}', { lo, hi })}</span>
          )}
          {summary && (
            <span className="text-muted-foreground">
              {t('· money lasts to {horizonAge} in {toLowerCase} simulated futures', {
                horizonAge: baselineInput.horizonAge,
                toLowerCase: chanceText(summary.successRate).toLowerCase(),
              })}
            </span>
          )}
          <DetailsPopover note={note} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t('Plan health')} className="mb-4 rounded-lg border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {t('Your plan')} {badge}
      </div>
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
              label={t('{successRate} simulated futures last', {
                successRate: chanceText(summary.successRate),
              })}
            />
            <span>
              <Term k="chanceLasts">{t('Chance your money lasts')}</Term>: {pct(summary.successRate, 0)}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-subtle">{t('Running the simulated futures…')}</p>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
        <Link className="text-primary hover:underline" to="/lab">
          {t('Why, and what would make it safer')}
        </Link>
        <Link className="text-primary hover:underline" to="/projection">
          {t('Year by year')}
        </Link>
      </div>
    </section>
  );
}

/**
 * The strip's explainer sits behind "Details" (UI-22), so the strip stays one line: a small
 * popover with the note and the way to the Strategy Lab. Escape or a click outside closes it.
 */
function DetailsPopover({ note }: { note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative ml-auto">
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex min-h-6 items-center text-primary hover:underline touch:min-h-11"
        onClick={() => setOpen((o) => !o)}
      >
        {t('Details')}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('Plan health details')}
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] animate-pop-in rounded-md border bg-surface p-3 text-xs shadow-lg"
        >
          {note && <p className="mb-2 text-muted-foreground">{note}</p>}
          <Link to="/lab" className="font-medium text-primary hover:underline">
            {t('Why, and what would make it safer')}
          </Link>
        </div>
      )}
    </div>
  );
}

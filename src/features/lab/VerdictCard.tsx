import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import { chanceDots, chanceText } from '@/domain/planStatus';
import type { GlossaryParams } from '@/lib/glossary';
import { STATUS_TONE } from '@/components/PlanHealthCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, Notice } from '@/components/ui/misc';
import { Term } from '@/components/ui/term';
import { pct } from '@/lib/format';
import { Dots } from './Dots';
import { MathDrawer } from './MathDrawer';
import { TIER_LABELS, verdict, whyLensesDiffer, type LabRow } from './model';
import { t } from '@/i18n';

/**
 * The answer first, in plain words (PRD R3, R4). Simulated futures set the status; past
 * markets are a second opinion, shown smaller with the reason they differ.
 */
export function VerdictCard({
  row,
  mc,
  stale,
  asOfDate,
  params,
  advanced,
}: {
  row: LabRow;
  mc?: MonteCarloSummary;
  stale: boolean;
  asOfDate: string;
  params: GlossaryParams;
  advanced: boolean;
}) {
  const v = verdict(row, asOfDate, mc);
  const past = row.backtest.successRate;
  const why = mc ? whyLensesDiffer(row.input, mc.successRate, past) : undefined;
  return (
    <Card className="mb-4" aria-label={t('Verdict')}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{row.name}</h2>
          {v.tier && <Badge tone={STATUS_TONE[v.tier]}>{TIER_LABELS[v.tier]}</Badge>}
          {stale && <span className="text-xs text-subtle">{t('Updating…')}</span>}
        </div>
        <p className="mt-2 text-base">
          {v.stop} {v.lasts}
        </p>
        {v.reach && <p className="mt-1 text-sm text-muted-foreground">{v.reach}</p>}

        <div className="mt-4 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">
            <Term k="simulated" params={params} advanced={advanced} /> {t('· sets the status')}
          </div>
          {mc ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="text-2xl font-semibold">{chanceText(mc.successRate)}</span>
                <Dots
                  filled={chanceDots(mc.successRate)}
                  label={t('{successRate} simulated futures last', {
                    successRate: chanceText(mc.successRate),
                  })}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <Term k="chanceLasts" params={params}>
                  {t('Chance your money lasts')}
                </Term>
                : {pct(mc.successRate, 0)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-subtle">{t('Simulating…')}</div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-sm text-muted-foreground">
          <span>
            {t('Second opinion,')} <Term k="pastMarkets" params={params} advanced={advanced} />:
          </span>
          <span className="font-medium text-foreground">{chanceText(past)}</span>
          <Dots
            small
            filled={chanceDots(past)}
            label={t('{past} past start years last', { past: chanceText(past) })}
          />
          <span className="text-xs">
            {t('{past} of {runs} start years, {firstYear}–{lastYear}', {
              past: pct(past, 0),
              runs: row.backtest.runs,
              firstYear: row.backtest.firstYear,
              lastYear: row.backtest.lastYear,
            })}
          </span>
        </div>
        {why && (
          <Notice className="mt-3">
            <strong>{t('Why these differ.')}</strong> {why}
          </Notice>
        )}
        <MathDrawer row={row} mc={mc} asOfDate={asOfDate} />
      </CardContent>
    </Card>
  );
}

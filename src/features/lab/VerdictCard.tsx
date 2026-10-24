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
    <Card className="mb-4" aria-label="Verdict">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{row.name}</h2>
          {v.tier && <Badge tone={STATUS_TONE[v.tier]}>{TIER_LABELS[v.tier]}</Badge>}
          {stale && <span className="text-xs text-subtle">Updating…</span>}
        </div>
        <p className="mt-2 text-base">
          {v.stop} {v.lasts}
        </p>
        {v.reach && <p className="mt-1 text-sm text-muted-foreground">{v.reach}</p>}

        <div className="mt-4 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">
            <Term k="simulated" params={params} advanced={advanced} /> · sets the status
          </div>
          {mc ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="text-2xl font-semibold">{chanceText(mc.successRate)}</span>
                <Dots
                  filled={chanceDots(mc.successRate)}
                  label={`${chanceText(mc.successRate)} simulated futures last`}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <Term k="chanceLasts" params={params}>
                  Chance your money lasts
                </Term>
                : {pct(mc.successRate, 0)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-subtle">Simulating…</div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-sm text-muted-foreground">
          <span>
            Second opinion, <Term k="pastMarkets" params={params} advanced={advanced} />:
          </span>
          <span className="font-medium text-foreground">{chanceText(past)}</span>
          <Dots small filled={chanceDots(past)} label={`${chanceText(past)} past start years last`} />
          <span className="text-xs">
            {pct(past, 0)} of {row.backtest.runs} start years, {row.backtest.firstYear}–
            {row.backtest.lastYear}
          </span>
        </div>
        {why && (
          <Notice className="mt-3">
            <strong>Why these differ.</strong> {why}
          </Notice>
        )}
        <MathDrawer row={row} mc={mc} asOfDate={asOfDate} />
      </CardContent>
    </Card>
  );
}

import type { MonteCarloSummary } from '@/domain/montecarlo/runner';
import type { GlossaryParams } from '@/lib/glossary';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, Notice } from '@/components/ui/misc';
import { Term } from '@/components/ui/term';
import { pct } from '@/lib/format';
import { Dots } from './Dots';
import { MathDrawer } from './MathDrawer';
import { outOfTen, TIER_LABELS, verdict, whyLensesDiffer, type LabRow, type Tier } from './model';

const TIER_TONE: Record<Tier, 'good' | 'warning' | 'critical'> = {
  on_track: 'good',
  borderline: 'warning',
  at_risk: 'critical',
};

/** The answer first, in plain words (PRD R3, R4). */
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
          {v.tier && <Badge tone={TIER_TONE[v.tier]}>{TIER_LABELS[v.tier]}</Badge>}
          {stale && <span className="text-xs text-subtle">Updating…</span>}
        </div>
        <p className="mt-2 text-base">
          {v.stop} {v.lasts}
        </p>
        {v.reach && <p className="mt-1 text-sm text-muted-foreground">{v.reach}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">
              <Term k="simulated" params={params} advanced={advanced} />
            </div>
            {mc ? (
              <>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-2xl font-semibold">{outOfTen(mc.successRate)} in 10</span>
                  <Dots
                    filled={outOfTen(mc.successRate)}
                    label={`${outOfTen(mc.successRate)} of 10 simulated futures last`}
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
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">
              <Term k="pastMarkets" params={params} advanced={advanced} />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-2xl font-semibold">{outOfTen(past)} in 10</span>
              <Dots filled={outOfTen(past)} label={`${outOfTen(past)} of 10 past start years last`} />
            </div>
            <div className="text-xs text-muted-foreground">
              {pct(past, 0)} of {row.backtest.runs} start years, {row.backtest.firstYear}–
              {row.backtest.lastYear}
            </div>
          </div>
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

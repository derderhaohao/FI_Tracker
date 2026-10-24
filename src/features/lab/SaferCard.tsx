import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ScenarioLevers } from '@/domain/entities';
import { buildProjectionInput } from '@/domain/baseline';
import type { SolveLever, SolveResult } from '@/domain/montecarlo/solve';
import { toMinor } from '@/domain/money';
import { assumptionSetFor, useAppData } from '@/app/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Table } from '@/components/ui/misc';
import { pct, twd } from '@/lib/format';
import { saferVariants } from './levers';
import { stopAge, type LabRow } from './model';
import { shortMoney } from './templates';
import { monteCarloWorker, signature } from './useMonteCarlo';
import { t } from '@/i18n';

const LEVERS: SolveLever[] = ['stopAge', 'fiSpending', 'partTime'];

function points(delta: number): string {
  const p = Math.round(delta * 100);
  return p === 0 ? t('no change') : t('{sign}{n} pts', { sign: p > 0 ? '+' : '−', n: Math.abs(p) });
}

/**
 * "What would make it safer?" (PRD R13) and "What does it take to reach N%?" (R14).
 * What-if results, not advice.
 */
export function SaferCard({
  row,
  chance,
  runs,
  seed,
  onSave,
}: {
  row: LabRow;
  chance?: number;
  runs: number;
  seed: number;
  onSave: (name: string, overrides: ScenarioLevers) => void | Promise<void>;
}) {
  const data = useAppData();
  const variants = useMemo(() => saferVariants(row), [row]);
  const inputs = useMemo(() => {
    const assumptions = assumptionSetFor(data, row.scenario?.assumptionSetId ?? data.activeAssumptions.id);
    return variants.map((v) =>
      buildProjectionInput(data, assumptions, { ...row.spec, overrides: v.overrides }, data.ctx),
    );
  }, [data, row, variants]);
  const key = useMemo(() => inputs.map((i) => signature(i, runs, seed)).join(','), [inputs, runs, seed]);
  const [chances, setChances] = useState<{ key: string; values: number[] }>();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void monteCarloWorker()
        .chances(inputs, { runs, seed })
        .then((values) => !cancelled && setChances({ key, values }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inputs, key, runs, seed]);

  const [target, setTarget] = useState(0.9);
  const [solved, setSolved] = useState<{ key: string; target: number; results: SolveResult[] }>();
  const [solving, setSolving] = useState(false);
  const stop = stopAge(row.result);
  const solveKey = signature(row.input, runs, seed);

  const ranked =
    chances?.key === key
      ? variants.map((v, i) => ({ v, c: chances.values[i] })).sort((a, b) => b.c - a.c)
      : undefined;

  const solveText = (r: SolveResult): { text: string; overrides?: ScenarioLevers; name?: string } => {
    const o = row.spec.overrides;
    const named = (text: string) =>
      row.scenario ? `${row.scenario.name}: ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
    if (r.lever === 'stopAge') {
      if (!r.reachable)
        return { text: t('Working until {value} is not enough on its own.', { value: r.value }) };
      if (r.value === stop) return { text: t('Already there at your current stop-work age.') };
      return {
        text: t('Stop working at {value}{v}: {pct}.', {
          value: r.value,
          v:
            stop !== undefined
              ? t(' ({v} more year{v2})', { v: r.value! - stop, v2: r.value! - stop === 1 ? '' : 's' })
              : '',
          pct: pct(r.chance!, 0),
        }),
        overrides:
          row.input.retireAtAge === undefined
            ? { ...o, workExtraYears: (o.workExtraYears ?? 0) + (r.value! - stop!) }
            : { ...o, targetFiAge: r.value },
        name: named(t('stop at {value}', { value: r.value })),
      };
    }
    if (r.lever === 'fiSpending') {
      if (!r.reachable) return { text: t('Even spending 60% less after you stop is not enough on its own.') };
      const cut = 1 - r.value! / row.input.fiSpending;
      if (cut < 0.005) return { text: t('Already there at your current FI spending.') };
      return {
        text: t('Spend {twd} a year after you stop ({round}% less): {pct}.', {
          twd: twd(r.value!),
          round: Math.round(cut * 100),
          pct: pct(r.chance!, 0),
        }),
        overrides: {
          ...o,
          fiSpendingMinor: toMinor(r.value!),
          targetSpendingMinor: toMinor(Math.round(row.input.targetSpending ?? row.input.fiSpending)),
        },
        name: named(t('spend {round}% less after stopping', { round: Math.round(cut * 100) })),
      };
    }
    const untilAge = Math.max(60, (stop ?? row.input.startAge) + 5);
    if (!r.reachable)
      return { text: t('Part-time income alone, up to your full FI spending, is not enough.') };
    if (r.value === 0) return { text: t('Already there without part-time income.') };
    return {
      text: t('Earn {shortMoney} a month part-time until {untilAge}: {pct}.', {
        shortMoney: shortMoney(r.value! / 12),
        untilAge,
        pct: pct(r.chance!, 0),
      }),
      overrides: { ...o, baristaIncome: { annualMinor: toMinor(r.value!), untilAge, inTarget: false } },
      name: named(
        t('part-time {shortMoney} a month to {untilAge}', {
          shortMoney: shortMoney(r.value! / 12),
          untilAge,
        }),
      ),
    };
  };

  return (
    <Card className="mt-4" aria-label={t('What would make it safer')}>
      <CardHeader
        title={t('What would make “{name}” safer?', { name: row.name })}
        description={t(
          'Each line changes one thing and reruns the same simulated futures. These are what-if results, not advice.',
        )}
      />
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th className="min-w-52">{t('Change')}</th>
              <th className="text-right">{t('Chance your money lasts')}</th>
              <th className="text-right">{t('vs now')}</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {(ranked ?? variants.map((v) => ({ v, c: undefined as number | undefined }))).map(({ v, c }) => (
              <tr key={v.key}>
                <td>{v.label}</td>
                <td className="text-right">
                  {c === undefined ? <span className="text-subtle">…</span> : pct(c, 0)}
                </td>
                <td className="text-right">
                  {c !== undefined && chance !== undefined ? points(c - chance) : ''}
                </td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => void onSave(v.name, v.overrides)}>
                    <Plus aria-hidden /> {t('Save')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="mt-5 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{t('What does it take to reach')}</span>
            <Select
              aria-label={t('Target chance')}
              className="h-8 w-24"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {[0.8, 0.85, 0.9, 0.95].map((t) => (
                <option key={t} value={t}>
                  {Math.round(t * 100)}%
                </option>
              ))}
            </Select>
            <span className="font-medium">?</span>
            <Button
              size="sm"
              variant="outline"
              disabled={solving || stop === undefined}
              onClick={async () => {
                if (stop === undefined) return;
                setSolving(true);
                try {
                  const results = await monteCarloWorker().solve(row.input, LEVERS, target, stop, {
                    runs: Math.min(runs, 1000),
                    seed,
                  });
                  setSolved({ key: solveKey, target, results });
                } finally {
                  setSolving(false);
                }
              }}
            >
              {solving ? t('Working it out…') : t('Find out')}
            </Button>
          </div>
          {solved && solved.key === solveKey && (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li className="text-muted-foreground">
                {t('To reach {round}%, any one of these on its own:', {
                  round: Math.round(solved.target * 100),
                })}
              </li>
              {solved.results.map((r) => {
                const s = solveText(r);
                return (
                  <li
                    key={r.lever}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span>{s.text}</span>
                    {s.overrides && s.name && (
                      <Button size="sm" variant="ghost" onClick={() => void onSave(s.name!, s.overrides!)}>
                        <Plus aria-hidden /> {t('Save as scenario')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useMemo } from 'react';
import type { Behaviour, StoryEvent } from '@/domain/entities';
import {
  runPlayback,
  type PlaybackPath,
  type PlaybackStory,
  type ResolvedEvent,
} from '@/domain/playback/engine';
import { pathStats, rankOutOf100, recoveryMonth, spanText } from '@/domain/playback/analysis';
import { usePlanHealth } from '@/app/planHealth';
import { Card, CardContent } from '@/components/ui/card';
import { Table } from '@/components/ui/misc';
import { pct, twdCompact } from '@/lib/format';
import { t } from '@/i18n';

const BEHAVIOURS: { b: Behaviour; label: string }[] = [
  { b: { kind: 'keep' }, label: t('Keep investing') },
  { b: { kind: 'pause' }, label: t('Pause new investing') },
  { b: { kind: 'sell', fall: 0.2 }, label: t('Sell after a 20% fall') },
];

/** The end card (PB-23, SC-10, EN-7, LE-15, SC-6). */
export function EndCard({
  path,
  normal,
  story,
  live,
  resolveAll,
}: {
  path: PlaybackPath;
  normal: PlaybackPath;
  story: PlaybackStory;
  live: StoryEvent[];
  resolveAll: (events: StoryEvent[]) => ResolvedEvent[];
}) {
  const { summary } = usePlanHealth();
  const s = pathStats(path);
  const age = (m: number) => Math.floor(path.startAge + m / 12);
  const all = useMemo(() => [...story.events, ...live], [story.events, live]);
  const contributions = useMemo(
    () =>
      all.map((e) => {
        const without = runPlayback(
          path.setup,
          resolveAll(all.filter((x) => x.uid !== e.uid)),
          story.behaviour,
          story.noiseSeed,
        );
        return { e, delta: path.investable[path.months] - without.investable[without.months] };
      }),
    [all, path, resolveAll, story.behaviour, story.noiseSeed],
  );
  const behaviours = useMemo(
    () =>
      all.length === 0
        ? []
        : BEHAVIOURS.map(({ b, label }) => {
            const p = runPlayback(path.setup, resolveAll(all), b, story.noiseSeed);
            return {
              label,
              value: p.investable[p.months],
              current: JSON.stringify(b) === JSON.stringify(story.behaviour),
              stop: p.retireAge,
              runOut: p.depletionMonth,
            };
          }),
    [all, path.setup, resolveAll, story.behaviour, story.noiseSeed],
  );
  const vsNormal = path.investable[path.months] - normal.investable[normal.months];
  const rankEnd = summary ? rankOutOf100(summary.horizonSorted, path.investable[path.months]) : undefined;
  const rankLow = summary ? rankOutOf100(summary.lowestSorted, s.lowest) : undefined;
  const nameOf = (id: string) => path.events.find((e) => e.def.id === id)?.def.name ?? id;

  return (
    <Card className="mt-3 border-primary" aria-label={t('End of the story')}>
      <CardContent className="flex flex-col gap-3 p-5 text-sm">
        <div>
          <h3 className="text-lg font-semibold">
            {t('End of the story, age {horizonAge}', { horizonAge: path.setup.input.horizonAge })}
          </h3>
          <p className="text-xs text-muted-foreground">{t('One possible story, not a forecast.')}</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Investments at the end')}</dt>
            <dd className="font-medium">{twdCompact(s.finalInvestable)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Total net worth at the end')}</dt>
            <dd className="font-medium">{twdCompact(s.finalTotal)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Lowest point')}</dt>
            <dd>
              {t('{lowest} at age {lowestMonth}', {
                lowest: twdCompact(s.lowest),
                lowestMonth: age(s.lowestMonth),
              })}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Worst market fall')}</dt>
            <dd>
              {s.drawdown > 0.005
                ? t('−{drawdown} at age {drawdownTroughMonth}', {
                    drawdown: pct(s.drawdown, 0),
                    drawdownTroughMonth: age(s.drawdownTroughMonth),
                  })
                : t('none')}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Time to recover')}</dt>
            <dd>
              {s.drawdown <= 0.005
                ? '—'
                : s.recoveryMonths !== undefined
                  ? spanText(s.recoveryMonths)
                  : t('not within the story')}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Compared with Normal')}</dt>
            <dd className={vsNormal < 0 ? 'text-critical' : 'text-good'}>
              {t('{v}{vsNormal} at {horizonAge}', {
                v: vsNormal >= 0 ? '+' : '−',
                vsNormal: twdCompact(Math.abs(vsNormal)),
                horizonAge: path.setup.input.horizonAge,
              })}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t('Money lasts')}</dt>
            <dd>
              {path.depletionMonth === undefined
                ? t('to {age}', { age: path.setup.input.horizonAge })
                : t('runs out at {depletionMonth}', { depletionMonth: age(path.depletionMonth) })}
            </dd>
          </div>
        </dl>
        {rankEnd !== undefined && summary && (
          <p>
            {t('This story ends better than')} <strong>{t('{rankEnd} of 100', { rankEnd })}</strong>{' '}
            {t(
              'simulated futures for your plan, and its lowest point is above {rankLow} of 100. For context, the Strategy Lab gives your plan a {successRate} chance of the money lasting.',
              { rankLow, successRate: pct(summary.successRate, 0) },
            )}
          </p>
        )}
        {path.events.filter((e) => e.source !== 'backdrop').length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">{t('Events in this story')}</h4>
            <Table>
              <thead>
                <tr>
                  <th>{t('Event')}</th>
                  <th className="text-right">{t('Starts at')}</th>
                  <th className="text-right">{t('Effect at the end')}</th>
                  <th className="text-right">{t('Investments back to pre-event level')}</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map(({ e, delta }) => {
                  const r = path.events.find((x) => x.uid === e.uid);
                  const rec = r ? recoveryMonth(path, r) : undefined;
                  return (
                    <tr key={e.uid}>
                      <td>
                        {nameOf(e.eventId)}
                        {e.source === 'live' && (
                          <span className="ml-1 text-xs text-subtle">{t('fired live')}</span>
                        )}
                      </td>
                      <td className="text-right">{age(e.start)}</td>
                      <td className="text-right">
                        {delta >= 0 ? '+' : '−'}
                        {twdCompact(Math.abs(delta))}
                      </td>
                      <td className="text-right">
                        {rec !== undefined ? t('after {span}', { span: spanText(rec - e.start) }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-1 text-xs text-subtle">
              {t('Each effect reruns the story without that one event, so they need not add up.')}
            </p>
          </div>
        )}
        {behaviours.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">{t('What reacting would have cost')}</h4>
            <ul className="flex flex-col gap-0.5">
              {behaviours.map((b) => (
                <li key={b.label} className="flex justify-between gap-2">
                  <span>
                    {b.label}
                    {b.current && <span className="ml-1 text-xs text-subtle">{t('(this story)')}</span>}
                  </span>
                  <span>
                    {b.runOut !== undefined
                      ? t('runs out at {runOut}', { runOut: age(b.runOut) })
                      : t('{value} at the end', { value: twdCompact(b.value) })}
                    {b.stop !== undefined && b.stop !== path.retireAge && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {t('(stops work at {stop})', { stop: b.stop })}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

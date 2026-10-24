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

const BEHAVIOURS: { b: Behaviour; label: string }[] = [
  { b: { kind: 'keep' }, label: 'Keep investing' },
  { b: { kind: 'pause' }, label: 'Pause new investing' },
  { b: { kind: 'sell', fall: 0.2 }, label: 'Sell after a 20% fall' },
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
    <Card className="mt-3 border-primary" aria-label="End of the story">
      <CardContent className="flex flex-col gap-3 p-5 text-sm">
        <div>
          <h3 className="text-lg font-semibold">End of the story, age {path.setup.input.horizonAge}</h3>
          <p className="text-xs text-muted-foreground">One possible story, not a forecast.</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Investments at the end</dt>
            <dd className="font-medium">{twdCompact(s.finalInvestable)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Total net worth at the end</dt>
            <dd className="font-medium">{twdCompact(s.finalTotal)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Lowest point</dt>
            <dd>
              {twdCompact(s.lowest)} at age {age(s.lowestMonth)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Worst market fall</dt>
            <dd>
              {s.drawdown > 0.005 ? `−${pct(s.drawdown, 0)} at age ${age(s.drawdownTroughMonth)}` : 'none'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Time to recover</dt>
            <dd>
              {s.drawdown <= 0.005
                ? '—'
                : s.recoveryMonths !== undefined
                  ? spanText(s.recoveryMonths)
                  : 'not within the story'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Compared with Normal</dt>
            <dd className={vsNormal < 0 ? 'text-critical' : 'text-good'}>
              {vsNormal >= 0 ? '+' : '−'}
              {twdCompact(Math.abs(vsNormal))} at {path.setup.input.horizonAge}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Money lasts</dt>
            <dd>
              {path.depletionMonth === undefined
                ? `to ${path.setup.input.horizonAge}`
                : `runs out at ${age(path.depletionMonth)}`}
            </dd>
          </div>
        </dl>
        {rankEnd !== undefined && summary && (
          <p>
            This story ends better than <strong>{rankEnd} of 100</strong> simulated futures for your plan, and
            its lowest point is above {rankLow} of 100. For context, the Strategy Lab gives your plan a{' '}
            {pct(summary.successRate, 0)} chance of the money lasting.
          </p>
        )}
        {path.events.filter((e) => e.source !== 'backdrop').length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">Events in this story</h4>
            <Table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th className="text-right">Starts at</th>
                  <th className="text-right">Effect at the end</th>
                  <th className="text-right">Investments back to pre-event level</th>
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
                        {e.source === 'live' && <span className="ml-1 text-xs text-subtle">fired live</span>}
                      </td>
                      <td className="text-right">{age(e.start)}</td>
                      <td className="text-right">
                        {delta >= 0 ? '+' : '−'}
                        {twdCompact(Math.abs(delta))}
                      </td>
                      <td className="text-right">
                        {rec !== undefined ? `after ${spanText(rec - e.start)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-1 text-xs text-subtle">
              Each effect reruns the story without that one event, so they need not add up.
            </p>
          </div>
        )}
        {behaviours.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium">What reacting would have cost</h4>
            <ul className="flex flex-col gap-0.5">
              {behaviours.map((b) => (
                <li key={b.label} className="flex justify-between gap-2">
                  <span>
                    {b.label}
                    {b.current && <span className="ml-1 text-xs text-subtle">(this story)</span>}
                  </span>
                  <span>
                    {b.runOut !== undefined
                      ? `runs out at ${age(b.runOut)}`
                      : `${twdCompact(b.value)} at the end`}
                    {b.stop !== undefined && b.stop !== path.retireAge && (
                      <span className="ml-1 text-xs text-muted-foreground">(stops work at {b.stop})</span>
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

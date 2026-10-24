import { memo, useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PlaybackPath } from '@/domain/playback/engine';
import { allGroupKeys, groupRows, type Grouping } from '@/domain/playback/analysis';
import { ChartLegend, TooltipBox } from '@/components/charts/ChartParts';
import { axisTick, useChartTheme } from '@/components/charts/theme';
import { twdCompact } from '@/lib/format';
import type { Fade } from './usePlayback';
import { getLang, t } from '@/i18n';

export type ChartView = 'total' | 'breakdown';

interface Props {
  path: PlaybackPath;
  normal: PlaybackPath;
  playhead: number;
  view: ChartView;
  grouping: Grouping;
  nominal: boolean;
  fade?: Fade;
  /** 0–1 progress of the morph and fade animation after a live event. */
  fadeT: number;
  morphT: number;
  pins: { month: number; label: string }[];
}

/** Playback chart (PB-10 to PB-15, LE-3 to LE-5). */
export const PlaybackChart = memo(function PlaybackChart({
  path,
  normal,
  playhead,
  view,
  grouping,
  nominal,
  fade,
  fadeT,
  morphT,
  pins,
}: Props) {
  const theme = useChartTheme();
  const k = (m: number) => (nominal ? path.inflationIndex[m] : 1);
  const head = Math.round(playhead);
  const groups = useMemo(
    () => (view === 'breakdown' ? allGroupKeys(path, grouping) : []),
    [path, grouping, view],
  );
  const base = useMemo(() => {
    const step = path.months > 480 ? 2 : 1;
    const rows: Record<string, number | null>[] = [];
    for (let m = 0; m <= path.months; m += step) {
      const row: Record<string, number | null> = {
        m,
        investable: path.investable[m] * k(m),
        total: path.total[m] * k(m),
        need: path.fiTarget[m] * k(m),
        normal: normal.investable[m] * (nominal ? normal.inflationIndex[m] : 1),
      };
      if (view === 'breakdown')
        for (const r of groupRows(path, m, grouping)) row[`g:${r.key}`] = Math.max(0, r.value * k(m));
      rows.push(row);
    }
    if (rows.at(-1)?.m !== path.months) rows.push({ ...rows.at(-1)!, m: path.months });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, normal, view, grouping, nominal]);

  const data = useMemo(
    () =>
      base.map((r) => {
        const m = r.m as number;
        const played = m <= head;
        let inv = r.investable as number;
        if (fade && m >= fade.fromMonth && morphT < 1) {
          const old = fade.oldInvestable[m] * k(m);
          inv = old + (inv - old) * morphT;
        }
        const row: Record<string, number | null> = {
          ...r,
          invPlayed: played ? inv : null,
          invAhead: m >= head ? inv : null,
          totPlayed: played ? (r.total as number) : null,
          totAhead: m >= head ? (r.total as number) : null,
          ghost: fade && fadeT < 1 && m >= fade.fromMonth ? fade.oldInvestable[m] * k(m) : null,
        };
        if (view === 'breakdown')
          for (const g of groups) {
            row[`p:${g.key}`] = played ? (r[`g:${g.key}`] ?? 0) : null;
          }
        return row;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, head, fade, fadeT, morphT, groups, view],
  );

  const bands = path.events.filter((e) => e.source !== 'backdrop' && e.shocks.length > 0);
  const age = (m: number) => Math.round(path.startAge + m / 12);
  const ticks: number[] = [];
  for (let m = 0; m <= path.months; m += 60) ticks.push(m);
  const c = theme.series[0];
  const ghostOpacity = fade ? Math.max(0, 1 - fadeT) * 0.8 : 0;

  return (
    <figure aria-label={t('Playback chart')} className="m-0">
      <ChartLegend
        items={
          view === 'total'
            ? [
                { label: t('Investments'), color: c },
                { label: t('Total net worth'), color: theme.series[2] },
                { label: t('Money needed'), color: theme.series[1], dashed: true },
                { label: t('Normal story'), color: theme.axis, dashed: true },
              ]
            : groups.map((g, i) => ({
                label: g.label,
                color: theme.series[i % theme.series.length],
                band: true,
              }))
        }
      />
      <div className="h-[230px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="m"
              type="number"
              domain={[0, path.months]}
              ticks={ticks}
              tickFormatter={(m: number) => String(age(m))}
              tick={axisTick(theme)}
              stroke={theme.axis}
              tickLine={false}
            />
            <YAxis
              tick={axisTick(theme)}
              tickFormatter={twdCompact}
              stroke={theme.axis}
              tickLine={false}
              axisLine={false}
              width={getLang() === 'zh-TW' ? 76 : 64}
            />
            {bands.map((e) => (
              <ReferenceArea
                key={e.uid}
                x1={e.start}
                x2={Math.min(path.months, e.start + e.length)}
                fill={e.def.palette === 'good' ? theme.good : theme.critical}
                fillOpacity={0.07}
                stroke="none"
                label={{ value: e.def.name, position: 'insideTopLeft', fill: theme.text, fontSize: 10 }}
              />
            ))}
            {path.retireMonth !== undefined && (
              <ReferenceLine
                x={path.retireMonth}
                stroke={theme.axis}
                strokeDasharray="2 3"
                label={{
                  value: t('Stop work'),
                  position: 'insideBottomLeft',
                  fill: theme.text,
                  fontSize: 10,
                }}
              />
            )}
            {path.depletionMonth !== undefined && (
              <ReferenceLine
                x={path.depletionMonth}
                stroke={theme.critical}
                label={{
                  value: t('Money runs out'),
                  position: 'insideBottomRight',
                  fill: theme.critical,
                  fontSize: 10,
                }}
              />
            )}
            {pins.map((p) => (
              <ReferenceLine
                key={`${p.month}-${p.label}`}
                x={p.month}
                stroke={theme.series[3]}
                strokeWidth={2}
                label={{ value: '●', position: 'top', fill: theme.series[3], fontSize: 12 }}
              />
            ))}
            <ReferenceLine x={head} stroke={theme.text} strokeWidth={1.5} />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Record<string, number>;
                return (
                  <TooltipBox
                    title={t('Age {toFixed}', { toFixed: (path.startAge + r.m / 12).toFixed(1) })}
                    rows={[
                      { label: t('Investments'), value: twdCompact(r.investable), color: c },
                      { label: t('Total net worth'), value: twdCompact(r.total), color: theme.series[2] },
                      { label: t('Money needed'), value: twdCompact(r.need), color: theme.series[1] },
                      { label: t('Normal story'), value: twdCompact(r.normal), color: theme.axis },
                    ]}
                  />
                );
              }}
            />
            {view === 'breakdown' &&
              groups.map((g, i) => (
                <Area
                  key={g.key}
                  dataKey={`p:${g.key}`}
                  stackId="g"
                  stroke="none"
                  fill={theme.series[i % theme.series.length]}
                  fillOpacity={0.55}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            {view === 'breakdown' &&
              groups.map((g, i) => (
                <Area
                  key={`f:${g.key}`}
                  dataKey={`g:${g.key}`}
                  stackId="f"
                  stroke="none"
                  fill={theme.series[i % theme.series.length]}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
              ))}
            <Line
              dataKey="normal"
              stroke={theme.axis}
              strokeDasharray="5 4"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="need"
              stroke={theme.series[1]}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {view === 'total' && (
              <>
                <Line
                  dataKey="totAhead"
                  stroke={theme.series[2]}
                  strokeOpacity={0.3}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="totPlayed"
                  stroke={theme.series[2]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </>
            )}
            {fade && fadeT < 1 && (
              <Line
                dataKey="ghost"
                stroke={c}
                strokeOpacity={ghostOpacity}
                strokeDasharray="2 3"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="invAhead"
              stroke={c}
              strokeOpacity={0.35}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="invPlayed"
              stroke={c}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
});

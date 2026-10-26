import { useState } from 'react';
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
import { twdCompact } from '@/lib/format';
import { BandLabel, ChartLegend, LABEL_ROW, TooltipBox } from './ChartParts';
import { axisTick, useChartTheme } from './theme';
import { ageTicks, labelWidth, niceTicks, staggerLabels, trimZeros } from './ticks';
import { TECHNICAL_BAND_LABELS, type BandLabels } from './bandLabels';
import { getLang, t } from '@/i18n';

export interface BandRow {
  age: number;
  p10: number;
  p50: number;
  p90: number;
  band: [number, number];
  target?: number;
  /** The typical path, drawn thin so its agreement with the band is visible. */
  typical?: number;
}

/**
 * Range chart for simulated or historical outcomes (PRD R8): the 1-in-10 band, the typical
 * future, the money needed, and optionally the typical path. The y-axis is capped near the
 * upper edge at `capAge` so the best-case tail doesn't squeeze the rest; "Show all" lifts it.
 */
export function BandChart({
  data,
  slot = 0,
  height = 300,
  labels = TECHNICAL_BAND_LABELS,
  capAge,
  markers = [],
  shadeRunsOut = false,
}: {
  data: BandRow[];
  slot?: number;
  height?: number;
  labels?: BandLabels;
  capAge?: number;
  markers?: { age: number; label: string }[];
  /** Shade the ages where at least 1 in 10 futures has run out of money. */
  shadeRunsOut?: boolean;
}) {
  const theme = useChartTheme();
  const [showAll, setShowAll] = useState(false);
  const [width, setWidth] = useState(0);
  const c = theme.series[slot];
  const target = theme.series[1];
  const hasTypical = data.some((r) => r.typical !== undefined);

  const capRow = capAge !== undefined ? (data.find((r) => r.age === capAge) ?? data.at(-1)) : undefined;
  const peak = Math.max(...data.map((r) => Math.max(r.p50, r.target ?? 0, r.typical ?? 0)), 0);
  // The cap and the full range both end on a round tick (UI-7).
  const cap = capRow ? niceTicks(0, Math.max(capRow.p90, peak) * 1.05).domain[1] : undefined;
  const capped = cap !== undefined && !showAll && data.some((r) => r.p90 > cap);
  const top = capped ? cap : Math.max(...data.map((r) => Math.max(r.p90, r.target ?? 0, r.typical ?? 0)), 0);
  const y = niceTicks(Math.min(0, ...data.map((r) => r.p10)), top);
  const ages = data.map((r) => r.age);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);

  // Marker labels in a band above the plot; ones that would overlap go on a second row (UI-8).
  const yWidth = getLang() === 'zh-TW' ? 76 : 68;
  const plotWidth = Math.max(1, width - yWidth - 12);
  const sorted = [...markers].sort((a, b) => a.age - b.age);
  const rows = staggerLabels(
    sorted.map((m) => ({
      x: yWidth + ((m.age - minAge) / Math.max(1, maxAge - minAge)) * plotWidth,
      width: labelWidth(m.label),
    })),
  );
  const labelRows = sorted.length ? Math.max(...rows) + 1 : 0;

  const firstOut = shadeRunsOut
    ? data.find((r, k) => k > 0 && r.p10 <= 0 && data[k - 1].p10 > 0)?.age
    : undefined;
  const lastAge = data.at(-1)?.age;

  return (
    <figure aria-label={t('Range of outcomes by age')} className="m-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ChartLegend
          items={[
            { label: labels.band, color: c, band: true },
            { label: labels.median, color: c },
            ...(hasTypical ? [{ label: labels.typical, color: theme.axis, dashed: true }] : []),
            { label: labels.target, color: target, dashed: true },
            ...(firstOut !== undefined
              ? [{ label: t('Money has run out in 1 in 10 futures'), color: theme.critical, band: true }]
              : []),
          ]}
        />
        {cap !== undefined && data.some((r) => r.p90 > cap) && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? t('Zoom to age {capAge}', { capAge }) : t('Show all')}
          </button>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
          <ComposedChart
            data={data}
            margin={{ top: 8 + labelRows * LABEL_ROW, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={theme.grid} vertical={false} horizontalValues={[0]} />
            <XAxis
              dataKey="age"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={ageTicks(minAge, maxAge)}
              interval={0}
              tick={axisTick(theme)}
              stroke={theme.axis}
              tickLine={false}
            />
            <YAxis
              tick={axisTick(theme)}
              tickFormatter={(v: number) => trimZeros(twdCompact(v))}
              stroke={theme.axis}
              tickLine={false}
              axisLine={false}
              width={yWidth}
              ticks={y.ticks}
              interval={0}
              domain={y.domain}
              allowDataOverflow={capped}
            />
            {firstOut !== undefined && lastAge !== undefined && (
              <ReferenceArea
                x1={firstOut}
                x2={lastAge}
                fill={theme.critical}
                fillOpacity={0.08}
                stroke="none"
              />
            )}
            {sorted.map((m, i) => (
              <ReferenceLine
                key={m.label}
                x={m.age}
                stroke={theme.axis}
                strokeDasharray="2 3"
                label={<BandLabel text={m.label} row={rows[i]} fill={theme.text} />}
              />
            ))}
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as BandRow;
                return (
                  <TooltipBox
                    title={t('Age {age}', { age: r.age })}
                    rows={[
                      { label: labels.high, value: twdCompact(r.p90) },
                      { label: labels.median, value: twdCompact(r.p50), color: c },
                      { label: labels.low, value: twdCompact(r.p10) },
                      ...(r.typical !== undefined
                        ? [{ label: labels.typical, value: twdCompact(r.typical), color: theme.axis }]
                        : []),
                      ...(r.target !== undefined
                        ? [{ label: labels.target, value: twdCompact(r.target), color: target }]
                        : []),
                    ]}
                  />
                );
              }}
            />
            <Area
              dataKey="band"
              stroke="none"
              fill={c}
              fillOpacity={0.18}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="p50"
              stroke={c}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            />
            {hasTypical && (
              <Line
                dataKey="typical"
                stroke={theme.axis}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            <Line
              dataKey="target"
              stroke={target}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
              activeDot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

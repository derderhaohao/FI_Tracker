import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { twdCompact } from '@/lib/format';
import { ChartLegend, TooltipBox } from './ChartParts';
import { axisTick, useChartTheme } from './theme';

export interface SeriesSpec {
  key: string;
  label: string;
  /** Categorical slot, 0-based, assigned by entity (never by rank). */
  slot: number;
  area?: boolean;
  dashed?: boolean;
}

export interface LineChartProps<T extends object> {
  data: T[];
  xKey: keyof T & string;
  series: SeriesSpec[];
  xFormat?: (v: number | string) => string;
  yFormat?: (v: number) => string;
  tooltipTitle?: (row: T) => string;
  referenceX?: { x: number | string; label: string };
  height?: number;
  ariaLabel: string;
}

/** Line chart with optional area wash, hairline grid, crosshair tooltip, one y-axis. */
export function LineChart<T extends object>({
  data,
  xKey,
  series,
  xFormat = (v) => String(v),
  yFormat = twdCompact,
  tooltipTitle,
  referenceX,
  height = 280,
  ariaLabel,
}: LineChartProps<T>) {
  const theme = useChartTheme();
  const color = (slot: number) => theme.series[slot % theme.series.length];
  return (
    <figure aria-label={ariaLabel} className="m-0">
      <ChartLegend items={series.map((s) => ({ label: s.label, color: color(s.slot), dashed: s.dashed }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey={xKey as string}
              tick={axisTick(theme)}
              tickFormatter={xFormat}
              stroke={theme.axis}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={axisTick(theme)}
              tickFormatter={yFormat}
              stroke={theme.axis}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as T;
                return (
                  <TooltipBox
                    title={tooltipTitle ? tooltipTitle(row) : xFormat(row[xKey] as number | string)}
                    rows={series.map((s) => ({
                      label: s.label,
                      value: yFormat(Number((row as Record<string, unknown>)[s.key] ?? Number.NaN)),
                      color: color(s.slot),
                    }))}
                  />
                );
              }}
            />
            {referenceX && (
              <ReferenceLine
                x={referenceX.x}
                stroke={theme.axis}
                label={{ value: referenceX.label, position: 'insideTopLeft', fill: theme.text, fontSize: 11 }}
              />
            )}
            {series
              .filter((s) => s.area)
              .map((s) => (
                <Area
                  key={`${s.key}-area`}
                  dataKey={s.key}
                  stroke="none"
                  fill={color(s.slot)}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  activeDot={false}
                  legendType="none"
                  tooltipType="none"
                />
              ))}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={color(s.slot)}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '6 4' : undefined}
                dot={false}
                activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

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
import { BandLabel, ChartLegend, LABEL_ROW, TooltipBox } from './ChartParts';
import { axisTick, useChartTheme } from './theme';
import { trimZeros, xTicksFor, yAxisFor } from './ticks';
import { getLang } from '@/i18n';

export interface SeriesSpec {
  key: string;
  label: string;
  /** Categorical slot, 0-based, assigned by entity (never by rank). */
  slot: number;
  area?: boolean;
  dashed?: boolean;
  /** Overrides the slot colour (e.g. a neutral reference series). */
  color?: string;
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
  /** Start the y-axis at zero (money); false lets it fit the data (index values). */
  yFromZero?: boolean;
}

/** Line chart with optional area wash, a zero line, crosshair tooltip, one y-axis. */
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
  yFromZero = true,
}: LineChartProps<T>) {
  const theme = useChartTheme();
  const slotColor = (slot: number) => theme.series[slot % theme.series.length];
  const color = (s: SeriesSpec) => s.color ?? slotColor(s.slot);
  const y = yAxisFor(
    data,
    series.map((s) => s.key),
    yFromZero,
  );
  const numericX = typeof (data[0] as Record<string, unknown> | undefined)?.[xKey] === 'number';
  const xTicks = xTicksFor(data, xKey);
  return (
    <figure aria-label={ariaLabel} className="m-0">
      <ChartLegend items={series.map((s) => ({ label: s.label, color: color(s), dashed: s.dashed }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: referenceX ? 8 + LABEL_ROW : 8, right: 12, bottom: 0, left: 0 }}
          >
            {/* One gridline at zero; the axis line is the only other rule (UI-9). */}
            <CartesianGrid stroke={theme.grid} vertical={false} horizontalValues={[0]} />
            <XAxis
              dataKey={xKey as string}
              type={numericX ? 'number' : 'category'}
              domain={numericX ? ['dataMin', 'dataMax'] : undefined}
              ticks={xTicks}
              interval={xTicks ? 0 : 'preserveEnd'}
              tick={axisTick(theme)}
              tickFormatter={xFormat}
              stroke={theme.axis}
              tickLine={false}
              minTickGap={numericX ? 4 : 24}
            />
            <YAxis
              tick={axisTick(theme)}
              tickFormatter={(v: number) => trimZeros(yFormat(v))}
              ticks={y.ticks}
              domain={y.domain}
              interval={0}
              stroke={theme.axis}
              tickLine={false}
              axisLine={false}
              width={getLang() === 'zh-TW' ? 76 : 68}
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
                      color: color(s),
                    }))}
                  />
                );
              }}
            />
            {referenceX && (
              <ReferenceLine
                x={referenceX.x}
                stroke={theme.axis}
                label={<BandLabel text={referenceX.label} fill={theme.text} />}
              />
            )}
            {series
              .filter((s) => s.area)
              .map((s) => (
                <Area
                  key={`${s.key}-area`}
                  dataKey={s.key}
                  stroke="none"
                  fill={color(s)}
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
                stroke={color(s)}
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

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { twdCompact } from '@/lib/format';
import { ChartLegend, TooltipBox } from './ChartParts';
import { axisTick, useChartTheme } from './theme';

export interface BandRow {
  age: number;
  p10: number;
  p50: number;
  p90: number;
  band: [number, number];
  target?: number;
}

/** Monte Carlo P10–P90 band with the median line and the FI target. */
export function BandChart({
  data,
  slot = 0,
  height = 300,
}: {
  data: BandRow[];
  slot?: number;
  height?: number;
}) {
  const theme = useChartTheme();
  const c = theme.series[slot];
  const target = theme.series[1];
  return (
    <figure aria-label="Monte Carlo investable net worth bands by age" className="m-0">
      <ChartLegend
        items={[
          { label: 'P10–P90', color: c, band: true },
          { label: 'Median (P50)', color: c },
          { label: 'FI target', color: target, dashed: true },
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="age"
              tick={axisTick(theme)}
              stroke={theme.axis}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={axisTick(theme)}
              tickFormatter={twdCompact}
              stroke={theme.axis}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ stroke: theme.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as BandRow;
                return (
                  <TooltipBox
                    title={`Age ${r.age}`}
                    rows={[
                      { label: 'P90', value: twdCompact(r.p90) },
                      { label: 'P50', value: twdCompact(r.p50), color: c },
                      { label: 'P10', value: twdCompact(r.p10) },
                      ...(r.target !== undefined
                        ? [{ label: 'FI target', value: twdCompact(r.target), color: target }]
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

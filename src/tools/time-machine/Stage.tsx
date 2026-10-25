import { useMemo } from 'react';
import { Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import {
  CartesianGrid,
  Line as ChartLine,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/misc';
import { axisTick, useChartTheme } from '@/components/charts/theme';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import {
  fallFromPeak,
  metrics,
  monthIndex,
  twr,
  type Benchmark,
  type Currency,
  type Line,
  type Simulation,
} from './engine';
import type { MarketEvent } from './events';
import { accentButton } from './fields';
import { lineColor, lineLabel, money, monthText, pct, pointLabel, pointMonth } from './labels';
import { tickerText } from './search';
import type { Speed } from './usePlayer';

export type View = 'value' | 'growth';

function Counter({
  label,
  value,
  sub,
  testId,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  testId: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        data-testid={testId}
        className={cn(
          'truncate text-sm font-semibold tabular sm:text-base',
          tone === 'good' && 'text-good',
          tone === 'bad' && 'text-critical',
        )}
      >
        {value}
      </div>
      {sub && <div className="truncate text-xs text-muted-foreground tabular">{sub}</div>}
    </div>
  );
}

/** Live counters (TM-11), the chart (TM-10, TM-14, TM-18), the player and the holdings race (TM-17). */
export function Stage({
  sim,
  benchmarks,
  currency,
  view,
  onView,
  events,
  pos,
  playing,
  speed,
  reduced,
  toast,
  onCloseToast,
  onToggle,
  onJump,
  onSpeed,
}: {
  sim: Simulation;
  benchmarks: readonly Benchmark[];
  currency: Currency;
  view: View;
  onView: (v: View) => void;
  events: MarketEvent[];
  pos: number;
  playing: boolean;
  speed: Speed;
  reduced: boolean;
  toast?: string;
  onCloseToast: () => void;
  onToggle: () => void;
  onJump: (k: number) => void;
  onSpeed: (s: Speed) => void;
}) {
  const theme = useChartTheme();
  const accent = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--tool-accent').trim() || '#4f46e5',
    // Re-read with the chart theme when the system theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
  const lines: Line[] = [sim.portfolio, ...sim.benchmarks];
  const growth = useMemo(() => new Map(lines.map((l) => [l.id, twr(l)])), [sim]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out: Record<string, number | null>[] = [];
    for (let k = 0; k <= sim.months; k++) {
      const row: Record<string, number | null> = { k };
      for (const l of [sim.portfolio, ...sim.benchmarks])
        row[l.id] = k > pos ? null : view === 'growth' ? growth.get(l.id)![k] : l.values[k];
      out.push(row);
    }
    return out;
  }, [sim, pos, view, growth]);

  // A fixed scale for the whole run, so the chart does not jump while it plays.
  const domain = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of lines)
      for (const v of view === 'growth' ? growth.get(l.id)! : l.values) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    const pad = (hi - lo) * 0.04;
    return [Math.max(0, lo - pad), hi + pad] as [number, number];
  }, [sim, view, growth]); // eslint-disable-line react-hooks/exhaustive-deps
  const port = sim.portfolio;
  const m = metrics(port, sim.startMonth, pos);
  const value = port.values[pos];
  const ticks = useMemo(() => {
    const years: number[] = [];
    for (let k = 0; k <= sim.months; k++) if (pointMonth(sim, k + 1) % 12 === 0) years.push(k);
    const every = Math.max(1, Math.ceil(years.length / 8));
    return years.filter((_, i) => i % every === 0);
  }, [sim]);
  const bands = events.flatMap((e) => {
    const from = monthIndex(e.from) - sim.startMonth;
    const to = monthIndex(e.to) - sim.startMonth + 1;
    if (to < 0 || from > sim.months) return [];
    return [{ e, x1: Math.max(0, from), x2: Math.min(sim.months, to) }];
  });
  const fmt = (v: number) => (view === 'growth' ? String(Math.round(v)) : money(v, currency, true));
  const holdings = sim.holdings
    .map((h) => ({ name: h.name, value: h.values[pos] }))
    .sort((a, b) => b.value - a.value);
  const maxHolding = Math.max(1, ...holdings.map((h) => h.value));

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-surface-2 px-3 py-2 sm:grid-cols-3"
        aria-label={t('Live counters')}
      >
        <Counter label={t('Date')} testId="tm-date" value={monthText(pointMonth(sim, Math.max(1, pos)))} />
        <Counter label={t('Portfolio value')} testId="tm-value" value={money(value, currency)} />
        <Counter
          label={t('Gain')}
          testId="tm-gain"
          value={`${m.gain < 0 ? '−' : '+'}${money(Math.abs(m.gain), currency)}`}
          sub={pct(m.gainPct, 1, true)}
          tone={m.gain >= 0 ? 'good' : 'bad'}
        />
        <Counter label={t('Yearly return so far')} testId="tm-yearly" value={pct(m.yearly)} />
        <Counter label={t('Fall from the peak')} testId="tm-fall" value={pct(fallFromPeak(port, pos), 1)} />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{t('Lead or lag')}</div>
          {sim.benchmarks.length === 0 && <div className="text-sm text-subtle">—</div>}
          {sim.benchmarks.map((b) => {
            const d = value - b.values[pos];
            return (
              <div key={b.id} className="truncate text-xs tabular" data-testid="tm-lead">
                <span className={d >= 0 ? 'text-good' : 'text-critical'}>
                  {d >= 0
                    ? t('{amount} ahead', { amount: money(d, currency, true) })
                    : t('{amount} behind', { amount: money(-d, currency, true) })}
                </span>{' '}
                <span className="text-muted-foreground">
                  {t('vs {name}', { name: lineLabel(b, benchmarks) })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <figure className="m-0" aria-label={t('Time Machine chart')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={t('Legend')}>
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded"
                  style={{
                    background: lineColor(l, theme.series, accent),
                    height: l.kind === 'portfolio' ? 3 : 2,
                  }}
                  aria-hidden
                />
                {lineLabel(l, benchmarks)}
              </li>
            ))}
          </ul>
          <Segmented
            label={t('Chart shows')}
            value={view}
            onChange={onView}
            options={[
              { value: 'value', label: t('Value') },
              { value: 'growth', label: t('Growth (start = 100)') },
            ]}
          />
        </div>
        <div className="relative mt-2 h-[280px] lg:h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              {bands.map(({ e, x1, x2 }) => (
                <ReferenceArea
                  key={e.id}
                  x1={x1}
                  x2={x2}
                  fill={theme.critical}
                  fillOpacity={0.08}
                  label={
                    x2 - x1 >= Math.max(12, sim.months * 0.08)
                      ? { value: e.name, position: 'insideTopLeft', fontSize: 11, fill: theme.text }
                      : undefined
                  }
                />
              ))}
              <XAxis
                dataKey="k"
                type="number"
                domain={[0, sim.months]}
                ticks={ticks}
                tickFormatter={(k: number) => String(Math.floor(pointMonth(sim, k + 1) / 12))}
                tick={axisTick(theme)}
                stroke={theme.axis}
              />
              <YAxis
                width={64}
                tick={axisTick(theme)}
                stroke={theme.axis}
                tickFormatter={fmt}
                domain={domain}
                allowDataOverflow
              />
              <Tooltip
                isAnimationActive={false}
                labelFormatter={(k) => pointLabel(sim, Number(k))}
                formatter={(v, id) => [
                  fmt(Number(v)),
                  lineLabel(lines.find((l) => l.id === id) ?? port, benchmarks),
                ]}
                contentStyle={{ background: theme.surface, borderColor: theme.grid, fontSize: 12 }}
              />
              {pos < sim.months && <ReferenceLine x={pos} stroke={theme.text} strokeDasharray="3 3" />}
              {lines.map((l) => (
                <ChartLine
                  key={l.id}
                  dataKey={l.id}
                  type="linear"
                  dot={false}
                  isAnimationActive={false}
                  stroke={lineColor(l, theme.series, accent)}
                  strokeWidth={l.kind === 'portfolio' ? 2.5 : 1.75}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {toast && (
            <div
              role="status"
              className="absolute top-2 left-[72px] z-10 flex max-w-[80%] items-start gap-2 rounded-md border bg-surface/95 px-3 py-1.5 text-sm shadow-md"
            >
              <span>{toast}</span>
              <button
                type="button"
                aria-label={t('Close the banner')}
                className="text-muted-foreground"
                onClick={onCloseToast}
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      </figure>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Player')}>
        <Button size="icon" variant="ghost" aria-label={t('Back to the start')} onClick={() => onJump(0)}>
          <RotateCcw />
        </Button>
        <Button
          className={cn('h-10 px-5 text-base', accentButton)}
          aria-label={playing ? t('Pause') : t('Play')}
          disabled={reduced}
          title={
            reduced
              ? t('Animation is off because your device asks for reduced motion; use the slider.')
              : undefined
          }
          onClick={onToggle}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? t('Pause') : t('Play')}
        </Button>
        <input
          type="range"
          aria-label={t('Playback month')}
          aria-valuetext={pointLabel(sim, pos)}
          min={0}
          max={sim.months}
          step={1}
          value={pos}
          onChange={(e) => onJump(Number(e.target.value))}
          className="min-w-40 flex-1 accent-[var(--tool-accent)]"
        />
        <Segmented
          label={t('Speed')}
          value={speed}
          onChange={onSpeed}
          options={[
            { value: 'slow', label: t('Slow') },
            { value: 'normal', label: t('Normal') },
            { value: 'fast', label: t('Fast') },
          ]}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('Jump to the end')}
          onClick={() => onJump(sim.months)}
        >
          <SkipForward />
        </Button>
      </div>

      {holdings.length > 1 && (
        <div aria-label={t('Holdings race')} role="group">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t('Holdings, by value now')}</h3>
          <ol className="flex flex-col gap-1">
            {holdings.map((h) => (
              <li key={h.name} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 font-semibold">{tickerText(h.name)}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-surface-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-tool-accent/70 motion-safe:transition-[width] motion-safe:duration-150"
                    style={{ width: `${(h.value / maxHolding) * 100}%` }}
                  />
                </span>
                <span className="w-32 shrink-0 text-right tabular">
                  {money(h.value, currency, true)} · {pct(h.value / Math.max(1e-9, value), 0)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';

export interface ChartTheme {
  series: string[];
  grid: string;
  axis: string;
  muted: string;
  text: string;
  /** Axis tick labels (UI-9). */
  tick: string;
  surface: string;
  good: string;
  critical: string;
}

function read(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim() || '#888';
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    grid: v('--grid'),
    axis: v('--axis'),
    muted: v('--subtle'),
    text: v('--muted-foreground'),
    tick: v('--chart-tick'),
    surface: v('--surface'),
    good: v('--good-mark'),
    critical: v('--critical'),
  };
}

/** Chart colors from CSS tokens, re-read when the system theme changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setTheme(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return theme;
}

/** Tick text: 12 px in the tick token, so it never picks up the faint axis colour (UI-9). */
export const axisTick = (theme: ChartTheme) => ({ fill: theme.tick, fontSize: 12 });

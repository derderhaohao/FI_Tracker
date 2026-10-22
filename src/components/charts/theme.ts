import { useEffect, useState } from 'react';

export interface ChartTheme {
  series: string[];
  grid: string;
  axis: string;
  muted: string;
  text: string;
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

export const axisTick = (theme: ChartTheme) => ({ fill: theme.muted, fontSize: 11 });

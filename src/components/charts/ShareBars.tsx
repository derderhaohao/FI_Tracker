import { pct, twdCompact } from '@/lib/format';
import { useChartTheme } from './theme';

export interface ShareRow {
  label: string;
  value: number;
  /** Optional target share, drawn as a tick. */
  target?: number;
}

/** Horizontal share bars (one series, one color), value at the tip. */
export function ShareBars({ rows, ariaLabel }: { rows: ShareRow[]; ariaLabel: string }) {
  const theme = useChartTheme();
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  if (total <= 0) return <p className="text-sm text-muted-foreground">No balances yet.</p>;
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const share = Math.max(0, r.value) / total;
        return (
          <li
            key={r.label}
            className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
            title={`${r.label}: ${twdCompact(r.value)}`}
          >
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="relative h-3 rounded-sm bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{ width: `${share * 100}%`, background: theme.series[0] }}
              />
              {r.target !== undefined && (
                <span
                  className="absolute -inset-y-1 w-0.5 bg-foreground"
                  style={{ left: `calc(${Math.min(1, r.target) * 100}% - 1px)` }}
                  aria-label={`Target ${pct(r.target, 0)}`}
                />
              )}
            </span>
            <span className="text-right whitespace-nowrap tabular">
              {pct(share, 0)} <span className="text-subtle">· {twdCompact(r.value)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import { pct, twdCompact } from '@/lib/format';
import { useChartTheme } from './theme';
import { t } from '@/i18n';

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
  if (total <= 0) return <p className="text-sm text-muted-foreground">{t('No balances yet.')}</p>;
  const hasTarget = rows.some((r) => r.target !== undefined);
  return (
    <>
      <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const share = Math.max(0, r.value) / total;
          return (
            <li
              key={r.label}
              // Label 96 px · bar (at least 120 px) · value (UI-10).
              className="grid grid-cols-[6rem_minmax(7.5rem,1fr)_auto] items-center gap-3 text-sm"
              title={
                r.target !== undefined
                  ? t('{label}: {share}, target {target}', {
                      label: r.label,
                      share: pct(share, 0),
                      target: pct(r.target, 0),
                    })
                  : `${r.label}: ${twdCompact(r.value)}`
              }
            >
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="relative h-2 rounded-sm bg-surface-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${share * 100}%`, background: theme.series[0] }}
                />
                {r.target !== undefined && (
                  <span
                    className="absolute -top-[3px] h-3.5 w-0.5 bg-foreground"
                    style={{ left: `calc(${Math.min(1, r.target) * 100}% - 1px)` }}
                    aria-label={t('Target {target}', { target: pct(r.target, 0) })}
                  />
                )}
              </span>
              <span className="text-right leading-tight whitespace-nowrap tabular">
                {pct(share, 0)}
                <span className="block text-xs text-muted-foreground">{twdCompact(r.value)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {hasTarget && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3.5 w-0.5 bg-foreground" aria-hidden /> {t('Target share')}
        </p>
      )}
    </>
  );
}

import { Fragment, memo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { BASE_CURRENCY } from '@/domain/fx';
import { formatMoney } from '@/domain/money';
import type { PlaybackPath } from '@/domain/playback/engine';
import { groupRows, type Grouping } from '@/domain/playback/analysis';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/misc';
import { toCsv } from '@/io/csv';
import { downloadText } from '@/lib/download';
import { twdCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

function Change({ now, then, flash = false }: { now: number; then: number | undefined; flash?: boolean }) {
  if (then === undefined) return <span className="text-subtle">—</span>;
  const d = now - then;
  if (Math.abs(d) < 1) return <span className="text-subtle">0</span>;
  const pct = Math.abs(then) > 1 ? d / Math.abs(then) : undefined;
  const big = flash && pct !== undefined && Math.abs(pct) > 0.05;
  return (
    <span className={cn(big && (d > 0 ? 'font-semibold text-good' : 'font-semibold text-critical'))}>
      {d > 0 ? '▲ +' : '▼ −'}
      {twdCompact(Math.abs(d))}
      {pct !== undefined && <span className="ml-1 text-xs">({(Math.abs(pct) * 100).toFixed(1)}%)</span>}
    </span>
  );
}

/**
 * The live table (PB-30 to PB-35): one row per group plus Total, values at the playhead,
 * with changes this month, since the current event started and since today.
 */
export const PlaybackTable = memo(function PlaybackTable({
  path,
  month,
  grouping,
  nominal,
  eventStart,
  fxNow,
}: {
  path: PlaybackPath;
  month: number;
  grouping: Grouping;
  nominal: boolean;
  eventStart?: number;
  /** TWD per unit of each foreign currency at a month, in nominal terms. */
  fxNow: (currency: string, m: number) => number | undefined;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState(false);
  const m = Math.max(0, Math.min(path.months, Math.round(month)));
  const k = (x: number) => (nominal ? path.inflationIndex[x] : 1);
  const rowsAt = (x: number) => new Map(groupRows(path, x, grouping).map((r) => [r.key, r]));
  const now = groupRows(path, m, grouping);
  const prev = m > 0 ? rowsAt(m - 1) : undefined;
  const ev = eventStart !== undefined && eventStart <= m ? rowsAt(eventStart) : undefined;
  const start = rowsAt(0);
  const native = (twdReal: number, currency: string, x: number) => {
    if (currency === BASE_CURRENCY) return undefined;
    const rate = fxNow(currency, x);
    return rate
      ? formatMoney((twdReal * path.inflationIndex[x]) / rate, currency, { compact: true })
      : undefined;
  };

  if (history) {
    const years: number[] = [];
    for (let x = 0; x <= m; x += 12) years.push(x);
    if (years.at(-1) !== m) years.push(m);
    const keys = [
      ...new Set(years.flatMap((x) => groupRows(path, x, grouping).map((r) => `${r.key}|${r.label}`))),
    ];
    const series = years.map((x) => {
      const g = rowsAt(x);
      return {
        age: (path.startAge + x / 12).toFixed(1),
        total: path.total[x] * k(x),
        investable: path.investable[x] * k(x),
        ...Object.fromEntries(
          keys.map((kk) => [kk.split('|')[1], (g.get(kk.split('|')[0])?.value ?? 0) * k(x)]),
        ),
      };
    });
    return (
      <div>
        <div className="mb-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setHistory(false)}>
            {t('Show the playhead month')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              downloadText(
                'fi-tracker-playback.csv',
                toCsv(
                  series.map((r) =>
                    Object.fromEntries(
                      Object.entries(r).map(([a, b]) => [a, typeof b === 'number' ? Math.round(b) : b]),
                    ),
                  ),
                ),
                'text/csv',
              )
            }
          >
            <Download aria-hidden /> {t('Export CSV')}
          </Button>
        </div>
        <Table>
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface">{t('Age')}</th>
              <th className="text-right">{t('Total')}</th>
              <th className="text-right">{t('Investments')}</th>
              {keys.map((kk) => (
                <th key={kk} className="text-right">
                  {kk.split('|')[1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.age}>
                <td className="sticky left-0 bg-surface">{r.age}</td>
                <td className="text-right">{twdCompact(r.total)}</td>
                <td className="text-right">{twdCompact(r.investable)}</td>
                {keys.map((kk) => (
                  <td key={kk} className="text-right">
                    {twdCompact((r as Record<string, number | string>)[kk.split('|')[1]] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  const total = path.total[m] * k(m);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setHistory(true)}>
          {t('Show history')}
        </Button>
      </div>
      <Table aria-label={t('Asset groups at the playhead')}>
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface">{t('Group')}</th>
            <th className="text-right">{t('Value now')}</th>
            <th className="text-right">{t('This month')}</th>
            <th className="text-right">{t('Since this event began')}</th>
            <th className="text-right">{t('Since today')}</th>
          </tr>
        </thead>
        <tbody>
          {now.map((r) => {
            const isOpen = open.has(r.key);
            return (
              <Fragment key={r.key}>
                <tr>
                  <td className="sticky left-0 bg-surface">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpen(
                          (s) => new Set(s.has(r.key) ? [...s].filter((x) => x !== r.key) : [...s, r.key]),
                        )
                      }
                    >
                      {isOpen ? (
                        <ChevronDown className="size-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="size-3.5" aria-hidden />
                      )}
                      {r.label}
                    </button>
                    {grouping === 'currency' && native(r.value, r.key, m) && (
                      <div className="text-xs text-subtle">{native(r.value, r.key, m)}</div>
                    )}
                  </td>
                  <td className="text-right font-medium">{twdCompact(r.value * k(m))}</td>
                  <td className="text-right">
                    <Change
                      now={r.value * k(m)}
                      then={prev ? (prev.get(r.key)?.value ?? 0) * k(m - 1) : undefined}
                    />
                  </td>
                  <td className="text-right">
                    <Change
                      now={r.value * k(m)}
                      then={ev ? (ev.get(r.key)?.value ?? 0) * k(eventStart!) : undefined}
                    />
                  </td>
                  <td className="text-right">
                    <Change now={r.value * k(m)} then={(start.get(r.key)?.value ?? 0) * k(0)} />
                  </td>
                </tr>
                {isOpen &&
                  r.accounts.map((a) => (
                    <tr key={`${r.key}:${a.id}`} className="text-xs">
                      <td className="sticky left-0 bg-surface pl-6 text-muted-foreground">
                        {a.name}
                        {native(a.value, a.currency, m) && (
                          <span className="ml-1 text-subtle">({native(a.value, a.currency, m)})</span>
                        )}
                      </td>
                      <td className="text-right">{twdCompact(a.value * k(m))}</td>
                      <td />
                      <td />
                      <td />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
          <tr className="font-semibold">
            <td className="sticky left-0 bg-surface">{t('Total net worth')}</td>
            <td className="text-right">{twdCompact(total)}</td>
            <td className="text-right">
              <Change flash now={total} then={m > 0 ? path.total[m - 1] * k(m - 1) : undefined} />
            </td>
            <td className="text-right">
              <Change
                now={total}
                then={
                  eventStart !== undefined && eventStart <= m
                    ? path.total[eventStart] * k(eventStart)
                    : undefined
                }
              />
            </td>
            <td className="text-right">
              <Change now={total} then={path.total[0]} />
            </td>
          </tr>
        </tbody>
      </Table>
      <p className="mt-1 text-xs text-subtle">
        {t(
          '▲ ▼ mark the direction; bold marks a move over 5% in a month. Amounts in TWD; foreign holdings also show their own currency.',
        )}
      </p>
    </div>
  );
});

import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented, Table } from '@/components/ui/misc';
import { downloadText } from '@/lib/download';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import {
  calendarYears,
  metrics,
  monthName,
  toCsv,
  twr,
  type Benchmark,
  type Currency,
  type Simulation,
} from './engine';
import { lineLabel, money, monthText, pct } from './labels';
import type { SavedScenario } from './state';

type Tab = 'results' | 'years' | 'saved';

export interface Compared {
  name: string;
  sim?: Simulation;
  benchmarks: readonly Benchmark[];
  currency: Currency;
}

/** Results (TM-12), calendar years and CSV (TM-19), saved scenarios and compare (TM-23). */
export function ResultsPanel({
  sim,
  benchmarks,
  currency,
  saved,
  compare,
  onSave,
  onOpen,
  onDelete,
  onCompare,
}: {
  sim: Simulation;
  benchmarks: readonly Benchmark[];
  currency: Currency;
  saved: SavedScenario[];
  compare: Compared[];
  onSave: (name: string) => void;
  onOpen: (i: number) => void;
  onDelete: (i: number) => void;
  onCompare: (picked: number[]) => void;
}) {
  const [tab, setTab] = useState<Tab>('results');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const lines = [sim.portfolio, ...sim.holdings.filter(() => sim.holdings.length > 1), ...sim.benchmarks];
  const label = (id: string) =>
    lineLabel(
      lines.find((l) => l.id === id)!,
      benchmarks,
    );
  const years = lines.map((l) => ({ id: l.id, years: calendarYears(twr(l), sim.startMonth) }));
  const yearList = years[0]?.years ?? [];
  // The currency effect column only when some line is priced in another currency (TW-9).
  const showFx = lines.some((l) => l.fxEffect);
  const fallDates = (k: number) => monthText(sim.startMonth + k - 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label={t('Results view')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'results', label: t('Results') },
            { value: 'years', label: t('Calendar years') },
            { value: 'saved', label: t('Saved and compare') },
          ]}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadText(
              `time-machine-${monthName(sim.startMonth)}.csv`,
              toCsv(sim, Object.fromEntries(lines.map((l) => [l.id, label(l.id)]))),
              'text/csv',
            )
          }
        >
          <Download aria-hidden /> {t('Export CSV')}
        </Button>
      </div>

      {tab === 'results' && (
        <Table aria-label={t('Results')}>
          <thead>
            <tr>
              <th>{t('Line')}</th>
              <th className="text-right">{t('Final value')}</th>
              <th className="text-right">{t('Gain')}</th>
              <th className="text-right">{t('Yearly return')}</th>
              <th className="text-right">{t('Worst fall')}</th>
              <th className="text-right">{t('Months to recover')}</th>
              <th className="text-right">{t('Best year')}</th>
              <th className="text-right">{t('Worst year')}</th>
              <th className="text-right">{t('Volatility')}</th>
              {showFx && (
                <th
                  className="text-right"
                  title={t('Gain in the scenario currency less the gain in local currency')}
                >
                  {t('From exchange rates')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const m = metrics(l, sim.startMonth);
              return (
                <tr key={l.id} className={cn(l.kind === 'portfolio' && 'font-medium')}>
                  <td className="min-w-32">{label(l.id)}</td>
                  <td className="text-right whitespace-nowrap">
                    {money(m.final, currency)}
                    {l.afterSelling !== undefined && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {t('{amount} after selling', { amount: money(l.afterSelling, currency) })}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      'text-right whitespace-nowrap',
                      m.gain >= 0 ? 'text-good' : 'text-critical',
                    )}
                  >
                    {pct(m.gainPct, 1, true)}
                  </td>
                  <td className="text-right">{pct(m.yearly)}</td>
                  <td className="text-right whitespace-nowrap">
                    {m.fall.depth < 0 ? (
                      <>
                        {pct(m.fall.depth)}
                        <div className="text-xs font-normal whitespace-nowrap text-muted-foreground">
                          {fallDates(m.fall.peak)} – {fallDates(m.fall.trough)}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right">
                    {m.fall.depth >= 0 ? '—' : m.fall.recovery !== undefined ? m.fall.recovery : t('Not yet')}
                  </td>
                  {/* Value on the first line, the year on the second (UI-16). */}
                  {[m.best, m.worst].map((y, i) => (
                    <td key={i} className="text-right whitespace-nowrap">
                      {y ? (
                        <>
                          {pct(y.ret, 0, true)}
                          <div className="text-xs font-normal text-muted-foreground">{y.year}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  ))}
                  <td className="text-right">{pct(m.volatility)}</td>
                  {showFx && (
                    <td
                      className={cn(
                        'text-right',
                        (l.fxEffect ?? 0) > 0 ? 'text-good' : (l.fxEffect ?? 0) < 0 ? 'text-critical' : '',
                      )}
                    >
                      {l.fxEffect
                        ? `${l.fxEffect < 0 ? '−' : '+'}${money(Math.abs(l.fxEffect), currency)}`
                        : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {tab === 'years' && (
        <Table aria-label={t('Calendar years')}>
          <thead>
            <tr>
              <th>{t('Year')}</th>
              {lines.map((l) => (
                <th key={l.id} className="text-right">
                  {label(l.id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearList.map((y, i) => (
              <tr key={y.year}>
                <td>
                  {y.year}
                  {y.partial && <span className="text-xs text-muted-foreground"> {t('(part)')}</span>}
                </td>
                {years.map((l) => {
                  const r = l.years[i]?.ret;
                  return (
                    <td
                      key={l.id}
                      className={cn(
                        'text-right',
                        r !== undefined && (r >= 0 ? 'text-good' : 'text-critical'),
                      )}
                    >
                      {pct(r, 1, true)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {tab === 'saved' && (
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                onSave(name.trim());
                setName('');
              }
            }}
          >
            <Input
              aria-label={t('Scenario name')}
              placeholder={t('Name this scenario')}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!name.trim()}>
              {t('Save')}
            </Button>
          </form>
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Saved scenarios stay on this device only.')}</p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label={t('Saved scenarios')}>
              {saved.map((s, i) => (
                <li
                  key={`${s.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--tool-accent)]"
                    aria-label={t('Compare {name}', { name: s.name })}
                    checked={picked.includes(i)}
                    disabled={!picked.includes(i) && picked.length >= 2}
                    onChange={(e) => {
                      const next = e.target.checked ? [...picked, i] : picked.filter((x) => x !== i);
                      setPicked(next);
                      onCompare(next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => onOpen(i)}>
                    {t('Open')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('Delete {name}', { name: s.name })}
                    onClick={() => {
                      setPicked([]);
                      onCompare([]);
                      onDelete(i);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {compare.length === 2 && (
            <div className="grid gap-3 sm:grid-cols-2" aria-label={t('Side by side')}>
              {compare.map((c, i) => {
                const m = c.sim && metrics(c.sim.portfolio, c.sim.startMonth);
                const b = c.sim?.benchmarks[0];
                const mb = b && c.sim && metrics(b, c.sim.startMonth);
                return (
                  <div key={i} className="rounded-md border p-3 text-sm">
                    <h3 className="font-semibold">{c.name}</h3>
                    {!c.sim || !m ? (
                      <p className="text-muted-foreground">{t('Loading…')}</p>
                    ) : (
                      <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 tabular">
                        <dt className="text-muted-foreground">{t('Period')}</dt>
                        <dd>
                          {monthText(c.sim.startMonth)} – {monthText(c.sim.startMonth + c.sim.months - 1)}
                        </dd>
                        <dt className="text-muted-foreground">{t('Final value')}</dt>
                        <dd>{money(m.final, c.currency)}</dd>
                        <dt className="text-muted-foreground">{t('Yearly return')}</dt>
                        <dd>{pct(m.yearly)}</dd>
                        <dt className="text-muted-foreground">{t('Worst fall')}</dt>
                        <dd>{pct(m.fall.depth)}</dd>
                        {b && mb && (
                          <>
                            <dt className="text-muted-foreground">{lineLabel(b, c.benchmarks)}</dt>
                            <dd>
                              {money(mb.final, c.currency)} · {pct(mb.yearly)}
                            </dd>
                          </>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

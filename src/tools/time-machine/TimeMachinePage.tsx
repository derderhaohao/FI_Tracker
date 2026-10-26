import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Hourglass, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Notice } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { getLang, t, useLang } from '@/i18n';
import {
  effectiveStart,
  lateListings,
  monthIndex,
  needsFx,
  simulate,
  twr,
  type Currency,
  type MarketData,
  type Scenario,
  type Series,
  type Simulation,
} from './engine';
import type { PriceIndex } from './format';
import { loadFx, loadIndex, loadSeries } from './data';
import { marketEvents } from './events';
import { accentButton } from './fields';
import { benchmarkLabel, money, monthText, pct } from './labels';
import { tickerText } from './search';
import { BenchmarksPanel } from './BenchmarksPanel';
import { ResultsPanel, type Compared } from './ResultsPanel';
import { SetupPanel } from './SetupPanel';
import { Stage, type View } from './Stage';
import {
  convertAmount,
  decodeScenario,
  defaultScenario,
  encodeScenario,
  loadLast,
  loadSaved,
  saveLast,
  storeSaved,
  upgradeLegacy,
  weightTotal,
  type SavedScenario,
} from './state';
import { usePlayer } from './usePlayer';

const tickersOf = (s: Scenario) => [
  ...s.holdings.map((h) => h.ticker),
  ...s.benchmarks.flatMap((b) => (b.kind === 'ticker' ? [b.ticker] : [])),
];

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Investment Time Machine (PRD Part B): a standalone "what if I had invested?" tool. It reads
 * market history only, never the FI Tracker's data (TM-3).
 */
export function TimeMachinePage() {
  useLang();
  const [params, setParams] = useSearchParams();
  const [index, setIndex] = useState<PriceIndex>();
  const [error, setError] = useState(false);
  const [scenario, setScenario] = useState<Scenario>();
  const [series, setSeries] = useState<ReadonlyMap<string, Series>>(new Map());
  const [failed, setFailed] = useState<string[]>([]);
  const [fx, setFx] = useState<MarketData['fx']>();
  const [view, setView] = useState<View>('value');
  // On phones, setup folds to one line once a run has started (UI-16).
  const [setupFolded, setSetupFolded] = useState(false);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [toast, setToast] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [reduced] = useState(reducedMotion);

  useEffect(() => {
    loadIndex()
      .then((i) => {
        setIndex(i);
        const fromLink = params.get('s');
        setScenario(
          (fromLink && decodeScenario(fromLink, i.asOf)) ||
            loadLast(i.asOf) ||
            defaultScenario(i.asOf, getLang() === 'zh-TW' ? 'TWD' : 'USD'),
        );
        setSaved(loadSaved(i.asOf));
      })
      .catch(() => setError(true));
    // Read the link once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** TWD per USD at the latest month, for converting amounts when the currency changes. */
  const latestRate = fx ? fx.v[fx.v.length - 1] : 30;
  const currencyOf = useCallback(
    (ticker: string): Currency => index?.tickers.find((e) => e.t === ticker)?.c ?? 'USD',
    [index],
  );
  const withCurrency = useCallback(
    (s: Scenario, c: Currency): Scenario =>
      c === s.currency
        ? s
        : {
            ...s,
            currency: c,
            amount: convertAmount(s.amount, s.currency, c, latestRate),
            topUp: convertAmount(s.topUp, s.currency, c, latestRate),
          },
    [latestRate],
  );

  const update = useCallback(
    (next: Scenario) => {
      // Until the user picks a currency, it follows the first holding (TW-3).
      const first = next.holdings[0] && currencyOf(next.holdings[0].ticker);
      const s = !next.currencyPicked && first && index?.fx ? withCurrency(next, first) : next;
      setScenario(s);
      saveLast(s);
      setParams({ s: encodeScenario(s) }, { replace: true });
    },
    [setParams, currencyOf, withCurrency, index],
  );
  const onCurrency = useCallback(
    (c: Currency) => scenario && update({ ...withCurrency(scenario, c), currencyPicked: true }),
    [scenario, update, withCurrency],
  );

  // Links made before Part C (TW-10): USD ones open unchanged; TWD ones convert their amounts.
  const upgrade = useCallback(
    (s: Scenario) =>
      upgradeLegacy(
        s,
        fx && fx.v[Math.min(fx.v.length - 1, Math.max(0, monthIndex(s.start) - 1 - fx.first))],
      ),
    [fx],
  );
  // Upgraded as soon as the rate is known; the link itself updates with the next change.
  if (scenario && !scenario.v && (scenario.currency === 'USD' || fx)) setScenario(upgrade(scenario));

  // Load every ticker the scenario and the compared scenarios use (TM-4).
  const compareScenarios = picked.map((i) => saved[i]).filter(Boolean);
  const needed = [
    ...new Set(
      [scenario, ...compareScenarios.map((c) => c.scenario)].flatMap((s) => (s ? tickersOf(s) : [])),
    ),
  ];
  const neededKey = needed.join(',');
  useEffect(() => {
    if (!index) return;
    for (const tk of neededKey.split(',').filter(Boolean)) {
      if (series.has(tk)) continue;
      if (!index.tickers.some((e) => e.t === tk)) continue;
      loadSeries(tk)
        .then((s) => setSeries((prev) => new Map(prev).set(tk, s)))
        .catch(() => setFailed((m) => (m.includes(tk) ? m : [...m, tk])));
    }
  }, [neededKey, index, series]);
  const missing = needed.filter(
    (tk) => (index && !index.tickers.some((e) => e.t === tk)) || failed.includes(tk),
  );
  // Month-end USD/TWD (TW-5): small, so it loads with the index.
  useEffect(() => {
    if (index?.fx) void loadFx().then(setFx);
  }, [index]);

  const dataFor = useCallback(
    (s: Scenario): MarketData | undefined => {
      const map = new Map<string, Series>();
      for (const tk of tickersOf(s)) {
        const x = series.get(tk);
        if (!x) return undefined;
        map.set(tk, x);
      }
      if (needsFx(s, { series: map }) && !fx) return undefined;
      return { series: map, fx };
    },
    [series, fx],
  );

  const data = useMemo(() => (scenario ? dataFor(scenario) : undefined), [scenario, dataFor]);
  const valid = !!scenario && scenario.holdings.length > 0 && weightTotal(scenario.holdings) === 100;
  const sim = useMemo<Simulation | undefined>(
    () => (scenario && data && valid ? simulate(scenario, data) : undefined),
    [scenario, data, valid],
  );
  const late = scenario && data ? lateListings(scenario, data) : [];
  const compared = useMemo<Compared[]>(
    () =>
      picked
        .map((i) => saved[i])
        .filter(Boolean)
        .map((c) => {
          const sc = upgrade(c.scenario);
          const d = dataFor(sc);
          return {
            name: c.name,
            sim: d && sc.v && weightTotal(sc.holdings) === 100 ? simulate(sc, d) : undefined,
            benchmarks: sc.benchmarks,
            currency: sc.currency,
          };
        }),
    [picked, saved, dataFor, upgrade],
  );

  // Market-event toasts (TM-18): when the playhead enters a period, and how far it fell by its end.
  const events = useMemo(() => marketEvents(), []);
  const onAdvance = useCallback(
    (from: number, to: number) => {
      if (!sim) return;
      for (const e of events) {
        const first = monthIndex(e.from) - sim.startMonth + 1; // point at the end of its first month
        const last = monthIndex(e.to) - sim.startMonth + 1;
        if (from < first && to >= first && first >= 1) setToast(t('{name} begins', { name: e.name }));
        if (from < last && to >= last && last >= 1) {
          const index = twr(sim.portfolio);
          const startPoint = Math.max(0, first - 1);
          const peak = Math.max(...index.slice(0, startPoint + 1));
          const trough = Math.min(...index.slice(startPoint, last + 1));
          setToast(
            t('{name}: portfolio {pct} from its peak', {
              name: e.name,
              pct: pct(trough / peak - 1, 0, true),
            }),
          );
        }
      }
    },
    [sim, events],
  );
  const player = usePlayer(sim?.months ?? 0, reduced, onAdvance);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // Keyboard: Space plays, arrows move a month (Shift a year), Home and End (TM-10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return;
      if (e.key === ' ' && el?.tagName !== 'BUTTON' && el?.tagName !== 'SUMMARY') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        player.jump(player.pos + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      } else if (e.key === 'Home') player.jump(0);
      else if (e.key === 'End') player.jump(Number.MAX_SAFE_INTEGER);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('Copy this link'), window.location.href);
    }
  };

  const setupSummary = scenario
    ? [
        money(scenario.amount, scenario.currency, true),
        monthText(monthIndex(scenario.start)),
        scenario.holdings.map((h) => `${tickerText(h.ticker)} ${Math.round(h.weight)}`).join(' / '),
        scenario.benchmarks.length
          ? t('vs {names}', { names: scenario.benchmarks.map(benchmarkLabel).join(', ') })
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <div className="flex flex-col gap-4">
      <header className="-mx-4 -mt-6 border-b border-tool-accent/30 bg-tool-accent-bg px-4 py-4 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Hourglass className="size-5 text-tool-accent" aria-hidden />
              {t('Investment Time Machine')}
              <span className="rounded bg-tool-accent px-1.5 py-0.5 text-xs font-medium text-tool-accent-foreground">
                {t('Sandbox')}
              </span>
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground" data-testid="tm-band">
              {t(
                'Standalone tool · Uses market history only. It does not read or change your FI Tracker data.',
              )}
            </p>
          </div>
          {scenario && (
            <Button className={accentButton} onClick={() => void share()}>
              <Link2 aria-hidden /> {copied ? t('Link copied') : t('Copy share link')}
            </Button>
          )}
        </div>
      </header>

      {error && (
        <Notice tone="warning">
          {t(
            'The price data could not be loaded. Check your connection, or try again after the next monthly update.',
          )}
        </Notice>
      )}
      {!error && !index && <p className="text-sm text-muted-foreground">{t('Loading…')}</p>}

      {index && scenario && (
        // Phones: setup, then the stage, then results; desktop: stage beside setup, results full
        // width below both (UI-16).
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <Card>
              <CardContent>
                {missing.length > 0 && (
                  <Notice tone="warning" className="mb-3">
                    {t('No price data for {tickers}. Remove them to see the result.', {
                      tickers: missing.join(', '),
                    })}
                  </Notice>
                )}
                {!valid && (
                  <Notice tone="warning">{t('Set the weights to add up to 100% to see the result.')}</Notice>
                )}
                {valid && !sim && missing.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('Loading prices…')}</p>
                )}
                {sim && sim.months === 0 && (
                  <Notice tone="warning">{t('There is no data for these months yet.')}</Notice>
                )}
                {sim && sim.months > 0 && (
                  <Stage
                    sim={sim}
                    benchmarks={scenario.benchmarks}
                    currency={scenario.currency}
                    view={view}
                    onView={setView}
                    events={events}
                    pos={Math.min(player.pos, sim.months)}
                    playing={player.playing}
                    speed={player.speed}
                    reduced={reduced}
                    toast={toast}
                    onCloseToast={() => setToast(undefined)}
                    onToggle={() => {
                      player.toggle();
                      setSetupFolded(true);
                    }}
                    onJump={player.jump}
                    onSpeed={player.setSpeed}
                  />
                )}
                {sim && data && effectiveStart(scenario, data) !== monthIndex(scenario.start) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('Starts in {month}, when the last holding listed.', {
                      month: monthText(sim.startMonth),
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="order-first min-w-0 lg:sticky lg:top-4 lg:order-none lg:col-start-2 lg:row-start-1">
            {setupFolded && (
              <CardContent className="flex items-center gap-2 lg:hidden">
                <p className="min-w-0 flex-1 truncate text-sm" data-testid="tm-setup-summary">
                  {setupSummary}
                </p>
                <Button size="sm" variant="outline" onClick={() => setSetupFolded(false)}>
                  {t('Edit')}
                </Button>
              </CardContent>
            )}
            <CardContent className={cn('flex flex-col gap-5', setupFolded && 'hidden lg:flex')}>
              <SetupPanel
                scenario={scenario}
                index={index}
                data={{ series, fx }}
                late={late}
                onChange={update}
                onCurrency={onCurrency}
              />
              <BenchmarksPanel scenario={scenario} onChange={update} />
            </CardContent>
          </Card>
          {sim && sim.months > 0 && (
            <Card className="min-w-0 lg:col-span-2">
              <CardContent>
                <ResultsPanel
                  sim={sim}
                  benchmarks={scenario.benchmarks}
                  currency={scenario.currency}
                  saved={saved}
                  compare={compared}
                  onSave={(name) => {
                    const next = [...saved, { name, scenario }];
                    setSaved(next);
                    storeSaved(next);
                  }}
                  onOpen={(i) => update(upgrade(saved[i].scenario))}
                  onDelete={(i) => {
                    const next = saved.filter((_, j) => j !== i);
                    setSaved(next);
                    storeSaved(next);
                    setPicked([]);
                  }}
                  onCompare={setPicked}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {index && (
        <footer className={cn('border-t pt-3 text-xs text-muted-foreground')}>
          <p className="font-medium text-foreground">{t('Past results, not a forecast or advice.')}</p>
          <p className="mt-1">
            {t('Source: {source}. Data to {month}.', {
              source: index.source,
              month: monthText(monthIndex(index.asOf)),
            })}{' '}
            {t(
              'The list holds today’s large companies and funds, so companies that failed or left the index are missing (survivorship bias). Taxes and fees are not included.',
            )}
          </p>
        </footer>
      )}
    </div>
  );
}

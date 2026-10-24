import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, StepBack, StepForward, Undo2, X, Zap } from 'lucide-react';
import type { Severity } from '@/domain/entities';
import { rateFor } from '@/domain/fx';
import {
  activeEvents,
  impactText as moveText,
  milestones,
  recoveryMonth,
  smartPace,
  spanText,
  type Grouping,
} from '@/domain/playback/analysis';
import { impactText, SEVERITY_LABELS } from '@/domain/playback/library';
import { db } from '@/db/db';
import { patch } from '@/db/repo';
import { useAppData } from '@/app/data';
import { useUi } from '@/state/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Notice, Segmented, Table } from '@/components/ui/misc';
import { dateAfterYears, twdCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { EndCard } from './EndCard';
import { EventPalette } from './EventPalette';
import { PlaybackChart, type ChartView } from './PlaybackChart';
import { PlaybackTable } from './PlaybackTable';
import { StoryPicker } from './StoryPicker';
import { usePlayback } from './usePlayback';

type Speed = 'smart' | '1' | '6' | '12' | '60';
const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'smart', label: 'Smart' },
  { value: '1', label: '1 month/s' },
  { value: '6', label: '6 months/s' },
  { value: '12', label: '1 year/s' },
  { value: '60', label: '5 years/s' },
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

interface Banner {
  key: string;
  title: string;
  text: string;
  detail?: string;
}

/** Projection Play mode (PRD "Projection Playback & Scenario Events"). */
export function PlaybackView() {
  const data = useAppData();
  const pb = usePlayback();
  const { path, normal } = pb;
  const valueMode = useUi((s) => s.valueMode);
  const nominal = valueMode === 'nominal';
  const reduced = useReducedMotion();
  const [month, setMonth] = useState(0);
  const [tableMonth, setTableMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('smart');
  const [view, setView] = useState<ChartView>('total');
  const [grouping, setGrouping] = useState<Grouping>('class');
  const [banner, setBanner] = useState<Banner>();
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string>();
  const [pin, setPin] = useState<string>();
  const [sheet, setSheet] = useState(false);
  const [anim, setAnim] = useState({ fadeT: 1, morphT: 1 });
  const monthRef = useRef(0);
  const pausedUntil = useRef(0);
  const pace = useMemo(() => smartPace(path), [path]);
  const ms = useMemo(() => milestones(path), [path]);
  const recoveries = useMemo(
    () =>
      path.events
        .filter((e) => e.source !== 'backdrop' && e.shocks.length)
        .map((e) => ({ e, at: recoveryMonth(path, e) }))
        .filter((r): r is { e: (typeof path.events)[number]; at: number } => r.at !== undefined),
    [path],
  );

  const jump = useCallback(
    (m: number) => {
      const x = Math.max(0, Math.min(path.months, m));
      monthRef.current = x;
      setMonth(x);
      setTableMonth(x);
    },
    [path.months],
  );

  const showEvent = useCallback(
    (m: number) => {
      const e = path.events.find((x) => x.start === m && x.source !== 'backdrop');
      if (!e) return false;
      setBanner({
        key: `${e.uid}-${m}`,
        title: e.def.name,
        text: e.def.story,
        detail: `${impactText(e.def, e.severity, e.lump !== undefined && e.source === 'live' ? e.lump : undefined)} · ${SEVERITY_LABELS[e.severity]} · a hypothetical story, not a forecast`,
      });
      setAnnounce(`Event: ${e.def.name}, age ${Math.floor(path.startAge + m / 12)}`);
      return true;
    },
    [path],
  );

  // The animation loop: the playhead advances by the pace; React state updates at most ~15 times a second.
  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    let lastTable = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now >= pausedUntil.current) {
        const before = monthRef.current;
        const rate = speed === 'smart' ? pace[Math.min(path.months, Math.floor(before))] : Number(speed);
        let next = Math.min(path.months, before + dt * rate);
        for (let m = Math.floor(before) + 1; m <= Math.floor(next); m++) {
          if (showEvent(m) && pb.playback.autoPause) {
            next = m;
            pausedUntil.current = now + 3000;
            break;
          }
          const rec = recoveries.find((r) => r.at === m);
          if (rec)
            setBanner({
              key: `rec-${rec.e.uid}`,
              title: 'Recovered',
              text: `Investments are back to where they were before “${rec.e.def.name}”, after ${spanText(rec.at - rec.e.start)}.`,
            });
          const mil = ms.find((x) => x.month === m && x.kind !== 'eventStart' && x.kind !== 'eventEnd');
          if (mil) setAnnounce(`${mil.label}, age ${Math.floor(path.startAge + m / 12)}`);
        }
        monthRef.current = next;
        if (next >= path.months) {
          setMonth(path.months);
          setTableMonth(path.months);
          setPlaying(false);
          setAnnounce('End of the story');
          return;
        }
      }
      if (now - lastPaint > 66) {
        setMonth(monthRef.current);
        lastPaint = now;
      }
      if (now - lastTable > 100) {
        setTableMonth(monthRef.current);
        lastTable = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, speed, pace, path, showEvent, recoveries, ms, pb.playback.autoPause]);

  // Morph the future in 300 ms and fade the old future over 3 s after a live event (LE-3, LE-4).
  useEffect(() => {
    if (!pb.fade) return;
    let raf = 0;
    const tick = (now: number) => {
      const e = now - pb.fade!.at;
      setAnim({ morphT: reduced ? 1 : Math.min(1, e / 300), fadeT: reduced ? 1 : Math.min(1, e / 3000) });
      if (e < 3000 && !reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pb.fade, reduced]);

  const fire = useCallback(
    (id: string, severity: Severity, amount?: number) => {
      const m = Math.floor(monthRef.current);
      const err = pb.fire(id, m, severity, amount);
      setError(err);
      if (!err) {
        if (pb.playback.pauseOnFire) setPlaying(false);
        setAnnounce(
          `Event fired: ${id === 'lump' ? 'one-off amount' : (path.events.find((e) => e.def.id === id)?.def.name ?? id)}, ${dateAfterYears(data.ctx.asOfDate, m / 12)}`,
        );
        setSheet(false);
      }
    },
    [pb, data.ctx.asOfDate, path.events],
  );

  // Keyboard (PB-1, PB-4, LE-6, LE-14).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        pb.undo();
      } else if (e.key === ' ' && !(t.tagName === 'BUTTON')) {
        e.preventDefault();
        if (!reduced) setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        jump(Math.round(monthRef.current) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      } else if (/^[1-6]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const id = pb.playback.favourites[Number(e.key) - 1];
        if (id) fire(id, 'typical');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pb, reduced, jump, fire]);

  const m = Math.round(month);
  const k = (x: number) => (nominal ? path.inflationIndex[x] : 1);
  const change = m > 0 ? path.total[m] * k(m) - path.total[m - 1] * k(m - 1) : 0;
  const changePct =
    m > 0 && Math.abs(path.total[m - 1]) > 1 ? change / Math.abs(path.total[m - 1] * k(m - 1)) : 0;
  const current = activeEvents(path, Math.round(tableMonth)).at(-1);
  const lastLog = pb.log.at(-1);
  const toggleFavourite = (id: string) => {
    const f = pb.playback.favourites;
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(-6);
    void patch(db.settings, 'singleton', { playback: { ...pb.playback, favourites: next } });
  };
  const fxNow = useCallback(
    (currency: string, x: number) => {
      const r0 = rateFor(data.fxRates, currency, data.ctx.asOfDate);
      if (!r0) return undefined;
      const f =
        currency === 'USD' ? path.factorLevels.usd[x] : currency === 'JPY' ? path.factorLevels.jpy[x] : 1;
      return r0 * Math.pow(1 + path.setup.input.fxDrift, x / 12) * f;
    },
    [data.fxRates, data.ctx.asOfDate, path],
  );
  const pins = pb.log.map((l) => ({ month: l.month, label: l.name }));

  const palette = (
    <EventPalette
      custom={pb.custom}
      favourites={pb.playback.favourites}
      onToggleFavourite={toggleFavourite}
      onFire={fire}
      remaining={(id) => pb.remaining(id, monthRef.current)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Notice>
        <strong>One possible story, not a forecast.</strong> Markets follow the story you pick; the Strategy
        Lab's simulated futures show the odds.
      </Notice>
      <Card>
        <CardHeader
          title="Story"
          description="Pick a backdrop and up to 3 events, then press Play. Fire more events live from the palette."
        />
        <CardContent>
          <StoryPicker
            story={pb.story}
            normal={normal}
            custom={pb.custom}
            playback={pb.playback}
            liveEvents={pb.live}
            onChange={(s, keep) => {
              pb.changeStory(s, keep);
              jump(0);
              setPlaying(false);
            }}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="flex flex-col gap-3 p-4">
            <div aria-label="Counters" className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <div>
                <div className="text-xs text-muted-foreground">Date</div>
                <div data-testid="counter-Date" className="font-semibold tabular">
                  {dateAfterYears(data.ctx.asOfDate, m / 12)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Age</div>
                <div data-testid="counter-Age" className="font-semibold tabular">
                  {Math.floor(path.startAge + m / 12)} y {m % 12} m
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total net worth</div>
                <div data-testid="counter-Total net worth" className="font-semibold tabular">
                  {twdCompact(path.total[m] * k(m))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Investments</div>
                <div data-testid="counter-Investments" className="font-semibold tabular">
                  {twdCompact(path.investable[m] * k(m))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">This month</div>
                <div
                  data-testid="counter-This month"
                  className={cn(
                    'font-semibold tabular',
                    change < 0 ? 'text-critical' : change > 0 ? 'text-good' : '',
                  )}
                >
                  {change >= 0 ? '▲ +' : '▼ −'}
                  {twdCompact(Math.abs(change))}{' '}
                  <span className="text-xs">({(Math.abs(changePct) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>

            {banner && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-md border border-primary bg-surface-2 px-3 py-2 text-sm"
              >
                <Zap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{banner.title}</div>
                  <div>{banner.text}</div>
                  {banner.detail && <div className="text-xs text-muted-foreground">{banner.detail}</div>}
                </div>
                <button
                  type="button"
                  aria-label="Close the banner"
                  onClick={() => {
                    setBanner(undefined);
                    pausedUntil.current = 0;
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Chart view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'total', label: 'Total' },
                  { value: 'breakdown', label: 'Breakdown' },
                ]}
              />
              <Segmented
                label="Group by"
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: 'class', label: 'Class' },
                  { value: 'region', label: 'Region' },
                  { value: 'currency', label: 'Currency' },
                ]}
              />
            </div>

            <PlaybackChart
              path={path}
              normal={normal}
              playhead={month}
              view={view}
              grouping={grouping}
              nominal={nominal}
              fade={pb.fade}
              fadeT={anim.fadeT}
              morphT={anim.morphT}
              pins={pins}
            />

            <input
              type="range"
              aria-label="Playhead month"
              min={0}
              max={path.months}
              step={1}
              value={m}
              onChange={(e) => jump(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Restart"
                onClick={() => {
                  jump(0);
                  setBanner(undefined);
                }}
              >
                <RotateCcw />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Back one year" onClick={() => jump(m - 12)}>
                <StepBack />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Back one month" onClick={() => jump(m - 1)}>
                −1 m
              </Button>
              <Button
                aria-label={playing ? 'Pause' : 'Play'}
                disabled={reduced}
                onClick={() => {
                  if (monthRef.current >= path.months) jump(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? 'Pause' : 'Play'}
              </Button>
              <Button size="sm" variant="ghost" aria-label="Forward one month" onClick={() => jump(m + 1)}>
                +1 m
              </Button>
              <Button size="icon" variant="ghost" aria-label="Forward one year" onClick={() => jump(m + 12)}>
                <StepForward />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPlaying(false);
                  jump(path.months);
                }}
              >
                <SkipForward aria-hidden /> Skip to end
              </Button>
              <Select
                aria-label="Speed"
                className="h-8 w-32"
                value={speed}
                onChange={(e) => setSpeed(e.target.value as Speed)}
              >
                {SPEEDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                disabled={!pb.canUndo}
                onClick={pb.undo}
                aria-label="Undo last event"
              >
                <Undo2 aria-hidden /> Undo
              </Button>
              {pb.live.length > 0 && (
                <Button size="sm" variant="ghost" onClick={pb.clearLive}>
                  Clear live events
                </Button>
              )}
              <Button size="sm" variant="outline" className="xl:hidden" onClick={() => setSheet(true)}>
                <Zap aria-hidden /> Events
              </Button>
            </div>
            {reduced && (
              <p className="text-xs text-muted-foreground">
                Animation is off because your device asks for reduced motion; drag the slider to move through
                time.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5" aria-label="Milestones">
              {ms.map((x) => (
                <button
                  key={`${x.kind}-${x.month}-${x.label}`}
                  type="button"
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs hover:bg-surface-2',
                    x.kind === 'runOut' && 'border-critical text-critical',
                  )}
                  onClick={() => {
                    jump(x.month);
                    if (x.kind === 'eventStart') showEvent(x.month);
                  }}
                >
                  {x.label} · {Math.floor(path.startAge + x.month / 12)}
                </button>
              ))}
              {pb.log.map((l) => (
                <span key={l.uid} className="relative">
                  <button
                    type="button"
                    className="rounded-full border border-primary px-2 py-0.5 text-xs text-primary"
                    onClick={() => setPin(pin === l.uid ? undefined : l.uid)}
                  >
                    ● {l.name} · {Math.floor(path.startAge + l.month / 12)}
                  </button>
                  {pin === l.uid && (
                    <span className="absolute top-full left-0 z-20 mt-1 block w-64 rounded-md border bg-surface p-2 text-xs shadow-lg">
                      {moveText(path, l.impact, twdCompact)}
                      <span className="mt-1 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            pb.remove(l.uid);
                            setPin(undefined);
                          }}
                        >
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => jump(l.month)}>
                          Go there
                        </Button>
                      </span>
                    </span>
                  )}
                </span>
              ))}
            </div>
            {lastLog && (
              <p className="text-sm" aria-label="Impact of the last event">
                <span className="rounded-full bg-surface-2 px-2 py-0.5">
                  {lastLog.name}: {moveText(path, lastLog.impact, twdCompact)}
                </span>
              </p>
            )}
            {(error || pb.warning) && <Notice tone="warning">{error ?? pb.warning}</Notice>}
            <div className="sr-only" aria-live="polite">
              {announce}
            </div>
            {m >= path.months && (
              <EndCard
                path={path}
                normal={normal}
                story={pb.story}
                live={pb.live}
                resolveAll={pb.resolveAll}
              />
            )}
          </CardContent>
        </Card>
        <Card className="hidden xl:block">
          <CardHeader
            title="Fire an event"
            description="It starts at the playhead month; everything already played stays as it was."
          />
          <CardContent>{palette}</CardContent>
        </Card>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setSheet(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Fire an event</h2>
              <Button size="icon" variant="ghost" aria-label="Close events" onClick={() => setSheet(false)}>
                <X />
              </Button>
            </div>
            {palette}
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title={`At ${dateAfterYears(data.ctx.asOfDate, Math.round(tableMonth) / 12)}`}
          description={current ? `During “${current.def.name}”` : undefined}
        />
        <CardContent>
          <PlaybackTable
            path={path}
            month={tableMonth}
            grouping={grouping}
            nominal={nominal}
            eventStart={current?.start}
            fxNow={fxNow}
          />
        </CardContent>
      </Card>

      {pb.log.length > 0 && (
        <Card>
          <CardHeader title="Event log" />
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <th>When</th>
                  <th className="text-right">Age</th>
                  <th>Event</th>
                  <th>Severity</th>
                  <th>Impact when fired</th>
                </tr>
              </thead>
              <tbody>
                {pb.log.map((l) => (
                  <tr key={l.uid}>
                    <td>{dateAfterYears(data.ctx.asOfDate, l.month / 12)}</td>
                    <td className="text-right">{Math.floor(path.startAge + l.month / 12)}</td>
                    <td>{l.name}</td>
                    <td>{SEVERITY_LABELS[l.severity]}</td>
                    <td>{moveText(path, l.impact, twdCompact)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

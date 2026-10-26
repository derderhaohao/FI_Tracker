import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, X, Zap } from 'lucide-react';
import type { Severity, StoryEvent } from '@/domain/entities';
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
import { findEvent, impactText, SEVERITY_LABELS } from '@/domain/playback/library';
import { db } from '@/db/db';
import { newId, patch } from '@/db/repo';
import { useAppData } from '@/app/data';
import { useUi } from '@/state/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Notice, Segmented } from '@/components/ui/misc';
import { dateAfterYears, twdCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { AdvancedPanel } from './AdvancedPanel';
import { EndCard } from './EndCard';
import { EventPicker } from './EventPicker';
import { MAX_SCHEDULED } from './pickerModel';
import { EventTrack, type TrackChip } from './EventTrack';
import { PlaybackChart, type ChartView } from './PlaybackChart';
import { plotInsets } from './trackModel';
import { PlaybackTable } from './PlaybackTable';
import { PlayerBar } from './PlayerBar';
import { SPEED_FACTOR, type ScrubTick, type Speed } from './playerModel';
import { StoryCards } from './StoryCards';
import { usePlayback } from './usePlayback';
import { Hint } from './hints';
import { useHints } from './useHints';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const change = () => setOn(mq.matches);
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [query]);
  return on;
}

interface Toast {
  key: string;
  title: string;
  text: string;
  detail?: string;
}

/**
 * Projection Play mode (PRD "Playback UX Redesign", Part A). The stage leads: a result strip,
 * the chart with an overlaid toast, the event timeline and the player bar. Setup sits beside
 * it in three steps (pick a story, add events, play); expert settings are under Advanced.
 */
export function PlaybackView() {
  const data = useAppData();
  const pb = usePlayback();
  const { path, normal } = pb;
  const valueMode = useUi((s) => s.valueMode);
  const nominal = valueMode === 'nominal';
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const wide = useMedia('(min-width: 768px)');
  const [month, setMonth] = useState(0);
  const [tableMonth, setTableMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [view, setView] = useState<ChartView>('total');
  const [grouping, setGrouping] = useState<Grouping>('class');
  const [toast, setToast] = useState<Toast>();
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string>();
  const [picker, setPicker] = useState(false);
  const [card, setCard] = useState('normal');
  const [advanced, setAdvanced] = useState(false);
  const [build, setBuild] = useState(false);
  const [anim, setAnim] = useState({ fadeT: 1, morphT: 1 });
  const hints = useHints();
  const monthRef = useRef(0);
  const pausedUntil = useRef(0);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const storiesRef = useRef<HTMLDivElement>(null);
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
  const scheduled = pb.story.events.filter((e) => e.source === 'scheduled');
  const ageAt = useCallback((m: number) => Math.floor(path.startAge + m / 12), [path.startAge]);

  const jump = useCallback(
    (m: number) => {
      const x = Math.max(0, Math.min(path.months, m));
      monthRef.current = x;
      setMonth(x);
      setTableMonth(x);
    },
    [path.months],
  );

  // Toasts sit over the chart and leave by themselves, so nothing below ever moves (PX-7).
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(undefined), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const showEvent = useCallback(
    (m: number) => {
      const e = path.events.find((x) => x.start === m && x.source !== 'backdrop');
      if (!e) return false;
      setToast({
        key: `${e.uid}-${m}`,
        title: t('{name} starts at {age}', { name: e.def.name, age: ageAt(m) }),
        text: e.def.story,
        detail: t('{def} · {SEVERITY_LABELS} · a hypothetical story, not a forecast', {
          def: impactText(
            e.def,
            e.severity,
            e.lump !== undefined && e.source === 'live' ? e.lump : undefined,
          ),
          SEVERITY_LABELS: SEVERITY_LABELS[e.severity],
        }),
      });
      setAnnounce(t('Event: {name}, age {floor}', { name: e.def.name, floor: ageAt(m) }));
      return true;
    },
    [path, ageAt],
  );

  // The animation loop: the playhead advances by the pace; React state updates at most ~15 times a second.
  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    let lastTable = 0;
    const factor = SPEED_FACTOR[speed];
    const tick = (now: number) => {
      // rAF timestamps can trail performance.now() slightly: never step backwards.
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now);
      if (now >= pausedUntil.current) {
        const before = monthRef.current;
        const rate = pace[Math.max(0, Math.min(path.months, Math.floor(before)))] * factor;
        let next = Math.min(path.months, before + dt * rate);
        for (let m = Math.floor(before) + 1; m <= Math.floor(next); m++) {
          if (showEvent(m) && pb.playback.autoPause) {
            next = m;
            pausedUntil.current = now + 3000;
            break;
          }
          const rec = recoveries.find((r) => r.at === m);
          if (rec)
            setToast({
              key: `rec-${rec.e.uid}`,
              title: t('Recovered'),
              text: t('Investments are back to where they were before “{name}”, after {spanText}.', {
                name: rec.e.def.name,
                spanText: spanText(rec.at - rec.e.start),
              }),
            });
          const mil = ms.find((x) => x.month === m && x.kind !== 'eventStart' && x.kind !== 'eventEnd');
          if (mil) {
            setToast({
              key: `mil-${mil.kind}-${m}`,
              title: mil.label,
              text: t('Age {age}', { age: ageAt(m) }),
            });
            setAnnounce(t('{label}, age {floor}', { label: mil.label, floor: ageAt(m) }));
          }
        }
        monthRef.current = next;
        if (next >= path.months) {
          setMonth(path.months);
          setTableMonth(path.months);
          setPlaying(false);
          setAnnounce(t('End of the story'));
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
  }, [playing, reduced, speed, pace, path, showEvent, recoveries, ms, pb.playback.autoPause, ageAt]);

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

  /** Fires an event at the playhead while playing (PX-3). */
  const fire = useCallback(
    (id: string, severity: Severity, amount?: number) => {
      const m = Math.floor(monthRef.current);
      const err = pb.fire(id, m, severity, amount);
      setError(err);
      if (!err) {
        if (pb.playback.pauseOnFire) setPlaying(false);
        setAnnounce(
          t('Event fired: {v}, {asOfDate}', {
            v: id === 'lump' ? t('one-off amount') : (findEvent(id, pb.custom)?.name ?? id),
            asOfDate: dateAfterYears(data.ctx.asOfDate, m / 12),
          }),
        );
        setPicker(false);
      }
    },
    [pb, data.ctx.asOfDate],
  );

  /** Schedules an event at a start month, before play or while paused (PX-3). */
  const schedule = (id: string, start: number, severity: Severity, amount?: number) => {
    if (scheduled.length >= MAX_SCHEDULED) {
      setError(t('Up to 3 scheduled events; fire more live while it plays.'));
      return;
    }
    const ev: StoryEvent = { uid: newId(), eventId: id, start, severity, source: 'scheduled', amount };
    pb.changeStory({ ...pb.story, events: [...pb.story.events, ev] }, true);
    setError(undefined);
    setPicker(false);
    setAnnounce(
      t('{name} added at age {age}', {
        name: id === 'lump' ? t('one-off amount') : (findEvent(id, pb.custom)?.name ?? id),
        age: ageAt(start),
      }),
    );
  };

  const moveScheduled = (uid: string, start: number) =>
    pb.changeStory(
      { ...pb.story, events: pb.story.events.map((e) => (e.uid === uid ? { ...e, start } : e)) },
      true,
    );

  const removeChip = (c: TrackChip) => {
    if (c.live) pb.remove(c.uid);
    else pb.changeStory({ ...pb.story, events: pb.story.events.filter((e) => e.uid !== c.uid) }, true);
  };

  // Once a story plays, the list folds to the chosen card plus "Change story" (UI-12).
  const [storiesOpen, setStoriesOpen] = useState(true);
  const togglePlay = useCallback(() => {
    if (reduced) return;
    if (monthRef.current >= path.months) jump(0);
    setPlaying((p) => !p);
    setStoriesOpen(false);
    hints.dismiss('play');
  }, [reduced, path.months, jump, hints]);

  // Keyboard (PB-1, PB-4, LE-6, LE-14): unchanged shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.closest('[role="dialog"]'))
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        pb.undo();
      } else if (e.key === ' ' && !(el.tagName === 'BUTTON')) {
        e.preventDefault();
        togglePlay();
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
  }, [pb, jump, fire, togglePlay]);

  const m = Math.max(0, Math.min(path.months, Math.round(month) || 0));
  const k = (x: number) => (nominal ? path.inflationIndex[x] : 1);
  const tm = Math.max(0, Math.min(path.months, Math.round(tableMonth) || 0));
  const change = tm > 0 ? path.total[tm] * k(tm) - path.total[tm - 1] * k(tm - 1) : 0;
  const changePct =
    tm > 0 && Math.abs(path.total[tm - 1]) > 1 ? change / Math.abs(path.total[tm - 1] * k(tm - 1)) : 0;
  const current = activeEvents(path, tm).at(-1);
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
  const yearOf = (x: number) => Number(path.setup.input.startYear) + Math.floor(x / 12);

  // The timeline: scheduled events (draggable) and fired ones, from the same story (PX-5, PX-11).
  const chips: TrackChip[] = [
    ...scheduled.map((e) => {
      const def = findEvent(e.eventId, pb.custom);
      return {
        uid: e.uid,
        month: e.start,
        name: def?.name ?? e.eventId,
        icon: def?.icon ?? 'Sparkles',
        tone: def?.palette ?? 'personal',
        live: false,
        detail: def ? `${impactText(def, e.severity, e.amount)} · ${SEVERITY_LABELS[e.severity]}` : '',
      } satisfies TrackChip;
    }),
    ...pb.log.map((l) => {
      const def = findEvent(l.eventId, pb.custom);
      return {
        uid: l.uid,
        month: l.month,
        name: l.name,
        icon: def?.icon ?? 'Sparkles',
        tone: def?.palette ?? 'personal',
        live: true,
        detail: moveText(path, l.impact, twdCompact),
      } satisfies TrackChip;
    }),
  ];
  const ticks: ScrubTick[] = [
    ...chips.map((c) => ({ month: c.month, kind: 'event' as const })),
    ...ms
      .filter((x) => x.kind !== 'eventStart' && x.kind !== 'eventEnd')
      .map((x) => ({
        month: x.month,
        kind:
          x.kind === 'stop'
            ? ('stop' as const)
            : x.kind === 'runOut'
              ? ('runOut' as const)
              : ('milestone' as const),
      })),
  ];

  // Result strip (PX-6): the two answers that matter, against the normal story.
  const stopAge = path.retireMonth !== undefined ? ageAt(path.retireMonth) : undefined;
  const normalStop = normal.retireMonth !== undefined ? ageAt(normal.retireMonth) : undefined;
  const runOut = path.depletionMonth !== undefined ? ageAt(path.depletionMonth) : undefined;
  const normalRunOut = normal.depletionMonth !== undefined ? ageAt(normal.depletionMonth) : undefined;
  const stopDiff = stopAge !== undefined && normalStop !== undefined ? stopAge - normalStop : undefined;
  const insets = plotInsets();

  const openPicker = () => {
    setPicker(true);
    hints.dismiss('events');
  };
  const pickStory = (id: string, s: typeof pb.story) => {
    pb.changeStory(s);
    setCard(id);
    jump(0);
    setPlaying(false);
    hints.dismiss('story');
  };

  const toastEl = toast && (
    <div
      role="status"
      key={toast.key}
      className="absolute top-2 z-10 flex max-w-[min(22rem,75%)] items-start gap-2 rounded-md border border-primary bg-surface/95 px-3 py-2 text-sm shadow-md"
      style={{ left: insets.left + 6 }}
    >
      <Zap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{toast.title}</div>
        <div className="text-xs">{toast.text}</div>
        {toast.detail && <div className="text-xs text-muted-foreground">{toast.detail}</div>}
      </div>
      <button
        type="button"
        aria-label={t('Close the banner')}
        onClick={() => {
          setToast(undefined);
          pausedUntil.current = 0;
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <Card aria-label={t('Stage')}>
          <CardContent className="flex flex-col gap-2 p-3 sm:p-4">
            <div className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 bg-surface px-3 pt-1 md:static md:mx-0 md:px-0 md:pt-0">
              <div
                aria-label={t('Counters')}
                className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-md bg-surface-2 px-3 py-1.5 text-sm sm:grid-cols-4"
              >
                <div>
                  <div className="text-xs text-muted-foreground">{t('Now')}</div>
                  <div className="font-semibold tabular">
                    <span data-testid="counter-Date">{dateAfterYears(data.ctx.asOfDate, m / 12)}</span>
                    {' · '}
                    <span data-testid="counter-Age">{t('{y} y {m} m', { y: ageAt(m), m: m % 12 })}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('Investments')}</div>
                  <div data-testid="counter-Investments" className="font-semibold tabular">
                    {twdCompact(path.investable[m] * k(m))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('Stop-work age vs normal')}</div>
                  <div
                    data-testid="counter-Stop-work age"
                    className={cn(
                      'font-semibold tabular',
                      stopDiff !== undefined && stopDiff > 0 && 'text-critical',
                      stopDiff !== undefined && stopDiff < 0 && 'text-good',
                    )}
                  >
                    {stopAge === undefined
                      ? t('not reached')
                      : stopDiff === undefined || stopDiff === 0
                        ? t('{age} · same as normal', { age: stopAge })
                        : t('{from} → {to} · {diff}', {
                            from: normalStop,
                            to: stopAge,
                            diff: stopDiff > 0 ? t('+{n}y', { n: stopDiff }) : t('−{n}y', { n: -stopDiff }),
                          })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('Money lasts')}</div>
                  <div
                    data-testid="counter-Money lasts"
                    className={cn('font-semibold tabular', runOut !== undefined && 'text-critical')}
                  >
                    {runOut === undefined
                      ? t('to {age} ✓', { age: path.setup.input.horizonAge })
                      : normalRunOut !== undefined && normalRunOut !== runOut
                        ? t('runs out at {age} (normal {normal})', { age: runOut, normal: normalRunOut })
                        : t('runs out at {age}', { age: runOut })}
                  </div>
                </div>
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
                overlay={toastEl}
              />
              {/* Phones: the three steps as a bar under the chart (PX-12). */}
              <nav aria-label={t('Steps')} className="grid grid-cols-3 gap-1 lg:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => storiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {t('1 · Story')}
                </Button>
                <Button size="sm" variant="outline" onClick={openPicker}>
                  {t('2 · Events')}
                </Button>
                <Button size="sm" variant="outline" disabled={reduced} onClick={togglePlay}>
                  {t('3 · Play')}
                </Button>
              </nav>
            </div>

            <EventTrack
              path={path}
              chips={chips}
              milestones={ms}
              onAdd={openPicker}
              onMove={moveScheduled}
              onRemove={removeChip}
              onGo={jump}
              yearOf={yearOf}
            />

            <div className="fixed inset-x-0 bottom-14 z-30 border-t bg-surface px-3 py-2 shadow-[0_-2px_6px_rgb(0_0_0/0.06)] md:static md:border-0 md:p-0 md:shadow-none">
              <PlayerBar
                month={m}
                months={path.months}
                playing={playing}
                reduced={reduced}
                speed={speed}
                ticks={ticks}
                canUndo={pb.canUndo}
                hasLive={pb.live.length > 0}
                onToggle={togglePlay}
                onRestart={() => {
                  jump(0);
                  setToast(undefined);
                }}
                onJump={(x) => {
                  if (x >= path.months) setPlaying(false);
                  jump(x);
                }}
                onSpeed={setSpeed}
                onUndo={pb.undo}
                onClearLive={pb.clearLive}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{t('One possible story, not a forecast.')}</strong>{' '}
                {t("Markets follow the story you pick; the Strategy Lab's simulated futures show the odds.")}
              </span>
              <span className="ml-auto flex flex-wrap gap-2">
                <Segmented
                  label={t('Chart view')}
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'total', label: t('Total') },
                    { value: 'breakdown', label: t('Breakdown') },
                  ]}
                />
                {view === 'breakdown' && (
                  <Segmented
                    label={t('Group by')}
                    value={grouping}
                    onChange={setGrouping}
                    options={[
                      { value: 'class', label: t('Class') },
                      { value: 'region', label: t('Region') },
                      { value: 'currency', label: t('Currency') },
                    ]}
                  />
                )}
              </span>
            </div>
            {reduced && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'Animation is off because your device asks for reduced motion; drag the slider to move through time.',
                )}
              </p>
            )}
            {lastLog && (
              <p className="text-sm" aria-label={t('Impact of the last event')}>
                <span className="rounded-full bg-surface-2 px-2 py-0.5">
                  {lastLog.name}: {moveText(path, lastLog.impact, twdCompact)}
                </span>
              </p>
            )}
            {(error || pb.warning) && <Notice tone="warning">{error ?? pb.warning}</Notice>}
            <div className="sr-only" aria-live="polite">
              {announce}
            </div>
          </CardContent>
        </Card>

        {m >= path.months && (
          <EndCard path={path} normal={normal} story={pb.story} live={pb.live} resolveAll={pb.resolveAll} />
        )}

        <Card>
          <details open={wide || undefined} className="group">
            <summary className="cursor-pointer px-4 py-3 font-semibold">
              {t('At this moment · {date}', { date: dateAfterYears(data.ctx.asOfDate, tm / 12) })}
              {current && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {t('During “{name}”', { name: current.def.name })}
                </span>
              )}
            </summary>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">{t('Total net worth')}</div>
                  <div data-testid="counter-Total net worth" className="font-semibold tabular">
                    {twdCompact(path.total[tm] * k(tm))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('This month')}</div>
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
              <PlaybackTable
                path={path}
                month={tableMonth}
                grouping={grouping}
                nominal={nominal}
                eventStart={current?.start}
                fxNow={fxNow}
              />
            </CardContent>
          </details>
        </Card>
        {/* Room for the fixed player bar on phones. */}
        <div className="h-16 md:hidden" aria-hidden />
      </div>

      <Card aria-label={t('Setup')} className="lg:sticky lg:top-4">
        <CardContent className="flex flex-col gap-4 p-4 text-sm">
          <section ref={storiesRef} className="scroll-mt-4">
            <h2 className="mb-1.5 font-semibold">{t('1 · Pick a story')}</h2>
            {hints.show('story') && (
              <Hint onDismiss={() => hints.dismiss('story')}>
                {t('Start here: Normal is already picked, so you can press Play straight away.')}
              </Hint>
            )}
            <StoryCards
              saved={data.settings.stories ?? []}
              selected={card}
              onlySelected={!storiesOpen}
              onExpand={() => setStoriesOpen(true)}
              normal={normal}
              onPick={pickStory}
              onBuild={() => {
                setAdvanced(true);
                setBuild(true);
                requestAnimationFrame(() =>
                  document.getElementById('build-your-own')?.scrollIntoView({ behavior: 'smooth' }),
                );
              }}
            />
          </section>
          <section>
            <h2 className="font-semibold">{t('2 · Add events')}</h2>
            <p className="mb-1.5 text-xs text-muted-foreground">
              {t('{n} of {max} scheduled', { n: scheduled.length, max: MAX_SCHEDULED })}
            </p>
            {hints.show('events') && (
              <Hint onDismiss={() => hints.dismiss('events')}>
                {t('Optional: add a crisis or a windfall, before or while it plays.')}
              </Hint>
            )}
            <Button variant="outline" className="w-full" onClick={openPicker}>
              <Plus aria-hidden /> {playing ? t('Fire an event') : t('Add event')}
            </Button>
          </section>
          <section>
            <h2 className="font-semibold">{t('3 · Play')}</h2>
            {hints.show('play') && (
              <Hint onDismiss={() => hints.dismiss('play')}>
                {t('Press Play, or the Space key, and watch the years go by.')}
              </Hint>
            )}
            <Button className="mt-1.5 w-full" disabled={reduced} onClick={togglePlay}>
              <Play aria-hidden /> {playing ? t('Pause') : t('Play the story')}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{t('or press Space')}</p>
          </section>
          <details
            ref={advancedRef}
            open={advanced || undefined}
            onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-semibold">{t('Advanced')}</summary>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('Behaviour, market noise, story files and your own events.')}
            </p>
            <div className="mt-3">
              <AdvancedPanel
                story={pb.story}
                custom={pb.custom}
                playback={pb.playback}
                liveEvents={pb.live}
                buildOpen={build}
                onChange={(s) => {
                  pb.changeStory(s, true);
                }}
              />
            </div>
          </details>
        </CardContent>
      </Card>

      {picker && (
        <EventPicker
          custom={pb.custom}
          favourites={pb.playback.favourites}
          onToggleFavourite={toggleFavourite}
          normal={normal}
          playing={playing}
          playhead={month}
          scheduledCount={scheduled.length}
          remaining={(id) => pb.remaining(id, month)}
          onSchedule={schedule}
          onFire={fire}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

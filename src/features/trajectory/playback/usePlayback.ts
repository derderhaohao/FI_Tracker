import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Severity, StoryEvent } from '@/domain/entities';
import { BASELINE_SPEC } from '@/domain/baseline';
import {
  DEFAULT_PLAYBACK_SETTINGS,
  NORMAL_STORY,
  playbackSetup,
  resolveStory,
  runPlayback,
  type PlaybackPath,
  type PlaybackStory,
} from '@/domain/playback/engine';
import { activeEvents, impactOf, type Impact } from '@/domain/playback/analysis';
import { eventLength, findEvent } from '@/domain/playback/library';
import { newId } from '@/db/repo';
import { useAppData } from '@/app/data';
import { t } from '@/i18n';

export interface LogEntry {
  uid: string;
  month: number;
  eventId: string;
  name: string;
  severity: Severity;
  impact: Impact;
}

export interface Fade {
  fromMonth: number;
  /** The future before the event fired (real TWD investable). */
  oldInvestable: Float64Array;
  at: number;
}

/** Story, live events, undo history and the computed paths (EN-3: compute once, animate the result). */
export function usePlayback() {
  const data = useAppData();
  const playback = data.settings.playback ?? DEFAULT_PLAYBACK_SETTINGS;
  const custom = useMemo(() => data.settings.customEvents ?? [], [data.settings.customEvents]);
  const setup = useMemo(
    () => playbackSetup(data, data.activeAssumptions, BASELINE_SPEC, data.ctx, playback),
    [data, playback],
  );
  const normal = useMemo(() => runPlayback(setup, []), [setup]);
  const [story, setStory] = useState<PlaybackStory>(NORMAL_STORY);
  const [live, setLive] = useState<StoryEvent[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<{ live: StoryEvent[]; log: LogEntry[]; path: PlaybackPath }[]>([]);
  const [fade, setFade] = useState<Fade>();
  const [warning, setWarning] = useState<string>();

  const resolveAll = useCallback(
    (events: StoryEvent[]) =>
      resolveStory({ ...story, events }, custom, normal.startAge, normal.retireMonth, normal.months),
    [story, custom, normal],
  );

  // Full recompute when the data or the scheduled story changes; live events are kept.
  const base = useMemo(
    () => runPlayback(setup, resolveAll([...story.events, ...live]), story.behaviour, story.noiseSeed),
    // Live events are applied incrementally below; this memo only reacts to story and data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup, story, custom],
  );
  const [livePath, setLivePath] = useState<{ base: PlaybackPath; path: PlaybackPath }>();
  const path = livePath && livePath.base === base ? livePath.path : base;

  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const recompute = useCallback(
    (nextLive: StoryEvent[], fromMonth: number) =>
      runPlayback(setup, resolveAll([...story.events, ...nextLive]), story.behaviour, story.noiseSeed, {
        path: pathRef.current,
        month: fromMonth,
      }),
    [setup, resolveAll, story],
  );

  /** Fires an event at a month (LE-2, LE-3). Returns an error message when it cannot. */
  const fire = useCallback(
    (eventId: string, month: number, severity: Severity = 'typical', amount?: number): string | undefined => {
      const def = findEvent(eventId, custom);
      if (!def) return t('Unknown event.');
      const m = Math.max(0, Math.min(pathRef.current.months - 1, Math.floor(month)));
      const running = activeEvents(pathRef.current, m);
      if (running.some((e) => e.def.id === eventId && eventId !== 'lump'))
        return t('{name} is still running; it can be fired again when it ends.', { name: def.name });
      if (running.length >= 5) return t('At most 5 events can run at the same time.');
      const ev: StoryEvent = { uid: newId(), eventId, start: m, severity, source: 'live', amount };
      const nextLive = [...live, ev];
      const before = pathRef.current;
      const after = recompute(nextLive, m);
      const impact = impactOf(before, after, m);
      setHistory((h) => [...h, { live, log, path: before }]);
      setLive(nextLive);
      setLog((l) => [...l, { uid: ev.uid, month: m, eventId, name: def.name, severity, impact }]);
      setLivePath({ base, path: after });
      setFade({ fromMonth: m, oldInvestable: before.investable, at: performance.now() });
      const worst = Math.min(
        ...['tw_equity', 'us_equity', 'jp_equity', 'eu_equity', 'em_equity'].map((f) =>
          Math.min(...after.factorLevels[f as 'tw_equity'].subarray(m)),
        ),
      );
      setWarning(worst < 0.2 ? t('Combined share losses now exceed 80%: an extreme story.') : undefined);
      return undefined;
    },
    [custom, live, log, recompute, base],
  );

  /** Removes one live event; recomputes from its month (LE-5). */
  const remove = useCallback(
    (uid: string) => {
      const ev = live.find((e) => e.uid === uid);
      if (!ev) return;
      const nextLive = live.filter((e) => e.uid !== uid);
      const before = pathRef.current;
      const after = recompute(nextLive, ev.start);
      setHistory((h) => [...h, { live, log, path: before }]);
      setLive(nextLive);
      setLog((l) => l.filter((x) => x.uid !== uid));
      setLivePath({ base, path: after });
      setFade({ fromMonth: ev.start, oldInvestable: before.investable, at: performance.now() });
    },
    [live, log, recompute, base],
  );

  /** Undo the last change exactly (LE-6). */
  const undo = useCallback(() => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setLive(last.live);
    setLog(last.log);
    setLivePath({ base, path: last.path });
    setFade(undefined);
  }, [history, base]);

  const clearLive = useCallback(() => {
    if (!live.length) return;
    const from = Math.min(...live.map((e) => e.start));
    const before = pathRef.current;
    const after = recompute([], from);
    setHistory((h) => [...h, { live, log, path: before }]);
    setLive([]);
    setLog([]);
    setLivePath({ base, path: after });
    setFade({ fromMonth: from, oldInvestable: before.investable, at: performance.now() });
  }, [live, log, recompute, base]);

  const changeStory = useCallback((s: PlaybackStory, keepLive = false) => {
    setStory(s);
    if (!keepLive) {
      setLive([]);
      setLog([]);
    }
    setHistory([]);
    setLivePath(undefined);
    setFade(undefined);
    setWarning(undefined);
  }, []);

  const remaining = useCallback(
    (eventId: string, month: number) => {
      const e = activeEvents(path, Math.floor(month)).find((x) => x.def.id === eventId);
      return e ? e.start + eventLength(e.def, e.severity) - Math.floor(month) : 0;
    },
    [path],
  );

  return {
    setup,
    normal,
    path,
    story,
    live,
    log,
    fade,
    warning,
    custom,
    playback,
    canUndo: history.length > 0,
    fire,
    remove,
    undo,
    clearLive,
    changeStory,
    remaining,
    resolveAll,
  };
}

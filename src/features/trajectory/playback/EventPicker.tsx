import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Star, X } from 'lucide-react';
import type { CustomEvent, Severity } from '@/domain/entities';
import {
  customToEvent,
  impactText,
  LUMP_EVENT,
  PALETTE_EVENTS,
  SEVERITY_LABELS,
  type EventDef,
  type Timing,
} from '@/domain/playback/library';
import { resolveTiming, type PlaybackPath } from '@/domain/playback/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { ICONS } from './icons';
import { plainLine } from './plain';
import { eventsForTab, MAX_SCHEDULED, type PickerTab } from './pickerModel';

const PRESETS: { key: string; label: string; timing: Timing }[] = [
  { key: 'next', label: t('Next year'), timing: { kind: 'inYears', years: 1 } },
  { key: 'beforeStop', label: t('A year before I stop work'), timing: { kind: 'beforeStop', months: 12 } },
  { key: 'afterStop', label: t('Just after I stop work'), timing: { kind: 'afterStop' } },
  { key: 'at60', label: t('At 60'), timing: { kind: 'age', age: 60 } },
];

/**
 * The one place to choose an event (PX-3, PX-4): search, category tabs and compact cards
 * that open in place with severity and timing. Before play (or while paused) it schedules
 * the event at a chosen age; while playing it fires it at the playhead.
 */
export function EventPicker({
  custom,
  favourites,
  onToggleFavourite,
  normal,
  playing,
  playhead,
  scheduledCount,
  remaining,
  onSchedule,
  onFire,
  onClose,
}: {
  custom: readonly CustomEvent[];
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  /** The normal story, for ages and the stop-work month. */
  normal: PlaybackPath;
  playing: boolean;
  playhead: number;
  scheduledCount: number;
  /** Months an event still runs at the playhead (0 = not running). */
  remaining: (id: string) => number;
  onSchedule: (id: string, start: number, severity: Severity, amount?: number) => void;
  onFire: (id: string, severity: Severity, amount?: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<PickerTab>('all');
  const [open, setOpen] = useState<string>();
  const all = useMemo<EventDef[]>(
    () => [...PALETTE_EVENTS, LUMP_EVENT, ...custom.map(customToEvent)],
    [custom],
  );
  const query = q.trim().toLowerCase();
  const list = eventsForTab(query ? 'all' : tab, all, favourites).filter(
    (e) =>
      !query ||
      `${e.name} ${plainLine(e.id, e.story)} ${e.story} ${impactText(e)}`.toLowerCase().includes(query),
  );
  const full = scheduledCount >= MAX_SCHEDULED;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: { value: PickerTab; label: string }[] = [
    { value: 'all', label: t('All') },
    { value: 'bad', label: t('Bad markets') },
    { value: 'good', label: t('Good markets') },
    { value: 'personal', label: t('Personal') },
    { value: 'region', label: t('Taiwan & region') },
    { value: 'mine', label: t('My events') },
    { value: 'favourites', label: t('Favourites') },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={t('Event picker')}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col rounded-t-xl border-t bg-surface shadow-xl md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[400px] md:rounded-none md:border-t-0 md:border-l"
      >
        <div className="flex items-center gap-2 border-b p-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{playing ? t('Fire an event') : t('Add an event')}</h2>
            <p className="text-xs text-muted-foreground">
              {playing
                ? t('It starts now, at the playhead; what already played stays as it was.')
                : t('{n} of {max} scheduled', { n: scheduledCount, max: MAX_SCHEDULED })}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label={t('Close events')} onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-b p-3">
          <Input
            autoFocus
            aria-label={t('Search events')}
            placeholder={t('Search events')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
          />
          <div role="tablist" aria-label={t('Event categories')} className="flex flex-wrap gap-1">
            {tabs.map((x) => (
              <button
                key={x.value}
                role="tab"
                type="button"
                aria-selected={tab === x.value}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  tab === x.value ? 'border-primary bg-surface-2 font-medium' : 'text-muted-foreground',
                )}
                onClick={() => setTab(x.value)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-3" aria-label={t('Events')}>
          {list.length === 0 && <li className="text-sm text-muted-foreground">{t('No events match.')}</li>}
          {list.map((e) => (
            <PickerCard
              key={e.id}
              e={e}
              open={open === e.id}
              onToggle={() => setOpen(open === e.id ? undefined : e.id)}
              favourite={favourites.includes(e.id)}
              onToggleFavourite={() => onToggleFavourite(e.id)}
              normal={normal}
              playing={playing}
              playhead={playhead}
              full={full}
              remaining={remaining(e.id)}
              onSchedule={onSchedule}
              onFire={onFire}
            />
          ))}
          <li className="pt-2 text-[11px] text-subtle">
            {t('Hypothetical stress stories with indicative numbers, not forecasts or probabilities.')}
          </li>
        </ul>
      </div>
    </>
  );
}

function PickerCard({
  e,
  open,
  onToggle,
  favourite,
  onToggleFavourite,
  normal,
  playing,
  playhead,
  full,
  remaining,
  onSchedule,
  onFire,
}: {
  e: EventDef;
  open: boolean;
  onToggle: () => void;
  favourite: boolean;
  onToggleFavourite: () => void;
  normal: PlaybackPath;
  playing: boolean;
  playhead: number;
  full: boolean;
  remaining: number;
  onSchedule: (id: string, start: number, severity: Severity, amount?: number) => void;
  onFire: (id: string, severity: Severity, amount?: number) => void;
}) {
  const Icon = ICONS[e.icon] ?? Sparkles;
  const resolve = (tm: Timing) => resolveTiming(tm, normal.startAge, normal.retireMonth, normal.months);
  const [severity, setSeverity] = useState<Severity>('typical');
  const [start, setStart] = useState(() => resolve(e.defaultStart));
  const [amount, setAmount] = useState('500000');
  const lump = e.id === LUMP_EVENT.id;
  const lumpValue = Number(amount.replace(/,/g, ''));
  const lumpOk = !lump || (Number.isFinite(lumpValue) && lumpValue !== 0);
  const ageOf = (m: number) => Math.floor(normal.startAge + m / 12);
  const maxMonth = normal.months - 1;
  const fireMonth = Math.max(0, Math.min(maxMonth, Math.floor(playhead)));
  const tone =
    e.palette === 'good' ? 'border-l-good' : e.palette === 'bad' ? 'border-l-critical' : 'border-l-primary';

  return (
    <li className={cn('mb-1.5 rounded-md border border-l-4', tone)}>
      <div className="flex items-start">
        <button
          type="button"
          aria-expanded={open}
          aria-label={e.name}
          className="flex min-w-0 flex-1 items-start gap-2 p-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onToggle}
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{e.name}</span>
            <span className="block text-xs text-muted-foreground">
              {remaining > 0
                ? t('Active · {left} months left', { left: remaining })
                : plainLine(e.id, e.story)}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={favourite ? t('Unpin {name}', { name: e.name }) : t('Pin {name}', { name: e.name })}
          aria-pressed={favourite}
          className="m-1 rounded p-1 text-subtle hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onToggleFavourite}
        >
          <Star className={cn('size-3.5', favourite && 'fill-current text-primary')} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t px-2 pt-2 pb-2.5 text-xs">
          <p>{e.story}</p>
          {!lump && (
            <p className="text-muted-foreground">
              {impactText(e, severity)}.
              {e.analogue ? t(' Roughly like: {analogue}.', { analogue: e.analogue }) : ''}
            </p>
          )}
          {lump ? (
            <label className="flex flex-col gap-0.5">
              {t('Amount (− = cost)')}
              <Input
                aria-label={t('One-off amount')}
                inputMode="decimal"
                className="h-8 w-36 text-right"
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
              />
            </label>
          ) : (
            <Segmented
              label={t('Severity')}
              value={severity}
              onChange={setSeverity}
              options={(['mild', 'typical', 'severe'] as Severity[]).map((s) => ({
                value: s,
                label: SEVERITY_LABELS[s],
              }))}
            />
          )}
          {!playing && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => {
                  const m = resolve(p.timing);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={cn(
                        'rounded-full border px-2 py-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        m === start && 'border-primary bg-surface-2',
                      )}
                      onClick={() => setStart(m)}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label={t('Start age')}
                  aria-valuetext={t('Age {age}', { age: ageOf(start) })}
                  min={0}
                  max={maxMonth}
                  step={1}
                  value={start}
                  onChange={(ev) => setStart(Number(ev.target.value))}
                  className="flex-1 accent-[var(--primary)]"
                />
                <Input
                  aria-label={t('Age')}
                  type="number"
                  className="h-7 w-16"
                  min={normal.startAge}
                  max={ageOf(maxMonth)}
                  value={ageOf(start)}
                  onChange={(ev) => {
                    const a = Number(ev.target.value);
                    if (Number.isFinite(a))
                      setStart(Math.max(0, Math.min(maxMonth, Math.round((a - normal.startAge) * 12))));
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            {playing ? (
              <Button
                size="sm"
                disabled={remaining > 0 || !lumpOk}
                onClick={() => onFire(e.id, severity, lump ? lumpValue : undefined)}
              >
                {t('Fire now at age {age}', { age: ageOf(fireMonth) })}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={full || !lumpOk}
                onClick={() => onSchedule(e.id, start, severity, lump ? lumpValue : undefined)}
              >
                {t('Add at age {age}', { age: ageOf(start) })}
              </Button>
            )}
            {!playing && full && (
              <span className="text-muted-foreground">
                {t('Up to 3 scheduled events; fire more live while it plays.')}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

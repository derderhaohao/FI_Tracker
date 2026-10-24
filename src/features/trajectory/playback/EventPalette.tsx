import { useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BadgePercent,
  Banknote,
  Biohazard,
  BriefcaseBusiness,
  Building,
  CircuitBoard,
  CloudRain,
  Coins,
  Cpu,
  Flame,
  Fuel,
  Gift,
  HeartPulse,
  Home,
  Hourglass,
  JapaneseYen,
  Minus,
  Percent,
  Rocket,
  ShieldAlert,
  Ship,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Unlink,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { Severity } from '@/domain/entities';
import {
  impactText,
  LUMP_EVENT,
  PALETTE_EVENTS,
  SEVERITY_LABELS,
  customToEvent,
  type EventDef,
} from '@/domain/playback/library';
import type { CustomEvent } from '@/domain/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

export const ICONS: Record<string, LucideIcon> = {
  Activity,
  ArrowUpRight,
  BadgePercent,
  Banknote,
  Biohazard,
  BriefcaseBusiness,
  Building,
  CircuitBoard,
  CloudRain,
  Coins,
  Cpu,
  Flame,
  Fuel,
  Gift,
  HeartPulse,
  Home,
  Hourglass,
  JapaneseYen,
  Minus,
  Percent,
  Rocket,
  ShieldAlert,
  Ship,
  Sparkles,
  Sun,
  Sunrise,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Unlink,
  Wand2,
};

const SECTIONS: { key: 'good' | 'bad' | 'personal'; label: string }[] = [
  { key: 'bad', label: t('Bad') },
  { key: 'good', label: t('Good') },
  { key: 'personal', label: t('Personal') },
];

/** The live event palette (LE-1 to LE-9, LE-13, LE-14). */
export function EventPalette({
  custom,
  favourites,
  onToggleFavourite,
  onFire,
  remaining,
  disabled,
}: {
  custom: readonly CustomEvent[];
  favourites: string[];
  onToggleFavourite: (id: string) => void;
  onFire: (id: string, severity: Severity, amount?: number) => void;
  /** Months an event still runs at the playhead (0 = not running). */
  remaining: (id: string) => number;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string>();
  const [lump, setLump] = useState('500000');
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const all: EventDef[] = [...PALETTE_EVENTS, ...custom.map(customToEvent)];
  const match = (e: EventDef) =>
    !q.trim() || `${e.name} ${e.story} ${impactText(e)}`.toLowerCase().includes(q.trim().toLowerCase());
  const favs = favourites.map((id) => all.find((e) => e.id === id)).filter((e): e is EventDef => !!e);

  const tile = (e: EventDef, n?: number) => {
    const Icon = ICONS[e.icon] ?? Sparkles;
    const left = remaining(e.id);
    const fav = favourites.includes(e.id);
    return (
      <div key={e.id} className="relative">
        <button
          type="button"
          disabled={disabled || left > 0}
          aria-label={t('Fire {name}{v}: {e}', {
            name: e.name,
            v: n ? t(' (key {n})', { n }) : '',
            e: impactText(e),
          })}
          title={t('Tap to fire at the playhead. Right-click or hold for severity.')}
          className={cn(
            'flex h-full w-full flex-col gap-0.5 rounded-md border p-2 pr-6 text-left text-xs hover:bg-surface-2 disabled:opacity-50',
            e.palette === 'good'
              ? 'border-l-4 border-l-good'
              : e.palette === 'bad'
                ? 'border-l-4 border-l-critical'
                : 'border-l-4 border-l-primary',
          )}
          onClick={() => onFire(e.id, 'typical')}
          onContextMenu={(ev) => {
            ev.preventDefault();
            setMenu(e.id);
          }}
          onPointerDown={() => {
            press.current = setTimeout(() => setMenu(e.id), 550);
          }}
          onPointerUp={() => clearTimeout(press.current)}
          onPointerLeave={() => clearTimeout(press.current)}
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="size-4 shrink-0" aria-hidden />
            {e.name}
            {n && <kbd className="ml-auto rounded border px-1 text-[10px] text-subtle">{n}</kbd>}
          </span>
          <span className="text-muted-foreground">
            {left > 0 ? t('Active · {left} months left', { left }) : impactText(e)}
          </span>
        </button>
        <button
          type="button"
          aria-label={fav ? t('Unpin {name}', { name: e.name }) : t('Pin {name}', { name: e.name })}
          aria-pressed={fav}
          className="absolute top-1 right-1 rounded p-0.5 text-subtle hover:text-primary"
          onClick={() => onToggleFavourite(e.id)}
        >
          <Star className={cn('size-3', fav && 'fill-current text-primary')} aria-hidden />
        </button>
        {menu === e.id && (
          <div
            role="menu"
            className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border bg-surface p-1 shadow-lg"
          >
            {(['mild', 'typical', 'severe'] as Severity[]).map((s) => (
              <button
                key={s}
                role="menuitem"
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
                onClick={() => {
                  setMenu(undefined);
                  onFire(e.id, s);
                }}
              >
                {SEVERITY_LABELS[s]}: {impactText(e, s)}
              </button>
            ))}
            <button
              type="button"
              className="block w-full px-2 py-1 text-left text-xs text-subtle"
              onClick={() => setMenu(undefined)}
            >
              {t('Cancel')}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-label={t('Event palette')} className="flex flex-col gap-3">
      <Input
        aria-label={t('Search events')}
        placeholder={t('Search events')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8"
      />
      {favs.length > 0 && !q && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{t('Pinned')}</h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{favs.map((e, i) => tile(e, i + 1))}</div>
        </div>
      )}
      {SECTIONS.map((s) => {
        const list = all.filter((e) => e.palette === s.key && match(e) && (q || !favourites.includes(e.id)));
        if (!list.length) return null;
        return (
          <div key={s.key}>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{s.label}</h3>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{list.map((e) => tile(e))}</div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-2 text-xs">
        <Banknote className="size-4" aria-hidden />
        <label className="flex flex-col gap-0.5">
          {t('{name} (− = cost)', { name: LUMP_EVENT.name })}
          <Input
            aria-label={t('One-off amount')}
            inputMode="decimal"
            className="h-8 w-32 text-right"
            value={lump}
            onChange={(e) => setLump(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={
            disabled ||
            !Number.isFinite(Number(lump.replace(/,/g, ''))) ||
            Number(lump.replace(/,/g, '')) === 0
          }
          onClick={() => onFire('lump', 'typical', Number(lump.replace(/,/g, '')))}
        >
          {t('Add at the playhead')}
        </Button>
      </div>
      <p className="text-[11px] text-subtle">
        {t('Hypothetical stress stories with indicative numbers, not forecasts or probabilities.')}
      </p>
    </section>
  );
}

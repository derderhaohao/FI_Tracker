import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudSun, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { BankArt, CoinBag, PiggyArt, TreeArt } from './art/Art';
import { coins, rateWords } from './copy';
import { getSetting, setSetting } from './db';
import { COST_ICONS } from './icons';
import { freeAtAge, freedomNumber, growTree, type TreeYear } from './math';
import type { Kids } from './types';
import { BigButton, Panel, PickCard } from './ui';

type Place = 'piggy' | 'bank' | 'tree';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Money Tree (KD-7): three inputs, then Grow plays the years one by one. */
function MoneyTree({ kids }: { kids: Kids }) {
  const age = kids.profile!.age;
  const [perWeek, setPerWeek] = useState(50);
  const [place, setPlace] = useState<Place>('tree');
  const [toAge, setToAge] = useState(age < 18 ? 18 : 30);
  const [weather, setWeather] = useState(false);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const years = Math.max(1, toAge - age);
  const g = place === 'piggy' ? 0 : place === 'bank' ? kids.growth.bank : kids.growth.tree;
  const run = useMemo(
    () => growTree(perWeek, years, place === 'tree' && weather ? 'weather' : g),
    [perWeek, years, place, weather, g],
  );
  const piggy = useMemo(() => growTree(perWeek, years, 0), [perWeek, years]);
  const reset = () => {
    setShown(0);
    setPlaying(false);
  };

  // One year at a time; at once when reduced motion is asked for.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(
      () => {
        setShown(reducedMotion() ? years : shown + 1);
        if (reducedMotion() || shown + 1 >= years) setPlaying(false);
      },
      reducedMotion() ? 0 : 450,
    );
    return () => clearTimeout(id);
  }, [playing, shown, years]);

  const now: TreeYear | undefined = run[shown - 1];
  const max = run[run.length - 1].total || 1;
  const size = (now ? Math.min(4, 1 + Math.floor((now.total / max) * 4)) : 0) as 0 | 1 | 2 | 3 | 4;
  const places: { id: Place; label: string; art: ReactNode; line: string }[] = [
    { id: 'piggy', label: t('Piggy bank'), art: <PiggyArt px={48} />, line: t('No growth') },
    { id: 'bank', label: t('Bank'), art: <BankArt px={48} />, line: t('Grows a little') },
    {
      id: 'tree',
      label: t('Money tree'),
      art: <TreeArt size={2} px={48} />,
      line: t('Grows more, with ups and downs'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('1 · Coins planted each week')}>
        <label className="flex flex-col gap-2">
          <span className="text-2xl font-bold tabular">{coins(perWeek)}</span>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={perWeek}
            aria-label={t('Coins planted each week')}
            aria-valuetext={coins(perWeek)}
            className="h-10 accent-[#16a34a]"
            onChange={(e) => {
              setPerWeek(Number(e.target.value));
              reset();
            }}
          />
        </label>
      </Panel>
      <Panel title={t('2 · Where the coins go')}>
        <div className="grid grid-cols-3 gap-2">
          {places.map((p) => (
            <PickCard
              key={p.id}
              selected={place === p.id}
              onClick={() => {
                setPlace(p.id);
                reset();
              }}
            >
              {p.art}
              <span className="font-semibold">{p.label}</span>
              <span className="text-center text-sm text-muted-foreground">{p.line}</span>
            </PickCard>
          ))}
        </div>
        <p className="mt-2 text-base text-muted-foreground">{rateWords(g)}</p>
        {place === 'tree' && (
          <label className="mt-2 flex min-h-12 items-center gap-3 text-base font-semibold">
            <input
              type="checkbox"
              className="size-6 accent-[#16a34a]"
              checked={weather}
              onChange={(e) => {
                setWeather(e.target.checked);
                reset();
              }}
            />
            <CloudSun className="size-6" aria-hidden />
            {t('Weather: some years go down, then come back')}
          </label>
        )}
      </Panel>
      <Panel title={t('3 · How many years?')}>
        <div className="grid grid-cols-3 gap-2">
          {[18, 30, 60]
            .filter((a) => a > age)
            .map((a) => (
              <PickCard
                key={a}
                selected={toAge === a}
                onClick={() => {
                  setToAge(a);
                  reset();
                }}
              >
                <span className="text-xl font-bold">{t('To age {age}', { age: a })}</span>
                <span className="text-sm text-muted-foreground">{t('{n} years', { n: a - age })}</span>
              </PickCard>
            ))}
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-col items-center gap-3">
          <TreeArt size={place === 'tree' ? size : 0} px={170} />
          <p className="text-xl font-bold" aria-live="polite">
            {now
              ? t('Year {y}: {total}', { y: now.year, total: coins(now.total) })
              : t('Press Grow to watch the years go by.')}
          </p>
          {/* Coins put in vs coins grown, year by year (KD-7). */}
          <div className="flex h-36 w-full items-end gap-0.5" aria-hidden>
            {run.slice(0, shown).map((y) => (
              <div key={y.year} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }}>
                <div className="bg-[#16a34a]" style={{ height: `${(Math.max(0, y.grew) / max) * 100}%` }} />
                <div className="bg-[#facc15]" style={{ height: `${(y.put / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-4 text-base">
            <span className="flex items-center gap-2">
              <span className="size-4 rounded bg-[#facc15]" aria-hidden /> {t('Coins you put in')}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-4 rounded bg-[#16a34a]" aria-hidden /> {t('Coins the tree grew')}
            </span>
          </div>
          {shown >= years && now && (
            <div className="w-full rounded-2xl bg-surface-2 p-3 text-center" data-testid="tree-result">
              <p>{t('You put in {put}.', { put: coins(now.put) })}</p>
              <p className="font-bold">
                {now.grew >= 0
                  ? t('It grew {grew} more!', { grew: coins(now.grew) })
                  : t('It is {grew} less for now.', { grew: coins(-now.grew) })}
              </p>
            </div>
          )}
          {/* Piggy bank vs this choice, same coins (KD-7). */}
          {shown > 0 && place !== 'piggy' && (
            <div className="w-full" aria-label={t('Race')} role="group">
              {[
                { label: t('Piggy bank'), v: piggy[shown - 1].total, color: '#f472b6' },
                { label: place === 'bank' ? t('Bank') : t('Money tree'), v: now!.total, color: '#16a34a' },
              ].map((r) => (
                <div key={r.label} className="mt-2 flex items-center gap-2 text-base">
                  <span className="w-24 shrink-0 font-semibold">{r.label}</span>
                  <span className="h-5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full motion-safe:transition-[width]"
                      style={{ width: `${(r.v / max) * 100}%`, background: r.color }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right tabular">{coins(r.v)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <BigButton
              tone="good"
              disabled={playing}
              onClick={() => {
                setShown(0);
                setPlaying(true);
              }}
            >
              <Play aria-hidden /> {t('Grow')}
            </BigButton>
            <BigButton tone="plain" aria-label={t('Start again')} onClick={reset}>
              <RotateCcw aria-hidden />
            </BigButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

const COSTS = [
  { id: 'home', yearly: 240_000 },
  { id: 'food', yearly: 120_000 },
  { id: 'transport', yearly: 36_000 },
  { id: 'fun', yearly: 36_000 },
  { id: 'travel', yearly: 60_000 },
] as const;
type CostId = (typeof COSTS)[number]['id'];

/** Freedom Quest (KD-8): what life costs a year, the freedom number, and the age you could be free. */
function FreedomQuest({ kids }: { kids: Kids }) {
  const [presets, setPresets] = useState<Record<CostId, number>>();
  const [picked, setPicked] = useState<CostId[]>(['home', 'food', 'transport']);
  const [perMonth, setPerMonth] = useState(20_000);
  const [fromAge, setFromAge] = useState(25);
  useEffect(() => {
    void getSetting<Record<CostId, number> | undefined>('costPresets', undefined).then((p) =>
      setPresets(p ?? (Object.fromEntries(COSTS.map((c) => [c.id, c.yearly])) as Record<CostId, number>)),
    );
  }, []);
  if (!presets) return null;
  const label = (id: CostId) =>
    ({ home: t('Home'), food: t('Food'), transport: t('Getting around'), fun: t('Fun'), travel: t('Trips') })[
      id
    ];
  const yearly = picked.reduce((a, id) => a + presets[id], 0);
  const target = freedomNumber(yearly);
  const result = yearly > 0 ? freeAtAge(yearly, perMonth, fromAge, kids.growth.tree) : undefined;
  const bags = Math.min(30, Math.max(1, Math.round(target / 1_000_000)));
  return (
    <div className="flex flex-col gap-4">
      <Panel title={t('1 · What does a grown-up life cost a year?')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COSTS.map(({ id }) => {
            const Icon = COST_ICONS[id];
            const on = picked.includes(id);
            return (
              <PickCard
                key={id}
                selected={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}
              >
                <Icon aria-hidden />
                <span className="font-semibold">{label(id)}</span>
                <span className="text-sm text-muted-foreground tabular">
                  {t('{amount} a year', { amount: coins(presets[id]) })}
                </span>
              </PickCard>
            );
          })}
        </div>
        <p className="mt-3 text-xl font-bold">{t('Together: {amount} a year', { amount: coins(yearly) })}</p>
      </Panel>
      <Panel title={t('2 · Your freedom number')}>
        <p className="text-3xl font-bold tabular" data-testid="freedom-number">
          {coins(target)}
        </p>
        <p className="mt-1 text-base text-muted-foreground">
          {t(
            'That is the yearly cost times 25. A money tree that big gives about 4 coins of fruit for every 100 each year: enough to pay for that life.',
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: bags }, (_, i) => (
            <CoinBag key={i} size={36} />
          ))}
        </div>
      </Panel>
      <Panel title={t('3 · When could you be free?')}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">
              {t('Planted each month as a grown-up: {amount}', { amount: coins(perMonth) })}
            </span>
            <input
              type="range"
              min={1_000}
              max={60_000}
              step={1_000}
              value={perMonth}
              aria-valuetext={coins(perMonth)}
              className="h-10 accent-[#16a34a]"
              onChange={(e) => setPerMonth(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">{t('Starting at age {age}', { age: fromAge })}</span>
            <input
              type="range"
              min={18}
              max={45}
              step={1}
              value={fromAge}
              aria-valuetext={String(fromAge)}
              className="h-10 accent-[#16a34a]"
              onChange={(e) => setFromAge(Number(e.target.value))}
            />
          </label>
          <div className="flex h-28 items-end gap-0.5" aria-hidden>
            {(result?.years ?? []).map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-[#16a34a]"
                style={{ height: `${Math.min(100, (v / target) * 100)}%` }}
              />
            ))}
          </div>
          <p
            className={cn(
              'rounded-2xl p-3 text-center text-2xl font-bold',
              result ? 'bg-[#dcfce7] text-[#14532d]' : 'bg-surface-2',
            )}
            data-testid="free-at"
          >
            {yearly === 0
              ? t('Pick at least one card.')
              : result
                ? t('You could be free at {age}!', { age: result.age })
                : t('Plant a little more each month to get there.')}
          </p>
          <p className="text-base text-muted-foreground">
            {t('Free means the tree’s fruit pays for your life, so work becomes a choice.')}
          </p>
        </div>
      </Panel>
    </div>
  );
}

/** Grow: the Money Tree, then Freedom Quest. */
export function Grow({ kids }: { kids: Kids }) {
  const [tab, setTab] = useState<'tree' | 'freedom'>('tree');
  useEffect(() => {
    void getSetting<'tree' | 'freedom'>('growTab', 'tree').then(setTab);
  }, []);
  const pick = (v: 'tree' | 'freedom') => {
    setTab(v);
    void setSetting('growTab', v);
  };
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t('Grow')} className="grid grid-cols-2 gap-2">
        {(
          [
            ['tree', t('Money Tree')],
            ['freedom', t('Freedom Quest')],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            className={cn(
              'min-h-14 rounded-2xl border-2 text-lg font-bold focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
              tab === v ? 'border-primary bg-surface' : 'bg-surface-2 text-muted-foreground',
            )}
            onClick={() => pick(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'tree' ? <MoneyTree kids={kids} /> : <FreedomQuest kids={kids} />}
    </div>
  );
}

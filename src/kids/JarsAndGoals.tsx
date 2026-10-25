import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { t } from '@/i18n';
import { JarArt } from './art/Art';
import { JAR_COLORS } from './art/palette';
import { categoryName, coins, goalName, jarLine, jarName, sourceName, splitWords } from './copy';
import {
  addMoney,
  kidsDb,
  MAX_GOALS,
  newId,
  spendMoney,
  weeklySavePace,
  type Category,
  type GoalPicture,
  type Source,
} from './db';
import { GoalIcon } from './goalIcons';
import { CATEGORY_ICONS, GOAL_ICONS, SOURCE_ICONS } from './icons';
import { splitAmount, weeksToGoal, type Jar, type Split } from './math';
import type { Kids } from './types';
import { BigButton, Celebrate, Keypad, Panel, PickCard } from './ui';

const SOURCES: Source[] = ['allowance', 'chores', 'redEnvelope', 'gift', 'other'];
const CATEGORIES: Category[] = ['snack', 'toy', 'book', 'game', 'giftForSomeone', 'other'];
const PICTURES: GoalPicture[] = ['bike', 'game', 'book', 'trip', 'gift'];
const JARS: Jar[] = ['spend', 'save', 'grow'];

/** The split as a coloured bar with two sliders: Spend, then Save; Grow takes the rest. */
function SplitEditor({ split, onChange }: { split: Split; onChange: (s: Split) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 overflow-hidden rounded-full" aria-hidden>
        {JARS.map((j) => (
          <div key={j} style={{ width: `${split[j]}%`, background: JAR_COLORS[j] }} />
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          {jarName('spend')}: {splitWords(split.spend)}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={split.spend}
          aria-valuetext={splitWords(split.spend)}
          className="h-10 accent-[#f59e0b]"
          onChange={(e) => {
            const spend = Number(e.target.value);
            const save = Math.min(split.save, 100 - spend);
            onChange({ spend, save, grow: 100 - spend - save });
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">
          {jarName('save')}: {splitWords(split.save)}
        </span>
        <input
          type="range"
          min={0}
          max={100 - split.spend}
          step={10}
          value={split.save}
          aria-valuetext={splitWords(split.save)}
          className="h-10 accent-[#3b82f6]"
          onChange={(e) => {
            const save = Number(e.target.value);
            onChange({ spend: split.spend, save, grow: 100 - split.spend - save });
          }}
        />
      </label>
      <p className="font-semibold">
        {jarName('grow')}: {splitWords(split.grow)}
      </p>
    </div>
  );
}

/** Money in (KD-5): where it came from, how much, and the 3-jar split. */
function MoneyIn({ kids, onDone }: { kids: Kids; onDone: () => void }) {
  const [source, setSource] = useState<Source>();
  const [amount, setAmount] = useState(0);
  const [split, setSplit] = useState<Split>(kids.profile!.split);
  const parts = splitAmount(amount, split);
  if (!source)
    return (
      <Panel title={t('Where did the money come from?')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SOURCES.map((s) => {
            const Icon = SOURCE_ICONS[s];
            return (
              <PickCard key={s} onClick={() => setSource(s)}>
                <Icon aria-hidden />
                {sourceName(s)}
              </PickCard>
            );
          })}
        </div>
      </Panel>
    );
  return (
    <Panel title={t('How much did you get?')}>
      <div className="flex flex-col gap-5">
        <Keypad value={amount} onChange={setAmount} label={t('Amount')} />
        <div>
          <h3 className="mb-2 text-lg font-bold">{t('Where the coins go')}</h3>
          <SplitEditor split={split} onChange={setSplit} />
        </div>
        <ul className="grid grid-cols-3 gap-2 text-center" aria-label={t('Your coins go to')}>
          {JARS.map((j) => (
            <li key={j} className="rounded-2xl bg-surface-2 p-2">
              <span className="block font-semibold">{jarName(j)}</span>
              <span className="tabular">{coins(parts[j])}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <BigButton
            tone="good"
            disabled={amount <= 0}
            onClick={async () => {
              const p = kids.profile!;
              if (split.spend !== p.split.spend || split.save !== p.split.save)
                await kidsDb.profiles.update(p.id, { split });
              await addMoney({ ...p, split }, amount, source);
              onDone();
            }}
          >
            {t('Put it in my jars')}
          </BigButton>
          <BigButton tone="plain" onClick={onDone}>
            {t('Cancel')}
          </BigButton>
        </div>
      </div>
    </Panel>
  );
}

/** Money out (KD-5): what it was for, Need or Want, how much; asks before using Save. */
function MoneyOut({ kids, onDone }: { kids: Kids; onDone: () => void }) {
  const [category, setCategory] = useState<Category>();
  const [need, setNeed] = useState<boolean>();
  const [amount, setAmount] = useState(0);
  const [ask, setAsk] = useState(false);
  const { spend, save } = kids.jars;
  const fromSave = Math.max(0, amount - spend);
  const pay = async (useSave: boolean) => {
    await spendMoney(
      kids.profile!.id,
      { spend: Math.min(amount, spend), save: useSave ? fromSave : 0 },
      category!,
      need,
    );
    onDone();
  };
  if (!category)
    return (
      <Panel title={t('What did you buy?')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            return (
              <PickCard key={c} onClick={() => setCategory(c)}>
                <Icon aria-hidden />
                {categoryName(c)}
              </PickCard>
            );
          })}
        </div>
      </Panel>
    );
  if (need === undefined)
    return (
      <Panel title={t('Was it a need or a want?')}>
        <p className="mb-3 text-base text-muted-foreground">
          {t('A need is something you must have. A want is nice to have.')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <BigButton tone="plain" onClick={() => setNeed(true)}>
            {t('Need')}
          </BigButton>
          <BigButton tone="plain" onClick={() => setNeed(false)}>
            {t('Want')}
          </BigButton>
        </div>
      </Panel>
    );
  if (ask)
    return (
      <Panel title={t('Not enough in Spend')}>
        <p className="mb-4">
          {t('Your Spend jar has {spend}. Use {more} from your Savings jar too?', {
            spend: coins(spend),
            more: coins(fromSave),
          })}
        </p>
        <div className="flex flex-wrap gap-3">
          <BigButton tone="warm" onClick={() => void pay(true)}>
            {t('Yes, use Savings')}
          </BigButton>
          <BigButton tone="plain" onClick={onDone}>
            {t('No, wait')}
          </BigButton>
        </div>
      </Panel>
    );
  const short = amount > spend + save;
  return (
    <Panel title={t('How much did it cost?')}>
      <div className="flex flex-col gap-4">
        <Keypad value={amount} onChange={setAmount} label={t('Amount')} />
        {short && (
          <p className="font-semibold text-critical">
            {t('That is more than your Spend and Savings jars have.')}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <BigButton
            tone="warm"
            disabled={amount <= 0 || short}
            onClick={() => (amount > spend ? setAsk(true) : void pay(false))}
          >
            {t('Take it out')}
          </BigButton>
          <BigButton tone="plain" onClick={onDone}>
            {t('Cancel')}
          </BigButton>
        </div>
      </div>
    </Panel>
  );
}

/** Goals (KD-6): up to three pictures with a price; weeks to go at the saving pace. */
function Goals({ kids }: { kids: Kids }) {
  const [adding, setAdding] = useState(false);
  const [picture, setPicture] = useState<GoalPicture>();
  const [price, setPrice] = useState(0);
  const pace = weeklySavePace(kids.entries);
  const save = kids.jars.save;
  return (
    <Panel title={t('My goals')}>
      <div id="goals" className="flex flex-col gap-3">
        {kids.goals.length === 0 && !adding && (
          <p className="text-base text-muted-foreground">{t('Pick something to save for.')}</p>
        )}
        {kids.goals.map((g) => {
          const weeks = weeksToGoal(g.price, save, pace);
          const done = save >= g.price;
          return (
            <div key={g.id} className="rounded-2xl border-2 p-3" data-testid="goal">
              <div className="flex items-center gap-3">
                <GoalIcon picture={g.picture} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {goalName(g.picture)} · {coins(g.price)}
                  </p>
                  <div className="mt-1 h-5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div
                      className="h-full rounded-full bg-[#3b82f6]"
                      style={{ width: `${Math.min(100, (save / g.price) * 100)}%` }}
                    />
                  </div>
                  {!done && (
                    <p className="mt-1 text-base text-muted-foreground">
                      {weeks !== undefined
                        ? t('About {n} more weeks', { n: weeks })
                        : t('Put coins in Savings to get there.')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t('Remove the goal {name}', { name: goalName(g.picture) })}
                  className="flex size-12 items-center justify-center rounded-2xl text-muted-foreground hover:bg-surface-2"
                  onClick={() => void kidsDb.goals.delete(g.id)}
                >
                  <Trash2 className="size-6" aria-hidden />
                </button>
              </div>
              {done && (
                <div className="mt-3 flex flex-col gap-2">
                  <Celebrate
                    text={t('You did it! You saved enough for your {name}.', { name: goalName(g.picture) })}
                  />
                  <BigButton
                    tone="good"
                    onClick={async () => {
                      await spendMoney(kids.profile!.id, { save: g.price }, 'goal', undefined);
                      await kidsDb.goals.update(g.id, { reachedAt: new Date().toISOString() });
                    }}
                  >
                    {t('I bought it!')}
                  </BigButton>
                </div>
              )}
            </div>
          );
        })}
        {adding ? (
          !picture ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {PICTURES.map((p) => {
                const Icon = GOAL_ICONS[p];
                return (
                  <PickCard key={p} onClick={() => setPicture(p)}>
                    <Icon aria-hidden />
                    {goalName(p)}
                  </PickCard>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-semibold">{t('How much does it cost?')}</p>
              <Keypad value={price} onChange={setPrice} label={t('Price')} />
              <div className="flex flex-wrap gap-3">
                <BigButton
                  disabled={price <= 0}
                  onClick={async () => {
                    await kidsDb.goals.add({
                      id: newId(),
                      profileId: kids.profile!.id,
                      picture,
                      price,
                      createdAt: new Date().toISOString(),
                    });
                    setAdding(false);
                    setPicture(undefined);
                    setPrice(0);
                  }}
                >
                  {t('Save this goal')}
                </BigButton>
                <BigButton tone="plain" onClick={() => setAdding(false)}>
                  {t('Cancel')}
                </BigButton>
              </div>
            </div>
          )
        ) : (
          kids.goals.length < MAX_GOALS && (
            <BigButton tone="plain" onClick={() => setAdding(true)}>
              <Plus aria-hidden /> {t('Add a goal')}
            </BigButton>
          )
        )}
      </div>
    </Panel>
  );
}

/** Jars and Goals: the jars, money in and out, recent coins and goals. */
export function JarsAndGoals({ kids }: { kids: Kids }) {
  const { search, hash } = useLocation();
  const navigate = useNavigate();
  const flow = new URLSearchParams(search).get('add');
  const done = () => navigate('/kids/jars', { replace: true });
  useEffect(() => {
    if (hash === '#goals') document.getElementById('goals')?.scrollIntoView();
  }, [hash]);
  if (flow === 'in') return <MoneyIn kids={kids} onDone={done} />;
  if (flow === 'out') return <MoneyOut kids={kids} onDone={done} />;
  const most = Math.max(1, kids.jars.spend, kids.jars.save, kids.jars.grow);
  const recent = kids.entries.slice(-6).reverse();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('Jars and Goals')}</h1>
      <Panel>
        <ul className="grid grid-cols-3 gap-2">
          {JARS.map((j) => (
            <li key={j} className="flex flex-col items-center text-center">
              <JarArt jar={j} level={kids.jars[j] / most} size={80} />
              <span className="font-bold">{jarName(j)}</span>
              <span className="tabular">{coins(kids.jars[j])}</span>
              <span className="text-sm text-muted-foreground">{jarLine(j)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <BigButton tone="good" onClick={() => navigate('/kids/jars?add=in')}>
            <Plus aria-hidden /> {t('I got money')}
          </BigButton>
          <BigButton tone="warm" onClick={() => navigate('/kids/jars?add=out')}>
            <Minus aria-hidden /> {t('I spent money')}
          </BigButton>
        </div>
      </Panel>
      <Goals kids={kids} />
      {recent.length > 0 && (
        <Panel title={t('Lately')}>
          <ul className="flex flex-col gap-2 text-base">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {e.amount > 0 ? sourceName(e.source ?? 'other') : categoryName(e.category ?? 'other')} ·{' '}
                  {jarName(e.jar)}
                  {e.need !== undefined && ` · ${e.need ? t('Need') : t('Want')}`}
                </span>
                <span className={e.amount > 0 ? 'text-good' : 'text-muted-foreground'}>
                  {e.amount > 0 ? '+' : '−'}
                  {coins(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

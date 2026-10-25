import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Download, KeyRound, Minus, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { downloadText } from '@/lib/download';
import { setMode } from '@/lib/mode';
import { t } from '@/i18n';
import { Avatar } from './art/Art';
import { exportChild, importChild, resetChild } from './backup';
import { coins, rateWords } from './copy';
import { defaultGrowth, deleteProfile, getSetting, kidsDb, setSetting, type Growth } from './db';
import { DEFAULT_SPLIT, type Split } from './math';
import { checkPin, hasPin, isPinShape, removePin, setPin, waitLeft } from './pin';
import { SplitEditor } from './split';
import type { Kids } from './types';
import { BigButton, Panel } from './ui';

const COST_KEYS = ['home', 'food', 'transport', 'fun', 'travel'] as const;
type CostKey = (typeof COST_KEYS)[number];
const DEFAULT_COSTS: Record<CostKey, number> = {
  home: 240_000,
  food: 120_000,
  transport: 36_000,
  fun: 36_000,
  travel: 60_000,
};

/** Four big dots and a number pad for the parent PIN. */
function PinPad({ label, onDone }: { label: string; onDone: (pin: string) => void }) {
  const [pin, setPinText] = useState('');
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPinText(next);
    if (next.length === 4) {
      onDone(next);
      setPinText('');
    }
  };
  const key =
    'min-h-14 rounded-2xl border-2 bg-surface text-2xl font-semibold hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none';
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-lg font-semibold">{label}</p>
      <div className="flex gap-3" aria-label={t('{n} of 4 digits', { n: pin.length })} role="status">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-full border-2 ${i < pin.length ? 'bg-foreground' : ''}`} />
        ))}
      </div>
      <div role="group" aria-label={t('PIN pad')} className="grid w-full max-w-xs grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'].map((d, i) =>
          d ? (
            <button key={d} type="button" className={key} onClick={() => press(d)}>
              {d}
            </button>
          ) : (
            <span key={`gap-${i}`} />
          ),
        )}
        <button
          type="button"
          className={key}
          aria-label={t('Delete a number')}
          onClick={() => setPinText(pin.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

/** The PIN check before the grown-ups corner (KD-10): three wrong tries mean a 30-second wait. */
function PinGate({ onOpen }: { onOpen: () => void }) {
  const [message, setMessage] = useState<string>();
  const [wait, setWait] = useState(0);
  useEffect(() => {
    void waitLeft().then((ms) => setWait(Math.ceil(ms / 1000)));
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);
  return (
    <Panel title={t('Grown-ups only')}>
      {wait > 0 ? (
        <p className="text-center text-lg font-semibold" role="status">
          {t('Too many tries. Please wait {n} seconds.', { n: wait })}
        </p>
      ) : (
        <PinPad
          label={t('Enter the grown-ups PIN')}
          onDone={async (pin) => {
            const r = await checkPin(pin);
            if (r === 'ok') onOpen();
            else if (r === 'wait') {
              setWait(Math.ceil((await waitLeft()) / 1000));
              setMessage(undefined);
            } else setMessage(t('That is not the PIN. Try again.'));
          }}
        />
      )}
      {message && wait <= 0 && (
        <p className="mt-3 text-center font-semibold text-critical" role="alert">
          {message}
        </p>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('A child lock, not a security feature.')}
      </p>
    </Panel>
  );
}

/** Set, change or remove the PIN. */
function PinSettings() {
  const [has, setHas] = useState<boolean>();
  const [step, setStep] = useState<'idle' | 'first' | 'again'>('idle');
  const [first, setFirst] = useState('');
  const [note, setNote] = useState<string>();
  useEffect(() => {
    void hasPin().then(setHas);
  }, []);
  return (
    <Panel title={t('Parent PIN')}>
      <p className="mb-3 text-base text-muted-foreground">
        {t(
          'With a PIN, leaving Beginner mode and opening this corner need it. A child lock, not a security feature.',
        )}
      </p>
      {step === 'idle' ? (
        <div className="flex flex-wrap gap-3">
          <BigButton tone="plain" onClick={() => setStep('first')}>
            <KeyRound aria-hidden /> {has ? t('Change the PIN') : t('Set a PIN')}
          </BigButton>
          {has && (
            <BigButton
              tone="plain"
              onClick={async () => {
                await removePin();
                setHas(false);
                setNote(t('The PIN is removed.'));
              }}
            >
              {t('Remove the PIN')}
            </BigButton>
          )}
        </div>
      ) : (
        <PinPad
          key={step}
          label={step === 'first' ? t('Choose 4 digits') : t('Enter the same 4 digits again')}
          onDone={async (pin) => {
            if (step === 'first') {
              setFirst(pin);
              setStep('again');
            } else if (pin === first && isPinShape(pin)) {
              await setPin(pin);
              setHas(true);
              setStep('idle');
              setNote(t('The PIN is set.'));
            } else {
              setStep('first');
              setNote(t('The two PINs were different. Try again.'));
            }
          }}
        />
      )}
      {note && (
        <p className="mt-3 font-semibold" role="status">
          {note}
        </p>
      )}
    </Panel>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  show,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  show: (v: number) => ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="text-base text-muted-foreground">{show(value)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2" role="group" aria-label={label}>
        <BigButton
          tone="plain"
          aria-label={t('Less')}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus aria-hidden />
        </BigButton>
        <BigButton
          tone="plain"
          aria-label={t('More')}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <Plus aria-hidden />
        </BigButton>
      </div>
    </div>
  );
}

/** Allowance, split, growth rates and Freedom Quest costs (KD-11). */
function Settings({ kids }: { kids: Kids }) {
  const [defaultSplit, setDefaultSplit] = useState<Split>();
  const [costs, setCosts] = useState<Record<CostKey, number>>();
  useEffect(() => {
    void getSetting<Split>('defaultSplit', DEFAULT_SPLIT).then(setDefaultSplit);
    void getSetting<Record<CostKey, number>>('costPresets', DEFAULT_COSTS).then(setCosts);
  }, []);
  const growth: Growth = kids.growth ?? defaultGrowth();
  const costLabel = (k: CostKey) =>
    ({ home: t('Home'), food: t('Food'), transport: t('Getting around'), fun: t('Fun'), travel: t('Trips') })[
      k
    ];
  return (
    <>
      <Panel title={t('Allowance and jars')}>
        <div className="flex flex-col gap-5">
          <Stepper
            label={t('Weekly allowance')}
            value={kids.allowance}
            min={0}
            max={5_000}
            step={10}
            onChange={(v) => void setSetting('allowance', v)}
            show={(v) => (v ? t('{amount} a week', { amount: coins(v) }) : t('Not set'))}
          />
          <p className="text-sm text-muted-foreground">
            {t('Used for weeks to a goal until there are a few weeks of saving to go by.')}
          </p>
          {kids.profile && (
            <div>
              <p className="mb-2 font-semibold">{t('{name}’s jar split', { name: kids.profile.nickname })}</p>
              <SplitEditor
                split={kids.profile.split}
                onChange={(split) => void kidsDb.profiles.update(kids.profile!.id, { split })}
              />
            </div>
          )}
          {defaultSplit && (
            <div>
              <p className="mb-2 font-semibold">{t('Split for new children')}</p>
              <SplitEditor
                split={defaultSplit}
                onChange={(s) => {
                  setDefaultSplit(s);
                  void setSetting('defaultSplit', s);
                }}
              />
            </div>
          )}
        </div>
      </Panel>
      <Panel title={t('How fast money grows')}>
        <div className="flex flex-col gap-5">
          <Stepper
            label={t('Bank')}
            value={growth.bank}
            min={0}
            max={5}
            onChange={(bank) => void setSetting('growth', { ...growth, bank })}
            show={rateWords}
          />
          <Stepper
            label={t('Money tree')}
            value={growth.tree}
            min={1}
            max={12}
            onChange={(tree) => void setSetting('growth', { ...growth, tree })}
            show={rateWords}
          />
        </div>
      </Panel>
      {costs && (
        <Panel title={t('Freedom Quest: yearly costs')}>
          <div className="flex flex-col gap-5">
            {COST_KEYS.map((k) => (
              <Stepper
                key={k}
                label={costLabel(k)}
                value={costs[k]}
                min={0}
                max={2_000_000}
                step={6_000}
                onChange={(v) => {
                  const next = { ...costs, [k]: v };
                  setCosts(next);
                  void setSetting('costPresets', next);
                }}
                show={(v) => t('{amount} a year', { amount: coins(v) })}
              />
            ))}
            <BigButton
              tone="plain"
              onClick={() => {
                setCosts(DEFAULT_COSTS);
                void setSetting('costPresets', DEFAULT_COSTS);
              }}
            >
              <RotateCcw aria-hidden /> {t('Back to the usual amounts')}
            </BigButton>
          </div>
        </Panel>
      )}
    </>
  );
}

/** For grown-ups (KD-10, KD-11): behind the PIN if set; Pro, children, settings and files. */
export function ParentCorner({ kids }: { kids: Kids }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>();
  const [confirm, setConfirm] = useState<{ id: string; what: 'reset' | 'delete' }>();
  const [note, setNote] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void hasPin().then((has) => setOpen(!has));
  }, []);
  if (open === undefined) return null;
  if (!open) return <PinGate onOpen={() => setOpen(true)} />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('Grown-ups corner')}</h1>
      <Panel title={t('Switch to Pro')}>
        <p className="mb-3 text-base text-muted-foreground">
          {t('Pro is the FI Tracker for planning your own money. The children’s data stays here, separate.')}
        </p>
        <BigButton
          onClick={() => {
            window.location.hash = '#/';
            setMode('pro');
          }}
        >
          <Briefcase aria-hidden /> {t('Switch to Pro')}
        </BigButton>
      </Panel>
      <PinSettings />
      <Panel title={t('Children')}>
        {kids.profiles.length === 0 && (
          <p className="text-base text-muted-foreground">{t('No children yet.')}</p>
        )}
        <ul className="flex flex-col gap-3">
          {kids.profiles.map((p) => (
            <li key={p.id} className="rounded-2xl border-2 p-3">
              <div className="flex items-center gap-3">
                <Avatar index={p.avatar} size={44} />
                <span className="min-w-0 flex-1 font-semibold">
                  {p.nickname} · {t('Age {age}', { age: p.age })}
                </span>
              </div>
              {confirm?.id === p.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <BigButton
                    tone="warm"
                    onClick={async () => {
                      if (confirm.what === 'delete') await deleteProfile(p.id);
                      else await resetChild(p.id);
                      setConfirm(undefined);
                      setNote(
                        confirm.what === 'delete'
                          ? t('{name} is removed.', { name: p.nickname })
                          : t('{name} starts again.', { name: p.nickname }),
                      );
                    }}
                  >
                    {confirm.what === 'delete' ? t('Delete everything') : t('Yes, start again')}
                  </BigButton>
                  <BigButton tone="plain" onClick={() => setConfirm(undefined)}>
                    {t('Keep')}
                  </BigButton>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <BigButton
                    tone="plain"
                    onClick={async () =>
                      downloadText(
                        `fi-tracker-kids-${p.nickname.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`,
                        JSON.stringify(await exportChild(p.id), null, 2),
                      )
                    }
                  >
                    <Download aria-hidden /> {t('Save progress')}
                  </BigButton>
                  <BigButton tone="plain" onClick={() => setConfirm({ id: p.id, what: 'reset' })}>
                    <RotateCcw aria-hidden /> {t('Start again')}
                  </BigButton>
                  <BigButton
                    tone="plain"
                    aria-label={t('Delete {name} and all their coins, goals and badges', {
                      name: p.nickname,
                    })}
                    onClick={() => setConfirm({ id: p.id, what: 'delete' })}
                  >
                    <Trash2 aria-hidden />
                  </BigButton>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-3">
          <BigButton tone="plain" onClick={() => navigate('/kids/profiles')}>
            {t('Choose or add a child')}
          </BigButton>
          <BigButton tone="plain" onClick={() => file.current?.click()}>
            <Upload aria-hidden /> {t('Load progress')}
          </BigButton>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('Load progress')}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const ok = await f
                .text()
                .then((text) => importChild(JSON.parse(text)))
                .catch(() => false);
              setNote(
                ok
                  ? t('Progress loaded.')
                  : t(
                      'That file could not be loaded. Is it a saved progress file, with room for one more child?',
                    ),
              );
            }}
          />
        </div>
        {note && (
          <p className="mt-3 font-semibold" role="status">
            {note}
          </p>
        )}
      </Panel>
      <Settings kids={kids} />
      <p className="text-sm text-muted-foreground">
        {t('Beginner mode has no real money, links or ads. Everything stays on this device.')}
      </p>
    </div>
  );
}

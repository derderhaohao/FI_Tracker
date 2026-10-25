import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import {
  storySchema,
  type CustomEvent,
  type PlaybackSettings,
  type Story,
  type StoryEvent,
} from '@/domain/entities';
import { customToEvent, FACTOR_LABELS, FACTORS, impactText, type Factor } from '@/domain/playback/library';
import type { PlaybackStory } from '@/domain/playback/engine';
import { db } from '@/db/db';
import { newId, patch } from '@/db/repo';
import { useAppData } from '@/app/data';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { downloadText } from '@/lib/download';
import { t } from '@/i18n';

async function saveSettings(changes: Parameters<typeof patch>[2]) {
  await patch(db.settings, 'singleton', changes);
}

/**
 * Advanced (PRD Playback UX PX-10): behaviour during events, market noise and the story ID,
 * playback settings, saving, sharing and importing stories, and the custom event builder.
 * Collapsed by default; the basics are the story cards and the event picker.
 */
export function AdvancedPanel({
  story,
  custom,
  playback,
  liveEvents,
  buildOpen,
  onChange,
}: {
  story: PlaybackStory;
  custom: readonly CustomEvent[];
  playback: PlaybackSettings;
  liveEvents: StoryEvent[];
  /** Opens the custom event builder ("Build your own" story card). */
  buildOpen: boolean;
  onChange: (s: PlaybackStory) => void;
}) {
  const { settings } = useAppData();
  const stories = settings.stories ?? [];
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (from: StoryEvent[], label: string) => {
    if (!label.trim()) return;
    const s: Story = {
      id: newId(),
      name: label.trim(),
      backdrop: story.backdrop,
      events: from.map((e) => ({ ...e, source: 'scheduled' as const })),
      behaviour: story.behaviour,
      noiseSeed: story.noiseSeed,
    };
    await saveSettings({ stories: [...stories, s] });
    setName('');
    setMessage(t('Saved “{name}”.', { name: s.name }));
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-1 gap-3">
        <Field label={t('During events')} hint={t('End card shows what each choice costs')}>
          {(id) => (
            <Select
              id={id}
              value={story.behaviour.kind === 'sell' ? `sell${story.behaviour.fall}` : story.behaviour.kind}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...story,
                  behaviour:
                    v === 'keep'
                      ? { kind: 'keep' }
                      : v === 'pause'
                        ? { kind: 'pause' }
                        : { kind: 'sell', fall: Number(v.slice(4)) },
                });
              }}
            >
              <option value="keep">{t('Keep investing')}</option>
              <option value="pause">{t('Pause new investing')}</option>
              <option value="sell0.2">{t('Sell shares after a 20% fall, buy back on recovery')}</option>
              <option value="sell0.3">{t('Sell shares after a 30% fall, buy back on recovery')}</option>
            </Select>
          )}
        </Field>
        <Field
          label={t('Market noise')}
          hint={t('Random monthly ups and downs; the same ID replays the same story')}
        >
          {(id) => (
            <div className="flex items-center gap-2">
              <input
                id={id}
                type="checkbox"
                checked={story.noiseSeed !== undefined}
                onChange={(e) =>
                  onChange({
                    ...story,
                    noiseSeed: e.target.checked ? Math.floor(Math.random() * 1e6) : undefined,
                  })
                }
              />
              {story.noiseSeed !== undefined && (
                <Input
                  aria-label={t('Story ID')}
                  className="h-8 w-28"
                  inputMode="numeric"
                  value={story.noiseSeed}
                  onChange={(e) =>
                    Number.isInteger(Number(e.target.value)) &&
                    onChange({ ...story, noiseSeed: Number(e.target.value) })
                  }
                />
              )}
            </div>
          )}
        </Field>
      </div>
      {message && <Notice>{message}</Notice>}

      <details>
        <summary className="cursor-pointer font-medium">
          {t('Saved stories ({length})', { length: stories.length })}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {stories.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">
                {t('{length} events', { length: s.events.length })}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('Share {name}', { name: s.name })}
                onClick={() =>
                  downloadText(
                    `${s.name.replace(/[^\w-]+/g, '-')}.story.json`,
                    JSON.stringify({ app: 'fi-tracker-story', story: s }, null, 2),
                  )
                }
              >
                <Download />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('Delete {name}', { name: s.name })}
                onClick={() => void saveSettings({ stories: stories.filter((x) => x.id !== s.id) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('Name')}>
              {(id) => (
                <Input
                  id={id}
                  className="h-8 w-56"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('My blockade test')}
                />
              )}
            </Field>
            <Button size="sm" disabled={!name.trim()} onClick={() => void save(story.events, name)}>
              {t('Save this story')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!name.trim() || liveEvents.length === 0}
              onClick={() => void save([...story.events, ...liveEvents], name)}
            >
              {t('Save this run (with live events)')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden /> {t('Import a story')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label={t('Story file')}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const raw = JSON.parse(await f.text()) as { story?: unknown };
                  const parsed = storySchema.safeParse(raw.story ?? raw);
                  if (!parsed.success) throw new Error(t('not a story file'));
                  await saveSettings({ stories: [...stories, { ...parsed.data, id: newId() }] });
                  setMessage(t('Imported “{name}”.', { name: parsed.data.name }));
                } catch (err) {
                  setMessage(
                    t('Could not import: {v}', { v: err instanceof Error ? err.message : String(err) }),
                  );
                }
              }}
            />
          </div>
          <p className="text-xs text-subtle">
            {t('Story files hold events and timing only, never balances.')}
          </p>
        </div>
      </details>

      <CustomEventBuilder custom={custom} open={buildOpen} />

      <details>
        <summary className="cursor-pointer font-medium">{t('Playback settings')}</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={playback.autoPause}
              onChange={(e) => void saveSettings({ playback: { ...playback, autoPause: e.target.checked } })}
            />
            {t('Pause 3 s at each event')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={playback.pauseOnFire}
              onChange={(e) =>
                void saveSettings({ playback: { ...playback, pauseOnFire: e.target.checked } })
              }
            />
            {t('Pause when I fire an event')}
          </label>
          <Field label={t('勞退 guaranteed minimum / year')} hint={t('Applied when the balance unlocks')}>
            {(id) => (
              <Input
                id={id}
                className="h-8 w-24"
                type="number"
                step={0.1}
                defaultValue={(playback.pensionFloor * 100).toFixed(1)}
                onBlur={(e) => {
                  const v = Number(e.target.value) / 100;
                  if (v >= 0 && v <= 0.1) void saveSettings({ playback: { ...playback, pensionFloor: v } });
                }}
              />
            )}
          </Field>
          <Field label={t('勞退 fund mix (TW shares / global shares / bonds, %)')}>
            {(id) => (
              <Input
                id={id}
                className="h-8 w-40"
                defaultValue={`${Math.round(playback.pensionMix.tw_equity * 100)}/${Math.round(playback.pensionMix.global_equity * 100)}/${Math.round(playback.pensionMix.bond * 100)}`}
                onBlur={(e) => {
                  const parts = e.target.value.split('/').map(Number);
                  const sum = parts.reduce((a, b) => a + b, 0);
                  if (parts.length === 3 && parts.every((x) => x >= 0) && sum > 0)
                    void saveSettings({
                      playback: {
                        ...playback,
                        pensionMix: {
                          tw_equity: parts[0] / sum,
                          global_equity: parts[1] / sum,
                          bond: parts[2] / sum,
                        },
                      },
                    });
                }}
              />
            )}
          </Field>
        </div>
      </details>
    </div>
  );
}

/** Build your own event (SC-9). */
function CustomEventBuilder({ custom, open }: { custom: readonly CustomEvent[]; open: boolean }) {
  const [name, setName] = useState('');
  const [factor, setFactor] = useState<Factor>('tw_equity');
  const [vals, setVals] = useState({ d: '30', a: '6', h: '12', r: '36', p: '0' });
  const [shocks, setShocks] = useState<CustomEvent['shocks']>([]);
  const num = (k: keyof typeof vals) => Number(vals[k]);
  const valid =
    Number.isFinite(num('d')) &&
    num('d') < 95 &&
    num('a') >= 0 &&
    num('h') >= 0 &&
    num('r') >= 0 &&
    num('p') >= 0 &&
    num('p') <= 100;
  return (
    <details open={open || undefined} id="build-your-own">
      <summary className="cursor-pointer font-medium">
        {t('Build your own event ({length})', { length: custom.length })}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {custom.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">{impactText(customToEvent(c))}</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('Delete {name}', { name: c.name })}
              onClick={() => void saveSettings({ customEvents: custom.filter((x) => x.id !== c.id) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('Market')}>
            {(id) => (
              <Select id={id} value={factor} onChange={(e) => setFactor(e.target.value as Factor)}>
                {FACTORS.map((f) => (
                  <option key={f} value={f}>
                    {FACTOR_LABELS[f]}
                    {f === 'usd' || f === 'jpy' ? t(' (vs TWD)') : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {(
            [
              ['d', t('Fall % (− = rise)')],
              ['a', t('Over months')],
              ['h', t('Stays low, months')],
              ['r', t('Recovers over, months')],
              ['p', t('Never comes back, %')],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              {(id) => (
                <Input
                  id={id}
                  className="h-8 w-24"
                  inputMode="decimal"
                  value={vals[k]}
                  onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={!valid}
            onClick={() =>
              setShocks([
                ...shocks,
                { factor, d: num('d') / 100, a: num('a'), h: num('h'), r: num('r'), p: num('p') / 100 },
              ])
            }
          >
            <Plus aria-hidden /> {t('Add market')}
          </Button>
        </div>
        {shocks.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {impactText(customToEvent({ id: 'draft', name: 'draft', story: '', shocks }))}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('Event name')}>
            {(id) => (
              <Input id={id} className="h-8 w-56" value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Button
            size="sm"
            disabled={!name.trim() || shocks.length === 0}
            onClick={() => {
              void saveSettings({
                customEvents: [
                  ...custom,
                  { id: `custom:${newId()}`, name: name.trim(), story: t('Your own event.'), shocks },
                ],
              });
              setName('');
              setShocks([]);
            }}
          >
            {t('Save event')}
          </Button>
        </div>
      </div>
    </details>
  );
}

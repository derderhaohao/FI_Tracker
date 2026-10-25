import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { Avatar } from './art/Art';
import { AVATAR_COUNT } from './art/palette';
import { createProfile, MAX_PROFILES, setSetting } from './db';
import type { Kids } from './types';
import { BigButton, Panel } from './ui';

/** Pick who is playing, or add a child: nickname, animal and age only (KD-3). */
export function Profiles({ kids, first = false }: { kids: Kids; first?: boolean }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(first || kids.profiles.length === 0);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [age, setAge] = useState(9);
  const full = kids.profiles.length >= MAX_PROFILES;

  const shell = (body: ReactNode) =>
    first ? (
      <div className="min-h-screen bg-[#f6f8ef] text-lg text-[#1c2a12] dark:bg-[#141a10] dark:text-[#eef3e6]">
        <main className="mx-auto max-w-2xl px-4 py-6">{body}</main>
      </div>
    ) : (
      body
    );

  if (adding && !full)
    return shell(
      <Panel title={first ? t('Hello! Who is learning today?') : t('Add a child')}>
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nickname.trim()) return;
            await createProfile({ nickname, avatar, age });
            navigate('/kids');
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="font-semibold">{t('Nickname')}</span>
            <input
              className="min-h-14 rounded-2xl border-2 bg-surface px-4 text-xl focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
              value={nickname}
              maxLength={20}
              autoComplete="off"
              placeholder={t('A fun name, not your real one')}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="mb-2 font-semibold">{t('Pick an animal')}</legend>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={avatar === i}
                  aria-label={t('Animal {n}', { n: i + 1 })}
                  className={cn(
                    'flex min-h-16 items-center justify-center rounded-2xl border-2 bg-surface focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                    avatar === i ? 'border-primary bg-surface-2' : '',
                  )}
                  onClick={() => setAvatar(i)}
                >
                  <Avatar index={i} size={52} />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold" id="kid-age">
              {t('Age')}
            </span>
            <div className="flex items-center gap-3" role="group" aria-labelledby="kid-age">
              <BigButton
                tone="plain"
                aria-label={t('Younger')}
                onClick={() => setAge((a) => Math.max(4, a - 1))}
              >
                <Minus aria-hidden />
              </BigButton>
              <output className="w-12 text-center text-2xl font-bold" aria-live="polite">
                {age}
              </output>
              <BigButton
                tone="plain"
                aria-label={t('Older')}
                onClick={() => setAge((a) => Math.min(15, a + 1))}
              >
                <Plus aria-hidden />
              </BigButton>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <BigButton type="submit" disabled={!nickname.trim()}>
              {t('Start')}
            </BigButton>
            {!first && kids.profiles.length > 0 && (
              <BigButton tone="plain" onClick={() => setAdding(false)}>
                {t('Back')}
              </BigButton>
            )}
          </div>
        </form>
      </Panel>,
    );

  return shell(
    <Panel title={t('Who is playing?')}>
      <ul className="grid grid-cols-2 gap-3">
        {kids.profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-pressed={kids.profile?.id === p.id}
              className={cn(
                'flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-surface p-3 text-xl font-bold focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                kids.profile?.id === p.id && 'border-primary',
              )}
              onClick={async () => {
                await setSetting('activeProfile', p.id);
                navigate('/kids');
              }}
            >
              <Avatar index={p.avatar} size={64} />
              {p.nickname}
            </button>
          </li>
        ))}
      </ul>
      {!full && (
        <BigButton tone="plain" className="mt-4" onClick={() => setAdding(true)}>
          <Plus aria-hidden /> {t('Add a child')}
        </BigButton>
      )}
    </Panel>,
  );
}

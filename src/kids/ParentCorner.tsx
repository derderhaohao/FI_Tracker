import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Trash2 } from 'lucide-react';
import { setMode } from '@/lib/mode';
import { t } from '@/i18n';
import { Avatar } from './art/Art';
import { deleteProfile } from './db';
import type { Kids } from './types';
import { BigButton, Panel } from './ui';

/** For grown-ups: switch back to Pro and manage the children's profiles (KD-1, KD-3). */
export function ParentCorner({ kids }: { kids: Kids }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<string>();
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
      <Panel title={t('Children')}>
        {kids.profiles.length === 0 && (
          <p className="text-base text-muted-foreground">{t('No children yet.')}</p>
        )}
        <ul className="flex flex-col gap-2">
          {kids.profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border-2 p-2">
              <Avatar index={p.avatar} size={44} />
              <span className="min-w-0 flex-1 font-semibold">
                {p.nickname} · {t('Age {age}', { age: p.age })}
              </span>
              {confirm === p.id ? (
                <span className="flex gap-2">
                  <BigButton
                    tone="warm"
                    onClick={async () => {
                      await deleteProfile(p.id);
                      setConfirm(undefined);
                    }}
                  >
                    {t('Delete everything')}
                  </BigButton>
                  <BigButton tone="plain" onClick={() => setConfirm(undefined)}>
                    {t('Keep')}
                  </BigButton>
                </span>
              ) : (
                <button
                  type="button"
                  className="flex size-12 items-center justify-center rounded-2xl text-muted-foreground hover:bg-surface-2"
                  aria-label={t('Delete {name} and all their coins, goals and badges', { name: p.nickname })}
                  onClick={() => setConfirm(p.id)}
                >
                  <Trash2 className="size-6" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {kids.profiles.length > 0 && (
          <BigButton tone="plain" className="mt-3" onClick={() => navigate('/kids/profiles')}>
            {t('Choose or add a child')}
          </BigButton>
        )}
      </Panel>
      <p className="text-sm text-muted-foreground">
        {t('Beginner mode has no real money, links or ads. Everything stays on this device.')}
      </p>
    </div>
  );
}

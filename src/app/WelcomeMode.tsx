import { Briefcase, Sprout } from 'lucide-react';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { setMode, type Mode } from '@/lib/mode';
import { t } from '@/i18n';

/** First visit (KD-1): who is using the app today? The answer is kept on this device. */
export function WelcomeMode() {
  const pick = (mode: Mode) => {
    if (mode === 'beginner' && !window.location.hash.startsWith('#/kids')) window.location.hash = '#/kids';
    setMode(mode);
  };
  const card =
    'flex min-h-40 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 bg-surface p-6 text-center shadow-sm hover:border-primary focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none';
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2">
        <img src="./favicon.svg" alt="" className="size-8" />
        <span className="text-xl font-semibold">{t('FI Tracker')}</span>
      </div>
      <h1 className="text-center text-2xl font-semibold">{t('Who is using this today?')}</h1>
      <div className="flex w-full flex-col gap-4 sm:flex-row">
        <button type="button" className={card} onClick={() => pick('pro')}>
          <Briefcase className="size-12 text-primary" aria-hidden />
          <span className="text-lg font-semibold">{t('A grown-up planning money (Pro)')}</span>
          <span className="text-sm text-muted-foreground">
            {t('Net worth, cash flow, goals and projections.')}
          </span>
        </button>
        <button type="button" className={card} onClick={() => pick('beginner')}>
          <Sprout className="size-12 text-good" aria-hidden />
          <span className="text-lg font-semibold">{t('A kid learning about money (Beginner)')}</span>
          <span className="text-sm text-muted-foreground">
            {t('Jars, goals, a money tree and short lessons.')}
          </span>
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {t('You can switch later in Settings. Everything stays on this device.')}
      </p>
      <LanguageSwitch />
    </main>
  );
}

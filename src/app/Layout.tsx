import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, RefreshCw, Settings as SettingsIcon, Target, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BackupBanner } from './BackupBanner';
import { UpdatePrompt } from './UpdatePrompt';
import { useAppData } from './data';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { t } from '@/i18n';

/**
 * Five destinations, the same on desktop and phone (UX doc, N1). `match` lists the paths a
 * destination holds, so it stays highlighted on its tabs (and Settings on the tools).
 */
const NAV: { to: string; label: string; icon: LucideIcon; match: string[] }[] = [
  { to: '/', label: t('Home'), icon: Home, match: [] },
  { to: '/update', label: t('Update'), icon: RefreshCw, match: ['/update'] },
  { to: '/money/balances', label: t('My money'), icon: Wallet, match: ['/money'] },
  { to: '/plan', label: t('My plan'), icon: Target, match: ['/plan'] },
  { to: '/settings', label: t('Settings'), icon: SettingsIcon, match: ['/settings', '/tools'] },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  return item.to === '/' ? pathname === '/' : item.match.some((m) => pathname.startsWith(m));
}

function MobileNav() {
  const { pathname } = useLocation();
  return (
    <nav aria-label={t('Main')} className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface md:hidden">
      {NAV.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs',
              active ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * First run and setup in focus mode (UX doc, O1): no sidebar or tabs, just the name, the
 * language picker and, during setup, a way out.
 */
function FocusLayout({ setup }: { setup: boolean }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-3 border-b bg-surface px-4 py-3 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <img src="./favicon.svg" alt="" className="size-6" />
          <span className="font-semibold">{t('FI Tracker')}</span>
        </Link>
        <div className="flex items-center gap-3">
          {setup && (
            <Link to="/" className="text-sm text-primary hover:underline">
              {t('Exit setup')}
            </Link>
          )}
          <LanguageSwitch compact />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <Outlet />
      </main>
      <UpdatePrompt holdOffline />
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { accounts } = useAppData();
  // Plan chrome such as the backup banner stays off the standalone tools (TM-2).
  const tool = pathname.startsWith('/tools/');
  const setup = pathname.startsWith('/setup');
  if (setup || (pathname === '/' && accounts.length === 0)) return <FocusLayout setup={setup} />;
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-surface md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="./favicon.svg" alt="" className="size-6" />
          <span className="font-semibold">{t('FI Tracker')}</span>
        </div>
        <nav aria-label={t('Main')} className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm',
                  active
                    ? 'bg-surface-2 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <LanguageSwitch className="px-4 pt-3" />
        <p className="px-4 py-3 text-xs text-subtle">{t('Data stays in this browser.')}</p>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        {!tool && <BackupBanner />}
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <UpdatePrompt />
    </div>
  );
}

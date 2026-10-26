import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  ClipboardCheck,
  FlaskConical,
  Hourglass,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  RefreshCw,
  Settings as SettingsIcon,
  Table2,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { BackupBanner } from './BackupBanner';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { ModeSwitch } from '@/components/ModeSwitch';
import { t } from '@/i18n';

const NAV = [
  { to: '/', label: t('Dashboard'), icon: LayoutDashboard },
  { to: '/update', label: t('Monthly update'), icon: RefreshCw },
  { to: '/accounts', label: t('Accounts'), icon: Landmark },
  { to: '/snapshots', label: t('Snapshots'), icon: Table2 },
  { to: '/cashflow', label: t('Cash flow'), icon: ArrowLeftRight },
  { to: '/goal', label: t('Goal'), icon: Target },
  { to: '/projection', label: t('Projection'), icon: TrendingUp },
  { to: '/lab', label: t('Strategy Lab'), icon: FlaskConical },
  { to: '/reviews', label: t('Reviews'), icon: ClipboardCheck },
  { to: '/settings', label: t('Settings'), icon: SettingsIcon },
] as const;

/** Standalone tools: separate from the plan and never reading its data (TM-1). */
const TOOLS = [{ to: '/tools/time-machine', label: t('Time Machine'), icon: Hourglass }] as const;

function SandboxBadge() {
  return (
    <span className="ml-auto shrink-0 rounded bg-tool-accent-bg px-1 py-0.5 text-xs font-medium text-tool-accent">
      {t('Sandbox')}
    </span>
  );
}

/** Phone tabs (product review, issue 9): four destinations plus More, which lists the rest. */
const PHONE_LABELS: Record<string, string> = { '/update': t('Update') };
const PHONE_TABS = ['/', '/update', '/cashflow', '/lab'];

function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const tabs = NAV.filter((n) => PHONE_TABS.includes(n.to));
  const more = NAV.filter((n) => !PHONE_TABS.includes(n.to));
  const moreActive = [...more, ...TOOLS].some((n) => pathname.startsWith(n.to));
  const item = 'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-xs';
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 md:hidden" onClick={() => setOpen(false)}>
          <nav
            aria-label={t('More pages')}
            className="absolute inset-x-0 bottom-14 rounded-t-lg border-t bg-surface p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm',
                    isActive ? 'bg-surface-2 font-medium' : 'text-foreground',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ))}
            <p className="mt-1 border-t px-3 pt-2 pb-1 text-xs font-medium text-subtle">
              {t('Standalone tools')}
            </p>
            {TOOLS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm',
                    isActive ? 'bg-surface-2 font-medium' : 'text-foreground',
                  )
                }
              >
                <Icon className="size-5 text-tool-accent" aria-hidden />
                {label}
                <SandboxBadge />
              </NavLink>
            ))}
            <ModeSwitch className="w-full border-t px-3 py-3" />
            <LanguageSwitch className="border-t px-3 pt-3 pb-1" />
          </nav>
        </div>
      )}
      <nav
        aria-label={t('Main')}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface md:hidden"
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) => cn(item, isActive ? 'text-primary' : 'text-muted-foreground')}
          >
            <Icon className="size-5" aria-hidden />
            <span className="whitespace-nowrap">{PHONE_LABELS[to] ?? label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-label={t('More pages')}
          className={cn(item, moreActive || open ? 'text-primary' : 'text-muted-foreground')}
          onClick={() => setOpen((o) => !o)}
        >
          <MoreHorizontal className="size-5" aria-hidden />
          <span>{t('More')}</span>
        </button>
      </nav>
    </>
  );
}

export function Layout() {
  // Plan chrome such as the backup banner stays off the standalone tools (TM-2).
  const tool = useLocation().pathname.startsWith('/tools/');
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-surface md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="./favicon.svg" alt="" className="size-6" />
          <span className="font-semibold">{t('FI Tracker')}</span>
        </div>
        <nav aria-label={t('Main')} className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                  isActive
                    ? 'bg-surface-2 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
          <div className="mt-3 border-t pt-3" role="group" aria-label={t('Standalone tools')}>
            <p className="px-2.5 pb-1 text-xs font-medium text-subtle">{t('Standalone tools')}</p>
            {TOOLS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                    isActive
                      ? 'bg-tool-accent-bg font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4 text-tool-accent" aria-hidden />
                <span className="whitespace-nowrap">{label}</span>
                <SandboxBadge />
              </NavLink>
            ))}
          </div>
        </nav>
        <ModeSwitch className="mx-4 mt-3" />
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
    </div>
  );
}

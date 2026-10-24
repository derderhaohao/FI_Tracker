import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  ClipboardCheck,
  FlaskConical,
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

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/update', label: 'Monthly update', icon: RefreshCw },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/snapshots', label: 'Snapshots', icon: Table2 },
  { to: '/cashflow', label: 'Cash flow', icon: ArrowLeftRight },
  { to: '/goal', label: 'Goal', icon: Target },
  { to: '/projection', label: 'Projection', icon: TrendingUp },
  { to: '/lab', label: 'Strategy Lab', icon: FlaskConical },
  { to: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

/** Phone tabs (product review, issue 9): four destinations plus More, which lists the rest. */
const PHONE_LABELS: Record<string, string> = { '/update': 'Update' };
const PHONE_TABS = ['/', '/update', '/cashflow', '/lab'];

function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const tabs = NAV.filter((n) => PHONE_TABS.includes(n.to));
  const more = NAV.filter((n) => !PHONE_TABS.includes(n.to));
  const moreActive = more.some((n) => pathname.startsWith(n.to));
  const item = 'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]';
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 md:hidden" onClick={() => setOpen(false)}>
          <nav
            aria-label="More pages"
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
          </nav>
        </div>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface md:hidden">
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
          aria-label="More pages"
          className={cn(item, moreActive || open ? 'text-primary' : 'text-muted-foreground')}
          onClick={() => setOpen((o) => !o)}
        >
          <MoreHorizontal className="size-5" aria-hidden />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-surface md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="./favicon.svg" alt="" className="size-6" />
          <span className="font-semibold">FI Tracker</span>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2">
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
        </nav>
        <p className="px-4 py-3 text-xs text-subtle">Data stays in this browser.</p>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <BackupBanner />
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

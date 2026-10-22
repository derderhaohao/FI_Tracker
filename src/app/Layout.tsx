import { NavLink, Outlet } from 'react-router-dom';
import {
  ArrowLeftRight,
  ClipboardCheck,
  FlaskConical,
  Landmark,
  LayoutDashboard,
  Settings as SettingsIcon,
  Table2,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { BackupBanner } from './BackupBanner';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/snapshots', label: 'Snapshots', icon: Table2 },
  { to: '/cashflow', label: 'Cash flow', icon: ArrowLeftRight },
  { to: '/goal', label: 'Goal', icon: Target },
  { to: '/projection', label: 'Projection', icon: TrendingUp },
  { to: '/lab', label: 'Strategy Lab', icon: FlaskConical },
  { to: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

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
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t bg-surface md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-w-16 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            <span className="whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

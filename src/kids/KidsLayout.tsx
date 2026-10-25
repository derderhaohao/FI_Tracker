import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Lock, PiggyBank, Sprout, TreeDeciduous } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { Avatar } from './art/Art';
import type { Kids } from './types';

const TABS = [
  { to: '/kids', end: true, label: () => t('Garden'), icon: Sprout },
  { to: '/kids/jars', end: false, label: () => t('Jars and Goals'), icon: PiggyBank },
  { to: '/kids/grow', end: false, label: () => t('Grow'), icon: TreeDeciduous },
  { to: '/kids/learn', end: false, label: () => t('Learn'), icon: BookOpen },
];

/** Big type, big targets, four tabs and the parent corner (KD-2). */
export function KidsLayout({ kids }: { kids: Kids }) {
  const p = kids.profile!;
  return (
    <div className="min-h-screen bg-[#f6f8ef] pb-28 text-lg text-[#1c2a12] dark:bg-[#141a10] dark:text-[#eef3e6]">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-4">
        <NavLink
          to="/kids/profiles"
          className="flex min-h-12 items-center gap-3 rounded-2xl pr-3 focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t('Change who is playing, now {name}', { name: p.nickname })}
        >
          <Avatar index={p.avatar} size={52} />
          <span className="text-xl font-bold">{p.nickname}</span>
        </NavLink>
        <NavLink
          to="/kids/parent"
          className="flex min-h-12 items-center gap-2 rounded-2xl border-2 bg-surface px-4 text-base font-medium focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Lock className="size-5" aria-hidden />
          {t('Grown-ups')}
        </NavLink>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">
        <Outlet />
      </main>
      <nav
        aria-label={t('Beginner tabs')}
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-3xl">
          {TABS.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-7" aria-hidden />
              <span className="text-center leading-tight">{label()}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

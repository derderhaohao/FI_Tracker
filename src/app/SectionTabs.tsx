import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface SectionTab {
  to: string;
  label: string;
}

/**
 * Tabs inside one of the five menu destinations (UX doc, N1): My money and My plan group the
 * pages that used to be separate menu items. Each tab keeps its own address.
 */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly SectionTab[] }) {
  const { pathname } = useLocation();
  return (
    <>
      <nav aria-label={label} className="-mt-2 mb-4 overflow-x-auto border-b">
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.to;
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex min-h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap touch:min-h-11',
                    active
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}

/** An old address that moved: same query and hash, new path, so bookmarks keep working. */
export function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

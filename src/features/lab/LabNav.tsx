import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/**
 * In-page navigation for the long Strategy Lab (UI-13): sticky anchor links on wider screens and
 * a section picker on phones. The section in view is marked with aria-current.
 */
export function LabNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        const best = [...visible.entries()]
          .filter(([, top]) => Number.isFinite(top))
          .sort((a, b) => a[1] - b[1])[0];
        if (best) setActive(best[0]);
      },
      { rootMargin: '-64px 0px -55% 0px' },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [sections]);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      <div className="mb-4 md:hidden">
        <Select aria-label={t('Strategy Lab section')} value={active} onChange={(e) => go(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <nav
        aria-label={t('Strategy Lab sections')}
        className="sticky top-0 z-20 -mx-1 mb-4 hidden border-b bg-background/95 px-1 py-1.5 backdrop-blur md:block"
      >
        <ul className="flex flex-wrap gap-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(s.id);
                }}
                className={cn(
                  'inline-flex h-8 items-center rounded-md px-2.5 text-sm whitespace-nowrap',
                  active === s.id
                    ? 'bg-surface-2 font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

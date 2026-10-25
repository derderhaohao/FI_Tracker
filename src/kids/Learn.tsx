import { Link } from 'react-router-dom';
import { Award, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { LESSONS, unlocked } from './lessons/content';
import type { Kids } from './types';

/** Learn (KD-9): ten short lessons; each unlocks the next, with a badge for each quiz. */
export function Learn({ kids }: { kids: Kids }) {
  const done = new Set(kids.progress.map((p) => p.lessonId));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('Learn')}</h1>
      <ol className="flex flex-col gap-3">
        {LESSONS.map((l) => {
          const open = unlocked(l.id, done);
          const body = (
            <>
              <span
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-bold',
                  done.has(l.id) ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-surface-2',
                )}
                aria-hidden
              >
                {done.has(l.id) ? <Award className="size-7" /> : open ? l.id : <Lock className="size-6" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{l.title()}</span>
                <span className="block text-base text-muted-foreground">
                  {open ? l.idea() : t('Finish the lesson before to open this one.')}
                </span>
              </span>
              {done.has(l.id) && <span className="sr-only">{t('Badge earned')}</span>}
            </>
          );
          const cls = 'flex min-h-20 items-center gap-3 rounded-2xl border-2 bg-surface p-3';
          return (
            <li key={l.id}>
              {open ? (
                <Link
                  to={`/kids/learn/${l.id}`}
                  className={cn(
                    cls,
                    'hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                  )}
                  aria-label={t('Lesson {n}: {title}', { n: l.id, title: l.title() })}
                >
                  {body}
                </Link>
              ) : (
                <div className={cn(cls, 'opacity-60')} aria-disabled>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

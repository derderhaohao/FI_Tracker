import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { coins } from './copy';

/** A big friendly button: at least 48 px tall, large text (PRD Part D, "Look and language"). */
export function BigButton({
  tone = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'plain' | 'good' | 'warm' }) {
  const tones = {
    primary: 'bg-primary text-primary-foreground',
    plain: 'border-2 bg-surface text-foreground',
    good: 'bg-good text-white',
    warm: 'bg-[#f59e0b] text-[#1f1300]',
  };
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold shadow-sm focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 [&_svg]:size-6',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A card the child can pick: picture plus a word, at least 48 px. */
export function PickCard({
  selected,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-24 min-w-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-surface p-3 text-base font-medium focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-8',
        selected ? 'border-primary bg-surface-2' : 'hover:bg-surface-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A coin keypad for whole amounts (up to 999,999). */
export function Keypad({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const press = (d: string) => {
    const next = Number(`${value === 0 ? '' : value}${d}`);
    if (next <= 999_999) onChange(next);
  };
  const key =
    'min-h-14 rounded-2xl border-2 bg-surface text-2xl font-semibold hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none';
  return (
    <div className="flex flex-col gap-3">
      <output
        aria-label={label}
        className="rounded-2xl bg-surface-2 py-3 text-center text-3xl font-bold tabular"
        aria-live="polite"
      >
        {coins(value)}
      </output>
      <div role="group" aria-label={t('Coin keypad')} className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className={cn(key, 'flex items-center justify-center')}
          aria-label={t('Delete a number')}
          onClick={() => onChange(Math.floor(value / 10))}
        >
          <Delete className="size-7" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** A soft panel for one idea per screen. */
export function Panel({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-3xl border-2 bg-surface p-4 shadow-sm sm:p-5', className)}>
      {title && <h2 className="mb-3 text-xl font-bold">{title}</h2>}
      {children}
    </section>
  );
}

/** A gentle celebration: a few floating coins, still when reduced motion is asked for. */
export function Celebrate({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="relative overflow-hidden rounded-2xl bg-[#fef3c7] p-4 text-center text-lg font-bold text-[#713f12]"
    >
      <span className="relative z-10">{text}</span>
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {[10, 30, 50, 70, 90].map((x, i) => (
          <span
            key={x}
            className="absolute bottom-0 text-xl motion-safe:animate-bounce"
            style={{ left: `${x}%`, animationDelay: `${i * 120}ms` }}
          >
            ●
          </span>
        ))}
      </span>
    </div>
  );
}

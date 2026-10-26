import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from 'react';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

// 32 px controls on desktop, 44 px on touch (size scale); the border meets 3:1 (UI-2).
const field =
  'h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-critical touch:h-11';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

/**
 * A native select (kept for accessibility) drawn like the other controls: no browser arrow, a
 * chevron 8 px from the right, same height and border as Input (UI-19). Width classes on
 * `className` size the whole control.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const width = className?.split(/\s+/).filter((c) => /^(w-|min-w-|max-w-|flex-|shrink|grow|basis-)/.test(c));
  return (
    <span className={cn('relative inline-flex w-full', width)}>
      <select className={cn(field, 'appearance-none pr-8', className)} {...props} />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'h-auto min-h-20 py-2', className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}

/** Label + control + optional hint/error, wired with ids. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? (
        <p className="text-xs text-critical">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/**
 * A checkbox hit through its label: at least 24 px tall, 44 px on touch (UI-4). Without a visible
 * label (a table cell), pass `aria-label`; the box still gets the full hit area.
 */
export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode }) {
  return (
    <label
      className={cn(
        'inline-flex min-h-6 min-w-6 cursor-pointer items-center gap-2 text-sm touch:min-h-11 touch:min-w-11',
        !label && 'justify-center',
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-4 rounded border-input accent-[var(--primary)] touch:size-5"
        {...props}
      />
      {label}
    </label>
  );
}

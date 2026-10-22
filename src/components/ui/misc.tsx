import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'primary' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted-foreground',
    good: 'bg-surface-2 text-good',
    warning: 'bg-warning-bg text-warning',
    critical: 'bg-critical-bg text-critical',
    primary: 'bg-surface-2 text-primary',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Notice({
  tone = 'info',
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warning' | 'critical';
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-surface-2 text-foreground',
    warning: 'bg-warning-bg text-foreground',
    critical: 'bg-critical-bg text-foreground',
  };
  const Icon = tone === 'info' ? Info : AlertTriangle;
  const iconColor =
    tone === 'info' ? 'text-muted-foreground' : tone === 'warning' ? 'text-warning' : 'text-critical';
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-sm', styles[tone], className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Stat tile: label, value, optional sub-line. */
export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-surface p-4', className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  to,
  action,
}: {
  title: string;
  children?: ReactNode;
  to?: string;
  action?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {to && action && (
        <Link
          to={to}
          className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground"
        >
          {action}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control for a small set of options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium',
            value === o.value
              ? 'bg-surface-2 text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-sm tabular [&_td]:border-t [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground',
          className,
        )}
        {...props}
      />
    </div>
  );
}

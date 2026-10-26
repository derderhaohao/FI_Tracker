import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function Badge({
  className,
  tone = 'neutral',
  icon,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'primary';
  /** Status is never colour alone (UI accessibility): an icon goes with the word. */
  icon?: ReactNode;
}) {
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
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
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

/** Stat tile (UI-21): label, a number or short status as the value, and an optional sub-line. */
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
    <div className={cn('min-w-0 rounded-lg border bg-surface p-4', className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
      {sub && (
        <div
          className="mt-1 line-clamp-2 text-xs text-muted-foreground"
          title={typeof sub === 'string' ? sub : undefined}
        >
          {sub}
        </div>
      )}
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

/**
 * Segmented control for a small set of options (UI-3). The selected option is a raised pill on a
 * darker track, set apart by fill, weight and an outline as well as colour; the pill slides to a
 * new option. Options never wrap: on a narrow screen the control scrolls sideways.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = track.current;
    const p = pill.current;
    if (!box || !p) return;
    // Measured, then re-measured whenever the control resizes (fonts, wrapping, zoom).
    const place = () => {
      const el = box.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!el) {
        p.style.opacity = '0';
        return;
      }
      p.style.opacity = '1';
      p.style.width = `${el.offsetWidth}px`;
      p.style.height = `${el.offsetHeight}px`;
      p.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(box);
    for (const child of box.children) ro.observe(child);
    return () => ro.disconnect();
  });
  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={cn(
        'relative inline-flex max-w-full shrink-0 overflow-x-auto rounded-md border border-input bg-surface-2 p-0.5',
        className,
      )}
    >
      <span
        ref={pill}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded bg-segment-selected opacity-0 shadow-xs ring-1 ring-input transition-transform duration-150 ease-out"
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 h-7 shrink-0 rounded px-2.5 text-xs whitespace-nowrap touch:h-10 touch:px-3 touch:text-sm',
            value === o.value
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A table that scrolls sideways inside its card, never the page (UI-17). On phones the first
 * column stays put while the rest scrolls.
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-sm tabular [&_td]:border-t [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground',
          'max-md:[&_td:first-child]:sticky max-md:[&_td:first-child]:left-0 max-md:[&_td:first-child]:z-[1] max-md:[&_td:first-child]:bg-surface max-md:[&_th:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_th:first-child]:z-[1] max-md:[&_th:first-child]:bg-surface',
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** A control with a small visible label above it, so a row of toggles reads as settings (UI-13). */
export function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

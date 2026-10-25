import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

/** A number input that keeps what is typed and reports valid numbers only. */
export function NumberInput({
  value,
  onChange,
  label,
  scale = 1,
  min,
  max,
  step,
  suffix,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  /** 100 shows a decimal as a percent. */
  scale?: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  const shown = String(Math.round(value * scale * 1e6) / 1e6);
  const [text, setText] = useState(shown);
  const [last, setLast] = useState(value);
  if (value !== last) {
    // Changed from outside (a preset or a restored scenario).
    setLast(value);
    setText(shown);
  }
  const n = Number(text);
  const invalid =
    text.trim() === '' ||
    !Number.isFinite(n) ||
    (min !== undefined && n < min) ||
    (max !== undefined && n > max);
  return (
    <span className={cn('relative inline-flex w-full items-center', className)}>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        min={min}
        max={max}
        step={step ?? 'any'}
        className={cn('tabular', suffix && 'pr-8')}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          const ok =
            e.target.value.trim() !== '' &&
            Number.isFinite(v) &&
            (min === undefined || v >= min) &&
            (max === undefined || v <= max);
          if (ok) {
            setLast(v / scale);
            onChange(v / scale);
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 text-sm text-muted-foreground" aria-hidden>
          {suffix}
        </span>
      )}
    </span>
  );
}

/** A row of small toggle chips. */
export function Chips<T extends string | number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value?: T;
  onPick: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === o.value
              ? 'border-tool-accent bg-tool-accent-bg font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onPick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A small US / TW market badge with the price currency (TW-6). */
export function MarketBadge({ market, currency }: { market: 'US' | 'TW'; currency: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1 text-[10px] font-semibold tracking-wide',
        market === 'TW' ? 'border-tool-accent/50 text-tool-accent' : 'text-muted-foreground',
      )}
      title={currency}
    >
      {market} · {currency}
    </span>
  );
}

/** The tool's primary button colour (TM-2). */
export const accentButton =
  'bg-tool-accent text-tool-accent-foreground hover:opacity-90 focus-visible:ring-tool-accent';

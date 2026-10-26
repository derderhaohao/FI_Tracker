import { useState } from 'react';
import { formatMoney, fromMinor, parseMoneyInput } from '@/domain/money';
import { cn } from '@/lib/cn';

function display(minor: number | undefined): string {
  if (minor === undefined) return '';
  const major = fromMinor(minor);
  return major.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export interface MoneyInputProps {
  /** Minor units in `currency`. */
  value: number | undefined;
  currency: string;
  onCommit: (minor: number | undefined) => void;
  /** TWD per unit, to show the TWD equivalent beside a foreign amount. */
  twdRate?: number;
  allowNegative?: boolean;
  /** Grid cells: no currency prefix (the row says it), so the whole amount fits on a phone. */
  compact?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}

/**
 * Amount input in the account's native currency. Commits on blur or Enter;
 * shows the TWD equivalent for foreign currencies.
 */
export function MoneyInput({
  value,
  currency,
  onCommit,
  twdRate,
  allowNegative = false,
  compact = false,
  id,
  className,
  placeholder,
  ...rest
}: MoneyInputProps) {
  const [text, setText] = useState(display(value));
  const [invalid, setInvalid] = useState(false);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(display(value));
  }

  const commit = () => {
    if (text.trim() === '') {
      setInvalid(false);
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const parsed = parseMoneyInput(text);
    if (parsed === null || (!allowNegative && parsed < 0)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value) onCommit(parsed);
    setText(display(parsed));
  };

  const parsedNow = parseMoneyInput(text);
  const showTwd = currency !== 'TWD' && twdRate !== undefined && parsedNow !== null;
  // TWD, the plan's currency, is named in the label or column header, not inside every field
  // (UI-20). A foreign currency keeps its code, since lists mix currencies.
  const prefix = !compact && currency !== 'TWD';
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-subtle">
            {currency}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          size={10}
          className={cn(
            'h-8 w-full min-w-0 rounded-md border border-input bg-surface pr-2 text-right text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-critical touch:h-11',
            prefix ? 'pl-11' : 'pl-2',
          )}
          value={text}
          placeholder={placeholder ?? '—'}
          aria-invalid={invalid || undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          {...rest}
        />
      </div>
      {showTwd && (
        <span className="mt-0.5 text-right text-xs text-subtle tabular">
          ≈ {formatMoney(fromMinor(parsedNow) * twdRate, 'TWD')}
        </span>
      )}
    </div>
  );
}

/** Percentage input; stores decimals (0.04) and shows percents (4). */
export function PercentInput({
  value,
  onCommit,
  id,
  min,
  max,
  step = 0.1,
  className,
  'aria-label': ariaLabel,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(round(value * 100)));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value === undefined ? '' : String(round(value * 100)));
  }
  const commit = () => {
    if (text.trim() === '') return onCommit(undefined);
    const n = Number(text);
    if (!Number.isFinite(n)) return;
    let v = n / 100;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onCommit(v);
    setText(String(round(v * 100)));
  };
  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="number"
        step={step}
        aria-label={ariaLabel}
        className="h-8 w-full rounded-md border border-input bg-surface pr-7 pl-2.5 text-right text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring touch:h-11"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-subtle">
        %
      </span>
    </div>
  );
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Integer input that commits on blur. */
export function NumberInput({
  value,
  onCommit,
  id,
  min,
  max,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  id?: string;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value === undefined ? '' : String(value));
  }
  const commit = () => {
    if (text.trim() === '') return onCommit(undefined);
    let n = Math.round(Number(text));
    if (!Number.isFinite(n)) return;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onCommit(n);
    setText(String(n));
  };
  return (
    <input
      id={id}
      type="number"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cn(
        'h-8 w-full rounded-md border border-input bg-surface px-2.5 text-right text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-ring touch:h-11',
        className,
      )}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

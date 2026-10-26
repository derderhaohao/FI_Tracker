import { useId, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey, type GlossaryParams } from '@/lib/glossary';
import { HISTORY } from '@/domain/backtest';
import { useAppData } from '@/app/data';
import { HEALTH_RUNS } from '@/lib/mcWorker';

function useGlossaryParams(): GlossaryParams {
  const { baselineInput } = useAppData();
  return {
    runs: HEALTH_RUNS,
    horizonAge: baselineInput.horizonAge,
    firstYear: HISTORY[0].year,
    lastYear: HISTORY.at(-1)!.year,
    fiSpending: baselineInput.fiSpending,
    swr: baselineInput.swr,
  };
}
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

const WIDTH = 256;

/**
 * A glossary term: the plain label with a one-sentence explanation on hover, focus or tap
 * (PRD R11). In the Advanced view the technical term follows in brackets. The tooltip is
 * fixed-positioned so scrolling tables do not clip it.
 */
export function Term({
  k,
  params,
  advanced = false,
  children,
  className,
}: {
  k: GlossaryKey;
  /** Defaults to the plan today's numbers. */
  params?: GlossaryParams;
  advanced?: boolean;
  /** Overrides the label text. */
  children?: ReactNode;
  className?: string;
}) {
  const entry = GLOSSARY[k];
  const defaults = useGlossaryParams();
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>();
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
    });
  };
  const hide = () => setPos(undefined);
  return (
    <span className={cn('inline-flex items-baseline', className)}>
      <button
        ref={ref}
        type="button"
        className="min-h-6 cursor-help border-b border-dotted border-current text-left"
        aria-describedby={id}
        onClick={show}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
      >
        {children ?? entry.label}
        {advanced && <span className="ml-1 text-subtle">({entry.advanced})</span>}
      </button>
      <span
        id={id}
        role="tooltip"
        style={pos ? { top: pos.top, left: pos.left, width: WIDTH } : undefined}
        className={cn(
          'fixed z-50 rounded-md border bg-surface p-2 text-left text-xs font-normal text-foreground normal-case shadow-lg',
          pos ? 'block' : 'hidden',
        )}
      >
        {entry.tooltip(params ?? defaults)}
      </span>
    </span>
  );
}

/**
 * A small info button with a one-paragraph tooltip on hover, focus or tap, for notes that would
 * otherwise crowd a table cell (UI-14). Same look and behaviour as a glossary term.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>();
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)) });
  };
  const hide = () => setPos(undefined);
  return (
    <span className="inline-flex align-middle">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex min-h-6 min-w-6 cursor-help items-center justify-center rounded text-muted-foreground hover:text-foreground"
        onClick={show}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
      >
        <Info className="size-4" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        style={pos ? { top: pos.top, left: pos.left, width: WIDTH } : undefined}
        className={cn(
          'fixed z-50 rounded-md border bg-surface p-2 text-left text-xs font-normal text-foreground normal-case shadow-lg',
          pos ? 'block' : 'hidden',
        )}
      >
        {children}
      </span>
    </span>
  );
}

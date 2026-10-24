import { cn } from '@/lib/cn';

/** Ten dots, `filled` of them solid: "6 of 10 futures" at a glance (PRD R3). */
export function Dots({ filled, label, small = false }: { filled: number; label: string; small?: boolean }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={cn(
            'inline-block rounded-full border',
            small ? 'size-1.5' : 'size-3',
            i < filled ? 'border-primary bg-primary' : 'border-subtle bg-transparent',
          )}
        />
      ))}
    </span>
  );
}

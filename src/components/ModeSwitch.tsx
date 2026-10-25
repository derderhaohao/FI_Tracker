import { Sprout } from 'lucide-react';
import { setMode } from '@/lib/mode';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';

/** Switches this device to Beginner mode (KD-1). The kids' space never reads the plan. */
export function ModeSwitch({ className, label }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
      onClick={() => {
        window.location.hash = '#/kids';
        setMode('beginner');
      }}
    >
      <Sprout className="size-4 text-good" aria-hidden />
      {label ?? t('Switch to Beginner mode')}
    </button>
  );
}

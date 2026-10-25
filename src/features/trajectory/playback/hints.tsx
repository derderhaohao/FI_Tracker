import type { ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { t } from '@/i18n';

export function Hint({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div
      role="note"
      className="mb-2 flex items-start gap-1.5 rounded-md border border-dashed border-primary bg-surface-2 px-2 py-1.5 text-xs"
    >
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">{children}</span>
      <button
        type="button"
        aria-label={t('Dismiss hint')}
        onClick={onDismiss}
        className="text-subtle hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

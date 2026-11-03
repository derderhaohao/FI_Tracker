import type { ReactNode } from 'react';
import { downloadBackup } from '@/lib/backupActions';
import { resumeAutosave, useAutosave } from '@/lib/autosave';
import { Button } from '@/components/ui/button';
import { useAppData } from './data';
import { t } from '@/i18n';

function Banner({ message, children }: { message: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning-bg px-4 py-2 text-sm md:px-8"
    >
      <span>{message}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * The one global banner (UX doc, A1): only for an auto-save that has stopped working.
 * Backup reminders live in Home's Next step card and the update recap.
 */
export function BackupBanner() {
  const { accounts } = useAppData();
  const autosave = useAutosave();
  if (accounts.length === 0) return null;
  if (autosave.status === 'needs-permission') {
    return (
      <Banner
        message={t('Auto-save to {v} is paused until you allow it again.', {
          v: autosave.fileName ?? t('your file'),
        })}
      >
        <Button size="sm" variant="outline" onClick={() => void resumeAutosave()}>
          {t('Resume auto-save')}
        </Button>
      </Banner>
    );
  }
  if (autosave.status === 'error') {
    return (
      <Banner
        message={t('Auto-save failed: {v}. Export a backup manually.', {
          v: autosave.error ?? t('unknown error'),
        })}
      >
        <Button size="sm" variant="outline" onClick={() => void downloadBackup()}>
          {t('Export backup')}
        </Button>
      </Banner>
    );
  }
  return null;
}
